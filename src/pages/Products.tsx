import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Pencil,
  AlertTriangle,
  Archive,
  Eye,
  Upload,
  ChevronLeft,
  CheckCircle2,
  XCircle,
  DollarSign,
  X,
  Trash2,
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useSettings } from "@/contexts/SettingsContext";
import { useQuery } from "@tanstack/react-query";
import { usePagedQuery, useDebouncedValue } from "@/hooks/use-paged-query";
import { StatusChips } from "@/components/StatusChips";
import {
  buildCategoryTree,
  getDescendantIds,
  CategoryNode,
} from "@/lib/category-utils";

interface ProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  barcode: string | null;
  model_number: string | null;
  main_image_url: string | null;
  purchase_price: number;
  selling_price: number;
  quantity_on_hand: number;
  min_stock_level: number;
  is_active: boolean;
  created_at: string;
  category: string | null;
  unit: string | null;
  brand_id: string | null;
  category_id: string | null;
  unit_id: string | null;
  product_categories?: { name: string } | null;
  product_units?: { name: string } | null;
  product_brands?: { name: string } | null;
}

const PAGE_SIZE = 20;
const fmtNum = (n: number) =>
  Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtInt = (n: number) => Number(n || 0).toLocaleString("en-US");
const formatCurrency = (val: number) => `${fmtNum(val)} EGP`;

function renderCategoryOptions(
  nodes: CategoryNode[],
  depth = 0,
): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  for (const node of nodes) {
    const prefix = depth > 0 ? "─ ".repeat(depth) : "";
    result.push(
      <SelectItem key={node.id} value={node.id}>
        <span className="flex items-center gap-1">
          {depth > 0 && (
            <ChevronLeft className="h-3 w-3 text-muted-foreground inline" />
          )}
          {prefix}
          {node.name}
        </span>
      </SelectItem>,
    );
    result.push(...renderCategoryOptions(node.children, depth + 1));
  }
  return result;
}

export default function Products() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { settings } = useSettings();

  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [statusFilter, setStatusFilter] = useState<
    "active" | "inactive" | "all"
  >("active");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const [categories, setCategories] = useState<
    { id: string; name: string; parent_id: string | null; is_active: boolean }[]
  >([]);

  const canEdit = role === "admin" || role === "accountant";

  // KPI Summary (RPC)
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["products-summary"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_products_summary" as any,
      );
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
  });

  // Categories (small lookup)
  useEffect(() => {
    (async () => {
      const { data } = await (supabase.from("product_categories" as any) as any)
        .select("id, name, parent_id, is_active")
        .eq("is_active", true)
        .order("name");
      setCategories(data || []);
    })();
  }, []);

  const categoryTree = useMemo(
    () => buildCategoryTree(categories),
    [categories],
  );

  const matchingCategoryIds = useMemo(() => {
    if (categoryFilter === "all") return null;
    return getDescendantIds(categoryTree, categoryFilter);
  }, [categoryFilter, categoryTree]);

  // Paged products
  const { data: pagedData, isLoading, refetch: refetchList } = usePagedQuery<
    ProductRow
  >(
    [
      "products-list",
      pagination.pageIndex,
      pagination.pageSize,
      statusFilter,
      stockFilter,
      categoryFilter,
      matchingCategoryIds?.join(",") || "all",
      debouncedSearch,
    ] as const,
    async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let q = (supabase.from("products") as any)
        .select(
          "id, code, name, description, barcode, model_number, main_image_url, purchase_price, selling_price, quantity_on_hand, min_stock_level, is_active, created_at, category, unit, brand_id, category_id, unit_id, product_categories(name), product_units(name), product_brands(name)",
          { count: "exact" },
        )
        .order("code")
        .range(from, to);

      if (statusFilter === "active") q = q.eq("is_active", true);
      else if (statusFilter === "inactive") q = q.eq("is_active", false);

      if (stockFilter === "out") q = q.lte("quantity_on_hand", 0);
      // 'low' (qty>0 AND qty<min) is filtered client-side because Supabase
      // can't do col-vs-col comparison directly in select chain.

      if (matchingCategoryIds && matchingCategoryIds.length > 0) {
        q = q.in("category_id", matchingCategoryIds);
      }

      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        q = q.or(
          `name.ilike.%${s}%,code.ilike.%${s}%,barcode.ilike.%${s}%,model_number.ilike.%${s}%`,
        );
      }

      const { data, error, count } = await q;
      if (error) {
        toast({
          title: "خطأ",
          description: "فشل في جلب المنتجات",
          variant: "destructive",
        });
        throw error;
      }
      let rows = (data || []) as ProductRow[];
      if (stockFilter === "low") {
        rows = rows.filter(
          (p) =>
            p.quantity_on_hand > 0 && p.quantity_on_hand < p.min_stock_level,
        );
      }
      return { rows, totalCount: count ?? 0 };
    },
  );

  const products = pagedData?.rows ?? [];
  const totalCount = pagedData?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [statusFilter, stockFilter, categoryFilter, debouncedSearch]);

  const toggleProductStatus = async (product: ProductRow) => {
    const newStatus = !product.is_active;
    // منع التعطيل إذا كانت الكمية المتاحة أكبر من صفر
    if (!newStatus && Number(product.quantity_on_hand || 0) > 0) {
      toast({
        title: "لا يمكن التعطيل",
        description: `لا يمكن تعطيل المنتج "${product.name}" لأن الكمية المتاحة (${fmtNum(product.quantity_on_hand)}) أكبر من صفر. قم بتصفير المخزون أولاً.`,
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase
      .from("products")
      .update({ is_active: newStatus })
      .eq("id", product.id);
    if (error) {
      toast({
        title: "خطأ",
        description: "فشل في تحديث حالة المنتج",
        variant: "destructive",
      });
    } else {
      toast({
        title: newStatus ? "تم التفعيل" : "تم التعطيل",
        description: newStatus
          ? "تم تفعيل المنتج بنجاح"
          : "تم تعطيل المنتج بنجاح",
      });
      refetchList();
      refetchSummary();
    }
  };

  // حذف نهائي: يفحص أن المنتج لم يُستخدم في أي وثيقة أو حركة قبل الحذف
  const hardDeleteProduct = async (product: ProductRow) => {
    try {
      const checks = await Promise.all([
        supabase.from("sales_invoice_items").select("id", { count: "exact", head: true }).eq("product_id", product.id),
        supabase.from("purchase_invoice_items").select("id", { count: "exact", head: true }).eq("product_id", product.id),
        supabase.from("sales_return_items").select("id", { count: "exact", head: true }).eq("product_id", product.id),
        supabase.from("purchase_return_items").select("id", { count: "exact", head: true }).eq("product_id", product.id),
        supabase.from("inventory_movements").select("id", { count: "exact", head: true }).eq("product_id", product.id),
        supabase.from("inventory_adjustment_items").select("id", { count: "exact", head: true }).eq("product_id", product.id),
      ]);
      const totalUsage = checks.reduce((sum, r) => sum + (r.count || 0), 0);
      if (totalUsage > 0) {
        toast({
          title: "لا يمكن الحذف النهائي",
          description: `المنتج "${product.name}" مستخدم في ${totalUsage} عملية/حركة. يمكن تعطيله بدلاً من حذفه.`,
          variant: "destructive",
        });
        return;
      }
      if (Number(product.quantity_on_hand || 0) !== 0) {
        toast({
          title: "لا يمكن الحذف النهائي",
          description: "الكمية المتاحة للمنتج ليست صفراً.",
          variant: "destructive",
        });
        return;
      }
      // حذف الصور المرتبطة أولاً ثم المنتج
      await supabase.from("product_images").delete().eq("product_id", product.id);
      const { error } = await supabase.from("products").delete().eq("id", product.id);
      if (error) throw error;
      toast({ title: "تم الحذف", description: `تم حذف المنتج "${product.name}" نهائياً` });
      refetchList();
      refetchSummary();
    } catch (err: any) {
      toast({
        title: "خطأ في الحذف",
        description: err.message || "تعذر حذف المنتج",
        variant: "destructive",
      });
    }
  };

  const getCategoryName = (p: ProductRow) =>
    (p as any).product_categories?.name || p.category || "-";
  const getBrandName = (p: ProductRow) =>
    (p as any).product_brands?.name || "-";

  const getStockBadge = (product: ProductRow) => {
    if (product.quantity_on_hand <= 0)
      return (
        <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-destructive/10 text-destructive">
          نفذت الكمية
        </span>
      );
    if (product.quantity_on_hand < product.min_stock_level)
      return (
        <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">
          مخزون منخفض
        </span>
      );
    return (
      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
        متوفر
      </span>
    );
  };

  // Lazy export with batching + progress
  const fetchAllForExport = async (
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<ProductRow[]> => {
    const { fetchAllPaged } = await import("@/lib/paged-fetch");
    const rows = await fetchAllPaged<ProductRow>(
      () => {
        let q = (supabase.from("products") as any)
          .select(
            "id, code, name, description, barcode, model_number, main_image_url, purchase_price, selling_price, quantity_on_hand, min_stock_level, is_active, created_at, category, unit, brand_id, category_id, unit_id, product_categories(name), product_units(name), product_brands(name)",
            { count: "exact" },
          )
          .order("code");
        if (statusFilter === "active") q = q.eq("is_active", true);
        else if (statusFilter === "inactive") q = q.eq("is_active", false);
        if (stockFilter === "out") q = q.lte("quantity_on_hand", 0);
        if (matchingCategoryIds && matchingCategoryIds.length > 0) {
          q = q.in("category_id", matchingCategoryIds);
        }
        return q;
      },
      { batchSize: 500, maxRows: 50000, onProgress },
    );
    let result = rows;
    if (stockFilter === "low") {
      result = result.filter(
        (p: any) =>
          p.quantity_on_hand > 0 && p.quantity_on_hand < p.min_stock_level,
      );
    }
    return result;
  };

  const [exportRows, setExportRows] = useState<any[][]>([]);
  React.useEffect(() => {
    setExportRows([]);
  }, [statusFilter, stockFilter, categoryFilter, debouncedSearch]);
  // Build full category path (e.g. "ملابس / قمصان") for round-trip export/import
  const categoryPathById = useMemo(() => {
    const map = new Map<string, { name: string; parent_id: string | null }>();
    categories.forEach((c) => map.set(c.id, c));
    const getPath = (id: string): string => {
      const parts: string[] = [];
      let cur = map.get(id);
      while (cur) {
        parts.unshift(cur.name);
        cur = cur.parent_id ? map.get(cur.parent_id) : undefined;
      }
      return parts.join(" / ");
    };
    const out = new Map<string, string>();
    categories.forEach((c) => out.set(c.id, getPath(c.id)));
    return out;
  }, [categories]);

  const handlePrepareExport = async (
    onProgress?: (loaded: number, total: number) => void,
  ) => {
    const all = await fetchAllForExport(onProgress);
    // Use the SAME column order/headers as the import template so the file is round-trippable
    const rows = all.map((p) => [
      p.code,
      p.name,
      p.description || "",
      (p.category_id && categoryPathById.get(p.category_id)) ||
        (getCategoryName(p) === "-" ? "" : getCategoryName(p)),
      (p as any).product_units?.name || p.unit || "",
      getBrandName(p) === "-" ? "" : getBrandName(p),
      p.model_number || "",
      p.barcode || "",
      Number(p.purchase_price || 0),
      Number(p.selling_price || 0),
      Number(p.quantity_on_hand || 0),
      Number(p.min_stock_level || 0),
    ]);
    setExportRows(rows);
    return { rows };
  };

  const exportConfig = {
    filenamePrefix: "المنتجات",
    sheetName: "المنتجات",
    pdfTitle: "قائمة المنتجات",
    headers: [
      "الكود",
      "الاسم",
      "الوصف",
      "التصنيف",
      "الوحدة",
      "الماركة",
      "رقم الموديل",
      "الباركود",
      "سعر الشراء",
      "سعر البيع",
      "الكمية",
      "الحد الأدنى",
    ],
    rows: exportRows,
    settings,
    pdfOrientation: "landscape" as const,
  };

  const columns = useMemo<ColumnDef<ProductRow, any>[]>(
    () => [
      {
        id: "product_info",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="المنتج" />
        ),
        accessorKey: "name",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            {row.original.main_image_url ? (
              <img
                src={row.original.main_image_url}
                alt={row.original.name}
                className="h-10 w-10 rounded-lg object-cover border border-border"
              />
            ) : (
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center border border-border">
                <Package className="h-5 w-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <p className="text-sm font-bold text-foreground">
                {row.original.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {getBrandName(row.original) !== "-"
                  ? getBrandName(row.original)
                  : ""}
                {row.original.model_number && getBrandName(row.original) !== "-"
                  ? " - "
                  : ""}
                {row.original.model_number || ""}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "active_status",
        meta: { hideOnMobile: true },
        header: "النشاط",
        cell: ({ row }) =>
          row.original.is_active ? (
            <Badge
              variant="secondary"
              className="bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
            >
              نشط
            </Badge>
          ) : (
            <Badge variant="secondary" className="bg-muted text-muted-foreground">
              غير نشط
            </Badge>
          ),
      },
      {
        accessorKey: "code",
        meta: { hideOnMobile: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="كود الصنف" />
        ),
        cell: ({ row }) => (
          <span className="font-mono text-sm text-foreground">
            {row.original.code}
          </span>
        ),
      },
      {
        id: "category",
        meta: { hideOnMobile: true },
        header: "التصنيف",
        cell: ({ row }) => (
          <span className="text-sm text-muted-foreground">
            {getCategoryName(row.original)}
          </span>
        ),
      },
      {
        accessorKey: "selling_price",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="سعر الوحدة" />
        ),
        cell: ({ row }) => (
          <span className="text-sm font-bold text-foreground font-mono">
            {formatCurrency(row.original.selling_price)}
          </span>
        ),
      },
      {
        accessorKey: "quantity_on_hand",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="الكمية" />
        ),
        cell: ({ row }) => (
          <span className="text-sm text-foreground font-mono">
            {fmtInt(row.original.quantity_on_hand)}{" "}
            {row.original.product_units?.name || row.original.unit || "وحدة"}
          </span>
        ),
      },
      {
        id: "stock_status",
        header: "حالة المخزون",
        cell: ({ row }) => getStockBadge(row.original),
      },
      {
        id: "actions",
        header: "الإجراءات",
        enableHiding: false,
        cell: ({ row }) => (
          <div
            className="flex items-center gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              aria-label="عرض المنتج"
              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
              onClick={() => navigate(`/products/${row.original.id}`)}
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="تعديل المنتج"
                className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
                onClick={() => navigate(`/products/${row.original.id}/edit`)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={
                      row.original.is_active ? "أرشفة المنتج" : "تفعيل المنتج"
                    }
                    className={`h-8 w-8 ${row.original.is_active ? "text-muted-foreground hover:text-destructive hover:bg-destructive/5" : "text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"}`}
                  >
                    {row.original.is_active ? (
                      <Archive className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent dir="rtl">
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      {row.original.is_active ? "تعطيل المنتج" : "تفعيل المنتج"}
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      {row.original.is_active
                        ? `هل تريد تعطيل منتج "${row.original.name}"؟`
                        : `هل تريد تفعيل منتج "${row.original.name}"؟`}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="flex-row-reverse gap-2">
                    <AlertDialogAction
                      onClick={() => toggleProductStatus(row.original)}
                      className={
                        row.original.is_active
                          ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          : "bg-emerald-600 text-white hover:bg-emerald-700"
                      }
                    >
                      {row.original.is_active ? "تعطيل" : "تفعيل"}
                    </AlertDialogAction>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {role === "admin" &&
              !row.original.is_active &&
              Number(row.original.quantity_on_hand || 0) === 0 && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="حذف نهائي"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent dir="rtl">
                    <AlertDialogHeader>
                      <AlertDialogTitle>حذف المنتج نهائياً</AlertDialogTitle>
                      <AlertDialogDescription>
                        سيتم حذف المنتج "{row.original.name}" نهائياً من قاعدة
                        البيانات. هذا الإجراء لا يمكن التراجع عنه. يُسمح بالحذف
                        فقط إذا لم يكن المنتج مرتبطاً بأي فاتورة أو حركة مخزون.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="flex-row-reverse gap-2">
                      <AlertDialogAction
                        onClick={() => hardDeleteProduct(row.original)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        حذف نهائي
                      </AlertDialogAction>
                      <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
          </div>
        ),
      },
    ],
    [canEdit, navigate, role],
  );

  // KPI cards
  const kpiCards = [
    {
      label: "إجمالي الأصناف",
      value: fmtInt(summary?.total_count ?? 0),
      icon: Package,
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "قيمة المخزون",
      value: formatCurrency(summary?.total_value ?? 0),
      icon: DollarSign,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "متوفر",
      value: fmtInt(summary?.available_count ?? 0),
      icon: CheckCircle2,
      color: "bg-teal-500/10 text-teal-600",
    },
    {
      label: "مخزون منخفض",
      value: fmtInt(summary?.low_stock_count ?? 0),
      icon: AlertTriangle,
      color: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "نفذ المخزون",
      value: fmtInt(summary?.out_of_stock_count ?? 0),
      icon: XCircle,
      color: "bg-destructive/10 text-destructive",
    },
  ];

  const statusChips = [
    {
      label: "نشط",
      value: fmtInt(summary?.active_count ?? 0),
      filter: "active",
      icon: CheckCircle2,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "غير نشط",
      value: fmtInt(summary?.inactive_count ?? 0),
      filter: "inactive",
      icon: Archive,
      color: "bg-muted text-muted-foreground",
    },
    {
      label: "الكل",
      value: fmtInt(summary?.total_count ?? 0),
      filter: "all",
      icon: Package,
      color: "bg-primary/10 text-primary",
    },
  ];

  const hasFilters =
    categoryFilter !== "all" ||
    stockFilter !== "all" ||
    statusFilter !== "active" ||
    search.trim();
  const clearFilters = () => {
    setCategoryFilter("all");
    setStockFilter("all");
    setStatusFilter("active");
    setSearch("");
  };

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={Package}
        title="إدارة المخزون والمنتجات"
        description="عرض وتتبع كافة الأصناف المتوفرة في المخازن."
        actions={
          <>
            {canEdit && (
              <>
                <Button
                  variant="outline"
                  className="gap-2 shadow-sm"
                  onClick={() => navigate("/products/import")}
                >
                  <Upload className="h-4 w-4" />
                  استيراد البيانات
                </Button>
                <ExportMenu
                  config={exportConfig}
                  disabled={isLoading}
                  onOpen={handlePrepareExport}
                />
                <Button
                  className="gap-2 shadow-md shadow-primary/20 font-bold"
                  onClick={() => navigate("/products/new")}
                >
                  <Plus className="h-4 w-4" />
                  إضافة منتج جديد
                </Button>
              </>
            )}
            {!canEdit && (
              <ExportMenu
                config={exportConfig}
                disabled={isLoading}
                onOpen={handlePrepareExport}
              />
            )}
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4 bg-card transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xl font-black text-foreground font-mono">
                {value}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      <StatusChips
        chips={statusChips}
        active={statusFilter}
        onSelect={(f) => setStatusFilter(f as any)}
      />

      <DataTable
        columns={columns}
        data={products}
        searchPlaceholder="بحث بالاسم، الكود، الباركود، أو الموديل..."
        isLoading={isLoading}
        emptyMessage="لا توجد منتجات"
        onRowClick={(p) => navigate(`/products/${p.id}`)}
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        manualPagination
        pageCount={pageCount}
        totalRows={totalCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        pageSize={PAGE_SIZE}
        toolbarContent={
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48 bg-card border-border h-9 text-sm">
                <SelectValue placeholder="كافة التصنيفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كافة التصنيفات</SelectItem>
                {renderCategoryOptions(categoryTree)}
              </SelectContent>
            </Select>
            <Select
              value={stockFilter}
              onValueChange={(v) => setStockFilter(v as any)}
            >
              <SelectTrigger className="w-40 bg-card border-border h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">حالة المخزون</SelectItem>
                <SelectItem value="low">مخزون منخفض</SelectItem>
                <SelectItem value="out">نفذت الكمية</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
