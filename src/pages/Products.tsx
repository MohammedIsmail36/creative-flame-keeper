import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { Package, Plus, Pencil, Trash2, Search, AlertTriangle, CheckCircle, Archive, DollarSign, Download } from "lucide-react";

interface Product {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  unit: string;
  purchase_price: number;
  selling_price: number;
  quantity_on_hand: number;
  min_stock_level: number;
  is_active: boolean;
  created_at: string;
}

const CATEGORIES = ["عام", "إلكترونيات", "أثاث", "مواد غذائية", "مستلزمات مكتبية", "قطع غيار", "مواد خام", "أخرى"];
const UNITS = ["قطعة", "كيلو", "متر", "لتر", "علبة", "كرتون", "طن", "دزينة"];

export default function Products() {
  const { role } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "out">("all");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Form state
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formCategory, setFormCategory] = useState("عام");
  const [formUnit, setFormUnit] = useState("قطعة");
  const [formPurchasePrice, setFormPurchasePrice] = useState(0);
  const [formSellingPrice, setFormSellingPrice] = useState(0);
  const [formQuantity, setFormQuantity] = useState(0);
  const [formMinStock, setFormMinStock] = useState(0);

  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const fetchProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_active", true)
      .order("code");
    if (error) {
      toast({ title: "خطأ", description: "فشل في جلب المنتجات", variant: "destructive" });
    } else {
      setProducts((data || []) as Product[]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchProducts(); }, []);

  const categories = useMemo(() => {
    const set = new Set(products.map(p => p.category));
    return Array.from(set).sort();
  }, [products]);

  const stats = useMemo(() => {
    const total = products.length;
    const lowStock = products.filter(p => p.quantity_on_hand > 0 && p.quantity_on_hand <= p.min_stock_level).length;
    const outOfStock = products.filter(p => p.quantity_on_hand <= 0).length;
    const totalValue = products.reduce((s, p) => s + (p.quantity_on_hand * p.purchase_price), 0);
    return { total, lowStock, outOfStock, totalValue };
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchesSearch = !searchQuery || p.name.includes(searchQuery) || p.code.includes(searchQuery);
      const matchesCategory = categoryFilter === "all" || p.category === categoryFilter;
      const matchesStock = stockFilter === "all"
        || (stockFilter === "low" && p.quantity_on_hand > 0 && p.quantity_on_hand <= p.min_stock_level)
        || (stockFilter === "out" && p.quantity_on_hand <= 0);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [products, searchQuery, categoryFilter, stockFilter]);

  const openAddDialog = () => {
    setEditingProduct(null);
    setFormCode("");
    setFormName("");
    setFormDescription("");
    setFormCategory("عام");
    setFormUnit("قطعة");
    setFormPurchasePrice(0);
    setFormSellingPrice(0);
    setFormQuantity(0);
    setFormMinStock(0);
    setDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    setFormCode(product.code);
    setFormName(product.name);
    setFormDescription(product.description || "");
    setFormCategory(product.category);
    setFormUnit(product.unit);
    setFormPurchasePrice(product.purchase_price);
    setFormSellingPrice(product.selling_price);
    setFormQuantity(product.quantity_on_hand);
    setFormMinStock(product.min_stock_level);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formCode.trim() || !formName.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال كود واسم المنتج", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload = {
      code: formCode.trim(),
      name: formName.trim(),
      description: formDescription.trim() || null,
      category: formCategory,
      unit: formUnit,
      purchase_price: formPurchasePrice,
      selling_price: formSellingPrice,
      quantity_on_hand: formQuantity,
      min_stock_level: formMinStock,
    };

    try {
      if (editingProduct) {
        const { error } = await supabase.from("products").update(payload).eq("id", editingProduct.id);
        if (error) throw error;
        toast({ title: "تم التحديث", description: "تم تعديل المنتج بنجاح" });
      } else {
        const { error } = await supabase.from("products").insert(payload);
        if (error) throw error;
        toast({ title: "تمت الإضافة", description: "تم إضافة المنتج بنجاح" });
      }
      setDialogOpen(false);
      fetchProducts();
    } catch (error: any) {
      const msg = error.message?.includes("duplicate") ? "كود المنتج موجود مسبقاً" : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (product: Product) => {
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

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = filteredProducts.map(p => ({
      "الكود": p.code, "الاسم": p.name, "التصنيف": p.category, "الوحدة": p.unit,
      "سعر الشراء": p.purchase_price, "سعر البيع": p.selling_price,
      "الكمية": p.quantity_on_hand, "الحد الأدنى": p.min_stock_level,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "Products.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير المنتجات بصيغة Excel" });
    setExportMenuOpen(false);
  };

  const handleExportPDF = async () => {
    const { createArabicPDF } = await import("@/lib/pdf-arabic");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = await createArabicPDF("landscape");

    doc.setFontSize(16);
    doc.text("قائمة المنتجات", 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`التاريخ: ${new Date().toLocaleDateString("en-US")} | العملة: EGP`, 148, 22, { align: "center" });

    const tableData = filteredProducts.map(p => [
      p.code, p.name, p.category, p.unit,
      formatNum(p.purchase_price), formatNum(p.selling_price),
      p.quantity_on_hand, p.min_stock_level,
    ]);

    autoTable(doc, {
      head: [["الكود", "الاسم", "التصنيف", "الوحدة", "سعر الشراء", "سعر البيع", "الكمية", "الحد الأدنى"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 9, cellPadding: 3, font: "Amiri", halign: "right" },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    });

    doc.save("Products.pdf");
    toast({ title: "تم التصدير", description: "تم تصدير المنتجات بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const getStockBadge = (product: Product) => {
    if (product.quantity_on_hand <= 0) {
      return <Badge variant="destructive" className="text-xs">نفذ</Badge>;
    }
    if (product.quantity_on_hand <= product.min_stock_level) {
      return <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-xs">منخفض</Badge>;
    }
    return <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">متوفر</Badge>;
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
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
            <Button className="gap-2" onClick={openAddDialog}>
              <Plus className="h-4 w-4" />
              منتج جديد
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="البحث بالاسم أو الكود..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pr-10" />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="التصنيف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل التصنيفات</SelectItem>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={stockFilter} onValueChange={(v) => setStockFilter(v as any)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
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
        </CardContent>
      </Card>

      {/* Products Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            قائمة المنتجات
            <Badge variant="secondary" className="mr-2">{filteredProducts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد منتجات</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-right">الكود</TableHead>
                  <TableHead className="text-right">المنتج</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">الوحدة</TableHead>
                  <TableHead className="text-right">سعر الشراء</TableHead>
                  <TableHead className="text-right">سعر البيع</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProducts.map(product => (
                  <TableRow key={product.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono font-medium">{product.code}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{product.name}</p>
                        {product.description && <p className="text-xs text-muted-foreground truncate max-w-[200px]">{product.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{product.category}</Badge></TableCell>
                    <TableCell className="text-muted-foreground">{product.unit}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(product.purchase_price)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(product.selling_price)}</TableCell>
                    <TableCell className="font-mono font-medium">{product.quantity_on_hand}</TableCell>
                    <TableCell>{getStockBadge(product)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openEditDialog(product)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                <AlertDialogDescription>هل أنت متأكد من حذف المنتج "{product.name}"؟</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-row-reverse gap-2">
                                <AlertDialogAction onClick={() => handleDelete(product)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingProduct ? `تعديل المنتج: ${editingProduct.name}` : "إضافة منتج جديد"}</DialogTitle>
            <DialogDescription>{editingProduct ? "قم بتعديل بيانات المنتج" : "أدخل بيانات المنتج الجديد"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>كود المنتج *</Label>
                <Input value={formCode} onChange={e => setFormCode(e.target.value)} placeholder="مثال: P001" className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>اسم المنتج *</Label>
                <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="اسم المنتج" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="وصف المنتج (اختياري)" rows={2} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <Select value={formCategory} onValueChange={setFormCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>وحدة القياس</Label>
                <Select value={formUnit} onValueChange={setFormUnit}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>سعر الشراء</Label>
                <Input type="number" min="0" step="0.01" value={formPurchasePrice || ""} onChange={e => setFormPurchasePrice(parseFloat(e.target.value) || 0)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>سعر البيع</Label>
                <Input type="number" min="0" step="0.01" value={formSellingPrice || ""} onChange={e => setFormSellingPrice(parseFloat(e.target.value) || 0)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>الكمية المتاحة</Label>
                <Input type="number" min="0" value={formQuantity || ""} onChange={e => setFormQuantity(parseFloat(e.target.value) || 0)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>الحد الأدنى</Label>
                <Input type="number" min="0" value={formMinStock || ""} onChange={e => setFormMinStock(parseFloat(e.target.value) || 0)} className="font-mono" />
              </div>
            </div>
            {formSellingPrice > 0 && formPurchasePrice > 0 && (
              <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-3">
                هامش الربح: <strong className="text-foreground">{formatCurrency(formSellingPrice - formPurchasePrice)}</strong>
                {" "}({((formSellingPrice - formPurchasePrice) / formPurchasePrice * 100).toFixed(1)}%)
              </div>
            )}
          </div>
          <DialogFooter className="flex-row-reverse gap-2 pt-4">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : editingProduct ? "تحديث" : "إضافة"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
