import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LookupCombobox } from "@/components/LookupCombobox";
import { toast } from "@/hooks/use-toast";
import { createArabicPDF, getAutoTableArabicStyles, addPdfHeader, addPdfFooter } from "@/lib/pdf-arabic";
import autoTable from "jspdf-autotable";
import { ArrowRight, Plus, X, Save, CheckCircle, Printer, Pencil, Trash2, Ban } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import InvoicePaymentSection from "@/components/InvoicePaymentSection";

interface Supplier { id: string; code: string; name: string; balance?: number; }
interface Product { id: string; code: string; name: string; purchase_price: number; }
interface InvoiceItem { id?: string; product_id: string; product_name: string; quantity: number; unit_price: number; discount: number; total: number; }

const ACCOUNT_CODES = {
  INVENTORY: "1104",
  SUPPLIERS: "2101",
};

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
      supabase.from("products").select("id, code, name, purchase_price").eq("is_active", true).order("name"),
    ]);
    setSuppliers(supRes.data || []);
    setProducts(prodRes.data || []);

    if (id) {
      const { data: inv } = await (supabase.from("purchase_invoices" as any) as any)
        .select("*, suppliers:supplier_id(name)").eq("id", id).single();
      if (inv) {
        setInvoiceNumber(inv.invoice_number);
        setSupplierId(inv.supplier_id || "");
        setSupplierName(inv.suppliers?.name || "");
        setInvoiceDate(inv.invoice_date);
        setNotes(inv.notes || "");
        setReference(inv.reference || "");
        setStatus(inv.status);
        setEditMode(inv.status === "draft");

        const { data: itemsData } = await (supabase.from("purchase_invoice_items" as any) as any)
          .select("*, products:product_id(name, code)").eq("invoice_id", id);
        setItems((itemsData || []).map((it: any) => ({
          id: it.id, product_id: it.product_id || "", product_name: it.products?.name || it.description || "",
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
        if (prod) { item.product_name = prod.name; item.unit_price = prod.purchase_price; }
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

      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `فاتورة شراء رقم ${invoiceNumber}`, entry_date: invoiceDate,
        total_debit: grandTotal, total_credit: grandTotal, status: "posted",
      } as any).select("id").single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: inventoryAcc.id, debit: grandTotal, credit: 0, description: `مشتريات - فاتورة ${invoiceNumber}` },
        { journal_entry_id: je.id, account_id: supplierAcc.id, debit: 0, credit: grandTotal, description: `مستحقات مورد - فاتورة ${invoiceNumber}` },
      ] as any);

      await (supabase.from("purchase_invoices" as any) as any).update({ status: "posted", journal_entry_id: je.id }).eq("id", id);

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

      const sup = suppliers.find(s => s.id === supplierId);
      if (sup) {
        await (supabase.from("suppliers" as any) as any).update({ balance: (sup.balance || 0) + grandTotal }).eq("id", supplierId);
      }

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

      const sup = suppliers.find(s => s.id === supplierId);
      if (sup) {
        await (supabase.from("suppliers" as any) as any).update({ balance: (sup.balance || 0) - grandTotal }).eq("id", supplierId);
      }

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
    const doc = await createArabicPDF();
    const styles = getAutoTableArabicStyles();

    let infoY = addPdfHeader(doc, settings, `فاتورة شراء رقم #${invoiceNumber || "جديدة"}`);

    doc.setFont("Amiri", "normal");
    doc.setFontSize(11);
    doc.text(`المورد: ${supplierName || suppliers.find(s => s.id === supplierId)?.name || "—"}`, doc.internal.pageSize.getWidth() - 15, infoY, { align: "right" });
    doc.text(`التاريخ: ${invoiceDate}`, doc.internal.pageSize.getWidth() - 15, infoY + 7, { align: "right" });
    doc.text(`الحالة: ${status === "posted" ? "مُرحّل" : "مسودة"}`, doc.internal.pageSize.getWidth() - 15, infoY + 14, { align: "right" });
    infoY += 14;

    const heads: string[] = [];
    if (showDiscount) heads.push("الإجمالي", "الخصم", "السعر", "الكمية", "المنتج", "#");
    else heads.push("الإجمالي", "السعر", "الكمية", "المنتج", "#");

    const tableData = items.map((item, i) => {
      const row: string[] = [item.total.toLocaleString("en-US", { minimumFractionDigits: 2 })];
      if (showDiscount) row.push(item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 }));
      row.push(item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 }), item.quantity.toString(), item.product_name, (i + 1).toString());
      return row;
    });

    const footRows: string[][] = [];
    const emptyCount = showDiscount ? 4 : 3;
    footRows.push([...Array(emptyCount).fill(""), "الإجمالي الفرعي", formatCurrency(subtotal)]);
    if (showTax) footRows.push([...Array(emptyCount).fill(""), `الضريبة (${taxRate}%)`, formatCurrency(taxAmount)]);
    footRows.push([...Array(emptyCount).fill(""), "الإجمالي الكلي", formatCurrency(grandTotal)]);

    autoTable(doc, {
      head: [heads],
      body: tableData,
      startY: infoY + 25,
      styles: { ...styles, fontSize: 11 },
      headStyles: { ...styles, fillColor: [41, 128, 185], textColor: 255, fontStyle: "bold" },
      foot: footRows,
      footStyles: { ...styles, fontStyle: "bold", fillColor: [236, 240, 241] },
    });

    if (notes) {
      const finalY = (doc as any).lastAutoTable.finalY + 10;
      doc.text(`ملاحظات: ${notes}`, doc.internal.pageSize.getWidth() - 15, finalY, { align: "right" });
    }

    addPdfFooter(doc, settings);
    doc.save(`فاتورة-شراء-${invoiceNumber || "جديدة"}.pdf`);
  }

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  const isDraft = status === "draft";
  const isEditable = editMode && isDraft && canEdit;
  const colCount = 3 + (showDiscount ? 1 : 0) + 1 + (isEditable ? 1 : 0);

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/purchases")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isNew ? "فاتورة شراء جديدة" : `فاتورة شراء #${invoiceNumber}`}
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
                  <AlertDialogDescription>سيتم عكس القيد المحاسبي وإرجاع الكميات للمخزون وتعديل رصيد المورد. هل تريد المتابعة؟</AlertDialogDescription>
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
              <Label>المورد *</Label>
              {isEditable ? (
                <LookupCombobox items={suppliers} value={supplierId} onValueChange={setSupplierId} placeholder="اختر المورد" />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{supplierName || suppliers.find(s => s.id === supplierId)?.name || "—"}</p>
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
                {showDiscount && <TableHead className="text-right w-[13%]">الخصم</TableHead>}
                <TableHead className="text-right w-[18%]">الإجمالي</TableHead>
                {isEditable && <TableHead className="w-[4%]"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow><TableCell colSpan={colCount} className="text-center py-8 text-muted-foreground">لا توجد أصناف</TableCell></TableRow>
              ) : items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    {isEditable ? (
                      <LookupCombobox
                        items={products.map(p => ({ id: p.id, name: `${p.code} - ${p.name}` }))}
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
                  {showDiscount && (
                    <TableCell>
                      {isEditable ? <Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}
                    </TableCell>
                  )}
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

      {/* Totals */}
      {items.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">الإجمالي الفرعي</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            {showTax && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">الضريبة ({taxRate}%)</span>
                <span className="font-mono">{formatCurrency(taxAmount)}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t pt-2">
              <span className="text-lg font-bold">الإجمالي الكلي</span>
              <span className="text-2xl font-bold font-mono">{formatCurrency(grandTotal)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Section - only for posted invoices */}
      {!isNew && status === "posted" && id && (
        <InvoicePaymentSection
          type="purchase"
          invoiceId={id}
          entityId={supplierId}
          entityName={supplierName || suppliers.find(s => s.id === supplierId)?.name || ""}
          invoiceTotal={grandTotal}
          invoiceNumber={invoiceNumber}
          onPaymentAdded={loadData}
        />
      )}
    </div>
  );
}
