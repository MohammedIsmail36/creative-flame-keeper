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
import { ProductWithBrand, productsToLookupItems, formatProductName, PRODUCT_SELECT_FIELDS } from "@/lib/product-utils";
import { toast } from "@/hooks/use-toast";
import { ArrowRight, Plus, X, Save, CheckCircle, Pencil } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

type Product = ProductWithBrand & { quantity_on_hand: number; };

interface AdjustmentItem {
  id?: string;
  product_id: string;
  product_name: string;
  system_quantity: number;
  actual_quantity: number;
  difference: number;
  unit_cost: number;
  total_cost: number;
  notes: string;
}

const ACCOUNT_CODES = {
  INVENTORY: "1104",
  INVENTORY_ADJUSTMENT_LOSS: "5201",
  INVENTORY_ADJUSTMENT_GAIN: "4201",
};

export default function InventoryAdjustmentForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const { formatCurrency } = useSettings();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant";

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [adjustmentNumber, setAdjustmentNumber] = useState<number | null>(null);
  const [adjustmentDate, setAdjustmentDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [items, setItems] = useState<AdjustmentItem[]>([]);
  const [editMode, setEditMode] = useState(true);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const { data: prodData } = await supabase
      .from("products")
      .select(PRODUCT_SELECT_FIELDS)
      .eq("is_active", true)
      .order("name");
    setProducts(prodData || []);

    if (id) {
      const { data: adj } = await (supabase.from("inventory_adjustments" as any) as any)
        .select("*").eq("id", id).single();
      if (adj) {
        setAdjustmentNumber(adj.adjustment_number);
        setAdjustmentDate(adj.adjustment_date);
        setDescription(adj.description || "");
        setStatus(adj.status);
        setEditMode(adj.status === "draft");

        const { data: adjItems } = await (supabase.from("inventory_adjustment_items" as any) as any)
          .select("*, products(code, name)")
          .eq("adjustment_id", id);
        if (adjItems) {
          setItems(adjItems.map((it: any) => ({
            id: it.id,
            product_id: it.product_id,
            product_name: it.products?.name || "",
            system_quantity: Number(it.system_quantity),
            actual_quantity: Number(it.actual_quantity),
            difference: Number(it.difference),
            unit_cost: Number(it.unit_cost),
            total_cost: Number(it.total_cost),
            notes: it.notes || "",
          })));
        }
      }
      setLoading(false);
    }
  }

  function addItem() {
    setItems([...items, {
      product_id: "", product_name: "", system_quantity: 0,
      actual_quantity: 0, difference: 0, unit_cost: 0, total_cost: 0, notes: "",
    }]);
  }

  async function handleProductSelect(idx: number, productId: string) {
    const product = products.find(p => p.id === productId);
    if (!product) return;

    // جلب متوسط سعر الشراء
    const { data: avgPrice } = await supabase.rpc("get_avg_purchase_price", { _product_id: productId });
    const cost = Number(avgPrice) || 0;

    const updated = [...items];
    updated[idx] = {
      ...updated[idx],
      product_id: productId,
      product_name: formatProductName(product),
      system_quantity: product.quantity_on_hand,
      actual_quantity: product.quantity_on_hand,
      difference: 0,
      unit_cost: cost,
      total_cost: 0,
    };
    setItems(updated);
  }

  function handleActualQtyChange(idx: number, val: number) {
    const updated = [...items];
    const diff = val - updated[idx].system_quantity;
    updated[idx].actual_quantity = val;
    updated[idx].difference = diff;
    updated[idx].total_cost = Math.abs(diff) * updated[idx].unit_cost;
    setItems(updated);
  }

  function removeItem(idx: number) {
    setItems(items.filter((_, i) => i !== idx));
  }

  const totalGain = items.filter(i => i.difference > 0).reduce((s, i) => s + i.total_cost, 0);
  const totalLoss = items.filter(i => i.difference < 0).reduce((s, i) => s + i.total_cost, 0);

  async function handleSave() {
    if (items.length === 0) return toast({ title: "أضف منتج واحد على الأقل", variant: "destructive" });
    if (items.some(i => !i.product_id)) return toast({ title: "اختر المنتج لكل بند", variant: "destructive" });

    setSaving(true);
    try {
      let adjId = id;
      if (isNew) {
        const { data, error } = await (supabase.from("inventory_adjustments" as any) as any)
          .insert({ adjustment_date: adjustmentDate, description, created_by: user?.id })
          .select().single();
        if (error) throw error;
        adjId = data.id;
      } else {
        await (supabase.from("inventory_adjustments" as any) as any)
          .update({ adjustment_date: adjustmentDate, description })
          .eq("id", adjId);
        await (supabase.from("inventory_adjustment_items" as any) as any).delete().eq("adjustment_id", adjId);
      }

      const rows = items.map(i => ({
        adjustment_id: adjId,
        product_id: i.product_id,
        system_quantity: i.system_quantity,
        actual_quantity: i.actual_quantity,
        difference: i.difference,
        unit_cost: i.unit_cost,
        total_cost: i.total_cost,
        notes: i.notes || null,
      }));

      const { error: itemsErr } = await (supabase.from("inventory_adjustment_items" as any) as any).insert(rows);
      if (itemsErr) throw itemsErr;

      toast({ title: "تم حفظ التسوية بنجاح" });
      navigate(`/inventory-adjustments/${adjId}`);
    } catch (e: any) {
      toast({ title: "خطأ في الحفظ", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (!id) return;
    setSaving(true);
    try {
      // 1. إنشاء القيد المحاسبي
      const { data: invAccount } = await supabase.from("accounts").select("id").eq("code", ACCOUNT_CODES.INVENTORY).single();
      
      // حساب العجز (مصروف)
      let lossAccount: { id: string } | null = null;
      if (totalLoss > 0) {
        const { data } = await supabase.from("accounts").select("id").eq("code", ACCOUNT_CODES.INVENTORY_ADJUSTMENT_LOSS).single();
        lossAccount = data;
        if (!lossAccount) {
          // إنشاء حساب العجز إذا لم يكن موجوداً
          const { data: created } = await supabase.from("accounts").insert({
            code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT_LOSS,
            name: "عجز المخزون",
            account_type: "expense",
            description: "خسائر ناتجة عن عجز الجرد",
          }).select().single();
          lossAccount = created;
        }
      }

      // حساب الزيادة (إيراد)
      let gainAccount: { id: string } | null = null;
      if (totalGain > 0) {
        const { data } = await supabase.from("accounts").select("id").eq("code", ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN).single();
        gainAccount = data;
        if (!gainAccount) {
          const { data: created } = await supabase.from("accounts").insert({
            code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT_GAIN,
            name: "فائض المخزون",
            account_type: "revenue",
            description: "أرباح ناتجة عن فائض الجرد",
          }).select().single();
          gainAccount = created;
        }
      }

      if (!invAccount) throw new Error("حساب المخزون غير موجود - تأكد من وجود حساب بكود " + ACCOUNT_CODES.INVENTORY);

      const lines: { account_id: string; debit: number; credit: number; description: string }[] = [];

      // عجز: مدين مصروف، دائن مخزون
      if (totalLoss > 0 && lossAccount) {
        lines.push({ account_id: lossAccount.id, debit: totalLoss, credit: 0, description: "عجز مخزون - تسوية جرد" });
        lines.push({ account_id: invAccount.id, debit: 0, credit: totalLoss, description: "تخفيض مخزون - عجز جرد" });
      }

      // فائض: مدين مخزون، دائن إيراد
      if (totalGain > 0 && gainAccount) {
        lines.push({ account_id: invAccount.id, debit: totalGain, credit: 0, description: "زيادة مخزون - فائض جرد" });
        lines.push({ account_id: gainAccount.id, debit: 0, credit: totalGain, description: "فائض مخزون - تسوية جرد" });
      }

      const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit, 0);

      let journalEntryId: string | null = null;
      if (lines.length > 0) {
        const { data: je, error: jeErr } = await (supabase.from("journal_entries" as any) as any)
          .insert({
            entry_date: adjustmentDate,
            description: `تسوية مخزون - جرد رقم ADJ-${adjustmentNumber}`,
            status: "posted",
            total_debit: totalDebit,
            total_credit: totalCredit,
            created_by: user?.id,
          }).select().single();
        if (jeErr) throw jeErr;
        journalEntryId = je.id;

        const jeLines = lines.map(l => ({ ...l, journal_entry_id: je.id }));
        const { error: linesErr } = await (supabase.from("journal_entry_lines" as any) as any).insert(jeLines);
        if (linesErr) throw linesErr;
      }

      // 2. تسجيل حركات المخزون وتحديث الكميات
      for (const item of items) {
        if (item.difference === 0) continue;

        // تسجيل حركة مخزون
        await (supabase.from("inventory_movements" as any) as any).insert({
          product_id: item.product_id,
          movement_type: "adjustment",
          quantity: Math.abs(item.difference),
          unit_cost: item.unit_cost,
          total_cost: item.total_cost,
          movement_date: adjustmentDate,
          notes: `تسوية جرد - ${item.difference > 0 ? "فائض" : "عجز"}: ${Math.abs(item.difference)} وحدة`,
          created_by: user?.id,
        });

        // تحديث كمية المنتج
        await supabase.from("products")
          .update({ quantity_on_hand: item.actual_quantity })
          .eq("id", item.product_id);
      }

      // 3. تحديث حالة التسوية
      await (supabase.from("inventory_adjustments" as any) as any)
        .update({ status: "approved", journal_entry_id: journalEntryId })
        .eq("id", id);

      setStatus("approved");
      setEditMode(false);
      toast({ title: "تم اعتماد التسوية وتسجيل القيود بنجاح" });
    } catch (e: any) {
      toast({ title: "خطأ في الاعتماد", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-center py-12">جاري التحميل...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/inventory-adjustments")}>
          <ArrowRight className="w-5 h-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">
            {isNew ? "تسوية جديدة" : `تسوية رقم ADJ-${adjustmentNumber}`}
          </h1>
        </div>
        {!isNew && (
          <Badge variant="secondary" className={status === "approved" ? "bg-green-100 text-green-800" : "bg-yellow-100 text-yellow-800"}>
            {status === "approved" ? "معتمد" : "مسودة"}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>بيانات التسوية</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>التاريخ</Label>
            <Input type="date" value={adjustmentDate} onChange={e => setAdjustmentDate(e.target.value)} disabled={!editMode} />
          </div>
          <div className="md:col-span-2">
            <Label>الوصف</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} disabled={!editMode} placeholder="وصف عملية الجرد..." />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>بنود التسوية</CardTitle>
          {editMode && (
            <Button size="sm" onClick={addItem}><Plus className="w-4 h-4 ml-1" />إضافة منتج</Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead className="min-w-[200px]">المنتج</TableHead>
                  <TableHead>الكمية بالنظام</TableHead>
                  <TableHead>الكمية الفعلية</TableHead>
                  <TableHead>الفرق</TableHead>
                  <TableHead>متوسط سعر الشراء</TableHead>
                  <TableHead>إجمالي الفرق</TableHead>
                  <TableHead>ملاحظات</TableHead>
                  {editMode && <TableHead className="w-10"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{idx + 1}</TableCell>
                    <TableCell>
                      {editMode ? (
                        <LookupCombobox
                          value={item.product_id}
                          onValueChange={(val) => handleProductSelect(idx, val)}
                          items={productsToLookupItems(products)}
                          placeholder="اختر المنتج"
                        />
                      ) : (
                        <span>{item.product_name}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="font-medium">{item.system_quantity.toLocaleString()}</span>
                    </TableCell>
                    <TableCell>
                      {editMode ? (
                        <Input
                          type="number"
                          min={0}
                          value={item.actual_quantity}
                          onChange={e => handleActualQtyChange(idx, Number(e.target.value))}
                          className="w-24"
                        />
                      ) : (
                        <span>{item.actual_quantity.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className={`font-bold ${item.difference > 0 ? "text-green-700" : item.difference < 0 ? "text-red-700" : ""}`}>
                        {item.difference > 0 ? "+" : ""}{item.difference.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>{formatCurrency(item.unit_cost)}</TableCell>
                    <TableCell>{formatCurrency(item.total_cost)}</TableCell>
                    <TableCell>
                      {editMode ? (
                        <Input value={item.notes} onChange={e => {
                          const u = [...items]; u[idx].notes = e.target.value; setItems(u);
                        }} className="w-32" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{item.notes || "-"}</span>
                      )}
                    </TableCell>
                    {editMode && (
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                          <X className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {items.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      أضف منتجات للجرد
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {items.length > 0 && (
            <div className="mt-4 flex gap-6 justify-end text-sm">
              {totalLoss > 0 && (
                <div className="text-red-700 font-bold">
                  إجمالي العجز: {formatCurrency(totalLoss)}
                </div>
              )}
              {totalGain > 0 && (
                <div className="text-green-700 font-bold">
                  إجمالي الفائض: {formatCurrency(totalGain)}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 justify-end">
        {editMode && (
          <>
            <Button onClick={handleSave} disabled={saving}>
              <Save className="w-4 h-4 ml-1" />{isNew ? "حفظ" : "تحديث"}
            </Button>
            {!isNew && status === "draft" && canEdit && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="default" className="bg-green-600 hover:bg-green-700" disabled={saving || items.length === 0}>
                    <CheckCircle className="w-4 h-4 ml-1" />اعتماد التسوية
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>اعتماد التسوية</AlertDialogTitle>
                    <AlertDialogDescription>
                      سيتم تسجيل القيود المحاسبية وتحديث كميات المخزون. لا يمكن التراجع عن هذه العملية.
                      {totalLoss > 0 && <div className="text-red-600 mt-2">عجز: {formatCurrency(totalLoss)}</div>}
                      {totalGain > 0 && <div className="text-green-600 mt-1">فائض: {formatCurrency(totalGain)}</div>}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>إلغاء</AlertDialogCancel>
                    <AlertDialogAction onClick={handleApprove}>اعتماد</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
        {!editMode && status === "draft" && canEdit && (
          <Button variant="outline" onClick={() => setEditMode(true)}>
            <Pencil className="w-4 h-4 ml-1" />تعديل
          </Button>
        )}
      </div>
    </div>
  );
}
