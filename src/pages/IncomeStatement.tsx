import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Download, CalendarIcon, X, DollarSign, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface IncomeRow {
  account: Account;
  amount: number;
}

export default function IncomeStatement() {
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
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entries!inner(entry_date, status)").eq("journal_entries.status", "posted"),
    ]);
    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);
    if (linesRes.data) setLines(linesRes.data);
    if (accountsRes.error || linesRes.error) {
      toast({ title: "خطأ", description: "فشل في جلب البيانات", variant: "destructive" });
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const { revenueRows, expenseRows, totalRevenue, totalExpenses, netIncome } = useMemo(() => {
    const filtered = lines.filter((l: any) => {
      const d = (l.journal_entries as any)?.entry_date;
      if (!d) return false;
      if (dateFrom && d < format(dateFrom, "yyyy-MM-dd")) return false;
      if (dateTo && d > format(dateTo, "yyyy-MM-dd")) return false;
      return true;
    });

    const totals = new Map<string, number>();
    filtered.forEach((l: any) => {
      const existing = totals.get(l.account_id) || 0;
      // Revenue: credit - debit (credit normal), Expense: debit - credit (debit normal)
      const acc = accounts.find(a => a.id === l.account_id);
      if (!acc) return;
      if (acc.account_type === "revenue") {
        totals.set(l.account_id, existing + (Number(l.credit) - Number(l.debit)));
      } else if (acc.account_type === "expense") {
        totals.set(l.account_id, existing + (Number(l.debit) - Number(l.credit)));
      }
    });

    const revenueRows: IncomeRow[] = [];
    const expenseRows: IncomeRow[] = [];

    accounts.forEach((acc) => {
      const amount = totals.get(acc.id);
      if (amount === undefined || amount === 0) return;
      if (acc.account_type === "revenue") revenueRows.push({ account: acc, amount });
      else if (acc.account_type === "expense") expenseRows.push({ account: acc, amount });
    });

    const totalRevenue = revenueRows.reduce((s, r) => s + r.amount, 0);
    const totalExpenses = expenseRows.reduce((s, r) => s + r.amount, 0);

    return { revenueRows, expenseRows, totalRevenue, totalExpenses, netIncome: totalRevenue - totalExpenses };
  }, [accounts, lines, dateFrom, dateTo]);

  const formatNum = (val: number) => Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCurrency = (val: number) => `${formatNum(val)} ${currency}`;

  const handleExportPDF = async () => {
    const { createArabicPDF, addPdfHeader, addPdfFooter } = await import("@/lib/pdf-arabic");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = await createArabicPDF();
    let startY = addPdfHeader(doc, settings, "قائمة الدخل");
    if (dateFrom || dateTo) {
      doc.setFont("Amiri", "normal");
      doc.setFontSize(9);
      doc.text(`الفترة: ${dateFrom ? format(dateFrom, "yyyy-MM-dd") : "البداية"} إلى ${dateTo ? format(dateTo, "yyyy-MM-dd") : "النهاية"}`, 105, startY, { align: "center" });
      startY += 6;
    }

    // Revenue section
    const revenueData = revenueRows.map((r) => [r.account.code, r.account.name, formatNum(r.amount)]);
    revenueData.push(["", "إجمالي الإيرادات", formatNum(totalRevenue)]);

    autoTable(doc, {
      head: [["الكود", "حساب الإيرادات", `المبلغ (${currency})`]],
      body: revenueData,
      startY,
      styles: { fontSize: 9, cellPadding: 3, font: "Amiri", halign: "right" },
      headStyles: { fillColor: [34, 197, 94], textColor: 255 },
      didParseCell: (data: any) => {
        if (data.row.index === revenueData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [240, 253, 244];
        }
      },
    });

    const afterRevenue = (doc as any).lastAutoTable.finalY + 6;

    // Expenses section
    const expenseData = expenseRows.map((r) => [r.account.code, r.account.name, formatNum(r.amount)]);
    expenseData.push(["", "إجمالي المصروفات", formatNum(totalExpenses)]);

    autoTable(doc, {
      head: [["الكود", "حساب المصروفات", `المبلغ (${currency})`]],
      body: expenseData,
      startY: afterRevenue,
      styles: { fontSize: 9, cellPadding: 3, font: "Amiri", halign: "right" },
      headStyles: { fillColor: [239, 68, 68], textColor: 255 },
      didParseCell: (data: any) => {
        if (data.row.index === expenseData.length - 1) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [254, 242, 242];
        }
      },
    });

    const afterExpenses = (doc as any).lastAutoTable.finalY + 6;

    // Net Income
    autoTable(doc, {
      body: [[netIncome >= 0 ? "صافي الربح" : "صافي الخسارة", `${formatNum(netIncome)} ${currency}`]],
      startY: afterExpenses,
      styles: { fontSize: 11, cellPadding: 4, fontStyle: "bold", font: "Amiri" },
      bodyStyles: {
        fillColor: netIncome >= 0 ? [240, 253, 244] : [254, 242, 242],
        textColor: netIncome >= 0 ? [22, 163, 74] : [220, 38, 38],
      },
      columnStyles: { 1: { halign: "right" } },
    });

    addPdfFooter(doc, settings);
    doc.save("Income_Statement.pdf");
    toast({ title: "تم التصدير", description: "تم تصدير قائمة الدخل بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const handleExportExcel = async () => {
    const { exportToExcel } = await import("@/lib/excel-export");
    const data: any[] = [];
    data.push({ "Section": "Revenue", "Code": "", "Account": "", [`Amount (${currency})`]: "" });
    revenueRows.forEach((r) => data.push({ "Section": "", "Code": r.account.code, "Account": r.account.name, [`Amount (${currency})`]: r.amount }));
    data.push({ "Section": "", "Code": "", "Account": "Total Revenue", [`Amount (${currency})`]: totalRevenue });
    data.push({ "Section": "", "Code": "", "Account": "", [`Amount (${currency})`]: "" });
    data.push({ "Section": "Expenses", "Code": "", "Account": "", [`Amount (${currency})`]: "" });
    expenseRows.forEach((r) => data.push({ "Section": "", "Code": r.account.code, "Account": r.account.name, [`Amount (${currency})`]: r.amount }));
    data.push({ "Section": "", "Code": "", "Account": "Total Expenses", [`Amount (${currency})`]: totalExpenses });
    data.push({ "Section": "", "Code": "", "Account": "", [`Amount (${currency})`]: "" });
    data.push({ "Section": "", "Code": "", "Account": "Net Income", [`Amount (${currency})`]: netIncome });

    await exportToExcel(data, "Income Statement", "Income_Statement.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير قائمة الدخل بصيغة Excel" });
    setExportMenuOpen(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <DollarSign className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">قائمة الدخل</h1>
            <p className="text-sm text-muted-foreground">Income Statement - الإيرادات والمصروفات</p>
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

      {/* Date Filter */}
      <Card>
        <CardContent className="p-4">
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
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-green-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-green-600" />
              </div>
              <p className="text-xs text-muted-foreground">إجمالي الإيرادات</p>
            </div>
            <p className="text-2xl font-bold font-mono text-green-600">{formatCurrency(totalRevenue)}</p>
          </CardContent>
        </Card>
        <Card className="border border-red-500/20">
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className="h-9 w-9 rounded-lg bg-red-500/10 flex items-center justify-center">
                <ArrowDownRight className="h-5 w-5 text-red-600" />
              </div>
              <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
            </div>
            <p className="text-2xl font-bold font-mono text-red-600">{formatCurrency(totalExpenses)}</p>
          </CardContent>
        </Card>
        <Card className={cn("border", netIncome >= 0 ? "border-green-500/20" : "border-red-500/20")}>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-2">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center", netIncome >= 0 ? "bg-green-500/10" : "bg-red-500/10")}>
                {netIncome >= 0 ? <TrendingUp className="h-5 w-5 text-green-600" /> : <TrendingDown className="h-5 w-5 text-red-600" />}
              </div>
              <p className="text-xs text-muted-foreground">{netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}</p>
            </div>
            <p className={cn("text-2xl font-bold font-mono", netIncome >= 0 ? "text-green-600" : "text-red-600")}>{formatCurrency(netIncome)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Revenue Table */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-green-500/5 py-4">
              <CardTitle className="text-base flex items-center gap-2 text-green-700">
                <ArrowUpRight className="h-4 w-4" />
                الإيرادات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {revenueRows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">لا توجد إيرادات</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-right">الكود</TableHead>
                      <TableHead className="text-right">الحساب</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {revenueRows.map((row) => (
                      <TableRow key={row.account.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-sm">{row.account.code}</TableCell>
                        <TableCell className="font-medium">{row.account.name}</TableCell>
                        <TableCell className="font-mono text-green-600">{formatCurrency(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-green-500/5 font-bold border-t-2">
                      <TableCell colSpan={2} className="text-left">إجمالي الإيرادات</TableCell>
                      <TableCell className="font-mono text-green-700">{formatCurrency(totalRevenue)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Expenses Table */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b bg-red-500/5 py-4">
              <CardTitle className="text-base flex items-center gap-2 text-red-700">
                <ArrowDownRight className="h-4 w-4" />
                المصروفات
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {expenseRows.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">لا توجد مصروفات</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/20">
                      <TableHead className="text-right">الكود</TableHead>
                      <TableHead className="text-right">الحساب</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expenseRows.map((row) => (
                      <TableRow key={row.account.id} className="hover:bg-muted/30 transition-colors">
                        <TableCell className="font-mono text-sm">{row.account.code}</TableCell>
                        <TableCell className="font-medium">{row.account.name}</TableCell>
                        <TableCell className="font-mono text-red-600">{formatCurrency(row.amount)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-red-500/5 font-bold border-t-2">
                      <TableCell colSpan={2} className="text-left">إجمالي المصروفات</TableCell>
                      <TableCell className="font-mono text-red-700">{formatCurrency(totalExpenses)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Net Income Banner */}
      {!loading && (
        <Card className={cn("border-2", netIncome >= 0 ? "border-green-500/30 bg-green-500/5" : "border-red-500/30 bg-red-500/5")}>
          <CardContent className="p-6 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {netIncome >= 0 ? <TrendingUp className="h-6 w-6 text-green-600" /> : <TrendingDown className="h-6 w-6 text-red-600" />}
              <span className="text-lg font-bold text-foreground">{netIncome >= 0 ? "صافي الربح" : "صافي الخسارة"}</span>
            </div>
            <span className={cn("text-2xl font-bold font-mono", netIncome >= 0 ? "text-green-600" : "text-red-600")}>
              {formatCurrency(netIncome)}
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
