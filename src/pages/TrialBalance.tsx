import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Scale, Download, CalendarIcon, X, AlertTriangle, CheckCircle } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface TrialBalanceRow {
  account: Account;
  totalDebit: number;
  totalCredit: number;
  balanceDebit: number;
  balanceCredit: number;
}

export default function TrialBalance() {
  const { settings, currency } = useSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code"),
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entry_id, journal_entries!inner(entry_date, status)").eq("journal_entries.status", "posted"),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);
    if (linesRes.data) setLines(linesRes.data);
    if (accountsRes.error || linesRes.error) {
      toast({ title: "خطأ", description: "فشل في جلب البيانات", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const trialBalanceData = useMemo(() => {
    const filteredLines = lines.filter((l: any) => {
      const entryDate = (l.journal_entries as any)?.entry_date;
      if (!entryDate) return false;
      if (dateFrom && entryDate < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && entryDate > format(dateTo, "yyyy-MM-dd")) return false;
      return true;
    });

    const accountTotals = new Map<string, { totalDebit: number; totalCredit: number }>();
    filteredLines.forEach((l: any) => {
      const existing = accountTotals.get(l.account_id) || { totalDebit: 0, totalCredit: 0 };
      existing.totalDebit += Number(l.debit) || 0;
      existing.totalCredit += Number(l.credit) || 0;
      accountTotals.set(l.account_id, existing);
    });

    const rows: TrialBalanceRow[] = [];
    accounts.forEach((acc) => {
      const totals = accountTotals.get(acc.id);
      if (!totals) return;
      const net = totals.totalDebit - totals.totalCredit;
      rows.push({
        account: acc,
        totalDebit: totals.totalDebit,
        totalCredit: totals.totalCredit,
        balanceDebit: net > 0 ? net : 0,
        balanceCredit: net < 0 ? Math.abs(net) : 0,
      });
    });

    return rows;
  }, [accounts, lines, dateFrom, dateTo]);

  const grandTotalDebit = trialBalanceData.reduce((s, r) => s + r.totalDebit, 0);
  const grandTotalCredit = trialBalanceData.reduce((s, r) => s + r.totalCredit, 0);
  const grandBalanceDebit = trialBalanceData.reduce((s, r) => s + r.balanceDebit, 0);
  const grandBalanceCredit = trialBalanceData.reduce((s, r) => s + r.balanceCredit, 0);
  const isBalanced = Math.abs(grandBalanceDebit - grandBalanceCredit) < 0.01;

  const formatNum = (val: number) => Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCurrency = (val: number) => `${formatNum(val)} ${currency}`;

  const getAccountTypeLabel = (type: string) => {
    const map: Record<string, string> = {
      assets: "أصول", liabilities: "خصوم", equity: "حقوق ملكية", revenue: "إيرادات", expenses: "مصروفات",
    };
    return map[type] || type;
  };

  const handleExportPDF = async () => {
    const { exportReportPdf } = await import("@/lib/pdf-arabic");
    const tableData = trialBalanceData.map((r) => [
      r.account.code, r.account.name, getAccountTypeLabel(r.account.account_type),
      formatNum(r.totalDebit), formatNum(r.totalCredit), formatNum(r.balanceDebit), formatNum(r.balanceCredit),
    ]);
    tableData.push(["", "", "الإجمالي", formatNum(grandTotalDebit), formatNum(grandTotalCredit), formatNum(grandBalanceDebit), formatNum(grandBalanceCredit)]);
    await exportReportPdf({
      title: "ميزان المراجعة",
      settings,
      headers: ["الكود", "الحساب", "النوع", "إجمالي مدين", "إجمالي دائن", "رصيد مدين", "رصيد دائن"],
      rows: tableData,
      orientation: "landscape",
      filename: "Trial_Balance",
    });
    toast({ title: "تم التصدير", description: "تم تصدير ميزان المراجعة بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const handleExportExcel = async () => {
    const { exportToExcel } = await import("@/lib/excel-export");
    const data = trialBalanceData.map((r) => ({
      "Code": r.account.code,
      "Account": r.account.name,
      "Type": r.account.account_type,
      "Total Debit (EGP)": r.totalDebit,
      "Total Credit (EGP)": r.totalCredit,
      "Balance Debit (EGP)": r.balanceDebit,
      "Balance Credit (EGP)": r.balanceCredit,
    }));
    data.push({
      "Code": "",
      "Account": "",
      "Type": "Total",
      "Total Debit (EGP)": grandTotalDebit,
      "Total Credit (EGP)": grandTotalCredit,
      "Balance Debit (EGP)": grandBalanceDebit,
      "Balance Credit (EGP)": grandBalanceCredit,
    });
    await exportToExcel(data, "Trial Balance", "Trial_Balance.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير ميزان المراجعة بصيغة Excel" });
    setExportMenuOpen(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Scale className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">ميزان المراجعة</h1>
            <p className="text-sm text-muted-foreground">Trial Balance - أرصدة الحسابات</p>
          </div>
        </div>
        <div className="relative">
          <Button variant="outline" className="gap-2" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
            <Download className="h-4 w-4" />
            تصدير
          </Button>
          {exportMenuOpen && (
            <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[140px]">
              <button onClick={handleExportPDF} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">PDF تصدير</button>
              <button onClick={handleExportExcel} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">Excel تصدير</button>
            </div>
          )}
        </div>
      </div>

      {/* Balance Status + Date Filter */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {/* Balance indicator */}
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              isBalanced ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
            )}>
              {isBalanced ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {isBalanced ? "الميزان متوازن ✓" : `الميزان غير متوازن - الفرق: ${formatCurrency(Math.abs(grandBalanceDebit - grandBalanceCredit))}`}
            </div>

            {/* Date filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">الفترة:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "من تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              <span className="text-sm text-muted-foreground">إلى</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[150px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "yyyy-MM-dd") : "إلى تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {(dateFrom || dateTo) && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي المدين</p>
            <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(grandTotalDebit)}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">إجمالي الدائن</p>
            <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(grandTotalCredit)}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">رصيد مدين</p>
            <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(grandBalanceDebit)}</p>
          </CardContent>
        </Card>
        <Card className="border">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">رصيد دائن</p>
            <p className="text-lg font-bold font-mono text-foreground">{formatCurrency(grandBalanceCredit)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Trial Balance Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <Scale className="h-4 w-4" />
            جدول ميزان المراجعة
            <Badge variant="secondary" className="mr-2">{trialBalanceData.length} حساب</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
          ) : trialBalanceData.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <Scale className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد حركات مالية معتمدة</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-right">كود الحساب</TableHead>
                  <TableHead className="text-right">اسم الحساب</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">إجمالي مدين</TableHead>
                  <TableHead className="text-right">إجمالي دائن</TableHead>
                  <TableHead className="text-right">رصيد مدين</TableHead>
                  <TableHead className="text-right">رصيد دائن</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trialBalanceData.map((row) => (
                  <TableRow key={row.account.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono font-medium">{row.account.code}</TableCell>
                    <TableCell className="font-medium">{row.account.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{getAccountTypeLabel(row.account.account_type)}</Badge>
                    </TableCell>
                    <TableCell className="font-mono">{formatCurrency(row.totalDebit)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(row.totalCredit)}</TableCell>
                    <TableCell className="font-mono">{row.balanceDebit > 0 ? formatCurrency(row.balanceDebit) : "—"}</TableCell>
                    <TableCell className="font-mono">{row.balanceCredit > 0 ? formatCurrency(row.balanceCredit) : "—"}</TableCell>
                  </TableRow>
                ))}
                {/* Totals Row */}
                <TableRow className="bg-muted/40 font-bold border-t-2">
                  <TableCell colSpan={3} className="text-left">الإجمالي</TableCell>
                  <TableCell className="font-mono">{formatCurrency(grandTotalDebit)}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(grandTotalCredit)}</TableCell>
                  <TableCell className={cn("font-mono", isBalanced ? "text-green-600" : "text-destructive")}>{formatCurrency(grandBalanceDebit)}</TableCell>
                  <TableCell className={cn("font-mono", isBalanced ? "text-green-600" : "text-destructive")}>{formatCurrency(grandBalanceCredit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
