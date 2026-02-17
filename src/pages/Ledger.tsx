import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Calculator, Download, BookOpen, ArrowUpDown, TrendingUp, TrendingDown, X } from "lucide-react";

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
  runningBalance?: number;
  showBalance?: boolean;
  accountName?: string;
  accountCode?: string;
}

const formatNumber = (val: number) =>
  val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatCurrency = (val: number) => `${formatNumber(val)} EGP`;

export default function Ledger() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).order("code"),
      supabase.from("journal_entry_lines").select("id, journal_entry_id, account_id, debit, credit, description, created_at").order("created_at", { ascending: true }),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);

    if (linesRes.data && linesRes.data.length > 0) {
      const entryIds = [...new Set(linesRes.data.map((l: any) => l.journal_entry_id))];
      const { data: entriesData } = await supabase.from("journal_entries").select("id, entry_number, entry_date, description, status").in("id", entryIds);

      const entryMap = new Map<string, any>();
      (entriesData || []).forEach((e: any) => entryMap.set(e.id, e));

      const enriched: LedgerLine[] = linesRes.data
        .map((l: any) => {
          const entry = entryMap.get(l.journal_entry_id);
          if (!entry || entry.status !== "posted") return null;
          return { ...l, debit: Number(l.debit), credit: Number(l.credit), entry_number: entry.entry_number, entry_date: entry.entry_date, entry_description: entry.description, entry_status: entry.status };
        })
        .filter(Boolean) as LedgerLine[];

      setLines(enriched);
    } else {
      setLines([]);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

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

  const activeAccounts = useMemo(() => accounts.filter((a) => accountBalances.has(a.id)), [accounts, accountBalances]);

  const filteredLines = useMemo(() => {
    let filtered = lines;
    if (selectedAccountId !== "all") filtered = filtered.filter((l) => l.account_id === selectedAccountId);
    if (dateFrom) filtered = filtered.filter((l) => l.entry_date >= dateFrom);
    if (dateTo) filtered = filtered.filter((l) => l.entry_date <= dateTo);
    return filtered;
  }, [lines, selectedAccountId, dateFrom, dateTo]);

  const linesWithBalance = useMemo(() => {
    if (selectedAccountId === "all") {
      return filteredLines.map((l) => {
        const acc = accountMap.get(l.account_id);
        return { ...l, runningBalance: 0, showBalance: false, accountName: acc?.name || "", accountCode: acc?.code || "" };
      });
    }
    let balance = 0;
    return filteredLines.map((l) => {
      balance += l.debit - l.credit;
      const acc = accountMap.get(l.account_id);
      return { ...l, runningBalance: balance, showBalance: true, accountName: acc?.name || "", accountCode: acc?.code || "" };
    });
  }, [filteredLines, selectedAccountId, accountMap]);

  const totalDebit = filteredLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = filteredLines.reduce((s, l) => s + l.credit, 0);

  const hasFilters = selectedAccountId !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setSelectedAccountId("all"); setDateFrom(""); setDateTo(""); };

  const handleExportPDF = async () => {
    const { createArabicPDF } = await import("@/lib/pdf-arabic");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = await createArabicPDF("landscape");
    const selectedAccount = selectedAccountId !== "all" ? accountMap.get(selectedAccountId) : null;
    const title = selectedAccount ? `دفتر الأستاذ - ${selectedAccount.code} ${selectedAccount.name}` : "دفتر الأستاذ العام";
    doc.setFontSize(16);
    doc.text(title, 148, 15, { align: "center" });
    const tableData = linesWithBalance.map((l) => [l.entry_number, l.entry_date, l.accountCode ? `${l.accountCode} - ${l.accountName}` : "", l.entry_description, l.debit > 0 ? formatNumber(l.debit) : "-", l.credit > 0 ? formatNumber(l.credit) : "-", l.showBalance ? formatNumber(l.runningBalance!) : "-"]);
    autoTable(doc, {
      head: [["#", "التاريخ", "الحساب", "الوصف", "مدين", "دائن", "الرصيد"]],
      body: tableData, startY: 22,
      styles: { fontSize: 8, cellPadding: 3, font: "Amiri", halign: "right" },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    });
    doc.save("General_Ledger.pdf");
    toast({ title: "تم التصدير" });
    setExportMenuOpen(false);
  };

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = linesWithBalance.map((l) => ({ "#": l.entry_number, "التاريخ": l.entry_date, "الحساب": `${l.accountCode} - ${l.accountName}`, "الوصف": l.entry_description, "مدين": l.debit, "دائن": l.credit, "الرصيد": l.showBalance ? l.runningBalance : "" }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, "General_Ledger.xlsx");
    toast({ title: "تم التصدير" });
    setExportMenuOpen(false);
  };

  const columns: ColumnDef<LedgerLine, any>[] = [
    {
      accessorKey: "entry_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم القيد" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.entry_number}</span>,
    },
    {
      accessorKey: "entry_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.entry_date}</span>,
    },
    ...(selectedAccountId === "all" ? [{
      id: "account",
      header: "الحساب",
      cell: ({ row }: any) => (
        <button className="text-primary hover:underline text-sm" onClick={() => setSelectedAccountId(row.original.account_id)}>
          {row.original.accountCode} - {row.original.accountName}
        </button>
      ),
    } as ColumnDef<LedgerLine, any>] : []),
    {
      accessorKey: "entry_description",
      header: "البيان",
      cell: ({ row }) => <span className="text-sm">{row.original.entry_description}</span>,
    },
    {
      accessorKey: "debit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="مدين (EGP)" />,
      cell: ({ row }) => <span className={`font-mono text-sm ${row.original.debit > 0 ? "text-green-600 font-medium" : "text-muted-foreground"}`}>{row.original.debit > 0 ? formatNumber(row.original.debit) : "-"}</span>,
    },
    {
      accessorKey: "credit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="دائن (EGP)" />,
      cell: ({ row }) => <span className={`font-mono text-sm ${row.original.credit > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>{row.original.credit > 0 ? formatNumber(row.original.credit) : "-"}</span>,
    },
    ...(selectedAccountId !== "all" ? [{
      id: "balance",
      header: "الرصيد (EGP)",
      cell: ({ row }: any) => {
        const bal = row.original.runningBalance ?? 0;
        return (
          <span className={`font-mono text-sm font-bold ${bal >= 0 ? "text-green-600" : "text-red-600"}`}>
            {formatNumber(Math.abs(bal))}
            <span className="text-xs text-muted-foreground mr-1">{bal >= 0 ? "مدين" : "دائن"}</span>
          </span>
        );
      },
    } as ColumnDef<LedgerLine, any>] : []),
  ];

  return (
    <div className="space-y-6" dir="rtl">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "حسابات نشطة", value: activeAccounts.length, icon: BookOpen, color: "bg-foreground/5 text-foreground" },
          { label: "إجمالي الحركات", value: lines.length, icon: ArrowUpDown, color: "bg-blue-500/10 text-blue-600" },
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

      <DataTable
        columns={columns}
        data={linesWithBalance}
        searchPlaceholder="البحث في الحركات..."
        isLoading={loading}
        emptyMessage="لا توجد حركات محاسبية"
        toolbarContent={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-56 h-9 text-sm">
                <SelectValue placeholder="اختر حساب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الحسابات</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-9 text-sm" placeholder="من تاريخ" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-9 text-sm" placeholder="إلى تاريخ" />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
            <div className="relative">
              <Button variant="outline" size="sm" className="gap-2 h-9" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
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
        }
        columnLabels={{
          entry_number: "رقم القيد",
          entry_date: "التاريخ",
          account: "الحساب",
          entry_description: "البيان",
          debit: "مدين",
          credit: "دائن",
          balance: "الرصيد",
        }}
      />
    </div>
  );
}
