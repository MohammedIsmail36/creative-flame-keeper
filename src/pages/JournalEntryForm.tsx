import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AccountCombobox } from "@/components/AccountCombobox";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Save, CheckCircle, Trash2, Pencil, CalendarIcon, Plus, X, Ban, BookOpen, Check } from "lucide-react";
import { getNextPostedNumber, formatDisplayNumber } from "@/lib/posted-number-utils";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface JournalEntryLine {
  id?: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
}

export default function JournalEntryForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { role, user } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const isNew = !id;
  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const [entryNumber, setEntryNumber] = useState<number | null>(null);
  const [postedNumber, setPostedNumber] = useState<number | null>(null);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split("T")[0]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("draft");
  const [editMode, setEditMode] = useState(true);
  const [isLinked, setIsLinked] = useState(false);

  const [lines, setLines] = useState<JournalEntryLine[]>([
    { account_id: "", debit: 0, credit: 0, description: "" },
    { account_id: "", debit: 0, credit: 0, description: "" },
  ]);

  useEffect(() => { loadData(); }, [id]);

  async function loadData() {
    const { data: accs } = await supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code");
    setAccounts(accs || []);

    if (id) {
      const { data: entry } = await (supabase.from("journal_entries") as any).select("*").eq("id", id).single();
      if (entry) {
        setEntryNumber(entry.entry_number);
        setPostedNumber(entry.posted_number);
        setEntryDate(entry.entry_date);
        setDescription(entry.description);
        setStatus(entry.status);
        setEditMode(entry.status === "draft");

        const { data: entryLines } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", id).order("created_at");
        if (entryLines && entryLines.length > 0) {
          setLines(entryLines.map((l: any) => ({
            id: l.id, account_id: l.account_id, debit: Number(l.debit), credit: Number(l.credit), description: l.description || "",
          })));
        }

        const queries = [
          (supabase.from("sales_invoices") as any).select("id").eq("journal_entry_id", id).limit(1),
          (supabase.from("purchase_invoices") as any).select("id").eq("journal_entry_id", id).limit(1),
          (supabase.from("customer_payments") as any).select("id").eq("journal_entry_id", id).limit(1),
          (supabase.from("supplier_payments") as any).select("id").eq("journal_entry_id", id).limit(1),
          (supabase.from("sales_returns") as any).select("id").eq("journal_entry_id", id).limit(1),
          (supabase.from("purchase_returns") as any).select("id").eq("journal_entry_id", id).limit(1),
        ];
        const results = await Promise.all(queries);
        setIsLinked(results.some(r => r.data && r.data.length > 0));
      }
      setLoading(false);
    } else {
      setEditMode(true);
      setLoading(false);
    }
  }

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach(a => map.set(a.id, a));
    return map;
  }, [accounts]);

  const totalDebit = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const difference = Math.abs(totalDebit - totalCredit);
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

  function addLine() {
    setLines([...lines, { account_id: "", debit: 0, credit: 0, description: "" }]);
  }

  function removeLine(index: number) {
    if (lines.length <= 2) return;
    setLines(lines.filter((_, i) => i !== index));
  }

  function updateLine(index: number, field: keyof JournalEntryLine, value: any) {
    const updated = [...lines];
    (updated[index] as any)[field] = value;
    if (field === "debit" && Number(value) > 0) updated[index].credit = 0;
    else if (field === "credit" && Number(value) > 0) updated[index].debit = 0;
    setLines(updated);
  }

  async function handleSave(asPosted: boolean = false) {
    if (!description.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال وصف القيد", variant: "destructive" });
      return;
    }
    const validLines = lines.filter(l => l.account_id && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) {
      toast({ title: "تنبيه", description: "يجب إضافة سطرين على الأقل", variant: "destructive" });
      return;
    }
    if (!isBalanced) {
      toast({ title: "تنبيه", description: "القيد غير متوازن", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let newPostedNumber: number | null = null;
      if (asPosted) {
        newPostedNumber = await getNextPostedNumber("journal_entries");
      }

      const entryPayload: any = {
        entry_date: entryDate, description: description.trim(),
        status: asPosted ? "posted" : "draft",
        total_debit: totalDebit, total_credit: totalCredit,
        created_by: user?.id || null,
      };
      if (asPosted) {
        entryPayload.posted_number = newPostedNumber;
      }

      if (id) {
        const { error } = await (supabase.from("journal_entries") as any).update(entryPayload).eq("id", id);
        if (error) throw error;
        await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", id);
        const linesPayload = validLines.map(l => ({
          journal_entry_id: id, account_id: l.account_id, debit: l.debit, credit: l.credit, description: l.description || null,
        }));
        await supabase.from("journal_entry_lines").insert(linesPayload as any);
        toast({ title: "تم التحديث", description: "تم تعديل القيد بنجاح" });
        loadData();
      } else {
        const { data, error } = await (supabase.from("journal_entries") as any).insert(entryPayload).select("id").single();
        if (error) throw error;
        const linesPayload = validLines.map(l => ({
          journal_entry_id: data.id, account_id: l.account_id, debit: l.debit, credit: l.credit, description: l.description || null,
        }));
        await supabase.from("journal_entry_lines").insert(linesPayload as any);
        toast({ title: "تمت الإضافة", description: "تم إنشاء القيد بنجاح" });
        navigate(`/journal/${data.id}`);
      }
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message || "حدث خطأ", variant: "destructive" });
    }
    setSaving(false);
  }

  async function handlePost() {
    if (!id) return;
    setSaving(true);
    try {
      const newPostedNumber = await getNextPostedNumber("journal_entries");
      const { error } = await (supabase.from("journal_entries") as any).update({ status: "posted", posted_number: newPostedNumber }).eq("id", id);
      if (error) throw error;
      toast({ title: "تم الاعتماد", description: "تم اعتماد القيد بنجاح" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!id) return;
    try {
      await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", id);
      await (supabase.from("journal_entries") as any).delete().eq("id", id);
      toast({ title: "تم الحذف", description: "تم حذف القيد بنجاح" });
      navigate("/journal");
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleCancel() {
    if (!id) return;
    try {
      await (supabase.from("journal_entries") as any).update({ status: "cancelled" }).eq("id", id);
      toast({ title: "تم الإلغاء", description: "تم إلغاء القيد" });
      loadData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  const prefix = (settings as any)?.journal_entry_prefix || "JV-";
  const displayNumber = entryNumber
    ? formatDisplayNumber(prefix, postedNumber, entryNumber, status)
    : "جديد";

  const statusLabels: Record<string, string> = { draft: "مسودة", posted: "معتمد", cancelled: "ملغي" };
  const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

  if (loading) return <div className="text-center py-12 text-muted-foreground">جاري التحميل...</div>;

  const isDraft = status === "draft";
  const isEditable = editMode && isDraft && canEdit;

  return (
    <div className="space-y-8" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
            <BookOpen className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {isNew ? "إنشاء قيد محاسبي جديد" : `قيد ${displayNumber}`}
              </h1>
              {!isNew && (
                <Badge variant={statusColors[status] as any} className="text-xs">{statusLabels[status]}</Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1">
              {isNew ? "تسجيل المعاملات المالية يدوياً في دفتر الأستاذ العام." : `تفاصيل القيد المحاسبي ${displayNumber}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isNew && isDraft && canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2"><Trash2 className="h-4 w-4" />حذف</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف القيد المسودة</AlertDialogTitle>
                  <AlertDialogDescription>هل أنت متأكد من حذف هذا القيد؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && status === "posted" && canEdit && !isLinked && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="gap-2 border-destructive text-destructive hover:bg-destructive/10"><Ban className="h-4 w-4" />إلغاء القيد</Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>إلغاء القيد {displayNumber}</AlertDialogTitle>
                  <AlertDialogDescription>سيتم تغيير حالة القيد إلى "ملغي". هل تريد المتابعة؟</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>تراجع</AlertDialogCancel>
                  <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">تأكيد الإلغاء</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {!isNew && status === "posted" && isLinked && (
            <Button variant="ghost" className="gap-2 text-muted-foreground/40 cursor-not-allowed" disabled title="قيد آلي - لا يمكن إلغاؤه يدوياً">
              <Ban className="h-4 w-4" />إلغاء القيد
            </Button>
          )}
          {!isNew && isDraft && canEdit && !editMode && (
            <Button variant="outline" onClick={() => setEditMode(true)} className="gap-2">
              <Pencil className="h-4 w-4" />تعديل
            </Button>
          )}
          {!isNew && isDraft && canEdit && (
            <Button variant="default" onClick={handlePost} disabled={!isBalanced || saving} className="gap-2 bg-green-600 hover:bg-green-700">
              <CheckCircle className="h-4 w-4" />اعتماد
            </Button>
          )}
          {isEditable && (
            <Button onClick={() => handleSave(false)} disabled={saving || !isBalanced} className="gap-2">
              <Save className="h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
          )}
          {isNew && (
            <Button onClick={() => handleSave(true)} disabled={saving || !isBalanced} variant="outline" className="gap-2">
              <CheckCircle className="h-4 w-4" />{saving ? "جاري الحفظ..." : "حفظ واعتماد"}
            </Button>
          )}
        </div>
      </div>

      {/* Entry Details Card */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Entry Number (read-only) */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">رقم القيد</label>
            <Input
              readOnly
              value={displayNumber}
              className="bg-muted/50 border-none font-mono text-muted-foreground"
            />
          </div>
          {/* Date */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">تاريخ القيد</label>
            {isEditable || isNew ? (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-full justify-start text-right font-normal h-10 rounded-xl", !entryDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4 text-muted-foreground" />
                    {entryDate || "اختر التاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={entryDate ? new Date(entryDate + "T00:00:00") : undefined} onSelect={(date) => date && setEntryDate(format(date, "yyyy-MM-dd"))} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            ) : (
              <Input readOnly value={entryDate} className="bg-muted/30 border-none" />
            )}
          </div>
          {/* Description */}
          <div className="md:col-span-2 space-y-2">
            <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">الوصف العام للقيد</label>
            {isEditable || isNew ? (
              <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="أدخل تفاصيل عامة عن هذا القيد المحاسبي..." className="rounded-xl" />
            ) : (
              <Input readOnly value={description} className="bg-muted/30 border-none" />
            )}
          </div>
        </div>
      </div>

      {/* Journal Lines Table */}
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-muted/30 border-b border-border">
                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-12">#</th>
                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-1/4">اسم الحساب</th>
                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">البيان / الوصف</th>
                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-36 text-center">مدين (Debit)</th>
                <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-36 text-center">دائن (Credit)</th>
                {(isEditable || isNew) && <th className="px-6 py-4 text-[11px] font-bold text-muted-foreground uppercase tracking-wider w-16 text-center">إجراءات</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {lines.map((line, index) => (
                <tr key={index} className="group hover:bg-muted/20 transition-colors">
                  <td className="px-6 py-2 text-sm text-muted-foreground font-medium">{index + 1}</td>
                  <td className="px-6 py-2">
                    {isEditable || isNew ? (
                      <AccountCombobox accounts={accounts} value={line.account_id} onValueChange={v => updateLine(index, "account_id", v)} />
                    ) : (
                      <span className="font-medium text-sm">{accountMap.get(line.account_id) ? `${accountMap.get(line.account_id)!.code} - ${accountMap.get(line.account_id)!.name}` : line.account_id}</span>
                    )}
                  </td>
                  <td className="px-6 py-2">
                    {isEditable || isNew ? (
                      <Input className="h-10 rounded-xl" value={line.description} onChange={e => updateLine(index, "description", e.target.value)} placeholder="بيان السطر..." />
                    ) : (
                      <span className="text-sm text-muted-foreground">{line.description || "—"}</span>
                    )}
                  </td>
                  <td className="px-6 py-2">
                    {isEditable || isNew ? (
                      <Input
                        className="h-10 rounded-xl text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:bg-primary/5"
                        type="number" min="0" step="0.01"
                        value={line.debit || ""}
                        onChange={e => updateLine(index, "debit", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    ) : (
                      <span className="font-mono text-sm block text-center">{line.debit > 0 ? formatCurrency(line.debit) : "—"}</span>
                    )}
                  </td>
                  <td className="px-6 py-2">
                    {isEditable || isNew ? (
                      <Input
                        className="h-10 rounded-xl text-center font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:bg-primary/5"
                        type="number" min="0" step="0.01"
                        value={line.credit || ""}
                        onChange={e => updateLine(index, "credit", parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                      />
                    ) : (
                      <span className="font-mono text-sm block text-center">{line.credit > 0 ? formatCurrency(line.credit) : "—"}</span>
                    )}
                  </td>
                  {(isEditable || isNew) && (
                    <td className="px-6 py-2 text-center">
                      {lines.length > 2 && (
                        <button
                          onClick={() => removeLine(index)}
                          className="w-8 h-8 flex items-center justify-center text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 rounded-lg transition-all mx-auto"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Add line button */}
        {(isEditable || isNew) && (
          <div className="p-6 bg-muted/10 border-t border-border">
            <button
              onClick={addLine}
              className="inline-flex items-center gap-2 text-primary font-bold hover:bg-primary/5 px-6 py-2.5 rounded-xl transition-all border border-dashed border-primary/40"
            >
              <Plus className="h-5 w-5" />
              <span className="text-sm">إضافة سطر جديد</span>
            </button>
          </div>
        )}
      </div>

      {/* Totals & Balance Bar */}
      <div className="bg-card rounded-2xl border border-border shadow-sm p-8 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex flex-wrap items-center gap-12">
          <div className="space-y-1">
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">إجمالي المدين</p>
            <p className="text-2xl font-black text-foreground">{formatCurrency(totalDebit)}</p>
          </div>
          <div className="h-12 w-px bg-border hidden md:block" />
          <div className="space-y-1">
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">إجمالي الدائن</p>
            <p className="text-2xl font-black text-foreground">{formatCurrency(totalCredit)}</p>
          </div>
          <div className="h-12 w-px bg-border hidden md:block" />
          <div className="space-y-1">
            <p className="text-[10px] font-extrabold text-muted-foreground uppercase tracking-widest">الفرق (التوازن)</p>
            <p className={cn("text-2xl font-black", isBalanced ? "text-green-600" : "text-destructive")}>{formatCurrency(difference)}</p>
          </div>
        </div>
        {/* Balance Indicator */}
        {totalDebit > 0 && (
          isBalanced ? (
            <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 px-6 py-3 rounded-2xl border border-green-200 dark:border-green-800 ring-4 ring-green-50/30 dark:ring-green-950/20">
              <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
                <Check className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black uppercase tracking-tight">قيد متوازن</span>
                <span className="text-[11px] opacity-80">جاهز للترحيل للحسابات</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 px-6 py-3 rounded-2xl border border-red-200 dark:border-red-800 ring-4 ring-red-50/30 dark:ring-red-950/20">
              <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white">
                <X className="h-4 w-4" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-black uppercase tracking-tight">قيد غير متوازن</span>
                <span className="text-[11px] opacity-80">الفرق: {formatCurrency(difference)}</span>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
