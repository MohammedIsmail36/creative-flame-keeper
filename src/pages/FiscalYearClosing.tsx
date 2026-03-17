import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2, Lock, TrendingUp, TrendingDown, DollarSign, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
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

const RETAINED_EARNINGS_CODE = "3102";

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  account_type: string;
  balance: number;
}

export default function FiscalYearClosing() {
  const { settings, currency, formatCurrency } = useSettings();
  const { user } = useAuth();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [existingClosing, setExistingClosing] = useState<any>(null);

  // Calculate fiscal year dates
  const fiscalYear = useMemo(() => {
    const startMonth = settings?.fiscal_year_start || "01-01";
    const [mm, dd] = startMonth.split("-").map(Number);
    const now = new Date();
    let startYear = now.getFullYear();
    const fiscalStartThisYear = new Date(startYear, mm - 1, dd);
    if (now < fiscalStartThisYear) startYear--;
    const start = new Date(startYear, mm - 1, dd);
    const end = new Date(startYear + 1, mm - 1, dd - 1);
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
      label: `${startYear}/${startYear + 1}`,
      year: startYear,
    };
  }, [settings]);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, linesRes, closingRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code"),
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entries!inner(entry_date, status)").in("journal_entries.status", ["posted", "approved"]),
      supabase.from("journal_entries").select("id, entry_date, description, status").like("description", `%قيد إقفال السنة المالية ${fiscalYear.year}%`).in("status", ["posted", "approved"]).limit(1),
    ]);
    if (accountsRes.data) setAccounts(accountsRes.data);
    if (linesRes.data) setLines(linesRes.data);
    if (closingRes.data && closingRes.data.length > 0) setExistingClosing(closingRes.data[0]);
    setLoading(false);
  };

  const { revenueAccounts, expenseAccounts, totalRevenue, totalExpenses, netIncome, retainedEarningsAccount } = useMemo(() => {
    const filtered = lines.filter((l: any) => {
      const d = (l.journal_entries as any)?.entry_date;
      if (!d) return false;
      return d >= fiscalYear.startDate && d <= fiscalYear.endDate;
    });

    const totals = new Map<string, number>();
    filtered.forEach((l: any) => {
      const existing = totals.get(l.account_id) || 0;
      const acc = accounts.find((a) => a.id === l.account_id);
      if (!acc) return;
      if (acc.account_type === "expense") {
        totals.set(l.account_id, existing + (Number(l.debit) - Number(l.credit)));
      } else {
        totals.set(l.account_id, existing + (Number(l.credit) - Number(l.debit)));
      }
    });

    const revenueAccounts: AccountBalance[] = [];
    const expenseAccounts: AccountBalance[] = [];
    let retainedEarningsAccount: any = null;

    accounts.forEach((acc) => {
      if (acc.code === RETAINED_EARNINGS_CODE) retainedEarningsAccount = acc;
      const balance = totals.get(acc.id) || 0;
      if (balance === 0) return;
      if (acc.account_type === "revenue") revenueAccounts.push({ ...acc, balance });
      else if (acc.account_type === "expense") expenseAccounts.push({ ...acc, balance });
    });

    const totalRevenue = revenueAccounts.reduce((s, a) => s + a.balance, 0);
    const totalExpenses = expenseAccounts.reduce((s, a) => s + a.balance, 0);
    const netIncome = totalRevenue - totalExpenses;

    return { revenueAccounts, expenseAccounts, totalRevenue, totalExpenses, netIncome, retainedEarningsAccount };
  }, [accounts, lines, fiscalYear]);

  const executeClosing = async () => {
    if (!retainedEarningsAccount) {
      toast.error("حساب الأرباح المحتجزة (3102) غير موجود في شجرة الحسابات");
      return;
    }
    if (revenueAccounts.length === 0 && expenseAccounts.length === 0) {
      toast.error("لا توجد أرصدة لإقفالها في هذه الفترة");
      return;
    }

    setExecuting(true);
    try {
      // 1. Create journal entry
      const description = `قيد إقفال السنة المالية ${fiscalYear.year} - ترحيل صافي ${netIncome >= 0 ? "الربح" : "الخسارة"} إلى الأرباح المحتجزة`;
      const totalDebit = revenueAccounts.reduce((s, a) => s + a.balance, 0) + (netIncome < 0 ? Math.abs(netIncome) : 0);
      const totalCredit = expenseAccounts.reduce((s, a) => s + a.balance, 0) + (netIncome >= 0 ? netIncome : 0);

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          description,
          entry_date: fiscalYear.endDate,
          status: "posted",
          total_debit: totalDebit,
          total_credit: totalCredit,
          created_by: user?.id || null,
        })
        .select("id, entry_number")
        .single();

      if (entryError) throw entryError;

      // 2. Build journal lines
      const journalLines: any[] = [];

      // Debit revenue accounts (to zero them out)
      revenueAccounts.forEach((acc) => {
        journalLines.push({
          journal_entry_id: entry.id,
          account_id: acc.id,
          debit: acc.balance,
          credit: 0,
          description: `إقفال حساب إيرادات: ${acc.name}`,
        });
      });

      // Credit expense accounts (to zero them out)
      expenseAccounts.forEach((acc) => {
        journalLines.push({
          journal_entry_id: entry.id,
          account_id: acc.id,
          debit: 0,
          credit: acc.balance,
          description: `إقفال حساب مصروفات: ${acc.name}`,
        });
      });

      // Net income/loss to retained earnings
      if (netIncome >= 0) {
        journalLines.push({
          journal_entry_id: entry.id,
          account_id: retainedEarningsAccount.id,
          debit: 0,
          credit: netIncome,
          description: `ترحيل صافي ربح السنة المالية ${fiscalYear.year}`,
        });
      } else {
        journalLines.push({
          journal_entry_id: entry.id,
          account_id: retainedEarningsAccount.id,
          debit: Math.abs(netIncome),
          credit: 0,
          description: `ترحيل صافي خسارة السنة المالية ${fiscalYear.year}`,
        });
      }

      const { error: linesError } = await supabase.from("journal_entry_lines").insert(journalLines);
      if (linesError) throw linesError;

      // Assign posted_number
      const { data: maxPosted } = await supabase.from("journal_entries").select("posted_number").not("posted_number", "is", null).order("posted_number", { ascending: false }).limit(1);
      const nextPosted = (maxPosted && maxPosted.length > 0 ? (maxPosted[0].posted_number || 0) : 0) + 1;
      await supabase.from("journal_entries").update({ posted_number: nextPosted }).eq("id", entry.id);

      toast.success(`تم إقفال السنة المالية ${fiscalYear.label} بنجاح - قيد رقم ${entry.entry_number}`);
      setExistingClosing({ id: entry.id, description });
      fetchData();
    } catch (err: any) {
      toast.error("خطأ في تنفيذ الإقفال: " + err.message);
      console.error(err);
    }
    setExecuting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-primary/10">
          <Lock className="h-7 w-7 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-foreground">إقفال السنة المالية</h1>
          <p className="text-muted-foreground mt-1">السنة المالية: {fiscalYear.label} ({fiscalYear.startDate} إلى {fiscalYear.endDate})</p>
        </div>
      </div>

      {/* Warning if already closed */}
      {existingClosing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-bold text-amber-700">تم إقفال هذه السنة المالية مسبقاً</p>
            <p className="text-sm text-amber-600 mt-1">{existingClosing.description}</p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div className="bg-card p-6 rounded-xl shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
            <span className="text-sm text-muted-foreground">إجمالي الإيرادات</span>
          </div>
          <p className="text-2xl font-black text-foreground font-mono">{formatCurrency(totalRevenue)}</p>
        </div>
        <div className="bg-card p-6 rounded-xl shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 rounded-lg bg-red-500/10"><TrendingDown className="h-5 w-5 text-red-600" /></div>
            <span className="text-sm text-muted-foreground">إجمالي المصروفات</span>
          </div>
          <p className="text-2xl font-black text-foreground font-mono">{formatCurrency(totalExpenses)}</p>
        </div>
        <div className="bg-card p-6 rounded-xl shadow-sm border">
          <div className="flex items-center gap-2 mb-3">
            <div className={cn("p-2 rounded-lg", netIncome >= 0 ? "bg-emerald-500/10" : "bg-destructive/10")}>
              <DollarSign className={cn("h-5 w-5", netIncome >= 0 ? "text-emerald-600" : "text-destructive")} />
            </div>
            <span className="text-sm text-muted-foreground">{netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}</span>
          </div>
          <p className={cn("text-2xl font-black font-mono", netIncome >= 0 ? "text-emerald-600" : "text-destructive")}>
            {formatCurrency(netIncome)}
          </p>
        </div>
      </div>

      {/* Details Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Accounts */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-emerald-500/5 px-6 py-4 border-b">
            <h4 className="font-bold text-foreground">حسابات الإيرادات ({revenueAccounts.length})</h4>
          </div>
          <div className="p-6 space-y-3">
            {revenueAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد إيرادات في هذه الفترة</p>
            ) : (
              revenueAccounts.map((acc) => (
                <div key={acc.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{acc.code} - {acc.name}</span>
                  <span className="font-mono font-medium text-foreground">{formatCurrency(acc.balance)}</span>
                </div>
              ))
            )}
            <div className="pt-3 mt-3 border-t flex justify-between font-bold">
              <span>الإجمالي</span>
              <span className="font-mono">{formatCurrency(totalRevenue)}</span>
            </div>
          </div>
        </div>

        {/* Expense Accounts */}
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="bg-red-500/5 px-6 py-4 border-b">
            <h4 className="font-bold text-foreground">حسابات المصروفات ({expenseAccounts.length})</h4>
          </div>
          <div className="p-6 space-y-3">
            {expenseAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد مصروفات في هذه الفترة</p>
            ) : (
              expenseAccounts.map((acc) => (
                <div key={acc.id} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{acc.code} - {acc.name}</span>
                  <span className="font-mono font-medium text-foreground">{formatCurrency(acc.balance)}</span>
                </div>
              ))
            )}
            <div className="pt-3 mt-3 border-t flex justify-between font-bold">
              <span>الإجمالي</span>
              <span className="font-mono">{formatCurrency(totalExpenses)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Closing Entry Preview */}
      <div className="bg-card rounded-xl border shadow-sm p-6">
        <h4 className="font-bold text-foreground mb-4">ملخص قيد الإقفال</h4>
        <div className="text-sm space-y-2">
          <p className="text-muted-foreground">سيتم إنشاء قيد يومية بتاريخ <span className="font-bold text-foreground">{fiscalYear.endDate}</span> يتضمن:</p>
          <ul className="list-disc list-inside space-y-1 text-muted-foreground mr-4">
            <li><span className="font-medium text-foreground">{revenueAccounts.length}</span> سطر مدين لتصفير حسابات الإيرادات</li>
            <li><span className="font-medium text-foreground">{expenseAccounts.length}</span> سطر دائن لتصفير حسابات المصروفات</li>
            <li>سطر واحد لحساب الأرباح المحتجزة (3102): <span className={cn("font-bold", netIncome >= 0 ? "text-emerald-600" : "text-destructive")}>{netIncome >= 0 ? "دائن" : "مدين"} بمبلغ {formatCurrency(netIncome)}</span></li>
          </ul>
        </div>
      </div>

      {/* Execute Button */}
      <div className="flex justify-center">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="lg"
              className="gap-2 px-8 shadow-lg shadow-primary/20"
              disabled={executing || !!existingClosing || !retainedEarningsAccount || (revenueAccounts.length === 0 && expenseAccounts.length === 0)}
            >
              {executing ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              تنفيذ إقفال السنة المالية {fiscalYear.label}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد إقفال السنة المالية</AlertDialogTitle>
              <AlertDialogDescription>
                سيتم إنشاء قيد إقفال تلقائي لتصفير حسابات الإيرادات والمصروفات وترحيل صافي {netIncome >= 0 ? "الربح" : "الخسارة"} ({formatCurrency(netIncome)}) إلى حساب الأرباح المحتجزة (3102).
                <br /><br />
                <strong>هذا الإجراء لا يمكن التراجع عنه بسهولة.</strong> هل أنت متأكد؟
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row-reverse gap-2">
              <AlertDialogAction onClick={executeClosing} className="bg-primary">تأكيد الإقفال</AlertDialogAction>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
