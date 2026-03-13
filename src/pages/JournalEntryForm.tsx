import React, { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { AccountCombobox } from "@/components/AccountCombobox";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Save, CheckCircle, Trash2, Pencil, CalendarIcon, Plus, X, Ban } from "lucide-react";
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

        // Check if linked to operations
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
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isNew ? "قيد محاسبي جديد" : `قيد ${displayNumber}`}
          </h1>
          {!isNew && <Badge variant={statusColors[status] as any} className="mt-1">{statusLabels[status]}</Badge>}
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

      {/* Entry Info */}
      <Card>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>التاريخ</Label>
              {isEditable || isNew ? (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !entryDate && "text-muted-foreground")}>
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {entryDate || "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={entryDate ? new Date(entryDate + "T00:00:00") : undefined} onSelect={(date) => date && setEntryDate(format(date, "yyyy-MM-dd"))} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{entryDate}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>وصف القيد</Label>
              {isEditable || isNew ? (
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="مثال: تسجيل فاتورة مبيعات" />
              ) : (
                <p className="text-sm font-medium p-2 bg-muted/30 rounded">{description}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lines */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">بنود القيد</CardTitle>
            {(isEditable || isNew) && (
              <Button variant="outline" size="sm" onClick={addLine} className="gap-1">
                <Plus className="h-3 w-3" />سطر جديد
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="border rounded-lg overflow-hidden mx-4 mb-4">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="text-right min-w-[200px]">الحساب</TableHead>
                  <TableHead className="text-right">البيان</TableHead>
                  <TableHead className="text-right w-[120px]">مدين</TableHead>
                  <TableHead className="text-right w-[120px]">دائن</TableHead>
                  {(isEditable || isNew) && <TableHead className="w-[40px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={index}>
                    <TableCell className="p-2">
                      {isEditable || isNew ? (
                        <AccountCombobox accounts={accounts} value={line.account_id} onValueChange={v => updateLine(index, "account_id", v)} />
                      ) : (
                        <span className="font-medium">{accountMap.get(line.account_id) ? `${accountMap.get(line.account_id)!.code} - ${accountMap.get(line.account_id)!.name}` : line.account_id}</span>
                      )}
                    </TableCell>
                    <TableCell className="p-2">
                      {isEditable || isNew ? (
                        <Input className="h-9" value={line.description} onChange={e => updateLine(index, "description", e.target.value)} placeholder="بيان" />
                      ) : (
                        <span className="text-muted-foreground">{line.description || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="p-2">
                      {isEditable || isNew ? (
                        <Input className="h-9 font-mono" type="number" min="0" step="0.01" value={line.debit || ""} onChange={e => updateLine(index, "debit", parseFloat(e.target.value) || 0)} placeholder="0.00" />
                      ) : (
                        <span className="font-mono">{line.debit > 0 ? formatCurrency(line.debit) : "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="p-2">
                      {isEditable || isNew ? (
                        <Input className="h-9 font-mono" type="number" min="0" step="0.01" value={line.credit || ""} onChange={e => updateLine(index, "credit", parseFloat(e.target.value) || 0)} placeholder="0.00" />
                      ) : (
                        <span className="font-mono">{line.credit > 0 ? formatCurrency(line.credit) : "—"}</span>
                      )}
                    </TableCell>
                    {(isEditable || isNew) && (
                      <TableCell className="p-2">
                        {lines.length > 2 && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(index)}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                <TableRow className="bg-muted/20 font-bold">
                  <TableCell colSpan={2} className="text-left p-2">الإجمالي</TableCell>
                  <TableCell className={`p-2 font-mono ${isBalanced ? "text-green-600" : "text-destructive"}`}>{formatCurrency(totalDebit)}</TableCell>
                  <TableCell className={`p-2 font-mono ${isBalanced ? "text-green-600" : "text-destructive"}`}>{formatCurrency(totalCredit)}</TableCell>
                  {(isEditable || isNew) && <TableCell></TableCell>}
                </TableRow>
              </TableBody>
            </Table>
          </div>

          {!isBalanced && totalDebit > 0 && (
            <p className="text-sm text-destructive flex items-center gap-1 px-4 pb-4">
              ⚠️ القيد غير متوازن - الفرق: {formatCurrency(Math.abs(totalDebit - totalCredit))}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
