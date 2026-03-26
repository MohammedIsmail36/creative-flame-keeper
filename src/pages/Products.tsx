import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { ColumnDef, FilterFn } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import {
  Package,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  Archive,
  Eye,
  Upload,
  ChevronLeft,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useSettings } from "@/contexts/SettingsContext";

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

interface CategoryNode {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  children: CategoryNode[];
}

function buildCategoryTree(
  flat: { id: string; name: string; parent_id: string | null; is_active: boolean }[],
): CategoryNode[] {
  const map = new Map<string, CategoryNode>();
  flat.forEach((c) => map.set(c.id, { ...c, children: [] }));
  const roots: CategoryNode[] = [];
  map.forEach((node) => {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

function getDescendantIds(tree: CategoryNode[], targetId: string): string[] {
  const ids: string[] = [];
  function collect(nodes: CategoryNode[]) {
    for (const n of nodes) {
      if (n.id === targetId) {
        collectAll(n);
        return true;
      }
      if (collect(n.children)) return true;
    }
    return false;
  }
  function collectAll(node: CategoryNode) {
    ids.push(node.id);
    node.children.forEach(collectAll);
  }
  collect(tree);
  return ids;
}

function renderCategoryOptions(nodes: CategoryNode[], depth = 0): React.ReactNode[] {
  const result: React.ReactNode[] = [];
  for (const node of nodes) {
    const prefix = depth > 0 ? "─ ".repeat(depth) : "";
    result.push(
      <SelectItem key={node.id} value={node.id}>
        <span className="flex items-center gap-1">
          {depth > 0 && <ChevronLeft className="h-3 w-3 text-muted-foreground inline" />}
          {prefix}
          {node.name}
        </span>
      </SelectItem>,
    );
    result.push(...renderCategoryOptions(node.children, depth + 1));
  }
  return result;
}

const productGlobalFilter: FilterFn<ProductRow> = (row, _columnId, filterValue) => {
  const search = (filterValue as string).toLowerCase();
  const p = row.original;
  const categoryName = (p as any).product_categories?.name || p.category || "";
  const brandName = (p as any).product_brands?.name || "";
  const fields = [p.name, p.code, p.barcode, p.model_number, categoryName, brandName];
  return fields.some((f) => f && f.toLowerCase().includes(search));
};

export default function Products() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");
  const [categories, setCategories] = useState<
    { id: string; name: string; parent_id: string | null; is_active: boolean }[]
  >([]);
  const { settings } = useSettings();

  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*, product_categories(name), product_units(name), product_brands(name)" as any)
      .order("code");
    if (error) {
      toast({ title: "خطأ", description: "فشل في جلب المنتجات", variant: "destructive" });
    } else {
      setProducts((data || []) as any);
    }
    setLoading(false);
  };

  const fetchCategories = async () => {
    const { data } = await (supabase.from("product_categories" as any) as any)
      .select("id, name, parent_id, is_active")
      .eq("is_active", true)
      .order("name");
    setCategories(data || []);
  };

  useEffect(() => {
    fetchProducts();
    fetchCategories();
  }, []);

  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);

  const stats = useMemo(() => {
    const total = products.length;
    const available = products.filter((p) => p.quantity_on_hand > p.min_stock_level).length;
    const lowStock = products.filter((p) => p.quantity_on_hand > 0 && p.quantity_on_hand <= p.min_stock_level).length;
    const outOfStock = products.filter((p) => p.quantity_on_hand <= 0).length;
    const totalValue = products.reduce((s, p) => s + p.quantity_on_hand * p.purchase_price, 0);
    return { total, available, lowStock, outOfStock, totalValue };
  }, [products]);

  const matchingCategoryIds = useMemo(() => {
    if (categoryFilter === "all") return null;
    return getDescendantIds(categoryTree, categoryFilter);
  }, [categoryFilter, categoryTree]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesCategory = !matchingCategoryIds || (p.category_id && matchingCategoryIds.includes(p.category_id));
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "low" && p.quantity_on_hand > 0 && p.quantity_on_hand <= p.min_stock_level) ||
        (stockFilter === "out" && p.quantity_on_hand <= 0);
      return matchesCategory && matchesStock;
    });
  }, [products, matchingCategoryIds, stockFilter]);

  const handleDelete = async (product: ProductRow) => {
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", product.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف المنتج", variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف المنتج بنجاح" });
      fetchProducts();
    }
  };

  const formatNum = (val: number) =>
    Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCurrency = (val: number) => `${formatNum(val)} EGP`;

  const getCategoryName = (p: ProductRow) => (p as any).product_categories?.name || p.category || "-";
  const getBrandName = (p: ProductRow) => (p as any).product_brands?.name || "-";

  const getStockBadge = (product: ProductRow) => {
    if (product.quantity_on_hand <= 0)
      return (
        <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-destructive/10 text-destructive">
          نفذت الكمية
        </span>
      );
    if (product.quantity_on_hand <= product.min_stock_level)
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

  const exportConfig = useMemo(
    () => ({
      filenamePrefix: "المنتجات",
      sheetName: "المنتجات",
      pdfTitle: "قائمة المنتجات",
      headers: [
        "الكود",
        "الاسم",
        "الماركة",
        "رقم الموديل",
        "الباركود",
        "التصنيف",
        "سعر الشراء",
        "سعر البيع",
        "الكمية",
        "الحد الأدنى",
      ],
      rows: filteredProducts.map((p) => [
        p.code,
        p.name,
        getBrandName(p),
        p.model_number || "",
        p.barcode || "",
        getCategoryName(p),
        formatNum(p.purchase_price),
        formatNum(p.selling_price),
        Number(p.quantity_on_hand),
        Number(p.min_stock_level),
      ]),
      settings,
      pdfOrientation: "landscape" as const,
    }),
    [filteredProducts, settings],
  );

  const columns: ColumnDef<ProductRow, any>[] = [
    {
      id: "product_info",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المنتج" />,
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
            <p className="text-sm font-bold text-foreground">{row.original.name}</p>
            <p className="text-xs text-muted-foreground">
              {getBrandName(row.original) !== "-" ? getBrandName(row.original) : ""}
              {row.original.model_number && getBrandName(row.original) !== "-" ? " - " : ""}
              {row.original.model_number || ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="كود الصنف" />,
      cell: ({ row }) => <span className="font-mono text-sm text-foreground">{row.original.code}</span>,
    },
    {
      id: "category",
      header: "التصنيف",
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{getCategoryName(row.original)}</span>,
    },
    {
      accessorKey: "selling_price",
      header: ({ column }) => <DataTableColumnHeader column={column} title="سعر الوحدة" />,
      cell: ({ row }) => (
        <span className="text-sm font-bold text-foreground">{formatCurrency(row.original.selling_price)}</span>
      ),
    },
    {
      accessorKey: "quantity_on_hand",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الكمية" />,
      cell: ({ row }) => <span className="text-sm text-foreground">{row.original.quantity_on_hand} وحدة</span>,
    },
    {
      id: "stock_status",
      header: "الحالة",
      cell: ({ row }) => getStockBadge(row.original),
    },
    {
      id: "actions",
      header: "الإجراءات",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
            onClick={() => navigate(`/products/${row.original.id}`)}
          >
            <Eye className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5"
              onClick={() => navigate(`/products/${row.original.id}/edit`)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                  <AlertDialogDescription>هل أنت متأكد من حذف المنتج "{row.original.name}"؟</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogAction
                    onClick={() => handleDelete(row.original)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    حذف
                  </AlertDialogAction>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ),
    },
  ];

  const statCards = [
    {
      label: "إجمالي الأصناف",
      value: stats.total,
      icon: Package,
      iconBg: "bg-blue-100 dark:bg-blue-500/20",
      iconColor: "text-blue-600 dark:text-blue-400",
    },
    {
      label: "متوفر بالمخزن",
      value: stats.available,
      icon: CheckCircle2,
      iconBg: "bg-green-100 dark:bg-green-500/20",
      iconColor: "text-green-600 dark:text-green-400",
    },
    {
      label: "أصناف منخفضة",
      value: stats.lowStock,
      icon: AlertTriangle,
      iconBg: "bg-amber-100 dark:bg-amber-500/20",
      iconColor: "text-amber-600 dark:text-amber-400",
    },
    {
      label: "أصناف منتهية",
      value: stats.outOfStock,
      icon: XCircle,
      iconBg: "bg-red-100 dark:bg-red-500/20",
      iconColor: "text-red-600 dark:text-red-400",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-foreground flex items-center">
            <div className="bg-primary/10 p-2 rounded-lg ml-3">
              <Package className="h-5 w-5 text-primary" />
            </div>
            إدارة المخزون والمنتجات
          </h2>
          <p className="text-muted-foreground text-sm mt-1">عرض وتتبع كافة الأصناف المتوفرة في المخازن.</p>
        </div>
        <div className="flex items-center gap-3">
          {canEdit && (
            <>
              <Button variant="outline" className="gap-2 shadow-sm" onClick={() => navigate("/products/import")}>
                <Upload className="h-4 w-4" />
                استيراد البيانات
              </Button>
              <ExportMenu config={exportConfig} disabled={loading} />
              <Button className="gap-2 shadow-md shadow-primary/20 font-bold" onClick={() => navigate("/products/new")}>
                <Plus className="h-4 w-4" />
                إضافة منتج جديد
              </Button>
            </>
          )}
          {!canEdit && <ExportMenu config={exportConfig} disabled={loading} />}
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(({ label, value, icon: Icon, iconBg, iconColor }) => (
          <div key={label} className="bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-full ${iconBg}`}>
              <Icon className={`h-5 w-5 ${iconColor}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-xl font-black text-foreground">{value.toLocaleString()}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Data Table with filters */}
      <DataTable
        columns={columns}
        data={filteredProducts}
        searchPlaceholder="البحث بواسطة اسم المنتج، الكود، أو الباركود..."
        isLoading={loading}
        emptyMessage="لا توجد منتجات"
        onRowClick={(p) => navigate(`/products/${p.id}`)}
        globalFilterFn={productGlobalFilter}
        toolbarContent={
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-48 bg-card border-border">
                <SelectValue placeholder="كافة التصنيفات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كافة التصنيفات</SelectItem>
                {renderCategoryOptions(categoryTree)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
              <SelectTrigger className="w-40 bg-card border-border">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">حالة المخزون</SelectItem>
                <SelectItem value="low">مخزون منخفض</SelectItem>
                <SelectItem value="out">نفذت الكمية</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      />
    </div>
  );
}
