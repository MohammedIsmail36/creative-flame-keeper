import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Package, Plus, Pencil, Trash2, AlertTriangle, Archive, DollarSign, Download, Eye, Upload } from "lucide-react";

interface ProductRow {
  id: string; code: string; name: string; description: string | null;
  barcode: string | null; model_number: string | null; main_image_url: string | null;
  purchase_price: number; selling_price: number; quantity_on_hand: number;
  min_stock_level: number; is_active: boolean; created_at: string;
  category: string | null; unit: string | null; brand_id: string | null;
  category_id: string | null; unit_id: string | null;
  product_categories?: { name: string } | null;
  product_units?: { name: string } | null;
  product_brands?: { name: string } | null;
}

export default function Products() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*, product_categories(name), product_units(name), product_brands(name)" as any)
      .eq("is_active", true)
      .order("code");
    if (error) {
      toast({ title: "خطأ", description: "فشل في جلب المنتجات", variant: "destructive" });
    } else {
      setProducts((data || []) as any);
    }
    setLoading(false);
  };

  const fetchCategories = async () => {
    const { data } = await (supabase.from("product_categories" as any) as any).select("id, name").eq("is_active", true).order("name");
    setCategories(data || []);
  };

  useEffect(() => { fetchProducts(); fetchCategories(); }, []);

  const stats = useMemo(() => {
    const total = products.length;
    const lowStock = products.filter(p => p.quantity_on_hand > 0 && p.quantity_on_hand <= p.min_stock_level).length;
    const outOfStock = products.filter(p => p.quantity_on_hand <= 0).length;
    const totalValue = products.reduce((s, p) => s + (p.quantity_on_hand * p.purchase_price), 0);
    return { total, lowStock, outOfStock, totalValue };
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesCategory = categoryFilter === "all" || p.category_id === categoryFilter;
      const matchesStock = stockFilter === "all"
        || (stockFilter === "low" && p.quantity_on_hand > 0 && p.quantity_on_hand <= p.min_stock_level)
        || (stockFilter === "out" && p.quantity_on_hand <= 0);
      return matchesCategory && matchesStock;
    });
  }, [products, categoryFilter, stockFilter]);

  const handleDelete = async (product: ProductRow) => {
    const { error } = await supabase.from("products").update({ is_active: false }).eq("id", product.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف المنتج", variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف المنتج بنجاح" });
      fetchProducts();
    }
  };

  const formatNum = (val: number) => Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCurrency = (val: number) => `${formatNum(val)} EGP`;

  const getCategoryName = (p: ProductRow) => (p as any).product_categories?.name || p.category || "-";
  const getBrandName = (p: ProductRow) => (p as any).product_brands?.name || "-";

  const getStockBadge = (product: ProductRow) => {
    if (product.quantity_on_hand <= 0) return <Badge variant="destructive" className="text-xs">نفذ</Badge>;
    if (product.quantity_on_hand <= product.min_stock_level) return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">منخفض</Badge>;
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">متوفر</Badge>;
  };

  const handleExportExcel = async () => {
    const { exportToExcel } = await import("@/lib/excel-export");
    const data = filteredProducts.map(p => ({
      "الكود": p.code, "الاسم": p.name, "الباركود": p.barcode || "",
      "التصنيف": getCategoryName(p),
      "سعر الشراء": p.purchase_price, "سعر البيع": p.selling_price,
      "الكمية": p.quantity_on_hand, "الحد الأدنى": p.min_stock_level,
    }));
    await exportToExcel(data, "Products", "Products.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير المنتجات بصيغة Excel" });
    setExportMenuOpen(false);
  };

  const handleExportPDF = async () => {
    const { createArabicPDF } = await import("@/lib/pdf-arabic");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = await createArabicPDF("landscape");
    doc.setFontSize(16);
    doc.text("قائمة المنتجات", 148, 15, { align: "center" });
    const tableData = filteredProducts.map(p => [
      p.code, p.name, p.barcode || "", getCategoryName(p),
      formatNum(p.purchase_price), formatNum(p.selling_price), p.quantity_on_hand, p.min_stock_level,
    ]);
    autoTable(doc, {
      head: [["الكود", "الاسم", "الباركود", "التصنيف", "سعر الشراء", "سعر البيع", "الكمية", "الحد الأدنى"]],
      body: tableData, startY: 28,
      styles: { fontSize: 9, cellPadding: 3, font: "Amiri", halign: "right" },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    });
    doc.save("Products.pdf");
    toast({ title: "تم التصدير", description: "تم تصدير المنتجات بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const columns: ColumnDef<ProductRow, any>[] = [
    {
      id: "image",
      header: "",
      enableHiding: false,
      cell: ({ row }) => row.original.main_image_url ? (
        <img src={row.original.main_image_url} alt={row.original.name} className="h-10 w-10 rounded-lg object-cover border" />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الكود" />,
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.code}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المنتج" />,
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.name}</p>
          {row.original.barcode && <p className="text-xs text-muted-foreground font-mono">{row.original.barcode}</p>}
        </div>
      ),
    },
    {
      id: "brand",
      header: "الماركة",
      cell: ({ row }) => <span className="text-muted-foreground">{getBrandName(row.original)}</span>,
    },
    {
      id: "category",
      header: "التصنيف",
      cell: ({ row }) => <Badge variant="outline" className="text-xs">{getCategoryName(row.original)}</Badge>,
    },
    {
      accessorKey: "purchase_price",
      header: ({ column }) => <DataTableColumnHeader column={column} title="سعر الشراء" />,
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.purchase_price)}</span>,
    },
    {
      accessorKey: "selling_price",
      header: ({ column }) => <DataTableColumnHeader column={column} title="سعر البيع" />,
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.selling_price)}</span>,
    },
    {
      accessorKey: "quantity_on_hand",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الكمية" />,
      cell: ({ row }) => <span className="font-mono font-medium">{row.original.quantity_on_hand}</span>,
    },
    {
      id: "stock_status",
      header: "الحالة",
      cell: ({ row }) => getStockBadge(row.original),
    },
    {
      id: "actions",
      header: "إجراءات",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/products/${row.original.id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
          {canEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/products/${row.original.id}/edit`)}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                  <AlertDialogDescription>هل أنت متأكد من حذف المنتج "{row.original.name}"؟</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogAction onClick={() => handleDelete(row.original)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Package className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">المنتجات والمخزون</h1>
            <p className="text-sm text-muted-foreground">{products.length} منتج</p>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="outline" className="gap-2" onClick={() => navigate("/products/import")}>
                <Upload className="h-4 w-4" />
                استيراد
              </Button>
              <Button className="gap-2" onClick={() => navigate("/products/new")}>
                <Plus className="h-4 w-4" />
                منتج جديد
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي المنتجات", value: stats.total, icon: Package, color: "bg-foreground/5 text-foreground" },
          { label: "مخزون منخفض", value: stats.lowStock, icon: AlertTriangle, color: "bg-amber-500/10 text-amber-600" },
          { label: "نفذ من المخزون", value: stats.outOfStock, icon: Archive, color: "bg-destructive/10 text-destructive" },
          { label: "قيمة المخزون", value: formatCurrency(stats.totalValue), icon: DollarSign, color: "bg-blue-500/10 text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xl font-bold text-foreground">{value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredProducts}
        searchPlaceholder="البحث بالاسم أو الكود أو الباركود..."
        isLoading={loading}
        emptyMessage="لا توجد منتجات"
        onRowClick={(p) => navigate(`/products/${p.id}`)}
        toolbarContent={
          <div className="flex gap-2 flex-wrap">
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="التصنيف" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل المخزون</SelectItem>
                <SelectItem value="low">مخزون منخفض</SelectItem>
                <SelectItem value="out">نفذ</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative">
              <Button variant="outline" className="gap-2" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
                <Download className="h-4 w-4" />
                تصدير
              </Button>
              {exportMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[140px]">
                  <button onClick={handleExportPDF} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">PDF تصدير</button>
                  <button onClick={handleExportExcel} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">Excel تصدير</button>
                </div>
              )}
            </div>
          </div>
        }
      />
    </div>
  );
}
