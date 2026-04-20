import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search } from "lucide-react";
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

const fmt = (v: number) =>
  Number(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export default function AccountBalancesReport() {
  const { currency } = useSettings();
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase.rpc as any)(
        "get_account_balances",
        { p_only_with_activity: true },
      );
      if (cancelled) return;
      if (error || !data) {
        setBalances([]);
        setLoading(false);
        return;
      }
      const rows = (data.rows ?? []) as AccountBalance[];
      setBalances(
        rows.map((r) => ({
          ...r,
          debit: Number(r.debit),
          credit: Number(r.credit),
          balance: Number(r.balance),
        })),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const typeGroups: Record<string, number> = {};
  balances.forEach((acc) => {
    typeGroups[acc.account_type] =
      (typeGroups[acc.account_type] || 0) + acc.balance;
  });

  return (
    <div className="space-y-4">
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
                {fmt(Math.abs(total))} {currency}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {total >= 0 ? "مدين" : "دائن"}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

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
                    <TableCell className="text-sm font-mono">
                      {fmt(acc.debit)} {currency}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {fmt(acc.credit)} {currency}
                    </TableCell>
                    <TableCell
                      className={`text-sm font-bold font-mono ${acc.balance >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {fmt(Math.abs(acc.balance))} {currency}{" "}
                      {acc.balance >= 0 ? "مدين" : "دائن"}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell colSpan={3} className="text-sm">
                    الإجمالي
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {fmt(totalDebit)} {currency}
                  </TableCell>
                  <TableCell className="text-sm font-mono">
                    {fmt(totalCredit)} {currency}
                  </TableCell>
                  <TableCell
                    className={`text-sm font-bold font-mono ${totalDebit - totalCredit >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {fmt(Math.abs(totalDebit - totalCredit))} {currency}
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
