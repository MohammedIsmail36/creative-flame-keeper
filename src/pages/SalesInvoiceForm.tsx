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
import {
  Plus,
  X,
  Save,
  CheckCircle,
  Printer,
  Pencil,
  Trash2,
  Ban,
  User,
  FileText,
  ListChecks,
  CreditCard,
  Eye,
  StickyNote,
  ArrowLeftRight,
} from "lucide-react";
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
import InvoicePaymentSection from "@/components/InvoicePaymentSection";
import OutstandingCreditsSection from "@/components/OutstandingCreditsSection";
import { recalculateEntityBalance } from "@/lib/entity-balance";
import {
  ProductWithBrand,
  productsToLookupItems,
  formatProductName,
  formatProductDisplay,
  PRODUCT_SELECT_FIELDS,
} from "@/lib/product-utils";

interface Customer {
  id: string;
  code: string;
  name: string;
  balance?: number;
}
type Product = ProductWithBrand & { selling_price: number; purchase_price: number; quantity_on_hand: number };
interface InvoiceItem {
  id?: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  discount: number;
  total: number;
}

const ACCOUNT_CODES = {
  CUSTOMERS: "1103",
  REVENUE: "4101",
  COGS: "5101",
  INVENTORY: "1104",
};

// ── Section Header Component ──
function SectionHeader({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
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
  const [paymentSectionRefreshKey, setPaymentSectionRefreshKey] = useState(0);

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

  useEffect(() => {
    loadData();
  }, [id]);

  async function loadData() {
    const [custRes, prodRes] = await Promise.all([
      (supabase.from("customers" as any) as any).select("id, code, name, balance").eq("is_active", true).order("name"),
      supabase.from("products").select(PRODUCT_SELECT_FIELDS).eq("is_active", true).order("name"),
    ]);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);

    if (id) {
      const { data: inv } = await (supabase.from("sales_invoices" as any) as any)
        .select("*, customers:customer_id(name)")
        .eq("id", id)
        .single();
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
          .select("*, products:product_id(name, code, purchase_price, model_number, product_brands(name))")
          .eq("invoice_id", id);
        setItems(
          (itemsData || []).map((it: any) => ({
            id: it.id,
            product_id: it.product_id || "",
            product_name: it.products
              ? formatProductDisplay(it.products.name, it.products.product_brands?.name, it.products.model_number)
              : it.description || "",
            quantity: it.quantity,
            unit_price: it.unit_price,
            cost_price: it.products?.purchase_price || 0,
            discount: it.discount,
            total: it.total,
          })),
        );
      }
      setLoading(false);
    } else {
      setEditMode(true);
      setLoading(false);
    }
  }

  async function handleSettlementChanged() {
    await loadData();
    setPaymentSectionRefreshKey((current) => current + 1);
  }

  function addItem() {
    setItems((prev) => [
      ...prev,
      { product_id: "", product_name: "", quantity: 1, unit_price: 0, cost_price: 0, discount: 0, total: 0 },
    ]);
  }

  function updateItem(index: number, field: string, value: any) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[index], [field]: value };
      if (field === "product_id") {
        const prod = products.find((p) => p.id === value);
        if (prod) {
          item.product_name = formatProductName(prod);
          item.unit_price = prod.selling_price;
          item.cost_price = prod.purchase_price;
        }
      }
      item.total = item.quantity * item.unit_price - item.discount;
      updated[index] = item;
      return updated;
    });
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const taxAmount = showTax ? subtotal * (taxRate / 100) : 0;
  const grandTotal = subtotal + taxAmount;

  async function handleSave() {
    if (!customerId || items.length === 0) {
      toast({ title: "تنبيه", description: "يرجى اختيار العميل وإضافة أصناف", variant: "destructive" });
      return;
    }
    if (items.some((i) => !i.product_id)) {
      toast({ title: "تنبيه", description: "يرجى اختيار المنتج لكل صنف", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        customer_id: customerId,
        invoice_date: invoiceDate,
        subtotal,
        discount: 0,
        tax: taxAmount,
        total: grandTotal,
        notes: notes.trim() || null,
        reference: reference.trim() || null,
        status: "draft",
      };

      if (isNew) {
        const { data: inv, error } = await (supabase.from("sales_invoices" as any) as any)
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        const rows = items.map((i) => ({
          invoice_id: inv.id,
          product_id: i.product_id,
          description: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          total: i.total,
        }));
        await (supabase.from("sales_invoice_items" as any) as any).insert(rows);
        toast({ title: "تمت الإضافة", description: "تم إنشاء فاتورة البيع كمسودة" });
        navigate(`/sales/${inv.id}`);
      } else {
        const { error } = await (supabase.from("sales_invoices" as any) as any).update(payload).eq("id", id);
        if (error) throw error;
        await (supabase.from("sales_invoice_items" as any) as any).delete().eq("invoice_id", id);
        const rows = items.map((i) => ({
          invoice_id: id,
          product_id: i.product_id,
          description: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount,
          total: i.total,
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
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code")
        .in("code", [ACCOUNT_CODES.CUSTOMERS, ACCOUNT_CODES.REVENUE, ACCOUNT_CODES.COGS, ACCOUNT_CODES.INVENTORY]);
      const customersAcc = accounts?.find((a) => a.code === ACCOUNT_CODES.CUSTOMERS);
      const revenueAcc = accounts?.find((a) => a.code === ACCOUNT_CODES.REVENUE);
      const cogsAcc = accounts?.find((a) => a.code === ACCOUNT_CODES.COGS);
      const inventoryAcc = accounts?.find((a) => a.code === ACCOUNT_CODES.INVENTORY);
      if (!customersAcc || !revenueAcc || !cogsAcc || !inventoryAcc) {
        toast({
          title: "خطأ",
          description: "تأكد من وجود حسابات العملاء والإيرادات والتكلفة والمخزون",
          variant: "destructive",
        });
        return;
      }

      let totalCost = 0;
      const itemAvgCosts: Record<string, number> = {};
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase
          .from("products")
          .select("quantity_on_hand")
          .eq("id", item.product_id)
          .single();
        if (prod) {
          if (prod.quantity_on_hand < item.quantity) {
            toast({
              title: "تنبيه",
              description: `الكمية المطلوبة من ${item.product_name} أكبر من المتاح (${prod.quantity_on_hand})`,
              variant: "destructive",
            });
            return;
          }
        }
        const { data: avgPrice } = await supabase.rpc("get_avg_purchase_price", { _product_id: item.product_id });
        const avgCost = Number(avgPrice) || 0;
        const effectiveCost = avgCost > 0 ? avgCost : item.cost_price;
        itemAvgCosts[item.product_id] = effectiveCost;
        totalCost += effectiveCost * item.quantity;
      }

      const totalDebit = grandTotal + totalCost;
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const { data: je, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          description: `فاتورة بيع رقم ${invoiceNumber}`,
          entry_date: invoiceDate,
          total_debit: totalDebit,
          total_credit: totalDebit,
          status: "posted",
          posted_number: jePostedNum,
        } as any)
        .select("id")
        .single();
      if (jeError) throw jeError;

      const lines: any[] = [
        {
          journal_entry_id: je.id,
          account_id: customersAcc.id,
          debit: grandTotal,
          credit: 0,
          description: `مبيعات - فاتورة ${invoiceNumber}`,
        },
        {
          journal_entry_id: je.id,
          account_id: revenueAcc.id,
          debit: 0,
          credit: grandTotal,
          description: `إيراد مبيعات - فاتورة ${invoiceNumber}`,
        },
      ];
      if (totalCost > 0) {
        lines.push(
          {
            journal_entry_id: je.id,
            account_id: cogsAcc.id,
            debit: totalCost,
            credit: 0,
            description: `تكلفة بضاعة مباعة - فاتورة ${invoiceNumber}`,
          },
          {
            journal_entry_id: je.id,
            account_id: inventoryAcc.id,
            debit: 0,
            credit: totalCost,
            description: `خصم مخزون - فاتورة ${invoiceNumber}`,
          },
        );
      }
      await supabase.from("journal_entry_lines").insert(lines as any);

      const nextPostedNum = await getNextPostedNumber("sales_invoices");
      await (supabase.from("sales_invoices" as any) as any)
        .update({ status: "posted", journal_entry_id: je.id, posted_number: nextPostedNum })
        .eq("id", id);

      for (const item of items) {
        if (!item.product_id) continue;
        const avgCost = itemAvgCosts[item.product_id] || 0;
        const { data: prod } = await supabase
          .from("products")
          .select("quantity_on_hand")
          .eq("id", item.product_id)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ quantity_on_hand: prod.quantity_on_hand - item.quantity } as any)
            .eq("id", item.product_id);
          await (supabase.from("inventory_movements" as any) as any).insert({
            product_id: item.product_id,
            movement_type: "sale",
            quantity: item.quantity,
            unit_cost: avgCost,
            total_cost: avgCost * item.quantity,
            reference_id: id,
            reference_type: "sales_invoice",
            movement_date: invoiceDate,
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
      const { data: inv } = await (supabase.from("sales_invoices" as any) as any)
        .select("journal_entry_id")
        .eq("id", id)
        .single();

      let totalCost = 0;
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase
          .from("products")
          .select("quantity_on_hand, purchase_price")
          .eq("id", item.product_id)
          .single();
        if (prod) {
          await supabase
            .from("products")
            .update({ quantity_on_hand: prod.quantity_on_hand + item.quantity } as any)
            .eq("id", item.product_id);
          totalCost += prod.purchase_price * item.quantity;
        }
        await (supabase.from("inventory_movements" as any) as any)
          .delete()
          .eq("reference_id", id)
          .eq("product_id", item.product_id);
      }

      await recalculateEntityBalance("customer", customerId);

      if (inv?.journal_entry_id) {
        const { data: origLines } = await supabase
          .from("journal_entry_lines")
          .select("*")
          .eq("journal_entry_id", inv.journal_entry_id);
        const totalDebit = (origLines || []).reduce((s: number, l: any) => s + Number(l.debit), 0);
        const totalCredit = (origLines || []).reduce((s: number, l: any) => s + Number(l.credit), 0);
        const postedNumber = await getNextPostedNumber("journal_entries");
        const { data: reverseJe } = await supabase
          .from("journal_entries")
          .insert({
            description: `عكس فاتورة بيع رقم ${invoiceNumber}`,
            entry_date: new Date().toISOString().split("T")[0],
            total_debit: totalCredit,
            total_credit: totalDebit,
            status: "posted",
            posted_number: postedNumber,
          } as any)
          .select("id")
          .single();
        if (reverseJe && origLines) {
          const reverseLines = origLines.map((line: any) => ({
            journal_entry_id: reverseJe.id,
            account_id: line.account_id,
            debit: line.credit,
            credit: line.debit,
            description: `عكس - ${line.description}`,
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
      partyName: customerName || customers.find((c) => c.id === customerId)?.name || "—",
      partyLabel: "العميل",
      reference: reference || undefined,
      notes: notes || undefined,
      items: items.map((i) => ({
        name: i.product_name,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discount: i.discount,
        total: i.total,
      })),
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
  const colCount = 4 + (showDiscount ? 1 : 0) + (isEditable ? 1 : 0);

  const displayNumber = !isNew
    ? formatDisplayNumber(settings?.sales_invoice_prefix || "INV-", postedNumber, invoiceNumber || 0, status)
    : null;

  const totalDiscount = items.reduce((s, i) => s + i.discount, 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* ── Page Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-black text-foreground tracking-tight">
              {isNew ? "إنشاء فاتورة مبيعات" : "فاتورة مبيعات"}
            </h1>
            {displayNumber && (
              <span className="text-sm font-semibold text-muted-foreground border border-border px-3 py-1 rounded-lg bg-muted/50 font-mono tabular-nums">
                {displayNumber}
              </span>
            )}
            {!isNew && (
              <Badge variant={statusColors[status] as any} className="text-xs px-3 py-1">
                {statusLabels[status]}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1.5 text-sm">إدارة وتوثيق مبيعات المنشأة بدقة وسهولة</p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {!isNew && isDraft && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                  حذف
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف الفاتورة المسودة</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteDraft}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    حذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && status === "posted" && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                >
                  <Ban className="h-4 w-4" />
                  إلغاء
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>إلغاء الفاتورة المرحّلة</AlertDialogTitle>
                  <AlertDialogDescription>
                    سيتم عكس القيد المحاسبي وإرجاع الكميات للمخزون وتعديل رصيد العميل.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleCancelPosted}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    إلغاء الفاتورة
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && (
            <Button variant="outline" size="sm" onClick={handlePrint} className="gap-1.5">
              <Printer className="h-4 w-4" />
              طباعة
            </Button>
          )}
          {!isNew && isDraft && canEdit && !editMode && (
            <Button variant="outline" size="sm" onClick={() => setEditMode(true)} className="gap-1.5">
              <Pencil className="h-4 w-4" />
              تعديل
            </Button>
          )}
          {isEditable && (
            <Button variant="outline" size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              <Save className="h-4 w-4" />
              {saving ? "جاري الحفظ..." : "حفظ مسودة"}
            </Button>
          )}
          {!isNew && isDraft && canEdit && (
            <Button
              size="sm"
              onClick={postInvoice}
              className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground px-5"
            >
              <CheckCircle className="h-4 w-4" />
              إصدار الفاتورة
            </Button>
          )}
        </div>
      </div>

      {/* ── Customer Details Card ── */}
      <div className="bg-card p-6 rounded-2xl border shadow-sm">
        <div className="mb-5">
          <SectionHeader icon={User} title="بيانات الفاتورة" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">اسم العميل</Label>
            {isEditable ? (
              <LookupCombobox
                items={customers}
                value={customerId}
                onValueChange={setCustomerId}
                placeholder="اختر عميل أو أضف جديداً"
              />
            ) : (
              <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm font-medium">
                {customerName || customers.find((c) => c.id === customerId)?.name || "—"}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">تاريخ الإصدار</Label>
            {isEditable ? (
              <DatePickerInput value={invoiceDate} onChange={setInvoiceDate} placeholder="اختر التاريخ" />
            ) : (
              <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm font-mono tabular-nums">
                {invoiceDate}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">رقم المرجع</Label>
            {isEditable ? (
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="أدخل رقم المرجع"
                className="rounded-xl"
              />
            ) : (
              <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm">
                {reference || "—"}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Items Table Card ── */}
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        {/* Card Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <SectionHeader icon={ListChecks} title="بنود الفاتورة" />
            {items.length > 0 && (
              <span className="text-xs font-medium text-muted-foreground bg-muted border border-border/60 px-2.5 py-0.5 rounded-full tabular-nums">
                {items.length} {items.length === 1 ? "بند" : "بنود"}
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "4%" }} />
              <col style={{ width: showDiscount ? "38%" : "48%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "18%" }} />
              {showDiscount && <col style={{ width: "14%" }} />}
              <col style={{ width: "18%" }} />
              {isEditable && <col style={{ width: "4%" }} />}
            </colgroup>
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs text-center">#</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs">البند</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs text-center">الكمية</th>
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs text-center">سعر الوحدة</th>
                {showDiscount && (
                  <th className="py-2 px-3 font-medium text-muted-foreground text-xs text-center">الخصم</th>
                )}
                <th className="py-2 px-3 font-medium text-muted-foreground text-xs text-center">المجموع</th>
                {isEditable && <th className="py-2 px-2" />}
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={colCount}>
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                        <ListChecks className="h-5 w-5 text-muted-foreground/40" />
                      </div>
                      <p className="text-sm font-medium text-muted-foreground">لا توجد بنود بعد</p>
                      {isEditable && <p className="text-xs text-muted-foreground/50">اضغط «إضافة بند جديد» للبدء</p>}
                    </div>
                  </td>
                </tr>
              ) : (
                items.map((item, i) => (
                  <tr
                    key={i}
                    className="group border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors duration-100"
                  >
                    {/* Row number */}
                    <td className="py-2 px-3 text-center">
                      <span className="text-xs font-medium text-muted-foreground/40 tabular-nums">{i + 1}</span>
                    </td>

                    {/* Product — takes all remaining width, truncates overflow */}
                    <td className="py-2 px-3 min-w-0">
                      {isEditable ? (
                        <LookupCombobox
                          items={productsToLookupItems(products, true)}
                          value={item.product_id}
                          onValueChange={(v) => updateItem(i, "product_id", v)}
                          placeholder="اختر المنتج"
                        />
                      ) : (
                        <span className="font-medium text-sm block truncate" title={item.product_name}>
                          {item.product_name}
                        </span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="py-2 px-3">
                      {isEditable ? (
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, "quantity", +e.target.value)}
                          className="font-mono tabular-nums text-center bg-muted/30 border-border rounded-md h-8 w-full"
                        />
                      ) : (
                        <span className="font-mono tabular-nums text-sm block text-center">{item.quantity}</span>
                      )}
                    </td>

                    {/* Unit Price */}
                    <td className="py-2 px-3">
                      {isEditable ? (
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateItem(i, "unit_price", +e.target.value)}
                          className="font-mono tabular-nums text-center bg-muted/30 border-border rounded-md h-8 w-full"
                        />
                      ) : (
                        <span className="font-mono tabular-nums text-sm text-muted-foreground">
                          {item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </td>

                    {/* Discount */}
                    {showDiscount && (
                      <td className="py-2 px-3">
                        {isEditable ? (
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.discount}
                            onChange={(e) => updateItem(i, "discount", +e.target.value)}
                            className="font-mono tabular-nums text-center bg-muted/30 border-border rounded-md h-8 w-full"
                          />
                        ) : item.discount > 0 ? (
                          <span className="inline-flex items-center text-xs font-medium text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/40 px-2 py-0.5 rounded-full border border-green-200 dark:border-green-800 font-mono tabular-nums">
                            -{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground/30 text-sm">—</span>
                        )}
                      </td>
                    )}

                    {/* Tax — removed from rows, shown only in summary */}

                    {/* Total */}
                    <td className="py-2 px-3 text-center w-full">
                      <span className="font-mono tabular-nums font-semibold text-sm text-foreground bg-muted/30 block rounded-md py-1.5 border border-border">
                        {formatCurrency(item.total)}
                      </span>
                    </td>

                    {/* Delete button */}
                    {isEditable && (
                      <td className="py-2 px-2">
                        <button
                          onClick={() => removeItem(i)}
                          className="p-1 rounded-md text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                          aria-label="حذف البند"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer: Add button + mini totals chips */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/10 flex-wrap gap-3">
          {isEditable ? (
            <button
              onClick={addItem}
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:bg-primary/5 px-3 py-1.5 rounded-lg transition-all"
            >
              <Plus className="h-4 w-4" />
              إضافة بند جديد
            </button>
          ) : (
            <div />
          )}

          {items.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {/* Product count */}
              <div className="flex items-center gap-1.5 bg-muted border border-border/60 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-muted-foreground">المنتجات</span>
                <span className="text-xs font-mono font-semibold tabular-nums text-foreground">
                  {new Set(items.filter((i) => i.product_id).map((i) => i.product_id)).size}
                </span>
              </div>
              {/* Total units */}
              <div className="flex items-center gap-1.5 bg-muted border border-border/60 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-muted-foreground">الوحدات</span>
                <span className="text-xs font-mono font-semibold tabular-nums text-foreground">
                  {items.reduce((s, i) => s + i.quantity, 0)}
                </span>
              </div>
              {/* Separator */}
              <div className="w-px h-4 bg-border/60" />
              {showDiscount && totalDiscount > 0 && (
                <div className="flex items-center gap-1.5 bg-muted border border-border/60 px-3 py-1.5 rounded-lg">
                  <span className="text-xs text-muted-foreground">إجمالي الخصم</span>
                  <span className="text-xs font-mono font-semibold tabular-nums text-green-600 dark:text-green-400">
                    -{formatCurrency(totalDiscount)}
                  </span>
                </div>
              )}
              {showTax && (
                <div className="flex items-center gap-1.5 bg-muted border border-border/60 px-3 py-1.5 rounded-lg">
                  <span className="text-xs text-muted-foreground">الضريبة {taxRate}%</span>
                  <span className="text-xs font-mono font-semibold tabular-nums text-foreground">
                    {formatCurrency(taxAmount)}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-1.5 bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-lg">
                <span className="text-xs text-primary/70 font-medium">الإجمالي</span>
                <span className="text-xs font-mono font-bold tabular-nums text-primary">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Notes + Summary: Side by side ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Notes */}
        <div className="bg-card p-6 rounded-2xl border shadow-sm flex flex-col">
          <div className="mb-4">
            <SectionHeader icon={StickyNote} title="ملاحظات داخلية" />
          </div>
          <div className="flex-1 space-y-2">
            <Label className="text-xs font-medium text-muted-foreground">ملاحظات داخلية (لا تظهر في الطباعة)</Label>
            {isEditable ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full h-32 px-4 py-3 bg-muted/30 border border-border rounded-xl text-sm transition-all resize-none focus:ring-2 focus:ring-ring focus:border-ring"
                placeholder="أدخل أي ملاحظات إضافية هنا..."
              />
            ) : (
              <div className="h-32 px-4 py-3 bg-muted/30 border rounded-xl text-sm text-muted-foreground">
                {notes || "لا توجد ملاحظات"}
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className="bg-card p-6 rounded-2xl border shadow-sm flex flex-col justify-between">
          <div className="mb-4">
            <SectionHeader icon={CreditCard} title="ملخص الفاتورة" />
          </div>
          <div className="space-y-1 mt-2">
            <div className="flex justify-between items-center py-2.5 border-b border-border/50">
              <span className="font-mono tabular-nums text-sm font-medium">{formatCurrency(subtotal)}</span>
              <span className="text-sm text-muted-foreground">المجموع قبل الضريبة</span>
            </div>
            {showDiscount && totalDiscount > 0 && (
              <div className="flex justify-between items-center py-2.5 border-b border-border/50">
                <span className="font-mono tabular-nums text-sm font-medium text-green-600 dark:text-green-400">
                  -{formatCurrency(totalDiscount)}
                </span>
                <span className="text-sm text-muted-foreground">إجمالي الخصومات</span>
              </div>
            )}
            {showTax && (
              <div className="flex justify-between items-center py-2.5 border-b border-border/50">
                <span className="font-mono tabular-nums text-sm font-medium">{formatCurrency(taxAmount)}</span>
                <span className="text-sm text-muted-foreground">ضريبة القيمة المضافة ({taxRate}%)</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-4">
              <span className="text-2xl font-black text-primary font-mono tabular-nums">
                {formatCurrency(grandTotal)}
              </span>
              <span className="text-base font-bold text-foreground">الإجمالي الكلي</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Related Operations ── */}
      {!isNew && status === "posted" && id && customerId && (
        <div className="bg-card p-6 rounded-2xl border shadow-sm">
          <div className="mb-5">
            <SectionHeader icon={ArrowLeftRight} title="العمليات المرتبطة" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <InvoicePaymentSection
                type="sales"
                invoiceId={id}
                entityId={customerId}
                entityName={customerName || customers.find((c) => c.id === customerId)?.name || ""}
                invoiceTotal={grandTotal}
                invoiceNumber={invoiceNumber}
                onPaymentAdded={loadData}
                refreshKey={paymentSectionRefreshKey}
              />
            </div>
            <div className="space-y-4">
              <OutstandingCreditsSection
                type="sales"
                invoiceId={id}
                entityId={customerId}
                invoiceTotal={grandTotal}
                onSettlementChanged={handleSettlementChanged}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
