import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LookupCombobox } from "@/components/LookupCombobox";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Search, ShoppingCart, Eye, CheckCircle, X } from "lucide-react";

interface Supplier { id: string; code: string; name: string; }
interface Product { id: string; code: string; name: string; purchase_price: number; }
interface InvoiceItem { product_id: string; product_name: string; quantity: number; unit_price: number; discount: number; total: number; }
interface Invoice {
  id: string; invoice_number: number; supplier_id: string | null; supplier_name?: string;
  invoice_date: string; status: string; subtotal: number; discount: number; tax: number; total: number; paid_amount: number; notes: string | null;
}

// Account IDs - fetched dynamically
const ACCOUNT_CODES = {
  INVENTORY: "1104",      // المخزون
  SUPPLIERS: "2101",      // الموردون (الدائنون)
};

export default function Purchases() {
  const { role } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [viewItems, setViewItems] = useState<any[]>([]);

  // Form
  const [supplierId, setSupplierId] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([]);

  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [invRes, supRes, prodRes] = await Promise.all([
      (supabase.from("purchase_invoices" as any) as any).select("*, suppliers:supplier_id(name)").order("invoice_number", { ascending: false }),
      (supabase.from("suppliers" as any) as any).select("id, code, name").eq("is_active", true).order("name"),
      supabase.from("products").select("id, code, name, purchase_price").eq("is_active", true).order("name"),
    ]);
    setInvoices((invRes.data || []).map((inv: any) => ({ ...inv, supplier_name: inv.suppliers?.name })));
    setSuppliers(supRes.data || []);
    setProducts(prodRes.data || []);
    setLoading(false);
  }

  function openAdd() {
    setSupplierId("");
    setInvoiceDate(new Date().toISOString().split("T")[0]);
    setNotes("");
    setItems([]);
    setDialogOpen(true);
  }

  function addItem() {
    setItems(prev => [...prev, { product_id: "", product_name: "", quantity: 1, unit_price: 0, discount: 0, total: 0 }]);
  }

  function updateItem(index: number, field: string, value: any) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "product_id") {
        const prod = products.find(p => p.id === value);
        if (prod) { item.product_name = prod.name; item.unit_price = prod.purchase_price; }
      }
      item.total = (item.quantity * item.unit_price) - item.discount;
      updated[index] = item;
      return updated;
    });
  }

  function removeItem(index: number) { setItems(prev => prev.filter((_, i) => i !== index)); }

  const subtotal = items.reduce((s, i) => s + i.total, 0);

  async function handleSave() {
    if (!supplierId || items.length === 0) {
      toast({ title: "تنبيه", description: "يرجى اختيار المورد وإضافة أصناف", variant: "destructive" });
      return;
    }
    if (items.some(i => !i.product_id)) {
      toast({ title: "تنبيه", description: "يرجى اختيار المنتج لكل صنف", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const invoicePayload: any = {
        supplier_id: supplierId,
        invoice_date: invoiceDate,
        subtotal, discount: 0, tax: 0, total: subtotal,
        notes: notes.trim() || null,
        status: "draft",
      };
      const { data: inv, error } = await (supabase.from("purchase_invoices" as any) as any).insert(invoicePayload).select("id").single();
      if (error) throw error;

      const rows = items.map(i => ({
        invoice_id: inv.id,
        product_id: i.product_id,
        description: i.product_name,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount,
        total: i.total,
      }));
      const { error: itemsError } = await (supabase.from("purchase_invoice_items" as any) as any).insert(rows);
      if (itemsError) throw itemsError;

      toast({ title: "تمت الإضافة", description: "تم إنشاء فاتورة الشراء كمسودة" });
      setDialogOpen(false);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function postInvoice(inv: Invoice) {
    try {
      // Get account IDs
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.INVENTORY, ACCOUNT_CODES.SUPPLIERS]);
      const inventoryAcc = accounts?.find(a => a.code === ACCOUNT_CODES.INVENTORY);
      const supplierAcc = accounts?.find(a => a.code === ACCOUNT_CODES.SUPPLIERS);
      if (!inventoryAcc || !supplierAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود حسابات المخزون والموردين في شجرة الحسابات", variant: "destructive" });
        return;
      }

      // Create journal entry: Debit Inventory, Credit Suppliers
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `فاتورة شراء رقم ${inv.invoice_number}`,
        entry_date: inv.invoice_date,
        total_debit: inv.total,
        total_credit: inv.total,
        status: "posted",
      } as any).select("id").single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: inventoryAcc.id, debit: inv.total, credit: 0, description: `مشتريات - فاتورة ${inv.invoice_number}` },
        { journal_entry_id: je.id, account_id: supplierAcc.id, debit: 0, credit: inv.total, description: `مستحقات مورد - فاتورة ${inv.invoice_number}` },
      ] as any);

      // Update invoice status + link journal entry
      await (supabase.from("purchase_invoices" as any) as any).update({ status: "posted", journal_entry_id: je.id }).eq("id", inv.id);

      // Update product quantities
      const { data: invoiceItems } = await (supabase.from("purchase_invoice_items" as any) as any).select("product_id, quantity").eq("invoice_id", inv.id);
      if (invoiceItems) {
        for (const item of invoiceItems) {
          const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
          if (prod) {
            await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand + item.quantity } as any).eq("id", item.product_id);
          }
        }
      }

      // Update supplier balance
      await (supabase.from("suppliers" as any) as any).update({ balance: (suppliers.find(s => s.id === inv.supplier_id) as any)?.balance || 0 + inv.total }).eq("id", inv.supplier_id);

      toast({ title: "تم الترحيل", description: "تم ترحيل فاتورة الشراء وتوليد القيد المحاسبي وتحديث المخزون" });
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function viewInvoiceDetails(inv: Invoice) {
    setViewInvoice(inv);
    const { data } = await (supabase.from("purchase_invoice_items" as any) as any).select("*, products:product_id(name, code)").eq("invoice_id", inv.id);
    setViewItems(data || []);
  }

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  const filtered = invoices.filter(inv => {
    const matchSearch = !search || inv.supplier_name?.includes(search) || String(inv.invoice_number).includes(search);
    const matchStatus = statusFilter === "all" || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">فواتير الشراء</h1>
            <p className="text-sm text-muted-foreground">{invoices.length} فاتورة</p>
          </div>
        </div>
        {canEdit && <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" />فاتورة جديدة</Button>}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "الكل", value: invoices.length, filter: "all" },
          { label: "مسودة", value: invoices.filter(i => i.status === "draft").length, filter: "draft" },
          { label: "مُرحّل", value: invoices.filter(i => i.status === "posted").length, filter: "posted" },
          { label: "إجمالي المشتريات", value: invoices.filter(i => i.status === "posted").reduce((s, i) => s + i.total, 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " EGP", filter: "" },
        ].map(({ label, value, filter }) => (
          <button key={label} onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-3 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground mt-1">{value}</p>
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث برقم الفاتورة أو اسم المورد..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">رقم الفاتورة</TableHead>
                  <TableHead className="text-right">المورد</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right w-[120px]">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">لا توجد فواتير</TableCell></TableRow>
                ) : filtered.map(inv => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono">#{inv.invoice_number}</TableCell>
                    <TableCell className="font-medium">{inv.supplier_name || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{inv.invoice_date}</TableCell>
                    <TableCell className="font-mono">{inv.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <Badge variant={statusColors[inv.status] as any}>{statusLabels[inv.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => viewInvoiceDetails(inv)}><Eye className="h-4 w-4" /></Button>
                        {canEdit && inv.status === "draft" && (
                          <Button variant="ghost" size="icon" onClick={() => postInvoice(inv)} title="ترحيل">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          </Button>
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

      {/* Create Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>فاتورة شراء جديدة</DialogTitle>
            <DialogDescription>أدخل بيانات الفاتورة والأصناف</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المورد *</Label>
                <LookupCombobox items={suppliers} value={supplierId} onValueChange={setSupplierId} placeholder="اختر المورد" />
              </div>
              <div className="space-y-2">
                <Label>تاريخ الفاتورة</Label>
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>الأصناف</Label>
                <Button variant="outline" size="sm" onClick={addItem} className="gap-1"><Plus className="h-3 w-3" />إضافة صنف</Button>
              </div>
              {items.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right">المنتج</TableHead>
                        <TableHead className="text-right w-[80px]">الكمية</TableHead>
                        <TableHead className="text-right w-[100px]">السعر</TableHead>
                        <TableHead className="text-right w-[80px]">الخصم</TableHead>
                        <TableHead className="text-right w-[100px]">الإجمالي</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <LookupCombobox
                              items={products.map(p => ({ id: p.id, name: `${p.code} - ${p.name}` }))}
                              value={item.product_id}
                              onValueChange={v => updateItem(i, "product_id", v)}
                              placeholder="اختر المنتج"
                            />
                          </TableCell>
                          <TableCell><Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="font-mono" /></TableCell>
                          <TableCell><Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="font-mono" /></TableCell>
                          <TableCell><Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono" /></TableCell>
                          <TableCell className="font-mono text-sm">{item.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(i)}><X className="h-4 w-4 text-destructive" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {items.length > 0 && (
                <div className="text-left font-bold text-lg p-2 bg-muted/30 rounded-lg">
                  الإجمالي: {subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" rows={2} />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ كمسودة"}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={!!viewInvoice} onOpenChange={() => setViewInvoice(null)}>
        <DialogContent dir="rtl" className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>فاتورة شراء #{viewInvoice?.invoice_number}</DialogTitle>
            <DialogDescription>
              المورد: {viewInvoice?.supplier_name} | التاريخ: {viewInvoice?.invoice_date} | الحالة: {statusLabels[viewInvoice?.status || "draft"]}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المنتج</TableHead>
                  <TableHead className="text-right">الكمية</TableHead>
                  <TableHead className="text-right">السعر</TableHead>
                  <TableHead className="text-right">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {viewItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.products?.name || item.description}</TableCell>
                    <TableCell className="font-mono">{item.quantity}</TableCell>
                    <TableCell className="font-mono">{item.unit_price}</TableCell>
                    <TableCell className="font-mono">{item.total}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="text-left font-bold text-lg">الإجمالي: {viewInvoice?.total.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP</div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
