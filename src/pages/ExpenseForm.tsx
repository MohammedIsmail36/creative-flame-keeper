import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { getNextPostedNumber } from "@/lib/posted-number-utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/DatePickerInput";
import { LookupCombobox } from "@/components/LookupCombobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Save, CheckCircle, ArrowRight, Receipt } from "lucide-react";

const ACCOUNT_CODES = { CASH: "1101", BANK: "1102" };

interface ExpenseType { id: string; name: string; account_id: string; }

export default function ExpenseForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { settings, formatCurrency } = useSettings();
  const isEdit = !!id;

  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [expenseTypeId, setExpenseTypeId] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchExpenseTypes();
    if (isEdit) fetchExpense();
  }, [id]);

  async function fetchExpenseTypes() {
    const { data } = await (supabase.from("expense_types" as any) as any)
      .select("id, name, account_id")
      .eq("is_active", true)
      .order("name");
    setExpenseTypes(data || []);
  }

  async function fetchExpense() {
    setLoading(true);
    const { data } = await (supabase.from("expenses" as any) as any)
      .select("*")
      .eq("id", id)
      .single();
    if (data) {
      setExpenseTypeId(data.expense_type_id);
      setAmount(data.amount);
      setPaymentMethod(data.payment_method);
      setExpenseDate(data.expense_date);
      setDescription(data.description || "");
    }
    setLoading(false);
  }

  function validate() {
    if (!expenseTypeId) {
      toast({ title: "تنبيه", description: "يرجى اختيار نوع المصروف", variant: "destructive" });
      return false;
    }
    if (amount <= 0) {
      toast({ title: "تنبيه", description: "يرجى إدخال مبلغ صحيح", variant: "destructive" });
      return false;
    }
    return true;
  }

  async function handleSaveDraft() {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        expense_type_id: expenseTypeId, amount, payment_method: paymentMethod,
        expense_date: expenseDate, description: description.trim() || null, status: "draft",
      };
      if (isEdit) {
        const { error } = await (supabase.from("expenses" as any) as any).update(payload).eq("id", id);
        if (error) throw error;
        toast({ title: "تم التحديث", description: "تم تحديث المسودة بنجاح" });
      } else {
        const { error } = await (supabase.from("expenses" as any) as any).insert(payload);
        if (error) throw error;
        toast({ title: "تم الحفظ", description: "تم حفظ المصروف كمسودة" });
      }
      navigate("/expenses");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleSaveAndPost() {
    if (!validate()) return;
    setSaving(true);
    try {
      const expType = expenseTypes.find(t => t.id === expenseTypeId);
      if (!expType) throw new Error("نوع المصروف غير موجود");

      const accountCode = paymentMethod === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [accountCode]);
      const cashBankAcc = accounts?.find(a => a.code === accountCode);
      if (!cashBankAcc) throw new Error("تأكد من وجود حساب الصندوق/البنك");

      const expPostedNum = await getNextPostedNumber("expenses" as any);
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const prefix = (settings as any)?.expense_prefix || "EXP-";
      const displayNum = `${prefix}${String(expPostedNum).padStart(4, "0")}`;
      const desc = `مصروف ${expType.name} - ${displayNum}${description.trim() ? ` - ${description.trim()}` : ""}`;

      // Create journal entry
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: desc, entry_date: expenseDate,
        total_debit: amount, total_credit: amount,
        status: "posted", posted_number: jePostedNum,
      } as any).select("id").single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: expType.account_id, debit: amount, credit: 0, description: desc },
        { journal_entry_id: je.id, account_id: cashBankAcc.id, debit: 0, credit: amount, description: desc },
      ] as any);

      const expPayload = {
        expense_type_id: expenseTypeId, amount, payment_method: paymentMethod,
        expense_date: expenseDate, description: description.trim() || null,
        status: "posted", journal_entry_id: je.id, posted_number: expPostedNum,
      };

      if (isEdit) {
        const { error } = await (supabase.from("expenses" as any) as any).update(expPayload).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("expenses" as any) as any).insert(expPayload);
        if (error) throw error;
      }

      toast({ title: "تم الترحيل", description: `تم تسجيل المصروف ${displayNum} بنجاح` });
      navigate("/expenses");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  const typeOptions = expenseTypes.map(t => ({ value: t.id, label: t.name }));

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">جاري التحميل...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/expenses")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">{isEdit ? "تعديل مصروف" : "مصروف جديد"}</h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">بيانات المصروف</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label>نوع المصروف *</Label>
              <div className="mt-1">
                <LookupCombobox
                  items={expenseTypes.map(t => ({ id: t.id, name: t.name }))}
                  value={expenseTypeId}
                  onValueChange={setExpenseTypeId}
                  placeholder="اختر نوع المصروف..."
                  searchPlaceholder="ابحث..."
                />
              </div>
            </div>
            <div>
              <Label>المبلغ *</Label>
              <Input
                type="number" min={0} step="0.01"
                value={amount || ""} onChange={e => setAmount(parseFloat(e.target.value) || 0)}
                className="mt-1" placeholder="0.00"
              />
            </div>
            <div>
              <Label>طريقة الدفع</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">نقدي</SelectItem>
                  <SelectItem value="bank">تحويل بنكي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>التاريخ</Label>
              <div className="mt-1">
                <DatePickerInput value={expenseDate} onChange={setExpenseDate} />
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>البيان</Label>
              <Textarea
                value={description} onChange={e => setDescription(e.target.value)}
                placeholder="وصف المصروف..."
                className="mt-1 min-h-[80px]"
              />
            </div>
          </div>

          {/* Summary */}
          {amount > 0 && (
            <div className="rounded-lg bg-muted/50 p-4 space-y-1">
              <p className="text-sm text-muted-foreground">ملخص القيد المحاسبي عند الترحيل:</p>
              <div className="flex justify-between text-sm">
                <span>مدين: {expenseTypes.find(t => t.id === expenseTypeId)?.name || "حساب المصروف"}</span>
                <span className="font-semibold">{formatCurrency(amount)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span>دائن: {paymentMethod === "cash" ? "الصندوق" : "البنك"}</span>
                <span className="font-semibold">{formatCurrency(amount)}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => navigate("/expenses")}>إلغاء</Button>
            <Button variant="secondary" onClick={handleSaveDraft} disabled={saving}>
              <Save className="h-4 w-4 ml-2" /> حفظ كمسودة
            </Button>
            <Button onClick={handleSaveAndPost} disabled={saving}>
              <CheckCircle className="h-4 w-4 ml-2" /> حفظ وترحيل
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
