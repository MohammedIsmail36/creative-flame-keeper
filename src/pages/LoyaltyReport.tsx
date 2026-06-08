import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/PageSkeleton";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Gift, TrendingUp, TrendingDown, Users, Calculator, X } from "lucide-react";
import { round2 } from "@/lib/utils";
import { ExportMenu } from "@/components/ExportMenu";

interface TxRow {
  customer_id: string;
  points: number;
  type: string;
  transaction_date: string;
}
interface CustomerLite {
  id: string;
  code: string;
  name: string;
  loyalty_points: number;
}

interface TopRow {
  id: string;
  code: string;
  name: string;
  earned_in_period: number;
  redeemed_in_period: number;
  net_in_period: number;
  current_balance: number;
}

export default function LoyaltyReport() {
  const { settings, formatCurrency } = useSettings();
  const today = new Date().toISOString().slice(0, 10);
  const firstOfMonth = today.slice(0, 8) + "01";

  const [dateFrom, setDateFrom] = useState<string>(firstOfMonth);
  const [dateTo, setDateTo] = useState<string>(today);
  const [loading, setLoading] = useState(true);
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [customers, setCustomers] = useState<CustomerLite[]>([]);

  const pointsPerRedeem = Number(settings?.loyalty_points_per_redeem) || 100;
  const redeemValue = Number(settings?.loyalty_redeem_value) || 0;
  const pointValue = pointsPerRedeem > 0 ? redeemValue / pointsPerRedeem : 0;

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo]);

  async function load() {
    setLoading(true);
    const [txRes, custRes] = await Promise.all([
      (supabase.from("loyalty_transactions") as any)
        .select("customer_id, points, type, transaction_date")
        .gte("transaction_date", dateFrom)
        .lte("transaction_date", dateTo),
      (supabase.from("customers") as any)
        .select("id, code, name, loyalty_points")
        .eq("is_active", true),
    ]);
    setTxs((txRes.data as TxRow[]) || []);
    setCustomers((custRes.data as CustomerLite[]) || []);
    setLoading(false);
  }

  // KPIs
  const kpis = useMemo(() => {
    let earned = 0;
    let redeemed = 0;
    const activeSet = new Set<string>();
    for (const t of txs) {
      activeSet.add(t.customer_id);
      if (t.type === "earn") earned += t.points;
      else if (t.type === "redeem_reversal") earned += t.points;
      else if (t.type === "redeem") redeemed += Math.abs(t.points);
      else if (t.type === "reversal") earned -= Math.abs(t.points);
      else if (t.type === "manual_adjust") {
        if (t.points >= 0) earned += t.points;
        else redeemed += Math.abs(t.points);
      }
    }
    return {
      earned,
      redeemed,
      net: earned - redeemed,
      activeCount: activeSet.size,
    };
  }, [txs]);

  // Top customers in period
  const topRows = useMemo<TopRow[]>(() => {
    const byCustomer = new Map<string, { earned: number; redeemed: number }>();
    for (const t of txs) {
      const cur = byCustomer.get(t.customer_id) || { earned: 0, redeemed: 0 };
      if (t.type === "earn" || (t.type === "manual_adjust" && t.points > 0)) {
        cur.earned += t.points;
      } else if (t.type === "redeem_reversal") {
        cur.earned += t.points;
      } else if (t.type === "redeem") {
        cur.redeemed += Math.abs(t.points);
      } else if (t.type === "reversal") {
        cur.earned -= Math.abs(t.points);
      } else if (t.type === "manual_adjust" && t.points < 0) {
        cur.redeemed += Math.abs(t.points);
      }
      byCustomer.set(t.customer_id, cur);
    }
    const custMap = new Map(customers.map((c) => [c.id, c]));
    const rows: TopRow[] = [];
    byCustomer.forEach((v, id) => {
      const c = custMap.get(id);
      if (!c) return;
      rows.push({
        id,
        code: c.code,
        name: c.name,
        earned_in_period: v.earned,
        redeemed_in_period: v.redeemed,
        net_in_period: v.earned - v.redeemed,
        current_balance: c.loyalty_points || 0,
      });
    });
    rows.sort((a, b) => b.earned_in_period - a.earned_in_period);
    return rows.slice(0, 20);
  }, [txs, customers]);

  const columns: ColumnDef<TopRow, any>[] = [
    {
      accessorKey: "code",
      header: "الكود",
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: "name",
      header: "العميل",
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "earned_in_period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="مكتسبة في الفترة" />,
      cell: ({ row }) => (
        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
          {row.original.earned_in_period}
        </span>
      ),
    },
    {
      accessorKey: "redeemed_in_period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="مستبدلة في الفترة" />,
      cell: ({ row }) => (
        <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
          {row.original.redeemed_in_period}
        </span>
      ),
    },
    {
      accessorKey: "net_in_period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="صافي الفترة" />,
      cell: ({ row }) => (
        <Badge variant={row.original.net_in_period >= 0 ? "secondary" : "destructive"}>
          {row.original.net_in_period}
        </Badge>
      ),
    },
    {
      accessorKey: "current_balance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الرصيد الحالي" />,
      cell: ({ row }) => (
        <span className="font-mono tabular-nums font-semibold">
          {row.original.current_balance}
          {pointValue > 0 && (
            <span className="text-xs text-muted-foreground mr-1">
              ({formatCurrency(round2(row.original.current_balance * pointValue))})
            </span>
          )}
        </span>
      ),
    },
  ];

  function resetFilters() {
    setDateFrom(firstOfMonth);
    setDateTo(today);
  }

  if (!settings?.loyalty_enabled) {
    return (
      <div className="space-y-6" dir="rtl">
        <PageHeader icon={Gift} title="ولاء العملاء" description="نظام نقاط الولاء" />
        <div className="bg-card p-12 rounded-2xl border text-center space-y-3">
          <Gift className="h-12 w-12 mx-auto text-muted-foreground/50" />
          <p className="text-lg font-semibold">نظام الولاء غير مُفعّل</p>
          <p className="text-sm text-muted-foreground">
            يمكن تفعيله من إعدادات الشركة ← تبويب "ولاء العملاء".
          </p>
        </div>
      </div>
    );
  }

  if (loading) return <PageSkeleton />;

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={Gift}
        title="ولاء العملاء"
        description="نقاط الولاء المكتسبة والمستبدلة خلال الفترة"
      />

      {/* Filters */}
      <div className="bg-card p-4 rounded-2xl border shadow-sm flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">من تاريخ</label>
          <DatePickerInput value={dateFrom} onChange={setDateFrom} className="w-40" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground font-medium">إلى تاريخ</label>
          <DatePickerInput value={dateTo} onChange={setDateTo} className="w-40" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDateFrom(firstOfMonth);
              setDateTo(today);
            }}
          >
            هذا الشهر
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const d = new Date();
              setDateFrom(`${d.getFullYear()}-01-01`);
              setDateTo(today);
            }}
          >
            هذه السنة
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setDateFrom("1900-01-01");
              setDateTo(today);
            }}
          >
            كل الوقت
          </Button>
          {(dateFrom !== firstOfMonth || dateTo !== today) && (
            <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1">
              <X className="h-3.5 w-3.5" />
              إعادة
            </Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KpiCard
          icon={TrendingUp}
          label="نقاط مكتسبة"
          value={kpis.earned.toLocaleString()}
          sub={pointValue > 0 ? `≈ ${formatCurrency(round2(kpis.earned * pointValue))}` : ""}
          tone="emerald"
        />
        <KpiCard
          icon={TrendingDown}
          label="نقاط مستبدلة"
          value={kpis.redeemed.toLocaleString()}
          sub={pointValue > 0 ? `≈ ${formatCurrency(round2(kpis.redeemed * pointValue))}` : ""}
          tone="amber"
        />
        <KpiCard
          icon={Calculator}
          label="صافي الفترة"
          value={kpis.net.toLocaleString()}
          sub={pointValue > 0 ? `≈ ${formatCurrency(round2(kpis.net * pointValue))}` : ""}
          tone={kpis.net >= 0 ? "primary" : "rose"}
        />
        <KpiCard
          icon={Users}
          label="عملاء نشطون"
          value={kpis.activeCount.toLocaleString()}
          sub="في الفترة المحددة"
          tone="primary"
        />
      </div>

      {/* Top customers */}
      <div className="bg-card rounded-2xl border shadow-sm">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-bold text-foreground">أعلى العملاء (Top 20)</h3>
          <ExportMenu
            config={{
              filenamePrefix: "loyalty-top-customers",
              sheetName: "Loyalty",
              pdfTitle: "أعلى العملاء بنقاط الولاء",
              headers: ["الكود", "العميل", "مكتسبة", "مستبدلة", "صافي", "الرصيد الحالي"],
              rows: topRows.map((r) => [
                r.code,
                r.name,
                r.earned_in_period,
                r.redeemed_in_period,
                r.net_in_period,
                r.current_balance,
              ]),
              settings,
            }}
          />
        </div>
        <DataTable
          compactRows
          columns={columns}
          data={topRows}
          emptyMessage="لا توجد حركات نقاط في هذه الفترة"
        />
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: any;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "emerald" | "amber" | "rose";
}) {
  const map: Record<string, string> = {
    primary: "bg-primary/10 text-primary",
    emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400",
    rose: "bg-rose-100 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400",
  };
  return (
    <div className="bg-card p-5 rounded-2xl border shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${map[tone]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="text-sm text-muted-foreground font-medium">{label}</div>
      </div>
      <div className="text-2xl font-black font-mono tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1 font-mono">{sub}</div>}
    </div>
  );
}
