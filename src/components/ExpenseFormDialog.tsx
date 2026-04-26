import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { getNextPostedNumber } from "@/lib/posted-number-utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerInput } from "@/components/DatePickerInput";
import { LookupCombobox } from "@/components/LookupCombobox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormFieldError } from "@/components/FormFieldError";
import { toast } from "@/hooks/use-toast";
import { Save, CheckCircle, Loader2 } from "lucide-react";
import { ACCOUNT_CODES } from "@/lib/constants";

interface ExpenseType {
  id: string;
  name: string;
  account_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expenseId?: string | null;
  /** When reverting a posted expense back to draft, reuse same numbers on re-post */
  reusePostedNum?: number | null;
  onSuccess?: () => void;
}

export function ExpenseFormDialog({
  open,
  onOpenChange,
  expenseId,
  reusePostedNum,
  onSuccess,
}: Props) {
  const { settings, formatCurrency } = useSettings();
  const isEdit = !!expenseId;

  const [expenseTypes, setExpenseTypes] = useState<ExpenseType[]>([]);
  const [expenseTypeId, setExpenseTypeId] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [expenseDate, setExpenseDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Reset / load when dialog opens
  useEffect(() => {
    if (!open) return;
    setFieldErrors({});
    fetchExpenseTypes();
    if (expenseId) {
      loadExpense(expenseId);
    } else {
      setExpenseTypeId("");
      setAmount(0);
      setPaymentMethod("cash");
      setExpenseDate(new Date().toISOString().split("T")[0]);
      setDescription("");
    }
  }, [open, expenseId]);

  async function fetchExpenseTypes() {
    const { data } = await (supabase.from("expense_types") as any)
      .select("id, name, account_id")
      .eq("is_active", true)
      .order("name");
    setExpenseTypes(data || []);
  }

  async function loadExpense(id: string) {
    setLoading(true);
    const { data } = await (supabase.from("expenses") as any)
      .select("*")
      .eq("id", id)
      .single();
    if (data) {
      setExpenseTypeId(data.expense_type_id);
      setAmount(Number(data.amount) || 0);
      setPaymentMethod(data.payment_method);
      setExpenseDate(data.expense_date);
      setDescription(data.description || "");
    }
    setLoading(false);
  }

  function validate() {
    const errors: Record<string, string> = {};
    if (!expenseTypeId) errors.expenseType = "يرجى اختيار نوع المصروف";
    if (amount <= 0) errors.amount = "يرجى إدخال مبلغ صحيح";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast({
        title: "تنبيه",
        description: Object.values(errors)[0],
        variant: "destructive",
      });
      return false;
    }
    return true;
  }

  async function handleSaveDraft() {
    if (saving) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: any = {
        expense_type_id: expenseTypeId,
        amount,
        payment_method: paymentMethod,
        expense_date: expenseDate,
        description: description.trim() || null,
        status: "draft",
      };
      if (isEdit) {
        const { error } = await (supabase.from("expenses") as any)
          .update(payload)
          .eq("id", expenseId);
        if (error) throw error;
        toast({ title: "تم التحديث", description: "تم تحديث المسودة بنجاح" });
      } else {
        const { error } = await (supabase.from("expenses") as any).insert(
          payload,
        );
        if (error) throw error;
        toast({ title: "تم الحفظ", description: "تم حفظ المصروف كمسودة" });
      }
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  async function handleSaveAndPost() {
    if (saving) return;
    if (!validate()) return;
    if (
      settings?.locked_until_date &&
      expenseDate <= settings.locked_until_date
    ) {
      toast({
        title: "خطأ",
        description: `لا يمكن تسجيل مصروف بتاريخ ${expenseDate} — الفترة مقفلة حتى ${settings.locked_until_date}`,
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    try {
      const expType = expenseTypes.find((t) => t.id === expenseTypeId);
      if (!expType) throw new Error("نوع المصروف غير موجود");

      const accountCode =
        paymentMethod === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code")
        .in("code", [accountCode]);
      const cashBankAcc = accounts?.find((a) => a.code === accountCode);
      if (!cashBankAcc) throw new Error("تأكد من وجود حساب الصندوق/البنك");

      const expPostedNum =
        reusePostedNum ?? (await getNextPostedNumber("expenses" as any));
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const expPrefix = (settings as any)?.expense_prefix || "EXP-";
      const displayNum = `${expPrefix}${String(expPostedNum).padStart(4, "0")}`;
      const desc = `سند مصروف رقم ${displayNum} - ${expType.name}${description.trim() ? ` - ${description.trim()}` : ""}`;

      const { data: je, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          description: desc,
          entry_date: expenseDate,
          total_debit: amount,
          total_credit: amount,
          status: "posted",
          posted_number: jePostedNum,
        } as any)
        .select("id")
        .single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: je.id,
          account_id: expType.account_id,
          debit: amount,
          credit: 0,
          description: desc,
        },
        {
          journal_entry_id: je.id,
          account_id: cashBankAcc.id,
          debit: 0,
          credit: amount,
          description: desc,
        },
      ] as any);

      const expPayload: any = {
        expense_type_id: expenseTypeId,
        amount,
        payment_method: paymentMethod,
        expense_date: expenseDate,
        description: description.trim() || null,
        status: "posted",
        journal_entry_id: je.id,
        posted_number: expPostedNum,
      };

      if (isEdit) {
        const { error } = await (supabase.from("expenses") as any)
          .update(expPayload)
          .eq("id", expenseId);
        if (error) throw error;
      } else {
        const { error } = await (supabase.from("expenses") as any).insert(
          expPayload,
        );
        if (error) throw error;
      }

      toast({
        title: "تم الترحيل",
        description: `تم تسجيل المصروف ${displayNum} بنجاح`,
      });
      onOpenChange(false);
      onSuccess?.();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "تعديل مصروف" : "إضافة مصروف جديد"}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>
                  نوع المصروف <span className="text-red-500">*</span>
                </Label>
                <div className="mt-1">
                  <LookupCombobox
                    items={expenseTypes.map((t) => ({
                      id: t.id,
                      name: t.name,
                    }))}
                    value={expenseTypeId}
                    onValueChange={(v) => {
                      setExpenseTypeId(v);
                      setFieldErrors((e) => {
                        const { expenseType, ...rest } = e;
                        return rest;
                      });
                    }}
                    placeholder="اختر نوع المصروف..."
                    searchPlaceholder="ابحث..."
                    error={!!fieldErrors.expenseType}
                  />
                </div>
                <FormFieldError message={fieldErrors.expenseType} />
              </div>
              <div>
                <Label>
                  المبلغ <span className="text-red-500">*</span>
                </Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={amount || ""}
                  onChange={(e) => {
                    setAmount(parseFloat(e.target.value) || 0);
                    setFieldErrors((er) => {
                      const { amount, ...rest } = er;
                      return rest;
                    });
                  }}
                  className="mt-1"
                  placeholder="0.00"
                  error={!!fieldErrors.amount}
                />
                <FormFieldError message={fieldErrors.amount} />
              </div>
              <div>
                <Label>طريقة الدفع</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">نقدي</SelectItem>
                    <SelectItem value="bank">تحويل بنكي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>التاريخ</Label>
                <div className="mt-1">
                  <DatePickerInput
                    value={expenseDate}
                    onChange={setExpenseDate}
                  />
                </div>
              </div>
              <div className="sm:col-span-2">
                <Label>البيان</Label>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="وصف المصروف..."
                  className="mt-1 min-h-[70px]"
                />
              </div>
            </div>

            {amount > 0 && (
              <div className="rounded-lg bg-muted/50 p-3 space-y-1">
                <p className="text-xs text-muted-foreground">
                  ملخص القيد المحاسبي عند الترحيل:
                </p>
                <div className="flex justify-between text-sm">
                  <span>
                    مدين:{" "}
                    {expenseTypes.find((t) => t.id === expenseTypeId)?.name ||
                      "حساب المصروف"}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(amount)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>
                    دائن: {paymentMethod === "cash" ? "الصندوق" : "البنك"}
                  </span>
                  <span className="font-semibold">
                    {formatCurrency(amount)}
                  </span>
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 flex-wrap">
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                إلغاء
              </Button>
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 ml-2" />
                )}
                حفظ كمسودة
              </Button>
              <Button onClick={handleSaveAndPost} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 ml-2" />
                )}
                حفظ وترحيل
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default ExpenseFormDialog;
