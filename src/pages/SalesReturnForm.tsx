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
import { ArrowRight, Plus, X, Save, CheckCircle, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

import { ProductWithBrand, productsToLookupItems, formatProductName, PRODUCT_SELECT_FIELDS } from "@/lib/product-utils";

interface Customer { id: string; code: string; name: string; balance?: number; }
type Product = ProductWithBrand & { selling_price: number; purchase_price: number; quantity_on_hand: number; };
interface ReturnItem { id?: string; product_id: string; product_name: string; quantity: number; unit_price: number; cost_price: number; discount: number; total: number; }

const ACCOUNT_CODES = { CUSTOMERS: "1103", REVENUE: "4101", COGS: "5101", INVENTORY: "1104" };

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

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [returnNumber, setReturnNumber] = useState<number | null>(null);
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
        setCustomerId(ret.customer_id || "");
        setCustomerName(ret.customers?.name || "");
        setReturnDate(ret.return_date);
        setNotes(ret.notes || "");
        setReference(ret.reference || "");
        setStatus(ret.status);
        setEditMode(ret.status === "draft");

        const { data: itemsData } = await (supabase.from("sales_return_items" as any) as any)
          .select("*, products:product_id(name, code, purchase_price)").eq("return_id", id);
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
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.CUSTOMERS, ACCOUNT_CODES.REVENUE, ACCOUNT_CODES.COGS, ACCOUNT_CODES.INVENTORY]);
      const customersAcc = accounts?.find(a => a.code === ACCOUNT_CODES.CUSTOMERS);
      const revenueAcc = accounts?.find(a => a.code === ACCOUNT_CODES.REVENUE);
      const cogsAcc = accounts?.find(a => a.code === ACCOUNT_CODES.COGS);
      const inventoryAcc = accounts?.find(a => a.code === ACCOUNT_CODES.INVENTORY);
      if (!customersAcc || !revenueAcc) {
        toast({ title: "خطأ", description: "تأكد من وجود الحسابات المطلوبة", variant: "destructive" });
        return;
      }

      // Use average purchase price for accurate cost reversal
      let totalCost = 0;
      const itemAvgCosts: Record<string, number> = {};
      for (const item of items) {
        if (!item.product_id) continue;
        const { data: avgPrice } = await supabase.rpc("get_avg_purchase_price", { _product_id: item.product_id });
        const avgCost = Number(avgPrice) || 0;
        itemAvgCosts[item.product_id] = avgCost;
        totalCost += avgCost * item.quantity;
      }

      const totalDebit = grandTotal + totalCost;
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: `مرتجع بيع رقم ${returnNumber}`, entry_date: returnDate,
        total_debit: totalDebit, total_credit: totalDebit, status: "posted",
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

      await (supabase.from("sales_returns" as any) as any).update({ status: "posted", journal_entry_id: je.id }).eq("id", id);

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

      // Fetch fresh customer balance from DB
      const { data: freshCust } = await (supabase.from("customers" as any) as any).select("balance").eq("id", customerId).single();
      if (freshCust) {
        await (supabase.from("customers" as any) as any).update({ balance: (freshCust.balance || 0) - grandTotal }).eq("id", customerId);
      }

      toast({ title: "تم الترحيل", description: "تم ترحيل مرتجع البيع" });
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

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default" };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  const isDraft = status === "draft";
  const isEditable = editMode && isDraft && canEdit;
  const colCount = 3 + (showDiscount ? 1 : 0) + 1 + (isEditable ? 1 : 0);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/sales-returns")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {isNew ? "مرتجع بيع جديد" : `مرتجع بيع #${returnNumber}`}
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
                <AlertDialogHeader><AlertDialogTitle>حذف المرتجع</AlertDialogTitle><AlertDialogDescription>هل أنت متأكد؟</AlertDialogDescription></AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDeleteDraft} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && isDraft && canEdit && (
            <Button variant="default" onClick={postReturn} className="gap-2 bg-green-600 hover:bg-green-700">
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
              <Label>تاريخ المرتجع</Label>
              {isEditable ? (
                <Input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{returnDate}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>مرجع</Label>
              {isEditable ? (
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم مرجعي (اختياري)" />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{reference || "—"}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-lg">الأصناف المرتجعة</CardTitle></CardHeader>
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
                      <LookupCombobox items={productsToLookupItems(products)} value={item.product_id} onValueChange={v => updateItem(i, "product_id", v)} placeholder="اختر المنتج" />
                    ) : <span className="font-medium">{item.product_name}</span>}
                  </TableCell>
                  <TableCell>{isEditable ? <Input type="number" min="1" value={item.quantity} onChange={e => updateItem(i, "quantity", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.quantity}</span>}</TableCell>
                  <TableCell>{isEditable ? <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={e => updateItem(i, "unit_price", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.unit_price.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}</TableCell>
                  {showDiscount && (
                    <TableCell>{isEditable ? <Input type="number" min="0" step="0.01" value={item.discount} onChange={e => updateItem(i, "discount", +e.target.value)} className="font-mono" /> : <span className="font-mono">{item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>}</TableCell>
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

      <Card>
        <CardContent className="p-4">
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            {isEditable ? (
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="ملاحظات (اختياري)" rows={2} />
            ) : <p className="text-sm p-2 bg-muted/30 rounded">{notes || "—"}</p>}
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
