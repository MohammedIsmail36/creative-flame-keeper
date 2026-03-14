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
import { Plus, X, Save, CheckCircle, Printer, Pencil, Trash2, Ban, User, FileText, ListChecks, CreditCard, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import InvoicePaymentSection from "@/components/InvoicePaymentSection";
import OutstandingCreditsSection from "@/components/OutstandingCreditsSection";
import { recalculateEntityBalance } from "@/lib/entity-balance";

import { ProductWithBrand, productsToLookupItems, formatProductName, formatProductDisplay, PRODUCT_SELECT_FIELDS } from "@/lib/product-utils";

interface Customer { id: string; code: string; name: string; balance?: number; }
type Product = ProductWithBrand & { selling_price: number; purchase_price: number; quantity_on_hand: number; };
interface InvoiceItem { id?: string; product_id: string; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; total: number; }

const ACCOUNT_CODES = {
  CUSTOMERS: "1103",
  REVENUE: "4101",
  COGS: "5101",
  INVENTORY: "1104",
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

export default function SalesInvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant" || role === "sales";

  const showTax = settings?.show_tax_on_invoice ?? false;
  const showDiscount = settings?.show_discount_on_invoice ?? true;
  const taxRate = settings?.tax_rate ?? 0;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState<number | null>(null);
  const [postedNumber, setPostedNumber] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [editMode, setEditMode] = useState(true);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const [custRes, prodRes] = await Promise.all([
      (supabase.from("customers" as any) as any).select("id, code, name, balance").eq("is_active", true).order("name"),
      supabase.from("products").select(PRODUCT_SELECT_FIELDS).eq("is_active", true).order("name"),
    ]);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);

    if (id) {
      const { data: inv } = await (supabase.from("sales_invoices" as any) as any)
        .select("*, customers:customer_id(name)").eq("id", id).single();
      if (inv) {
        setInvoiceNumber(inv.invoice_number);
        setPostedNumber(inv.posted_number || null);
        setCustomerId(inv.customer_id || "");
        setCustomerName(inv.customers?.name || "");
        setInvoiceDate(inv.invoice_date);
        setNotes(inv.notes || "");
        setReference(inv.reference || "");
        setStatus(inv.status);
        setEditMode(inv.status === "draft");

        const { data: itemsData } = await (supabase.from("sales_invoice_items" as any) as any)
          .select("*, products:product_id(name, code, purchase_price, model_number, product_brands(name))").eq("invoice_id", id);
        setItems((itemsData || []).map((it: any) => ({
          id: it.id, product_id: it.product_id || "", product_name: it.products ? formatProductDisplay(it.products.name, it.products.product_brands?.name, it.products.model_number) : (it.description || ""),
          quantity: it.quantity, unit_price: it.unit_price, cost_price: it.products?.purchase_price || 0,
          discount: it.discount, total: it.total,
        })));
      }
      setLoading(false);
    } else {
      setEditMode(true);
      setLoading(false);
    }
  }

  function addItem() {
    setItems(prev => [...prev, { product_id: "", product_name: "", quantity: 1, unit_price: 0, cost_price: 0, discount: 0, total: 0 }]);
  }

  function updateItem(index: number, field: string, value: any) {
    setItems(prev => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "product_id") {
        const prod = products.find(p => p.id === value);
        if (prod) { item.product_name = formatProductName(prod); item.unit_price = prod.selling_price; item.cost_price = prod.purchase_price; }
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
    if (!customerId || items.length === 0) {
      toast({ title: "تنبيه", description: "يرجى اختيار العميل وإضافة أصناف", variant: "destructive" });
      return;
    }
    if (items.some(i => !i.product_id)) {
      toast({ title: "تنبيه", description: "يرجى اختيار المنتج لكل صنف", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        customer_id: customerId, invoice_date: invoiceDate,
        subtotal, discount: 0, tax: taxAmount, total: grandTotal,
        notes: notes.trim() || null, reference: reference.trim() || null, status: "draft",
      };

      if (isNew) {
        const { data: inv, error } = await (supabase.from("sales_invoices" as any) as any).insert(payload).select("id").single();
        if (error) throw error;
        const rows = items.map(i => ({
          invoice_id: inv.id, product_id: i.product_id, description: i.product_name,
          quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
        }));
        await (supabase.from("sales_invoice_items" as any) as any).insert(rows);
        toast({ title: "تمت الإضافة", description: "تم إنشاء فاتورة البيع كمسودة" });
        navigate(`/sales/${inv.id}`);
      } else {
        const { error } = await (supabase.from("sales_invoices" as any) as any).update(payload).eq("id", id);
        if (error) throw error;
        await (supabase.from("sales_invoice_items" as any) as any).delete().eq("invoice_id", id);
        const rows = items.map(i => ({
          invoice_id: id, product_id: i.product_id, description: i.product_name,
          quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
        }));
        await (supabase.from("sales_invoice_items" as any) as any).insert(rows);
        toast({ title: "تم التحديث", description: "تم تحديث فاتورة البيع" });
        loadData();
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function postInvoice() {
    try {
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.CUSTOMERS, ACCOUNT_CODES.REVENUE, ACCOUNT_CODES.COGS, ACCOUNT_CODES.INVENTORY]);
      const customersAcc = accounts?.find(a => a.code === ACCOUNT_CODES.CUSTOMERS);
      const revenueAcc = accounts?.find(a => a.code === ACCOUNT_CODES.REVENUE);
      const cogsAcc = accounts?.find(a => a.code === ACCOUNT_CODES.COGS);
      const inventoryAcc = accounts?.find(a => a.code === ACCOUNT_CODES.INVENTORY);
      if (!customersAcc || !revenueAcc || !cogsAcc || !inventoryAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود حسابات العملاء والإيرادات والتكلفة والمخزون", variant: "destructive" });
        return;
      }

      let totalCost = 0;
      const itemAvgCosts: Record<string, number> = {};
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          if (prod.quantity_on_hand < item.quantity) {
            toast({ title: "تنبيه", description: `الكمية المطلوبة من ${item.product_name} أكبر من المتاح (${prod.quantity_on_hand})`, variant: "destructive" });
            return;
          }
        }
        const { data: avgPrice } = await supabase.rpc("get_avg_purchase_price", { _product_id: item.product_id });
        const avgCost = Number(avgPrice) || 0;
        itemAvgCosts[item.product_id] = avgCost > 0 ? avgCost : item.cost_price;
        totalCost += avgCost * item.quantity;
      }

      const totalDebit = grandTotal + totalCost;
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `فاتورة بيع رقم ${invoiceNumber}`, entry_date: invoiceDate,
        total_debit: totalDebit, total_credit: totalDebit, status: "posted", posted_number: jePostedNum,
      } as any).select("id").single();
      if (jeError) throw jeError;

      const lines: any[] = [
        { journal_entry_id: je.id, account_id: customersAcc.id, debit: grandTotal, credit: 0, description: `مبيعات - فاتورة ${invoiceNumber}` },
        { journal_entry_id: je.id, account_id: revenueAcc.id, debit: 0, credit: grandTotal, description: `إيراد مبيعات - فاتورة ${invoiceNumber}` },
      ];
      if (totalCost > 0) {
        lines.push(
          { journal_entry_id: je.id, account_id: cogsAcc.id, debit: totalCost, credit: 0, description: `تكلفة بضاعة مباعة - فاتورة ${invoiceNumber}` },
          { journal_entry_id: je.id, account_id: inventoryAcc.id, debit: 0, credit: totalCost, description: `خصم مخزون - فاتورة ${invoiceNumber}` },
        );
      }
      await supabase.from("journal_entry_lines").insert(lines as any);

      const nextPostedNum = await getNextPostedNumber("sales_invoices");
      await (supabase.from("sales_invoices" as any) as any).update({ status: "posted", journal_entry_id: je.id, posted_number: nextPostedNum }).eq("id", id);

      for (const item of items) {
        if (!item.product_id) continue;
        const avgCost = itemAvgCosts[item.product_id] || 0;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand - item.quantity } as any).eq("id", item.product_id);
          await (supabase.from("inventory_movements" as any) as any).insert({
            product_id: item.product_id, movement_type: "sale",
            quantity: item.quantity, unit_cost: avgCost, total_cost: avgCost * item.quantity,
            reference_id: id, reference_type: "sales_invoice", movement_date: invoiceDate,
          });
        }
      }

      await recalculateEntityBalance("customer", customerId);

      toast({ title: "تم الترحيل", description: "تم ترحيل فاتورة البيع وتوليد القيد المحاسبي وتحديث المخزون" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleDeleteDraft() {
    try {
      await (supabase.from("sales_invoice_items" as any) as any).delete().eq("invoice_id", id);
      await (supabase.from("sales_invoices" as any) as any).delete().eq("id", id);
      toast({ title: "تم الحذف", description: "تم حذف فاتورة البيع المسودة" });
      navigate("/sales");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleCancelPosted() {
    try {
      const { data: inv } = await (supabase.from("sales_invoices" as any) as any).select("journal_entry_id").eq("id", id).single();

      let totalCost = 0;
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand, purchase_price").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand + item.quantity } as any).eq("id", item.product_id);
          totalCost += prod.purchase_price * item.quantity;
        }
        await (supabase.from("inventory_movements" as any) as any).delete().eq("reference_id", id).eq("product_id", item.product_id);
      }

      await recalculateEntityBalance("customer", customerId);

      if (inv?.journal_entry_id) {
        const { data: origLines } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", inv.journal_entry_id);
        const totalDebit = grandTotal + totalCost;
        const { data: reverseJe } = await supabase.from("journal_entries").insert({
          description: `عكس فاتورة بيع رقم ${invoiceNumber}`, entry_date: new Date().toISOString().split("T")[0],
          total_debit: totalDebit, total_credit: totalDebit, status: "posted",
        } as any).select("id").single();
        if (reverseJe && origLines) {
          const reverseLines = origLines.map((line: any) => ({
            journal_entry_id: reverseJe.id, account_id: line.account_id,
            debit: line.credit, credit: line.debit, description: `عكس - ${line.description}`,
          }));
          await supabase.from("journal_entry_lines").insert(reverseLines as any);
        }
      }

      await (supabase.from("sales_invoices" as any) as any).update({ status: "cancelled" }).eq("id", id);
      toast({ title: "تم الإلغاء", description: "تم إلغاء الفاتورة وعكس القيد المحاسبي وإرجاع الكميات للمخزون" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handlePrint() {
    await exportInvoicePdf({
      type: "sales_invoice",
      number: invoiceNumber || "جديدة",
      date: invoiceDate,
      partyName: customerName || customers.find(c => c.id === customerId)?.name || "—",
      partyLabel: "العميل",
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

  const displayNumber = !isNew ? formatDisplayNumber(settings?.sales_invoice_prefix || "INV-", postedNumber, invoiceNumber || 0, status) : null;

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="text-center sm:text-right flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            {isNew ? "إنشاء فاتورة مبيعات" : `فاتورة مبيعات`}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة وتوثيق مبيعات المنشأة بدقة وسهولة</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && <Badge variant={statusColors[status] as any} className="text-xs px-3 py-1">{statusLabels[status]}</Badge>}
          
          {!isNew && isDraft && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" />حذف</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف الفاتورة المسودة</AlertDialogTitle>
                  <AlertDialogDescription>هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && status === "posted" && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive"><Ban className="h-3.5 w-3.5" />إلغاء</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>إلغاء الفاتورة المرحّلة</AlertDialogTitle>
                  <AlertDialogDescription>سيتم عكس القيد المحاسبي وإرجاع الكميات للمخزون وتعديل رصيد العميل. هل تريد المتابعة؟</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancelPosted} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">إلغاء الفاتورة</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="h-3.5 w-3.5" />طباعة</Button>
          )}
          {!isNew && isDraft && canEdit && !editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5"><Pencil className="h-3.5 w-3.5" />تعديل</Button>
          )}
          {isEditable && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-3.5 w-3.5" />{saving ? "جاري الحفظ..." : "حفظ مسودة"}
            </Button>
          )}
          {!isNew && isDraft && canEdit && (
            <Button size="sm" onClick={postInvoice} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground">
              <CheckCircle className="h-3.5 w-3.5" />إصدار الفاتورة
            </Button>
          )}
        </div>
      </div>

      {/* ── Metadata: Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Right: Customer Info */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5">
            <SectionHeader icon={User} title="بيانات العميل" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">اسم العميل</Label>
                {isEditable ? (
                  <LookupCombobox items={customers} value={customerId} onValueChange={setCustomerId} placeholder="اختر العميل" />
                ) : (
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm font-medium">
                    {customerName || customers.find(c => c.id === customerId)?.name || "—"}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">ملاحظات</Label>
                {isEditable ? (
                  <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" />
                ) : (
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm">{notes || "—"}</div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">مرجع</Label>
                {isEditable ? (
                  <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم مرجعي (اختياري)" />
                ) : (
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm">{reference || "—"}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Left: Invoice Details */}
        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={FileText} title="تفاصيل الفاتورة" />
            <div className="space-y-4">
              {displayNumber && (
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">رقم الفاتورة</Label>
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm font-bold font-mono tabular-nums">
                    {displayNumber}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">تاريخ الإصدار</Label>
                {isEditable ? (
                  <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} placeholder="اختر التاريخ" />
                ) : (
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm font-mono tabular-nums">{invoiceDate}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Items + Summary: Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Items Table */}
        <Card className="lg:col-span-2">
          <CardContent className="p-5 pb-0">
            <SectionHeader icon={ListChecks} title="بنود الفاتورة" />
          </CardContent>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right">البند</TableHead>
                  <TableHead className="text-right w-[10%]">الكمية</TableHead>
                  <TableHead className="text-right w-[15%]">السعر</TableHead>
                  {showDiscount && <TableHead className="text-right w-[12%]">خصم</TableHead>}
                  {showTax && <TableHead className="text-right w-[10%]">ضريبة</TableHead>}
                  <TableHead className="text-right w-[15%]">المجموع</TableHead>
                  {isEditable && <TableHead className="w-[5%]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colCount} className="text-center py-10 text-muted-foreground">
                      لا توجد أصناف بعد
                    </TableCell>
                  </TableRow>
                ) : items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {isEditable ? (
                        <LookupCombobox items={productsToLookupItems(products, true)} value={item.product_id} onValueChange={v => updateItem(i, "product_id", v)} placeholder="اختر المنتج" />
                      ) : (
                        <span className="font-medium text-sm">{item.product_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditable ? (
                        <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="font-mono tabular-nums text-center" />
                      ) : (
                        <span className="font-mono tabular-nums">{item.quantity}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {isEditable ? (
                        <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="font-mono tabular-nums" />
                      ) : (
                        <span className="font-mono tabular-nums">{item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                      )}
                    </TableCell>
                    {showDiscount && (
                      <TableCell>
                        {isEditable ? (
                          <Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono tabular-nums" />
                        ) : (
                          <span className="font-mono tabular-nums">{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                        )}
                      </TableCell>
                    )}
                    {showTax && (
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{taxRate}%</span>
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="font-mono tabular-nums font-semibold">{formatCurrency(item.total)}</span>
                    </TableCell>
                    {isEditable && (
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(i)}>
                          <X className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {isEditable && (
              <div className="p-4 border-t">
                <button
                  onClick={addItem}
                  className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  إضافة بند جديد
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={CreditCard} title="ملخص الدفع" />
            <div className="space-y-3">
              <div className="flex justify-between items-center text-sm">
                <span className="font-mono tabular-nums">{formatCurrency(subtotal)}</span>
                <span className="text-muted-foreground">الإجمالي الفرعي</span>
              </div>
              {showTax && (
                <div className="flex justify-between items-center text-sm">
                  <span className="font-mono tabular-nums">{formatCurrency(taxAmount)}</span>
                  <span className="text-muted-foreground">الضريبة ({taxRate}%)</span>
                </div>
              )}
              <div className="border-t pt-3 mt-3">
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold font-mono tabular-nums text-primary">{formatCurrency(grandTotal)}</span>
                  <span className="font-bold text-base">الإجمالي الكلي</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Financial section - settlements & payments ── */}
      {!isNew && status === "posted" && id && customerId && (
        <div className="space-y-4">
          <OutstandingCreditsSection
            type="sales"
            invoiceId={id}
            entityId={customerId}
            invoiceTotal={grandTotal}
            onSettlementChanged={loadData}
          />
          <InvoicePaymentSection
            type="sales"
            invoiceId={id}
            entityId={customerId}
            entityName={customerName || customers.find(c => c.id === customerId)?.name || ""}
            invoiceTotal={grandTotal}
            invoiceNumber={invoiceNumber}
            onPaymentAdded={loadData}
          />
        </div>
      )}
    </div>
  );
}
