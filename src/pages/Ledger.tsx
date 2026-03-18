import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { Card, CardContent } from "@/components/ui/card";
import { AccountCombobox } from "@/components/AccountCombobox";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/DatePickerInput";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { ExportMenu } from "@/components/ExportMenu";
import { Calculator, BookOpen, ArrowUpDown, TrendingUp, TrendingDown, X, Coins } from "lucide-react";

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
  entry_posted_number: number | null;
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

export default function Ledger() {
  const { settings } = useSettings();
  const jePrefix = (settings as any)?.journal_entry_prefix || "JV-";
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [lines, setLines] = useState<LedgerLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const fetchData = async () => {
    setLoading(true);
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).order("code"),
      supabase.from("journal_entry_lines").select("id, journal_entry_id, account_id, debit, credit, description, created_at").order("created_at", { ascending: true }),
    ]);

    if (accountsRes.data) setAccounts(accountsRes.data as Account[]);

    if (linesRes.data && linesRes.data.length > 0) {
      const entryIds = [...new Set(linesRes.data.map((l: any) => l.journal_entry_id))];
      const { data: entriesData } = await supabase.from("journal_entries").select("id, entry_number, posted_number, entry_date, description, status").in("id", entryIds);

      const entryMap = new Map<string, any>();
      (entriesData || []).forEach((e: any) => entryMap.set(e.id, e));

      const enriched: LedgerLine[] = linesRes.data
        .map((l: any) => {
          const entry = entryMap.get(l.journal_entry_id);
          if (!entry || entry.status !== "posted") return null;
          return { ...l, debit: Number(l.debit), credit: Number(l.credit), entry_number: entry.entry_number, entry_posted_number: entry.posted_number, entry_date: entry.entry_date, entry_description: entry.description, entry_status: entry.status };
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
  const netBalance = totalDebit - totalCredit;

  const hasFilters = selectedAccountId !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setSelectedAccountId("all"); setDateFrom(""); setDateTo(""); };

  const columns: ColumnDef<LedgerLine, any>[] = [
    {
      accessorKey: "entry_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم القيد" />,
      cell: ({ row }) => <span className="font-mono font-bold text-sm">{formatDisplayNumber(jePrefix, row.original.entry_posted_number, row.original.entry_number, row.original.entry_status)}</span>,
    },
    {
      accessorKey: "entry_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-sm text-muted-foreground whitespace-nowrap">{row.original.entry_date}</span>,
    },
    ...(selectedAccountId === "all" ? [{
      id: "account",
      header: "الحساب",
      cell: ({ row }: any) => (
        <button className="text-primary hover:text-primary/80 font-medium text-sm transition-colors" onClick={() => setSelectedAccountId(row.original.account_id)}>
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
      header: ({ column }) => <DataTableColumnHeader column={column} title="مدين" />,
      cell: ({ row }) => <span className={`font-mono text-sm ${row.original.debit > 0 ? "text-emerald-600 font-bold" : "text-muted-foreground/30"}`}>{row.original.debit > 0 ? formatNumber(row.original.debit) : "-"}</span>,
    },
    {
      accessorKey: "credit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="دائن" />,
      cell: ({ row }) => <span className={`font-mono text-sm ${row.original.credit > 0 ? "text-rose-600 font-bold" : "text-muted-foreground/30"}`}>{row.original.credit > 0 ? formatNumber(row.original.credit) : "-"}</span>,
    },
    ...(selectedAccountId !== "all" ? [{
      id: "balance",
      header: "الرصيد",
      cell: ({ row }: any) => {
        const bal = row.original.runningBalance ?? 0;
        return (
          <span className={`font-mono text-sm font-black ${bal >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {bal >= 0 ? formatNumber(bal) : `(${formatNumber(Math.abs(bal))})`}
          </span>
        );
      },
    } as ColumnDef<LedgerLine, any>] : []),
  ];

  const exportConfig = {
    filenamePrefix: "دفتر-الأستاذ",
    sheetName: "دفتر الأستاذ",
    pdfTitle: selectedAccountId !== "all" && accountMap.get(selectedAccountId)
      ? `دفتر الأستاذ - ${accountMap.get(selectedAccountId)!.code} ${accountMap.get(selectedAccountId)!.name}`
      : "دفتر الأستاذ العام",
    headers: ["رقم القيد", "التاريخ", "الحساب", "البيان", "مدين", "دائن", ...(selectedAccountId !== "all" ? ["الرصيد"] : [])],
    rows: linesWithBalance.map((l) => [
      formatDisplayNumber(jePrefix, l.entry_posted_number, l.entry_number, l.entry_status),
      l.entry_date,
      `${l.accountCode} - ${l.accountName}`,
      l.entry_description,
      l.debit > 0 ? l.debit : "",
      l.credit > 0 ? l.credit : "",
      ...(l.showBalance ? [l.runningBalance] : []),
    ]),
    settings,
    pdfOrientation: "landscape" as const,
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <Calculator className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">دفتر الأستاذ العام</h1>
            <p className="text-sm text-muted-foreground">حركة الحسابات وأرصدتها</p>
          </div>
        </div>
        <ExportMenu config={exportConfig} disabled={loading || linesWithBalance.length === 0} />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: "حسابات نشطة", value: activeAccounts.length.toLocaleString(), icon: BookOpen, color: "bg-primary/10 text-primary" },
          { label: "إجمالي الحركات", value: filteredLines.length.toLocaleString(), icon: ArrowUpDown, color: "bg-blue-500/10 text-blue-600" },
          { label: "إجمالي المدين", value: formatNumber(totalDebit), icon: TrendingUp, color: "bg-emerald-500/10 text-emerald-600" },
          { label: "إجمالي الدائن", value: formatNumber(totalCredit), icon: TrendingDown, color: "bg-rose-500/10 text-rose-600" },
          { label: "صافي الرصيد", value: netBalance >= 0 ? formatNumber(netBalance) : `(${formatNumber(Math.abs(netBalance))})`, icon: Coins, color: netBalance >= 0 ? "bg-emerald-500/10 text-emerald-600" : "bg-rose-500/10 text-rose-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className="text-2xl font-black text-foreground font-mono">{value}</p>
              <p className="text-xs text-muted-foreground mt-1">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={linesWithBalance}
        searchPlaceholder="البحث في الحركات..."
        isLoading={loading}
        emptyMessage="لا توجد حركات محاسبية"
        toolbarContent={
          <div className="flex items-center gap-2 flex-wrap">
            <AccountCombobox
              accounts={accounts}
              value={selectedAccountId === "all" ? "" : selectedAccountId}
              onValueChange={(val) => setSelectedAccountId(val || "all")}
              placeholder="جميع الحسابات"
              className="w-56"
            />
            <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" className="w-[150px]" />
            <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" className="w-[150px]" />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
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
