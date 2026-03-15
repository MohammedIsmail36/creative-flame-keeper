import React, { useState, useEffect } from "react";
import { getNextPostedNumber, formatDisplayNumber } from "@/lib/posted-number-utils";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { LookupCombobox } from "@/components/LookupCombobox";
import { toast } from "@/hooks/use-toast";
import { exportInvoicePdf } from "@/lib/pdf-arabic";
import { Plus, X, Save, CheckCircle, Printer, Pencil, Trash2, Ban, Truck, FileText, ListChecks, CreditCard, StickyNote, ArrowLeftRight } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import InvoicePaymentSection from "@/components/InvoicePaymentSection";
import OutstandingCreditsSection from "@/components/OutstandingCreditsSection";
import { recalculateEntityBalance } from "@/lib/entity-balance";

import { ProductWithBrand, productsToLookupItems, formatProductName, formatProductDisplay, PRODUCT_SELECT_FIELDS_BASIC } from "@/lib/product-utils";

interface Supplier { id: string; code: string; name: string; balance?: number; }
type Product = ProductWithBrand & { purchase_price: number; };
interface InvoiceItem { id?: string; product_id: string; product_name: string; quantity: number; unit_price: number; discount: number; total: number; }

const ACCOUNT_CODES = {
  INVENTORY: "1104",
  SUPPLIERS: "2101",
};

// ── Section Header Component ──
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-4 w-4 text-primary" />
      </div>
      <h2 className="text-base font-bold text-foreground">{title}</h2>
    </div>
  );
}

export default function PurchaseInvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant";

  const showTax = settings?.show_tax_on_invoice ?? false;
  const showDiscount = settings?.show_discount_on_invoice ?? true;
  const taxRate = settings?.tax_rate ?? 0;

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState<number | null>(null);
  const [postedNumber, setPostedNumber] = useState<number | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [editMode, setEditMode] = useState(true);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [supRes, prodRes] = await Promise.all([
      (supabase.from("suppliers" as any) as any).select("id, code, name, balance").eq("is_active", true).order("name"),
      supabase.from("products").select(PRODUCT_SELECT_FIELDS_BASIC).eq("is_active", true).order("name"),
    ]);
    setSuppliers(supRes.data || []);
    setProducts(prodRes.data || []);

    if (id) {
      const { data: inv } = await (supabase.from("purchase_invoices" as any) as any)
        .select("*, suppliers:supplier_id(name)").eq("id", id).single();
      if (inv) {
        setInvoiceNumber(inv.invoice_number);
        setPostedNumber(inv.posted_number || null);
        setSupplierId(inv.supplier_id || "");
        setSupplierName(inv.suppliers?.name || "");
        setInvoiceDate(inv.invoice_date);
        setNotes(inv.notes || "");
        setReference(inv.reference || "");
        setStatus(inv.status);
        setEditMode(inv.status === "draft");

        const { data: itemsData } = await (supabase.from("purchase_invoice_items" as any) as any)
          .select("*, products:product_id(name, code, model_number, product_brands(name))").eq("invoice_id", id);
        setItems((itemsData || []).map((it: any) => ({
          id: it.id, product_id: it.product_id || "", product_name: it.products ? formatProductDisplay(it.products.name, it.products.product_brands?.name, it.products.model_number) : (it.description || ""),
          quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, total: it.total,
        })));
      }
      setLoading(false);
    } else {
      setEditMode(true);
      setLoading(false);
    }
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
        if (prod) { item.product_name = formatProductName(prod); item.unit_price = prod.purchase_price; }
      }
      item.total = (item.quantity * item.unit_price) - item.discount;
      updated[index] = item;
      return updated;
    });
  }

  function removeItem(index: number) { setItems(prev => prev.filter((_, i) => i !== index)); }

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmount = showTax ? subtotal * (taxRate / 100) : 0;
  const grandTotal = subtotal + taxAmount;

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
      const payload: any = {
        supplier_id: supplierId, invoice_date: invoiceDate,
        subtotal, discount: 0, tax: taxAmount, total: grandTotal,
        notes: notes.trim() || null, reference: reference.trim() || null, status: "draft",
      };

      if (isNew) {
        const { data: inv, error } = await (supabase.from("purchase_invoices" as any) as any).insert(payload).select("id").single();
        if (error) throw error;
        const rows = items.map(i => ({
          invoice_id: inv.id, product_id: i.product_id, description: i.product_name,
          quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
        }));
        await (supabase.from("purchase_invoice_items" as any) as any).insert(rows);
        toast({ title: "تمت الإضافة", description: "تم إنشاء فاتورة الشراء كمسودة" });
        navigate(`/purchases/${inv.id}`);
      } else {
        const { error } = await (supabase.from("purchase_invoices" as any) as any).update(payload).eq("id", id);
        if (error) throw error;
        await (supabase.from("purchase_invoice_items" as any) as any).delete().eq("invoice_id", id);
        const rows = items.map(i => ({
          invoice_id: id, product_id: i.product_id, description: i.product_name,
          quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
        }));
        await (supabase.from("purchase_invoice_items" as any) as any).insert(rows);
        toast({ title: "تم التحديث", description: "تم تحديث فاتورة الشراء" });
        loadData();
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function postInvoice() {
    try {
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.INVENTORY, ACCOUNT_CODES.SUPPLIERS]);
      const inventoryAcc = accounts?.find(a => a.code === ACCOUNT_CODES.INVENTORY);
      const supplierAcc = accounts?.find(a => a.code === ACCOUNT_CODES.SUPPLIERS);
      if (!inventoryAcc || !supplierAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود حسابات المخزون والموردين في شجرة الحسابات", variant: "destructive" });
        return;
      }

      const jePostedNum = await getNextPostedNumber("journal_entries");
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `فاتورة شراء رقم ${invoiceNumber}`, entry_date: invoiceDate,
        total_debit: grandTotal, total_credit: grandTotal, status: "posted", posted_number: jePostedNum,
      } as any).select("id").single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: inventoryAcc.id, debit: grandTotal, credit: 0, description: `مشتريات - فاتورة ${invoiceNumber}` },
        { journal_entry_id: je.id, account_id: supplierAcc.id, debit: 0, credit: grandTotal, description: `مستحقات مورد - فاتورة ${invoiceNumber}` },
      ] as any);

      const nextPostedNum = await getNextPostedNumber("purchase_invoices");
      await (supabase.from("purchase_invoices" as any) as any).update({ status: "posted", journal_entry_id: je.id, posted_number: nextPostedNum }).eq("id", id);

      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand + item.quantity } as any).eq("id", item.product_id);
        }
        await (supabase.from("inventory_movements" as any) as any).insert({
          product_id: item.product_id, movement_type: "purchase",
          quantity: item.quantity, unit_cost: item.unit_price, total_cost: item.total,
          reference_id: id, reference_type: "purchase_invoice", movement_date: invoiceDate,
        });
      }

      await recalculateEntityBalance("supplier", supplierId);

      toast({ title: "تم الترحيل", description: "تم ترحيل فاتورة الشراء وتوليد القيد المحاسبي وتحديث المخزون" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleDeleteDraft() {
    try {
      await (supabase.from("purchase_invoice_items" as any) as any).delete().eq("invoice_id", id);
      await (supabase.from("purchase_invoices" as any) as any).delete().eq("id", id);
      toast({ title: "تم الحذف", description: "تم حذف فاتورة الشراء المسودة" });
      navigate("/purchases");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleCancelPosted() {
    try {
      const { data: inv } = await (supabase.from("purchase_invoices" as any) as any).select("journal_entry_id").eq("id", id).single();
      
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand - item.quantity } as any).eq("id", item.product_id);
        }
        await (supabase.from("inventory_movements" as any) as any).delete().eq("reference_id", id).eq("product_id", item.product_id);
      }

      await recalculateEntityBalance("supplier", supplierId);

      if (inv?.journal_entry_id) {
        const { data: origLines } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", inv.journal_entry_id);
        const { data: reverseJe } = await supabase.from("journal_entries").insert({
          description: `عكس فاتورة شراء رقم ${invoiceNumber}`, entry_date: new Date().toISOString().split("T")[0],
          total_debit: grandTotal, total_credit: grandTotal, status: "posted",
        } as any).select("id").single();
        if (reverseJe && origLines) {
          const reverseLines = origLines.map((line: any) => ({
            journal_entry_id: reverseJe.id, account_id: line.account_id,
            debit: line.credit, credit: line.debit, description: `عكس - ${line.description}`,
          }));
          await supabase.from("journal_entry_lines").insert(reverseLines as any);
        }
      }

      await (supabase.from("purchase_invoices" as any) as any).update({ status: "cancelled" }).eq("id", id);
      toast({ title: "تم الإلغاء", description: "تم إلغاء الفاتورة وعكس القيد المحاسبي وإرجاع الكميات" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handlePrint() {
    await exportInvoicePdf({
      type: "purchase_invoice",
      number: invoiceNumber || "جديدة",
      date: invoiceDate,
      partyName: supplierName || suppliers.find(s => s.id === supplierId)?.name || "—",
      partyLabel: "المورد",
      reference: reference || undefined,
      notes: notes || undefined,
      items: items.map(i => ({ name: i.product_name, quantity: i.quantity, unitPrice: i.unit_price, discount: i.discount, total: i.total })),
      subtotal,
      taxAmount,
      taxRate,
      grandTotal,
      showTax,
      showDiscount,
      settings,
      status,
    });
  }

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  const isDraft = status === "draft";
  const isEditable = editMode && isDraft && canEdit;
  const colCount = 3 + (showDiscount ? 1 : 0) + (showTax ? 1 : 0) + 1 + (isEditable ? 1 : 0);

  const displayNumber = !isNew ? formatDisplayNumber(settings?.purchase_invoice_prefix || "PUR-", postedNumber, invoiceNumber || 0, status) : null;

  return (
    <div className="space-y-8" dir="rtl">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-4 flex-wrap">
            <h1 className="text-3xl font-black text-foreground tracking-tight">
              {isNew ? "إنشاء فاتورة مشتريات" : "فاتورة مشتريات"}
            </h1>
            {displayNumber && (
              <span className="text-base font-semibold text-muted-foreground border border-border px-3 py-1 rounded-lg bg-muted/50 font-mono tabular-nums">
                {displayNumber}
              </span>
            )}
            {!isNew && <Badge variant={statusColors[status] as any} className="text-xs px-3 py-1">{statusLabels[status]}</Badge>}
          </div>
          <p className="text-muted-foreground mt-2 font-medium">إدارة وتوثيق مشتريات المنشأة بدقة وسهولة</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {!isNew && isDraft && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"><Trash2 className="h-4 w-4" />حذف</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader><AlertDialogTitle>حذف الفاتورة المسودة</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذه الفاتورة؟</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2"><AlertDialogCancel>إلغاء</AlertDialogCancel><AlertDialogAction onClick={handleDeleteDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && status === "posted" && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"><Ban className="h-4 w-4" />إلغاء</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader><AlertDialogTitle>إلغاء الفاتورة المرحّلة</AlertDialogTitle><AlertDialogDescription>سيتم عكس القيد المحاسبي وإرجاع الكميات للمخزون وتعديل رصيد المورد.</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2"><AlertDialogCancel>تراجع</AlertDialogCancel><AlertDialogAction onClick={handleCancelPosted} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">إلغاء الفاتورة</AlertDialogAction></AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="h-4 w-4" />طباعة الفاتورة</Button>}
          {!isNew && isDraft && canEdit && !editMode && <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5"><Pencil className="h-4 w-4" />تعديل</Button>}
          {isEditable && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ مسودة"}
            </Button>
          )}
          {!isNew && isDraft && canEdit && (
            <Button size="sm" onClick={postInvoice} className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 px-6">
              <CheckCircle className="h-4 w-4" />إصدار الفاتورة
            </Button>
          )}
        </div>
      </div>

      {/* ── Supplier Details Card ── */}
      <div className="bg-card p-6 rounded-2xl border shadow-sm">
        <SectionHeader icon={Truck} title="بيانات المورد" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-sm font-medium text-muted-foreground">اسم المورد</Label>
            {isEditable ? (
              <LookupCombobox items={suppliers} value={supplierId} onValueChange={setSupplierId} placeholder="اختر مورد أو أضف جديداً" />
            ) : (
              <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm font-medium">
                {supplierName || suppliers.find(s => s.id === supplierId)?.name || "—"}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-muted-foreground">تاريخ الإصدار</Label>
            {isEditable ? (
              <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} placeholder="اختر التاريخ" />
            ) : (
              <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm font-mono tabular-nums">{invoiceDate}</div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-muted-foreground">رقم المرجع</Label>
            {isEditable ? (
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="أدخل رقم المرجع" className="rounded-xl" />
            ) : (
              <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm">{reference || "—"}</div>
            )}
          </div>
        </div>
      </div>

      {/* ── Items Table Card ── */}
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between p-6 pb-4">
          <SectionHeader icon={ListChecks} title="بنود الفاتورة" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="pb-4 px-6 font-bold text-muted-foreground text-sm">البند</th>
                <th className="pb-4 px-3 font-bold text-muted-foreground text-sm w-20">الكمية</th>
                <th className="pb-4 px-3 font-bold text-muted-foreground text-sm w-32">السعر</th>
                {showDiscount && <th className="pb-4 px-3 font-bold text-muted-foreground text-sm w-24">خصم</th>}
                {showTax && <th className="pb-4 px-3 font-bold text-muted-foreground text-sm w-24">ضريبة</th>}
                <th className="pb-4 px-3 font-bold text-muted-foreground text-sm w-32">المجموع</th>
                {isEditable && <th className="pb-4 px-3 w-12"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="text-center py-12 text-muted-foreground">لا توجد أصناف بعد</td>
                </tr>
              ) : items.map((item, i) => (
                <tr key={i} className="group hover:bg-muted/30 transition-colors">
                  <td className="py-4 px-6">
                    {isEditable ? (
                      <LookupCombobox items={productsToLookupItems(products)} value={item.product_id} onValueChange={v => updateItem(i, "product_id", v)} placeholder="اختر المنتج" />
                    ) : (
                      <span className="font-medium text-sm">{item.product_name}</span>
                    )}
                  </td>
                  <td className="py-4 px-3">
                    {isEditable ? (
                      <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="font-mono tabular-nums text-center bg-muted/30 border-border rounded-lg h-9" />
                    ) : (
                      <span className="font-mono tabular-nums">{item.quantity}</span>
                    )}
                  </td>
                  <td className="py-4 px-3">
                    {isEditable ? (
                      <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="font-mono tabular-nums text-center bg-muted/30 border-border rounded-lg h-9" />
                    ) : (
                      <span className="font-mono tabular-nums">{item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                    )}
                  </td>
                  {showDiscount && (
                    <td className="py-4 px-3">
                      {isEditable ? (
                        <Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono tabular-nums text-center bg-muted/30 border-border rounded-lg h-9" />
                      ) : (
                        <span className="font-mono tabular-nums">{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      )}
                    </td>
                  )}
                  {showTax && (
                    <td className="py-4 px-3">
                      <span className="text-sm text-muted-foreground">{taxRate}%</span>
                    </td>
                  )}
                  <td className="py-4 px-3">
                    <span className="font-mono tabular-nums font-bold text-foreground">{formatCurrency(item.total)}</span>
                  </td>
                  {isEditable && (
                    <td className="py-4 px-3">
                      <button className="p-1 text-muted-foreground/40 hover:text-destructive transition-colors" onClick={() => removeItem(i)}>
                        <X className="h-5 w-5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isEditable && (
          <div className="p-4 border-t">
            <button onClick={addItem} className="flex items-center gap-2 text-sm font-bold text-primary hover:bg-primary/5 px-4 py-2 rounded-xl transition-all">
              <Plus className="h-4 w-4" />
              إضافة بند جديد
            </button>
          </div>
        )}
      </div>

      {/* ── Notes + Summary: Side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-card p-6 rounded-2xl border shadow-sm flex flex-col">
          <SectionHeader icon={StickyNote} title="ملاحظات داخلية" />
          <div className="flex-1 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">ملاحظات داخلية (لا تظهر في الطباعة)</Label>
            {isEditable ? (
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-muted/30 border border-border rounded-xl text-sm transition-all resize-none focus:ring-2 focus:ring-ring focus:border-ring"
                placeholder="أدخل أي ملاحظات إضافية هنا..."
              />
            ) : (
              <div className="h-32 px-4 py-3 bg-muted/30 border rounded-xl text-sm">{notes || "لا توجد ملاحظات"}</div>
            )}
          </div>
        </div>

        <div className="bg-muted/50 p-8 rounded-2xl border shadow-sm">
          <SectionHeader icon={CreditCard} title="ملخص الفاتورة" />
          <div className="space-y-4">
            <div className="flex justify-between text-base">
              <span className="font-medium font-mono tabular-nums">{formatCurrency(subtotal)}</span>
              <span className="text-muted-foreground">الإجمالي الفرعي</span>
            </div>
            {showTax && (
              <div className="flex justify-between text-base">
                <span className="font-medium font-mono tabular-nums">{formatCurrency(taxAmount)}</span>
                <span className="text-muted-foreground">إجمالي الضريبة ({taxRate}%)</span>
              </div>
            )}
            <div className="h-px bg-border my-4"></div>
            <div className="flex justify-between items-center">
              <div className="text-right">
                <span className="text-3xl font-black text-primary font-mono tabular-nums">{formatCurrency(grandTotal)}</span>
              </div>
              <span className="text-lg font-bold text-foreground">الإجمالي الكلي</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Related Operations ── */}
      {!isNew && status === "posted" && id && supplierId && (
        <div className="bg-card p-6 rounded-2xl border shadow-sm">
          <SectionHeader icon={ArrowLeftRight} title="العمليات المرتبطة" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <InvoicePaymentSection type="purchase" invoiceId={id} entityId={supplierId} entityName={supplierName || suppliers.find(s => s.id === supplierId)?.name || ""} invoiceTotal={grandTotal} invoiceNumber={invoiceNumber} onPaymentAdded={loadData} />
            </div>
            <div className="space-y-4">
              <OutstandingCreditsSection type="purchase" invoiceId={id} entityId={supplierId} invoiceTotal={grandTotal} onSettlementChanged={loadData} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
