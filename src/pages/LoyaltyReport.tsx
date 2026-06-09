import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { PageSkeleton } from "@/components/PageSkeleton";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { useUserRole } from "@/hooks/use-user-role";
import {
  Gift,
  TrendingUp,
  TrendingDown,
  Users,
  Calculator,
  X,
  ArrowUp,
  ArrowDown,
  Settings2,
  Trophy,
  Medal,
  Award,
} from "lucide-react";
import { round2, cn } from "@/lib/utils";
import { aggregateByCustomer, aggregateTotals } from "@/lib/loyalty-aggregation";
import { ExportMenu } from "@/components/ExportMenu";
import { toast } from "@/hooks/use-toast";

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

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function LoyaltyReport() {
  const { settings, formatCurrency } = useSettings();
  const { data: role } = useUserRole();
  const isAdmin = role === "admin";
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
      else if (t.type === "cancel_earn") earned -= Math.abs(t.points);
      else if (t.type === "cancel_redeem") redeemed -= Math.abs(t.points);
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
      } else if (t.type === "cancel_earn") {
        cur.earned -= Math.abs(t.points);
      } else if (t.type === "cancel_redeem") {
        cur.redeemed -= Math.abs(t.points);
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

  const maxEarned = useMemo(
    () => Math.max(1, ...topRows.map((r) => r.earned_in_period)),
    [topRows],
  );

  async function applyAdjustment(
    customer: TopRow,
    delta: number,
    reason: string,
  ): Promise<boolean> {
    if (!delta || isNaN(delta)) return false;
    const newBalance = (customer.current_balance || 0) + delta;
    if (newBalance < 0) {
      toast({
        title: "غير مسموح",
        description: "الرصيد الناتج سيكون سالباً",
        variant: "destructive",
      });
      return false;
    }
    try {
      const { error: txErr } = await (supabase.from("loyalty_transactions") as any).insert({
        customer_id: customer.id,
        points: delta,
        type: "manual_adjust",
        transaction_date: today,
        notes: reason || "تعديل يدوي",
      });
      if (txErr) throw txErr;
      const { error: cErr } = await (supabase.from("customers") as any)
        .update({ loyalty_points: newBalance })
        .eq("id", customer.id);
      if (cErr) throw cErr;
      toast({
        title: "تم التعديل",
        description: `${customer.name}: ${delta > 0 ? "+" : ""}${delta} نقطة`,
      });
      await load();
      return true;
    } catch (e: any) {
      toast({ title: "خطأ", description: e.message, variant: "destructive" });
      return false;
    }
  }

  const columns: ColumnDef<TopRow, any>[] = [
    {
      id: "rank",
      header: "#",
      cell: ({ row }) => {
        const idx = row.index;
        const rank = idx + 1;
        if (rank === 1)
          return (
            <div className="h-7 w-7 rounded-full bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 flex items-center justify-center">
              <Trophy className="h-3.5 w-3.5" />
            </div>
          );
        if (rank === 2)
          return (
            <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <Medal className="h-3.5 w-3.5" />
            </div>
          );
        if (rank === 3)
          return (
            <div className="h-7 w-7 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 flex items-center justify-center">
              <Award className="h-3.5 w-3.5" />
            </div>
          );
        return (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {String(rank).padStart(2, "0")}
          </span>
        );
      },
    },
    {
      accessorKey: "name",
      header: "العميل",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0">
            {initials(row.original.name)}
          </div>
          <div className="min-w-0">
            <div className="font-medium text-foreground truncate">{row.original.name}</div>
            <div className="text-[11px] font-mono text-muted-foreground">{row.original.code}</div>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "earned_in_period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="مكتسبة" />,
      cell: ({ row }) => {
        const v = row.original.earned_in_period;
        const pct = Math.round((v / maxEarned) * 100);
        return (
          <div className="space-y-1 min-w-[110px]">
            <div className="flex items-center gap-1.5">
              <ArrowUp className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                {v.toLocaleString()}
              </span>
            </div>
            <div className="h-1 w-full rounded-full bg-emerald-100 dark:bg-emerald-950/40 overflow-hidden">
              <div
                className="h-full bg-emerald-500 dark:bg-emerald-400 rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: "redeemed_in_period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="مستبدلة" />,
      cell: ({ row }) => {
        const v = row.original.redeemed_in_period;
        if (v === 0)
          return <span className="text-xs text-muted-foreground/50">—</span>;
        return (
          <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40">
            <ArrowDown className="h-3 w-3" />
            <span className="font-mono tabular-nums text-sm font-semibold">
              {v.toLocaleString()}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "net_in_period",
      header: ({ column }) => <DataTableColumnHeader column={column} title="صافي" />,
      cell: ({ row }) => {
        const v = row.original.net_in_period;
        return (
          <span
            className={cn(
              "font-mono tabular-nums font-semibold text-sm",
              v >= 0 ? "text-foreground" : "text-rose-600 dark:text-rose-400",
            )}
          >
            {v >= 0 ? "+" : ""}
            {v.toLocaleString()}
          </span>
        );
      },
    },
    {
      accessorKey: "current_balance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الرصيد الحالي" />,
      cell: ({ row }) => (
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-mono tabular-nums text-base font-bold text-foreground">
              {row.original.current_balance.toLocaleString()}
            </span>
            <span className="text-[10px] text-muted-foreground font-medium">نقطة</span>
          </div>
          {pointValue > 0 && (
            <div className="text-[11px] text-muted-foreground font-mono">
              ≈ {formatCurrency(round2(row.original.current_balance * pointValue))}
            </div>
          )}
        </div>
      ),
    },
    ...(isAdmin
      ? [
          {
            id: "actions",
            header: "",
            cell: ({ row }: any) => <AdjustPopover customer={row.original} onApply={applyAdjustment} />,
          } as ColumnDef<TopRow, any>,
        ]
      : []),
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
      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Trophy className="h-4 w-4" />
            </div>
            <div>
              <h3 className="font-bold text-foreground leading-tight">أعلى العملاء</h3>
              <p className="text-[11px] text-muted-foreground">Top 20 خلال الفترة المحددة</p>
            </div>
          </div>
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
        <div className="p-4">
          <DataTable
            columns={columns}
            data={topRows}
            emptyMessage="لا توجد حركات نقاط في هذه الفترة"
            showSearch={false}
            showColumnToggle={false}
            showPagination={false}
          />
        </div>
      </div>
    </div>
  );
}

function AdjustPopover({
  customer,
  onApply,
}: {
  customer: TopRow;
  onApply: (c: TopRow, delta: number, reason: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "sub">("add");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const amt = parseInt(amount, 10);
  const valid = !isNaN(amt) && amt > 0;
  const delta = mode === "add" ? amt : -amt;
  const newBalance = customer.current_balance + (valid ? delta : 0);
  const willBeNegative = valid && newBalance < 0;

  async function handleSave() {
    if (!valid || willBeNegative) return;
    setSaving(true);
    const ok = await onApply(customer, delta, reason.trim());
    setSaving(false);
    if (ok) {
      setOpen(false);
      setAmount("");
      setReason("");
      setMode("add");
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="تعديل النقاط">
          <Settings2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-3" dir="rtl">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold">تعديل يدوي للنقاط</p>
          <p className="text-[11px] text-muted-foreground">
            الرصيد الحالي: <span className="font-mono font-bold">{customer.current_balance}</span> نقطة
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => setMode("add")}
            className={cn(
              "py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1",
              mode === "add"
                ? "bg-emerald-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowUp className="h-3 w-3" /> إضافة
          </button>
          <button
            type="button"
            onClick={() => setMode("sub")}
            className={cn(
              "py-1.5 text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-1",
              mode === "sub"
                ? "bg-amber-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <ArrowDown className="h-3 w-3" /> خصم
          </button>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground font-medium">عدد النقاط</label>
          <Input
            type="number"
            min={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="مثال: 50"
            className="h-9 font-mono"
            error={willBeNegative}
          />
          {willBeNegative && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              الرصيد الناتج سيكون سالباً
            </p>
          )}
          {valid && !willBeNegative && (
            <p className="text-[11px] text-muted-foreground">
              الرصيد بعد التعديل:{" "}
              <span className="font-mono font-semibold text-foreground">{newBalance}</span>
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] text-muted-foreground font-medium">السبب (اختياري)</label>
          <Input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: تسوية، خطأ، حملة..."
            className="h-9"
            maxLength={120}
          />
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1"
            disabled={!valid || willBeNegative || saving}
            onClick={handleSave}
          >
            {saving ? "جارٍ الحفظ..." : "حفظ"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            إلغاء
          </Button>
        </div>
      </PopoverContent>
    </Popover>
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
