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
import { Plus, X, Save, CheckCircle, Trash2, Printer, Ban, User, FileText, ListChecks, CreditCard } from "lucide-react";
import { exportInvoicePdf } from "@/lib/pdf-arabic";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import InvoicePaymentSection from "@/components/InvoicePaymentSection";
import ReturnSettlementsView from "@/components/ReturnSettlementsView";
import { recalculateEntityBalance } from "@/lib/entity-balance";

import { ProductWithBrand, productsToLookupItems, formatProductName, formatProductDisplay, PRODUCT_SELECT_FIELDS } from "@/lib/product-utils";

interface Customer { id: string; code: string; name: string; balance?: number; }
type Product = ProductWithBrand & { selling_price: number; purchase_price: number; quantity_on_hand: number; };
interface ReturnItem { id?: string; product_id: string; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; total: number; }

const ACCOUNT_CODES = { CUSTOMERS: "1103", REVENUE: "4101", COGS: "5101", INVENTORY: "1104" };

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

export default function SalesReturnForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant" || role === "sales";

  const showTax = settings?.show_tax_on_invoice ?? false;
  const showDiscount = settings?.show_discount_on_invoice ?? true;
  const taxRate = settings?.tax_rate ?? 0;
  const returnDaysLimit = settings?.return_days_limit ?? 30;

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [returnNumber, setReturnNumber] = useState<number | null>(null);
  const [postedNumber, setPostedNumber] = useState<number | null>(null);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split("T")[0]);
  const [notes, setNotes] = useState("");
  const [reference, setReference] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<ReturnItem[]>([]);
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
      const { data: ret } = await (supabase.from("sales_returns" as any) as any)
        .select("*, customers:customer_id(name)").eq("id", id).single();
      if (ret) {
        setReturnNumber(ret.return_number);
        setPostedNumber(ret.posted_number || null);
        setCustomerId(ret.customer_id || "");
        setCustomerName(ret.customers?.name || "");
        setReturnDate(ret.return_date);
        setNotes(ret.notes || "");
        setReference(ret.reference || "");
        setStatus(ret.status);
        setEditMode(ret.status === "draft");

        const { data: itemsData } = await (supabase.from("sales_return_items" as any) as any)
          .select("*, products:product_id(name, code, purchase_price, model_number, product_brands(name))").eq("return_id", id);
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
    setSaving(true);
    try {
      const payload: any = {
        customer_id: customerId, return_date: returnDate,
        subtotal, discount: 0, tax: taxAmount, total: grandTotal,
        notes: notes.trim() || null, reference: reference.trim() || null, status: "draft",
      };

      if (isNew) {
        const { data: ret, error } = await (supabase.from("sales_returns" as any) as any).insert(payload).select("id").single();
        if (error) throw error;
        const rows = items.map(i => ({
          return_id: ret.id, product_id: i.product_id, description: i.product_name,
          quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
        }));
        await (supabase.from("sales_return_items" as any) as any).insert(rows);
        toast({ title: "تمت الإضافة", description: "تم إنشاء مرتجع البيع كمسودة" });
        navigate(`/sales-returns/${ret.id}`);
      } else {
        await (supabase.from("sales_returns" as any) as any).update(payload).eq("id", id);
        await (supabase.from("sales_return_items" as any) as any).delete().eq("return_id", id);
        const rows = items.map(i => ({
          return_id: id, product_id: i.product_id, description: i.product_name,
          quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
        }));
        await (supabase.from("sales_return_items" as any) as any).insert(rows);
        toast({ title: "تم التحديث", description: "تم تحديث مرتجع البيع" });
        loadData();
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function postReturn() {
    try {
      // Validate: check sold quantity in the last N days for each item
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - returnDaysLimit);
      const cutoffStr = cutoffDate.toISOString().split("T")[0];

      for (const item of items) {
        if (!item.product_id) continue;
        // Get total sold quantity for this product in the return period
        const { data: salesData } = await (supabase.from("sales_invoice_items" as any) as any)
          .select("quantity, invoice_id")
          .eq("product_id", item.product_id);

        // Filter by posted invoices within the date range
        let totalSold = 0;
        if (salesData && salesData.length > 0) {
          const invoiceIds = [...new Set(salesData.map((s: any) => s.invoice_id))];
          const { data: invoices } = await (supabase.from("sales_invoices" as any) as any)
            .select("id, invoice_date, status")
            .in("id", invoiceIds)
            .eq("status", "posted")
            .gte("invoice_date", cutoffStr);
          const validIds = new Set((invoices || []).map((inv: any) => inv.id));
          totalSold = salesData
            .filter((s: any) => validIds.has(s.invoice_id))
            .reduce((sum: number, s: any) => sum + Number(s.quantity), 0);
        }

        // Get already returned quantity for this product (exclude current return)
        const { data: returnedData } = await (supabase.from("sales_return_items" as any) as any)
          .select("quantity, return_id")
          .eq("product_id", item.product_id);
        
        let totalReturned = 0;
        if (returnedData && returnedData.length > 0) {
          const returnIds = [...new Set(returnedData.map((r: any) => r.return_id))].filter(rid => rid !== id);
          if (returnIds.length > 0) {
            const { data: returns } = await (supabase.from("sales_returns" as any) as any)
              .select("id, status")
              .in("id", returnIds)
              .eq("status", "posted");
            const validReturnIds = new Set((returns || []).map((r: any) => r.id));
            totalReturned = returnedData
              .filter((r: any) => validReturnIds.has(r.return_id))
              .reduce((sum: number, r: any) => sum + Number(r.quantity), 0);
          }
        }

        const availableToReturn = totalSold - totalReturned;
        if (item.quantity > availableToReturn) {
          const prodName = item.product_name;
          toast({
            title: "تنبيه",
            description: `الكمية المرتجعة للصنف (${prodName}) أكبر من الكمية المباعة خلال ${returnDaysLimit} يوم السابقة. المتاح للإرجاع: ${availableToReturn}`,
            variant: "destructive",
          });
          return;
        }
      }

      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.CUSTOMERS, ACCOUNT_CODES.REVENUE, ACCOUNT_CODES.COGS, ACCOUNT_CODES.INVENTORY]);
      const customersAcc = accounts?.find(a => a.code === ACCOUNT_CODES.CUSTOMERS);
      const revenueAcc = accounts?.find(a => a.code === ACCOUNT_CODES.REVENUE);
      const cogsAcc = accounts?.find(a => a.code === ACCOUNT_CODES.COGS);
      const inventoryAcc = accounts?.find(a => a.code === ACCOUNT_CODES.INVENTORY);
      if (!customersAcc || !revenueAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود الحسابات المطلوبة", variant: "destructive" });
        return;
      }

      let totalCost = 0;
      const itemAvgCosts: Record<string, number> = {};
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: avgPrice } = await supabase.rpc("get_avg_purchase_price", { _product_id: item.product_id });
        const avgCost = Number(avgPrice) || 0;
        const finalCost = avgCost > 0 ? avgCost : item.cost_price;
        itemAvgCosts[item.product_id] = finalCost;
        totalCost += finalCost * item.quantity;
      }

      const totalDebit = grandTotal + totalCost;
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `مرتجع بيع رقم ${returnNumber}`, entry_date: returnDate,
        total_debit: totalDebit, total_credit: totalDebit, status: "posted", posted_number: jePostedNum,
      } as any).select("id").single();
      if (jeError) throw jeError;

      const lines: any[] = [
        { journal_entry_id: je.id, account_id: revenueAcc.id, debit: grandTotal, credit: 0, description: `مرتجع مبيعات - ${returnNumber}` },
        { journal_entry_id: je.id, account_id: customersAcc.id, debit: 0, credit: grandTotal, description: `خصم ذمم عملاء - ${returnNumber}` },
      ];
      if (totalCost > 0 && inventoryAcc && cogsAcc) {
        lines.push(
          { journal_entry_id: je.id, account_id: inventoryAcc.id, debit: totalCost, credit: 0, description: `إرجاع مخزون - ${returnNumber}` },
          { journal_entry_id: je.id, account_id: cogsAcc.id, debit: 0, credit: totalCost, description: `عكس تكلفة بضاعة - ${returnNumber}` },
        );
      }
      await supabase.from("journal_entry_lines").insert(lines as any);

      const nextPostedNum = await getNextPostedNumber("sales_returns");
      await (supabase.from("sales_returns" as any) as any).update({ status: "posted", journal_entry_id: je.id, posted_number: nextPostedNum }).eq("id", id);

      for (const item of items) {
        if (!item.product_id) continue;
        const avgCost = itemAvgCosts[item.product_id] || 0;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand + item.quantity } as any).eq("id", item.product_id);
        }
        await (supabase.from("inventory_movements" as any) as any).insert({
          product_id: item.product_id, movement_type: "sale_return",
          quantity: item.quantity, unit_cost: avgCost, total_cost: avgCost * item.quantity,
          reference_id: id, reference_type: "sales_return", movement_date: returnDate,
        });
      }

      await recalculateEntityBalance("customer", customerId);

      toast({ title: "تم الترحيل", description: "تم ترحيل مرتجع البيع" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleCancelPosted() {
    try {
      const { data: ret } = await (supabase.from("sales_returns" as any) as any).select("journal_entry_id").eq("id", id).single();

      // Reverse inventory
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand - item.quantity } as any).eq("id", item.product_id);
        }
        await (supabase.from("inventory_movements" as any) as any).delete().eq("reference_id", id).eq("product_id", item.product_id);
      }

      await recalculateEntityBalance("customer", customerId);

      // Create reverse journal entry
      if (ret?.journal_entry_id) {
        const { data: origLines } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", ret.journal_entry_id);
        const totalDebit = (origLines || []).reduce((s: number, l: any) => s + Number(l.debit), 0);
        const { data: reverseJe } = await supabase.from("journal_entries").insert({
          description: `عكس مرتجع بيع رقم ${returnNumber}`, entry_date: new Date().toISOString().split("T")[0],
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

      await (supabase.from("sales_returns" as any) as any).update({ status: "cancelled" }).eq("id", id);
      toast({ title: "تم الإلغاء", description: "تم إلغاء المرتجع وعكس القيد المحاسبي وإرجاع المخزون" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleDeleteDraft() {
    try {
      await (supabase.from("sales_return_items" as any) as any).delete().eq("return_id", id);
      await (supabase.from("sales_returns" as any) as any).delete().eq("id", id);
      toast({ title: "تم الحذف", description: "تم حذف المرتجع" });
      navigate("/sales-returns");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handlePrint() {
    await exportInvoicePdf({
      type: "sales_return",
      number: postedNumber ? formatDisplayNumber(settings?.sales_return_prefix || "SRN-", postedNumber, returnNumber || 0, status) : (returnNumber || "جديد"),
      date: returnDate,
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
  const colCount = 3 + (showDiscount ? 1 : 0) + 1 + (isEditable ? 1 : 0);

  return (
    <div className="space-y-5" dir="rtl">
      {/* ── Header ── */}
      <div className="text-center space-y-1">
        <h1 className="text-xl font-bold text-foreground">
          {isNew ? "مرتجع بيع جديد" : `مرتجع بيع ${formatDisplayNumber(settings?.sales_return_prefix || "SRN-", postedNumber, returnNumber || 0, status)}`}
        </h1>
        {!isNew && <Badge variant={statusColors[status] as any}>{statusLabels[status]}</Badge>}
      </div>

      {/* ── Action Buttons ── */}
      <div className="flex items-center justify-center gap-2 flex-wrap">
        {!isNew && isDraft && canEdit && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" />حذف</Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader><AlertDialogTitle>حذف المرتجع</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد من حذف هذا المرتجع؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription></AlertDialogHeader>
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
                <AlertDialogTitle>إلغاء المرتجع المرحّل</AlertDialogTitle>
                <AlertDialogDescription>سيتم عكس القيد المحاسبي وإرجاع الكميات من المخزون وتعديل رصيد العميل. هل تريد المتابعة؟</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogCancel>تراجع</AlertDialogCancel>
                <AlertDialogAction onClick={handleCancelPosted} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">إلغاء المرتجع</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
        {!isNew && (
          <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5"><Printer className="h-3.5 w-3.5" />طباعة</Button>
        )}
        {!isNew && isDraft && canEdit && (
          <Button size="sm" onClick={postReturn} className="gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"><CheckCircle className="h-3.5 w-3.5" />ترحيل</Button>
        )}
        {isEditable && (
          <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
            <Save className="h-3.5 w-3.5" />{saving ? "جاري الحفظ..." : "حفظ مسودة"}
          </Button>
        )}
      </div>

      {/* ── Metadata: Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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

        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={FileText} title="تفاصيل المرتجع" />
            <div className="space-y-4">
              {!isNew && (
                <div className="space-y-1.5">
                  <Label className="text-sm text-muted-foreground">رقم المرتجع</Label>
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm font-bold font-mono tabular-nums">
                    {formatDisplayNumber(settings?.sales_return_prefix || "SRN-", postedNumber, returnNumber || 0, status)}
                  </div>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-sm text-muted-foreground">تاريخ المرتجع</Label>
                {isEditable ? (
                  <DatePickerInput value={returnDate} onChange={setReturnDate} placeholder="اختر التاريخ" />
                ) : (
                  <div className="h-10 px-3 flex items-center rounded-lg border bg-muted/30 text-sm font-mono tabular-nums">{returnDate}</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Items + Summary: Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <CardContent className="p-5 pb-0">
            <SectionHeader icon={ListChecks} title="بنود المرتجع" />
          </CardContent>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right">المنتج</TableHead>
                  <TableHead className="text-right w-[10%]">الكمية</TableHead>
                  <TableHead className="text-right w-[15%]">السعر</TableHead>
                  {showDiscount && <TableHead className="text-right w-[12%]">خصم</TableHead>}
                  <TableHead className="text-right w-[15%]">المجموع</TableHead>
                  {isEditable && <TableHead className="w-[5%]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={colCount} className="text-center py-10 text-muted-foreground">لا توجد أصناف بعد</TableCell>
                  </TableRow>
                ) : items.map((item, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      {isEditable ? (
                        <LookupCombobox items={productsToLookupItems(products)} value={item.product_id} onValueChange={v => updateItem(i, "product_id", v)} placeholder="اختر المنتج" />
                      ) : <span className="font-medium text-sm">{item.product_name}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditable ? (
                        <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="font-mono tabular-nums text-center" />
                      ) : <span className="font-mono tabular-nums">{item.quantity}</span>}
                    </TableCell>
                    <TableCell>
                      {isEditable ? (
                        <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="font-mono tabular-nums" />
                      ) : <span className="font-mono tabular-nums">{item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
                    </TableCell>
                    {showDiscount && (
                      <TableCell>
                        {isEditable ? (
                          <Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono tabular-nums" />
                        ) : <span className="font-mono tabular-nums">{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
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
                <button onClick={addItem} className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
                  <Plus className="h-4 w-4" />إضافة بند جديد
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Summary Card */}
        <Card>
          <CardContent className="p-5">
            <SectionHeader icon={CreditCard} title="ملخص المرتجع" />
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

      {/* ── Financial section ── */}
      {!isNew && status === "posted" && id && (
        <div className="space-y-4">
          <ReturnSettlementsView type="sales" returnId={id} returnTotal={grandTotal} />
          <InvoicePaymentSection
            type="sales_return" invoiceId={id} entityId={customerId}
            entityName={customerName || customers.find(c => c.id === customerId)?.name || ""}
            invoiceTotal={grandTotal} invoiceNumber={returnNumber} onPaymentAdded={loadData}
          />
        </div>
      )}
    </div>
  );
}