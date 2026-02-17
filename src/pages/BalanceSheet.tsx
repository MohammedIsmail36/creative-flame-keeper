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
import { Landmark, Download, CalendarIcon, X, CheckCircle, AlertTriangle } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface BalanceRow {
  account: Account;
  balance: number;
}

export default function BalanceSheet() {
  const { settings, currency } = useSettings();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState<Date | undefined>(undefined);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code"),
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entries!inner(entry_date, status)").eq("journal_entries.status", "posted"),
    ]);
    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);
    if (linesRes.data) setLines(linesRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const { assetRows, liabilityRows, equityRows, totalAssets, totalLiabilities, totalEquity, netIncome } = useMemo(() => {
    const filtered = lines.filter((l: any) => {
      const d = (l.journal_entries as any)?.entry_date;
      if (!d) return false;
      if (asOfDate && d > format(asOfDate, "yyyy-MM-dd")) return false;
      return true;
    });

    const totals = new Map<string, number>();
    filtered.forEach((l: any) => {
      const acc = accounts.find(a => a.id === l.account_id);
      if (!acc) return;
      const existing = totals.get(l.account_id) || 0;
      // Assets & Expenses: debit normal, Liabilities/Equity/Revenue: credit normal
      if (acc.account_type === "asset" || acc.account_type === "expense") {
        totals.set(l.account_id, existing + (Number(l.debit) - Number(l.credit)));
      } else {
        totals.set(l.account_id, existing + (Number(l.credit) - Number(l.debit)));
      }
    });

    const assetRows: BalanceRow[] = [];
    const liabilityRows: BalanceRow[] = [];
    const equityRows: BalanceRow[] = [];
    let revenueTotal = 0;
    let expenseTotal = 0;

    accounts.forEach((acc) => {
      const balance = totals.get(acc.id);
      if (balance === undefined || balance === 0) return;
      if (acc.account_type === "asset") assetRows.push({ account: acc, balance });
      else if (acc.account_type === "liability") liabilityRows.push({ account: acc, balance });
      else if (acc.account_type === "equity") equityRows.push({ account: acc, balance });
      else if (acc.account_type === "revenue") revenueTotal += balance;
      else if (acc.account_type === "expense") expenseTotal += balance;
    });

    const netIncome = revenueTotal - expenseTotal;
    const totalAssets = assetRows.reduce((s, r) => s + r.balance, 0);
    const totalLiabilities = liabilityRows.reduce((s, r) => s + r.balance, 0);
    const totalEquity = equityRows.reduce((s, r) => s + r.balance, 0) + netIncome;

    return { assetRows, liabilityRows, equityRows, totalAssets, totalLiabilities, totalEquity, netIncome };
  }, [accounts, lines, asOfDate]);

  const isBalanced = Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01;
  const formatNum = (val: number) => Math.abs(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCurrency = (val: number) => `${formatNum(val)} ${currency}`;

  const handleExportPDF = async () => {
    const { createArabicPDF, addPdfHeader, addPdfFooter } = await import("@/lib/pdf-arabic");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = await createArabicPDF();
    const startY = addPdfHeader(doc, settings, "الميزانية العمومية");

    const baseStyles = { fontSize: 9, cellPadding: 3, font: "Amiri", halign: "right" as const };

    // Assets
    const assetData = assetRows.map((r) => [r.account.code, r.account.name, formatNum(r.balance)]);
    assetData.push(["", "إجمالي الأصول", formatNum(totalAssets)]);
    autoTable(doc, {
      head: [["الكود", "الأصول", `المبلغ (${currency})`]],
      body: assetData, startY,
      styles: baseStyles,
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      didParseCell: (data: any) => {
        if (data.row.index === assetData.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [239, 246, 255]; }
      },
    });

    const y1 = (doc as any).lastAutoTable.finalY + 6;

    // Liabilities
    const liabData = liabilityRows.map((r) => [r.account.code, r.account.name, formatNum(r.balance)]);
    liabData.push(["", "إجمالي الخصوم", formatNum(totalLiabilities)]);
    autoTable(doc, {
      head: [["الكود", "الخصوم", `المبلغ (${currency})`]],
      body: liabData,
      startY: y1,
      styles: baseStyles,
      headStyles: { fillColor: [239, 68, 68], textColor: 255 },
      didParseCell: (data: any) => {
        if (data.row.index === liabData.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [254, 242, 242]; }
      },
    });

    const y2 = (doc as any).lastAutoTable.finalY + 6;

    // Equity
    const eqData = equityRows.map((r) => [r.account.code, r.account.name, formatNum(r.balance)]);
    if (netIncome !== 0) eqData.push(["", netIncome >= 0 ? "صافي الربح" : "صافي الخسارة", formatNum(netIncome)]);
    eqData.push(["", "إجمالي حقوق الملكية", formatNum(totalEquity)]);
    autoTable(doc, {
      head: [["الكود", "حقوق الملكية", `المبلغ (${currency})`]],
      body: eqData,
      startY: y2,
      styles: baseStyles,
      headStyles: { fillColor: [34, 197, 94], textColor: 255 },
      didParseCell: (data: any) => {
        if (data.row.index === eqData.length - 1) { data.cell.styles.fontStyle = "bold"; data.cell.styles.fillColor = [240, 253, 244]; }
      },
    });

    const y3 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      body: [["إجمالي الخصوم وحقوق الملكية", formatNum(totalLiabilities + totalEquity)]],
      startY: y3,
      styles: { fontSize: 11, cellPadding: 4, fontStyle: "bold", font: "Amiri" },
      bodyStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59] },
      columnStyles: { 1: { halign: "right" } },
    });

    addPdfFooter(doc, settings);
    doc.save("Balance_Sheet.pdf");
    toast({ title: "تم التصدير", description: "تم تصدير الميزانية العمومية بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const data: any[] = [];
    data.push({ "القسم": "الأصول", "الكود": "", "الحساب": "", "المبلغ (EGP)": "" });
    assetRows.forEach((r) => data.push({ "القسم": "", "الكود": r.account.code, "الحساب": r.account.name, "المبلغ (EGP)": r.balance }));
    data.push({ "القسم": "", "الكود": "", "الحساب": "إجمالي الأصول", "المبلغ (EGP)": totalAssets });
    data.push({ "القسم": "", "الكود": "", "الحساب": "", "المبلغ (EGP)": "" });
    data.push({ "القسم": "الخصوم", "الكود": "", "الحساب": "", "المبلغ (EGP)": "" });
    liabilityRows.forEach((r) => data.push({ "القسم": "", "الكود": r.account.code, "الحساب": r.account.name, "المبلغ (EGP)": r.balance }));
    data.push({ "القسم": "", "الكود": "", "الحساب": "إجمالي الخصوم", "المبلغ (EGP)": totalLiabilities });
    data.push({ "القسم": "", "الكود": "", "الحساب": "", "المبلغ (EGP)": "" });
    data.push({ "القسم": "حقوق الملكية", "الكود": "", "الحساب": "", "المبلغ (EGP)": "" });
    equityRows.forEach((r) => data.push({ "القسم": "", "الكود": r.account.code, "الحساب": r.account.name, "المبلغ (EGP)": r.balance }));
    if (netIncome !== 0) data.push({ "القسم": "", "الكود": "", "الحساب": netIncome >= 0 ? "صافي الربح" : "صافي الخسارة", "المبلغ (EGP)": netIncome });
    data.push({ "القسم": "", "الكود": "", "الحساب": "إجمالي حقوق الملكية", "المبلغ (EGP)": totalEquity });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Balance Sheet");
    XLSX.writeFile(wb, "Balance_Sheet.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير الميزانية العمومية بصيغة Excel" });
    setExportMenuOpen(false);
  };

  const SectionTable = ({ title, rows, total, totalLabel, color, icon }: {
    title: string; rows: BalanceRow[]; total: number; totalLabel: string;
    color: string; icon: React.ReactNode;
  }) => (
    <Card className="overflow-hidden">
      <CardHeader className={cn("border-b py-4", color)}>
        <CardTitle className="text-base flex items-center gap-2">
          {icon}
          {title}
          <Badge variant="secondary" className="mr-2">{rows.length} حساب</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">لا توجد حسابات</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/20">
                <TableHead className="text-right">الكود</TableHead>
                <TableHead className="text-right">الحساب</TableHead>
                <TableHead className="text-right">الرصيد</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.account.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-mono text-sm">{row.account.code}</TableCell>
                  <TableCell className="font-medium">{row.account.name}</TableCell>
                  <TableCell className="font-mono">{formatCurrency(row.balance)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/40 font-bold border-t-2">
                <TableCell colSpan={2} className="text-left">{totalLabel}</TableCell>
                <TableCell className="font-mono">{formatCurrency(total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Landmark className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">الميزانية العمومية</h1>
            <p className="text-sm text-muted-foreground">Balance Sheet - المركز المالي</p>
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

      {/* Date + Balance Status */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium",
              isBalanced ? "bg-green-500/10 text-green-600" : "bg-destructive/10 text-destructive"
            )}>
              {isBalanced ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              {isBalanced
                ? "الميزانية متوازنة ✓"
                : `غير متوازنة - الفرق: ${formatCurrency(Math.abs(totalAssets - (totalLiabilities + totalEquity)))}`}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">كما في تاريخ:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn("w-[160px] justify-start text-left font-normal", !asOfDate && "text-muted-foreground")}>
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {asOfDate ? format(asOfDate, "yyyy-MM-dd") : "حتى اليوم"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={asOfDate} onSelect={setAsOfDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
              {asOfDate && (
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => setAsOfDate(undefined)}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border border-blue-500/20">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">إجمالي الأصول</p>
            <p className="text-2xl font-bold font-mono text-blue-600">{formatCurrency(totalAssets)}</p>
          </CardContent>
        </Card>
        <Card className="border border-red-500/20">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">إجمالي الخصوم</p>
            <p className="text-2xl font-bold font-mono text-red-600">{formatCurrency(totalLiabilities)}</p>
          </CardContent>
        </Card>
        <Card className="border border-green-500/20">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground mb-1">حقوق الملكية</p>
            <p className="text-2xl font-bold font-mono text-green-600">{formatCurrency(totalEquity)}</p>
          </CardContent>
        </Card>
      </div>

      {loading ? (
        <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
      ) : (
        <>
          {/* Assets */}
          <SectionTable
            title="الأصول"
            rows={assetRows}
            total={totalAssets}
            totalLabel="إجمالي الأصول"
            color="bg-blue-500/5"
            icon={<Landmark className="h-4 w-4 text-blue-600" />}
          />

          {/* Liabilities */}
          <SectionTable
            title="الخصوم"
            rows={liabilityRows}
            total={totalLiabilities}
            totalLabel="إجمالي الخصوم"
            color="bg-red-500/5"
            icon={<Landmark className="h-4 w-4 text-red-600" />}
          />

          {/* Equity */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b py-4 bg-green-500/5">
              <CardTitle className="text-base flex items-center gap-2">
                <Landmark className="h-4 w-4 text-green-600" />
                حقوق الملكية
                <Badge variant="secondary" className="mr-2">{equityRows.length + (netIncome !== 0 ? 1 : 0)} بند</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/20">
                    <TableHead className="text-right">الكود</TableHead>
                    <TableHead className="text-right">الحساب</TableHead>
                    <TableHead className="text-right">الرصيد</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {equityRows.map((row) => (
                    <TableRow key={row.account.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-sm">{row.account.code}</TableCell>
                      <TableCell className="font-medium">{row.account.name}</TableCell>
                      <TableCell className="font-mono">{formatCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                  {netIncome !== 0 && (
                    <TableRow className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-mono text-sm">—</TableCell>
                      <TableCell className={cn("font-medium", netIncome >= 0 ? "text-green-600" : "text-red-600")}>
                        {netIncome >= 0 ? "صافي ربح الفترة" : "صافي خسارة الفترة"}
                      </TableCell>
                      <TableCell className={cn("font-mono", netIncome >= 0 ? "text-green-600" : "text-red-600")}>
                        {formatCurrency(netIncome)}
                      </TableCell>
                    </TableRow>
                  )}
                  <TableRow className="bg-muted/40 font-bold border-t-2">
                    <TableCell colSpan={2} className="text-left">إجمالي حقوق الملكية</TableCell>
                    <TableCell className="font-mono">{formatCurrency(totalEquity)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Balance equation */}
          <Card className={cn("border-2", isBalanced ? "border-green-500/30 bg-green-500/5" : "border-destructive/30 bg-destructive/5")}>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">الأصول</p>
                  <p className="text-xl font-bold font-mono text-blue-600">{formatCurrency(totalAssets)}</p>
                </div>
                <span className="text-2xl font-bold text-muted-foreground">=</span>
                <div>
                  <p className="text-xs text-muted-foreground">الخصوم</p>
                  <p className="text-xl font-bold font-mono text-red-600">{formatCurrency(totalLiabilities)}</p>
                </div>
                <span className="text-2xl font-bold text-muted-foreground">+</span>
                <div>
                  <p className="text-xs text-muted-foreground">حقوق الملكية</p>
                  <p className="text-xl font-bold font-mono text-green-600">{formatCurrency(totalEquity)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
