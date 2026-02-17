import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LookupCombobox } from "@/components/LookupCombobox";
import { toast } from "@/hooks/use-toast";
import { createArabicPDF, getAutoTableArabicStyles } from "@/lib/pdf-arabic";
import autoTable from "jspdf-autotable";
import { ArrowRight, Plus, X, Save, CheckCircle, Printer, Pencil, Trash2, Ban } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface Customer { id: string; code: string; name: string; balance?: number; }
interface Product { id: string; code: string; name: string; selling_price: number; purchase_price: number; quantity_on_hand: number; }
interface InvoiceItem { id?: string; product_id: string; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; total: number; }

const ACCOUNT_CODES = {
  CUSTOMERS: "1103",
  REVENUE: "4101",
  COGS: "5101",
  INVENTORY: "1104",
};

export default function SalesInvoiceForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role } = useAuth();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant" || role === "sales";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState<number | null>(null);
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
      supabase.from("products").select("id, code, name, selling_price, purchase_price, quantity_on_hand").eq("is_active", true).order("name"),
    ]);
    setCustomers(custRes.data || []);
    setProducts(prodRes.data || []);

    if (id) {
      const { data: inv } = await (supabase.from("sales_invoices" as any) as any)
        .select("*, customers:customer_id(name)").eq("id", id).single();
      if (inv) {
        setInvoiceNumber(inv.invoice_number);
        setCustomerId(inv.customer_id || "");
        setCustomerName(inv.customers?.name || "");
        setInvoiceDate(inv.invoice_date);
        setNotes(inv.notes || "");
        setReference(inv.reference || "");
        setStatus(inv.status);
        setEditMode(inv.status === "draft");

        const { data: itemsData } = await (supabase.from("sales_invoice_items" as any) as any)
          .select("*, products:product_id(name, code, purchase_price)").eq("invoice_id", id);
        setItems((itemsData || []).map((it: any) => ({
          id: it.id, product_id: it.product_id || "", product_name: it.products?.name || it.description || "",
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
        if (prod) { item.product_name = prod.name; item.unit_price = prod.selling_price; item.cost_price = prod.purchase_price; }
      }
      item.total = (item.quantity * item.unit_price) - item.discount;
      updated[index] = item;
      return updated;
    });
  }

  function removeItem(index: number) { setItems(prev => prev.filter((_, i) => i !== index)); }

  const subtotal = items.reduce((s, i) => s + i.total, 0);

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
        subtotal, discount: 0, tax: 0, total: subtotal,
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

      // Check stock & calculate COGS
      let totalCost = 0;
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("purchase_price, quantity_on_hand").eq("id", item.product_id).single();
        if (prod) {
          if (prod.quantity_on_hand < item.quantity) {
            toast({ title: "تنبيه", description: `الكمية المطلوبة من ${item.product_name} أكبر من المتاح (${prod.quantity_on_hand})`, variant: "destructive" });
            return;
          }
          totalCost += prod.purchase_price * item.quantity;
        }
      }

      const totalDebit = subtotal + totalCost;
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `فاتورة بيع رقم ${invoiceNumber}`, entry_date: invoiceDate,
        total_debit: totalDebit, total_credit: totalDebit, status: "posted",
      } as any).select("id").single();
      if (jeError) throw jeError;

      const lines: any[] = [
        { journal_entry_id: je.id, account_id: customersAcc.id, debit: subtotal, credit: 0, description: `مبيعات - فاتورة ${invoiceNumber}` },
        { journal_entry_id: je.id, account_id: revenueAcc.id, debit: 0, credit: subtotal, description: `إيراد مبيعات - فاتورة ${invoiceNumber}` },
      ];
      if (totalCost > 0) {
        lines.push(
          { journal_entry_id: je.id, account_id: cogsAcc.id, debit: totalCost, credit: 0, description: `تكلفة بضاعة مباعة - فاتورة ${invoiceNumber}` },
          { journal_entry_id: je.id, account_id: inventoryAcc.id, debit: 0, credit: totalCost, description: `خصم مخزون - فاتورة ${invoiceNumber}` },
        );
      }
      await supabase.from("journal_entry_lines").insert(lines as any);

      await (supabase.from("sales_invoices" as any) as any).update({ status: "posted", journal_entry_id: je.id }).eq("id", id);

      // Update stock & record inventory movements
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: prod } = await supabase.from("products").select("quantity_on_hand, purchase_price").eq("id", item.product_id).single();
        if (prod) {
          await supabase.from("products").update({ quantity_on_hand: prod.quantity_on_hand - item.quantity } as any).eq("id", item.product_id);
          await (supabase.from("inventory_movements" as any) as any).insert({
            product_id: item.product_id, movement_type: "sale",
            quantity: item.quantity, unit_cost: item.unit_price, total_cost: item.total,
            reference_id: id, reference_type: "sales_invoice", movement_date: invoiceDate,
          });
        }
      }

      // Update customer balance
      const cust = customers.find(c => c.id === customerId);
      if (cust) {
        await (supabase.from("customers" as any) as any).update({ balance: (cust.balance || 0) + subtotal }).eq("id", customerId);
      }

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
        // Delete related inventory movements
        await (supabase.from("inventory_movements" as any) as any).delete().eq("reference_id", id).eq("product_id", item.product_id);
      }

      const cust = customers.find(c => c.id === customerId);
      if (cust) {
        await (supabase.from("customers" as any) as any).update({ balance: (cust.balance || 0) - subtotal }).eq("id", customerId);
      }

      if (inv?.journal_entry_id) {
        const { data: origLines } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", inv.journal_entry_id);
        const totalDebit = subtotal + totalCost;
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
    const doc = await createArabicPDF();
    const styles = getAutoTableArabicStyles();

    doc.setFont("Amiri", "bold");
    doc.setFontSize(18);
    doc.text(`فاتورة بيع رقم #${invoiceNumber || "جديدة"}`, doc.internal.pageSize.getWidth() / 2, 25, { align: "center" });

    doc.setFont("Amiri", "normal");
    doc.setFontSize(12);
    const infoY = 40;
    doc.text(`العميل: ${customerName || customers.find(c => c.id === customerId)?.name || "—"}`, doc.internal.pageSize.getWidth() - 15, infoY, { align: "right" });
    doc.text(`التاريخ: ${invoiceDate}`, doc.internal.pageSize.getWidth() - 15, infoY + 8, { align: "right" });
    doc.text(`الحالة: ${status === "posted" ? "مُرحّل" : "مسودة"}`, doc.internal.pageSize.getWidth() - 15, infoY + 16, { align: "right" });

    const tableData = items.map((item, i) => [
      item.total.toLocaleString("en-US", { minimumFractionDigits: 2 }),
      item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 }),
      item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 }),
      item.quantity.toString(),
      item.product_name,
      (i + 1).toString(),
    ]);

    autoTable(doc, {
      head: [["الإجمالي", "الخصم", "السعر", "الكمية", "المنتج", "#"]],
      body: tableData,
      startY: infoY + 25,
      styles: { ...styles, fontSize: 11 },
      headStyles: { ...styles, fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
      foot: [["", "", "", "", "الإجمالي الكلي", subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 }) + " EGP"]],
      footStyles: { ...styles, fontStyle: "bold", fillColor: [236, 240, 241] },
    });

    if (notes) {
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.text(`ملاحظات: ${notes}`, doc.internal.pageSize.getWidth() - 15, finalY, { align: "right" });
    }

    doc.save(`فاتورة-بيع-${invoiceNumber || "جديدة"}.pdf`);
  }

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  const isDraft = status === "draft";
  const isEditable = editMode && isDraft && canEdit;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isNew ? "فاتورة بيع جديدة" : `فاتورة بيع #${invoiceNumber}`}
            </h1>
            {!isNew && <Badge variant={statusColors[status] as any} className="mt-1">{statusLabels[status]}</Badge>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isNew && isDraft && canEdit && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2"><Trash2 className="h-4 w-4" />حذف</Button>
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
                <Button variant="outline" className="gap-2 border-destructive text-destructive hover:bg-destructive/10"><Ban className="h-4 w-4" />إلغاء الفاتورة</Button>
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
            <Button variant="outline" onClick={handlePrint} className="gap-2">
              <Printer className="h-4 w-4" />طباعة
            </Button>
          )}
          {!isNew && isDraft && canEdit && !editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)} className="gap-2">
              <Pencil className="h-4 w-4" />تعديل
            </Button>
          )}
          {!isNew && isDraft && canEdit && (
            <Button variant="default" onClick={postInvoice} className="gap-2 bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4" />ترحيل
            </Button>
          )}
          {isEditable && (
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          )}
        </div>
      </div>

      {/* Invoice Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>العميل *</Label>
              {isEditable ? (
                <LookupCombobox items={customers} value={customerId} onValueChange={setCustomerId} placeholder="اختر العميل" />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{customerName || customers.find(c => c.id === customerId)?.name || "—"}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>تاريخ الفاتورة</Label>
              {isEditable ? (
                <Input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{invoiceDate}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>مرجع الفاتورة</Label>
              {isEditable ? (
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم مرجعي (اختياري)" />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{reference || "—"}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">الأصناف</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right w-[35%]">المنتج</TableHead>
                <TableHead className="text-right w-[12%]">الكمية</TableHead>
                <TableHead className="text-right w-[18%]">السعر</TableHead>
                <TableHead className="text-right w-[13%]">الخصم</TableHead>
                <TableHead className="text-right w-[18%]">الإجمالي</TableHead>
                {isEditable && <TableHead className="w-[4%]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={isEditable ? 6 : 5} className="text-center py-8 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>
              ) : items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {isEditable ? (
                      <LookupCombobox
                        items={products.map(p => ({ id: p.id, name: `${p.code} - ${p.name} (${p.quantity_on_hand})` }))}
                        value={item.product_id} onValueChange={v => updateItem(i, "product_id", v)} placeholder="اختر المنتج"
                      />
                    ) : (
                      <span className="font-medium">{item.product_name}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {isEditable ? <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.quantity}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditable ? <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
                  </TableCell>
                  <TableCell>
                    {isEditable ? <Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
                  </TableCell>
                  <TableCell className="font-mono font-semibold">{item.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</TableCell>
                  {isEditable && <TableCell><Button variant="ghost" size="icon" onClick={() => removeItem(i)}><X className="h-4 w-4 text-destructive" /></Button></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {isEditable && (
            <div className="p-3 border-t">
              <Button variant="outline" size="sm" onClick={addItem} className="gap-1 w-full"><Plus className="h-3 w-3" />إضافة صنف</Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            {isEditable ? (
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" rows={2} />
            ) : (
              <p className="text-sm p-2 bg-muted/30 rounded">{notes || "—"}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Total */}
      {items.length > 0 && (
        <Card>
          <CardContent className="p-4 flex justify-between items-center">
            <span className="text-lg font-bold">الإجمالي الكلي</span>
            <span className="text-2xl font-bold font-mono">{subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP</span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
