import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Calculator, Search, Download, Filter, BookOpen, ArrowUpDown, TrendingUp, TrendingDown } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface LedgerLine {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string | null;
  created_at: string;
  entry_number: number;
  entry_date: string;
  entry_description: string;
  entry_status: string;
}

const formatNumber = (val: number) =>
  val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatCurrency = (val: number) => `${formatNumber(val)} EGP`;

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
};

export default function Ledger() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).order("code"),
      supabase
        .from("journal_entry_lines")
        .select("id, journal_entry_id, account_id, debit, credit, description, created_at")
        .order("created_at", { ascending: true }),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);

    if (linesRes.data && linesRes.data.length > 0) {
      // Fetch journal entries for metadata
      const entryIds = [...new Set(linesRes.data.map((l: any) => l.journal_entry_id))];
      const { data: entriesData } = await supabase
        .from("journal_entries")
        .select("id, entry_number, entry_date, description, status")
        .in("id", entryIds);

      const entryMap = new Map<string, any>();
      (entriesData || []).forEach((e: any) => entryMap.set(e.id, e));

      const enriched: LedgerLine[] = linesRes.data
        .map((l: any) => {
          const entry = entryMap.get(l.journal_entry_id);
          if (!entry || entry.status !== "posted") return null;
          return {
            ...l,
            debit: Number(l.debit),
            credit: Number(l.credit),
            entry_number: entry.entry_number,
            entry_date: entry.entry_date,
            entry_description: entry.description,
            entry_status: entry.status,
          };
        })
        .filter(Boolean) as LedgerLine[];

      setLines(enriched);
    } else {
      setLines([]);
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  // Compute balances per account
  const accountBalances = useMemo(() => {
    const balances = new Map<string, { debit: number; credit: number; balance: number }>();
    lines.forEach((l) => {
      const current = balances.get(l.account_id) || { debit: 0, credit: 0, balance: 0 };
      current.debit += l.debit;
      current.credit += l.credit;
      current.balance = current.debit - current.credit;
      balances.set(l.account_id, current);
    });
    return balances;
  }, [lines]);

  // Accounts that have movements
  const activeAccounts = useMemo(() => {
    return accounts.filter((a) => accountBalances.has(a.id));
  }, [accounts, accountBalances]);

  // Filtered lines for selected account
  const filteredLines = useMemo(() => {
    let filtered = lines;
    if (selectedAccountId !== "all") {
      filtered = filtered.filter((l) => l.account_id === selectedAccountId);
    }
    if (searchQuery) {
      filtered = filtered.filter(
        (l) =>
          l.entry_description.toLowerCase().includes(searchQuery.toLowerCase()) ||
          String(l.entry_number).includes(searchQuery) ||
          (l.description || "").toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return filtered;
  }, [lines, selectedAccountId, searchQuery]);

  // Running balance for filtered lines (only meaningful for single account)
  const linesWithBalance = useMemo(() => {
    if (selectedAccountId === "all") {
      return filteredLines.map((l) => ({ ...l, runningBalance: 0, showBalance: false }));
    }
    let balance = 0;
    return filteredLines.map((l) => {
      balance += l.debit - l.credit;
      return { ...l, runningBalance: balance, showBalance: true };
    });
  }, [filteredLines, selectedAccountId]);

  const totalDebit = filteredLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = filteredLines.reduce((s, l) => s + l.credit, 0);

  // Stats
  const totalAccounts = activeAccounts.length;
  const totalMovements = lines.length;
  const netBalance = lines.reduce((s, l) => s + l.debit - l.credit, 0);

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF({ orientation: "landscape" });
    const selectedAccount = selectedAccountId !== "all" ? accountMap.get(selectedAccountId) : null;
    const title = selectedAccount
      ? `General Ledger - ${selectedAccount.code} ${selectedAccount.name}`
      : "General Ledger - All Accounts";

    doc.setFontSize(16);
    doc.text(title, 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Date: ${new Date().toLocaleDateString("en-US")} | Currency: EGP`, 148, 22, { align: "center" });

    const tableData = linesWithBalance.map((l) => {
      const acc = accountMap.get(l.account_id);
      return [
        l.entry_number,
        formatDate(l.entry_date),
        acc ? `${acc.code} - ${acc.name}` : l.account_id,
        l.entry_description,
        l.debit > 0 ? formatNumber(l.debit) : "-",
        l.credit > 0 ? formatNumber(l.credit) : "-",
        l.showBalance ? formatNumber(l.runningBalance) : "-",
      ];
    });

    autoTable(doc, {
      head: [["#", "Date", "Account", "Description", "Debit (EGP)", "Credit (EGP)", "Balance (EGP)"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      foot: [["", "", "", "Total", formatNumber(totalDebit), formatNumber(totalCredit), formatNumber(totalDebit - totalCredit)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    });

    doc.save("General_Ledger.pdf");
    toast({ title: "تم التصدير", description: "تم تصدير دفتر الأستاذ بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = linesWithBalance.map((l) => {
      const acc = accountMap.get(l.account_id);
      return {
        "Entry #": l.entry_number,
        Date: formatDate(l.entry_date),
        "Account Code": acc?.code || "",
        "Account Name": acc?.name || "",
        Description: l.entry_description,
        "Debit (EGP)": l.debit,
        "Credit (EGP)": l.credit,
        "Balance (EGP)": l.showBalance ? l.runningBalance : "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, "General_Ledger.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير دفتر الأستاذ بصيغة Excel" });
    setExportMenuOpen(false);
  };

  const handleExportCSV = () => {
    const headers = ["Entry #", "Date", "Account Code", "Account Name", "Description", "Debit (EGP)", "Credit (EGP)", "Balance (EGP)"];
    const rows = linesWithBalance.map((l) => {
      const acc = accountMap.get(l.account_id);
      return [
        l.entry_number,
        formatDate(l.entry_date),
        acc?.code || "",
        acc?.name || "",
        l.entry_description,
        l.debit,
        l.credit,
        l.showBalance ? l.runningBalance : "",
      ];
    });
    const csvContent = "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "General_Ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "تم التصدير", description: "تم تصدير دفتر الأستاذ بصيغة CSV" });
    setExportMenuOpen(false);
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Calculator className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">دفتر الأستاذ العام</h1>
            <p className="text-sm text-muted-foreground">حركة الحسابات وأرصدتها</p>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "حسابات نشطة", value: totalAccounts, icon: BookOpen, color: "bg-foreground/5 text-foreground" },
          { label: "إجمالي الحركات", value: totalMovements, icon: ArrowUpDown, color: "bg-blue-500/10 text-blue-600" },
          { label: "إجمالي المدين", value: formatCurrency(lines.reduce((s, l) => s + l.debit, 0)), icon: TrendingUp, color: "bg-green-500/10 text-green-600" },
          { label: "إجمالي الدائن", value: formatCurrency(lines.reduce((s, l) => s + l.credit, 0)), icon: TrendingDown, color: "bg-red-500/10 text-red-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-lg font-bold text-foreground">{value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account Balances Summary */}
      {activeAccounts.length > 0 && selectedAccountId === "all" && !searchQuery && (
        <Card>
          <CardHeader className="border-b bg-muted/30 py-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              ملخص أرصدة الحسابات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-right">الرمز</TableHead>
                  <TableHead className="text-right">اسم الحساب</TableHead>
                  <TableHead className="text-right">إجمالي المدين</TableHead>
                  <TableHead className="text-right">إجمالي الدائن</TableHead>
                  <TableHead className="text-right">الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAccounts.map((acc) => {
                  const bal = accountBalances.get(acc.id)!;
                  return (
                    <TableRow
                      key={acc.id}
                      className="cursor-pointer hover:bg-muted/30"
                      onClick={() => setSelectedAccountId(acc.id)}
                    >
                      <TableCell className="font-mono text-sm">{acc.code}</TableCell>
                      <TableCell className="font-medium">{acc.name}</TableCell>
                      <TableCell>{formatCurrency(bal.debit)}</TableCell>
                      <TableCell>{formatCurrency(bal.credit)}</TableCell>
                      <TableCell className={`font-bold ${bal.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {formatCurrency(Math.abs(bal.balance))} {bal.balance >= 0 ? "مدين" : "دائن"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Search & Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="البحث في الحركات..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pr-10"
              />
            </div>
            <div className="flex gap-2">
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="w-56 gap-2">
                  <Filter className="h-4 w-4" />
                  <SelectValue placeholder="اختر حساب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الحسابات</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Button variant="outline" className="gap-2" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
                  <Download className="h-4 w-4" />
                  تصدير
                </Button>
                {exportMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[140px]">
                    <button onClick={handleExportPDF} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                      PDF تصدير
                    </button>
                    <button onClick={handleExportExcel} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                      Excel تصدير
                    </button>
                    <button onClick={handleExportCSV} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                      CSV تصدير
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ledger Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            {selectedAccountId !== "all"
              ? `حركات الحساب: ${accountMap.get(selectedAccountId)?.name || ""}`
              : "جميع الحركات"}
            <span className="text-muted-foreground font-normal">({filteredLines.length} حركة)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">جاري التحميل...</div>
          ) : filteredLines.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Calculator className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد حركات محاسبية</p>
              <p className="text-xs mt-1">ستظهر الحركات بعد اعتماد القيود المحاسبية</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-right">رقم القيد</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  {selectedAccountId === "all" && <TableHead className="text-right">الحساب</TableHead>}
                  <TableHead className="text-right">البيان</TableHead>
                  <TableHead className="text-right">مدين (EGP)</TableHead>
                  <TableHead className="text-right">دائن (EGP)</TableHead>
                  {selectedAccountId !== "all" && <TableHead className="text-right">الرصيد (EGP)</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {linesWithBalance.map((l) => {
                  const acc = accountMap.get(l.account_id);
                  return (
                    <TableRow key={l.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-sm">{l.entry_number}</TableCell>
                      <TableCell className="text-sm">{formatDate(l.entry_date)}</TableCell>
                      {selectedAccountId === "all" && (
                        <TableCell>
                          <button
                            className="text-primary hover:underline text-sm"
                            onClick={() => setSelectedAccountId(l.account_id)}
                          >
                            {acc ? `${acc.code} - ${acc.name}` : "—"}
                          </button>
                        </TableCell>
                      )}
                      <TableCell className="text-sm">{l.entry_description}</TableCell>
                      <TableCell className={`font-mono text-sm ${l.debit > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}`}>
                        {l.debit > 0 ? formatNumber(l.debit) : "-"}
                      </TableCell>
                      <TableCell className={`font-mono text-sm ${l.credit > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {l.credit > 0 ? formatNumber(l.credit) : "-"}
                      </TableCell>
                      {l.showBalance && (
                        <TableCell className={`font-mono text-sm font-bold ${l.runningBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {formatNumber(Math.abs(l.runningBalance))}
                          <span className="text-xs text-muted-foreground mr-1">{l.runningBalance >= 0 ? "مدين" : "دائن"}</span>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
                {/* Totals Row */}
                <TableRow className="bg-muted/30 font-bold border-t-2">
                  <TableCell colSpan={selectedAccountId === "all" ? 4 : 3} className="text-left">
                    الإجمالي
                  </TableCell>
                  <TableCell className="font-mono text-sm text-green-600">{formatNumber(totalDebit)}</TableCell>
                  <TableCell className="font-mono text-sm text-red-600">{formatNumber(totalCredit)}</TableCell>
                  {selectedAccountId !== "all" && (
                    <TableCell className="font-mono text-sm font-bold">
                      {formatNumber(Math.abs(totalDebit - totalCredit))}
                      <span className="text-xs text-muted-foreground mr-1">
                        {totalDebit - totalCredit >= 0 ? "مدين" : "دائن"}
                      </span>
                    </TableCell>
                  )}
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
