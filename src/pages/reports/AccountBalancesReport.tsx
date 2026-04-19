import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Calculator, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
  balance: number;
}

const typeLabels: Record<string, string> = {
  asset: "الأصول",
  liability: "الخصوم",
  equity: "حقوق الملكية",
  revenue: "الإيرادات",
  expense: "المصروفات",
};

export default function AccountBalancesReport() {
  const { formatCurrency } = useSettings();
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    fetchBalances();
  }, []);

  const fetchBalances = async () => {
    setLoading(true);
    const [accountsRes, linesRes] = await Promise.all([
      supabase
        .from("accounts")
        .select("id, code, name, account_type")
        .eq("is_active", true)
        .eq("is_parent", false)
        .order("code"),
      supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, journal_entry_id"),
    ]);

    if (!accountsRes.data || !linesRes.data) {
      setLoading(false);
      return;
    }

    const entryIds = [
      ...new Set(linesRes.data.map((l: any) => l.journal_entry_id)),
    ];
    if (!entryIds.length) {
      setLoading(false);
      return;
    }

    const { data: entries } = await supabase
      .from("journal_entries")
      .select("id")
      .in("id", entryIds)
      .eq("status", "posted");
    const postedIds = new Set((entries || []).map((e) => e.id));

    const balMap = new Map<string, { debit: number; credit: number }>();
    linesRes.data.forEach((l: any) => {
      if (!postedIds.has(l.journal_entry_id)) return;
      const cur = balMap.get(l.account_id) || { debit: 0, credit: 0 };
      cur.debit += Number(l.debit);
      cur.credit += Number(l.credit);
      balMap.set(l.account_id, cur);
    });

    setBalances(
      accountsRes.data
        .filter((a: any) => balMap.has(a.id))
        .map((a: any) => {
          const b = balMap.get(a.id)!;
          return {
            ...a,
            debit: b.debit,
            credit: b.credit,
            balance: b.debit - b.credit,
          };
        }),
    );
    setLoading(false);
  };

  const filtered = balances
    .filter((acc) => {
      const matchSearch =
        !search || acc.name.includes(search) || acc.code.includes(search);
      const matchType = typeFilter === "all" || acc.account_type === typeFilter;
      return matchSearch && matchType;
    })
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));

  const totalDebit = filtered.reduce((s, a) => s + a.debit, 0);
  const totalCredit = filtered.reduce((s, a) => s + a.credit, 0);

  // Group summary
  const typeGroups: Record<string, number> = {};
  balances.forEach((acc) => {
    typeGroups[acc.account_type] =
      (typeGroups[acc.account_type] || 0) + acc.balance;
  });

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {Object.entries(typeGroups).map(([key, total]) => (
          <Card key={key} className="border-border/60 shadow-none">
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">
                {typeLabels[key] || key}
              </p>
              <p
                className={`text-lg font-bold ${total >= 0 ? "text-foreground" : "text-destructive"}`}
              >
                {formatCurrency(Math.abs(total))}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {total >= 0 ? "مدين" : "دائن"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="بحث بالاسم أو الرمز..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 h-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-44 h-9">
            <SelectValue placeholder="نوع الحساب" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">جميع الأنواع</SelectItem>
            {Object.entries(typeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="border-border/60 shadow-none">
        <CardContent className="p-0">
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              جاري التحميل...
            </p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">
              لا توجد بيانات
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-xs">الرمز</TableHead>
                  <TableHead className="text-xs">اسم الحساب</TableHead>
                  <TableHead className="text-xs">النوع</TableHead>
                  <TableHead className="text-xs">إجمالي المدين</TableHead>
                  <TableHead className="text-xs">إجمالي الدائن</TableHead>
                  <TableHead className="text-xs">الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((acc) => (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono text-xs">
                      {acc.code}
                    </TableCell>
                    <TableCell className="text-sm font-medium">
                      {acc.name}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {typeLabels[acc.account_type] || acc.account_type}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCurrency(acc.debit)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatCurrency(acc.credit)}
                    </TableCell>
                    <TableCell
                      className={`text-sm font-bold ${acc.balance >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {formatCurrency(Math.abs(acc.balance))}{" "}
                      {acc.balance >= 0 ? "مدين" : "دائن"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell colSpan={3} className="text-sm">
                    الإجمالي
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatCurrency(totalDebit)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatCurrency(totalCredit)}
                  </TableCell>
                  <TableCell
                    className={`text-sm font-bold ${totalDebit - totalCredit >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {formatCurrency(Math.abs(totalDebit - totalCredit))}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
