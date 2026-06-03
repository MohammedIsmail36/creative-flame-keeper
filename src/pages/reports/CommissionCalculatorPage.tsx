import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calculator, Info, RefreshCw } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/contexts/SettingsContext";
import { cn } from "@/lib/utils";

const LS_KEY = "commission-calc-prefs-v1";

interface Prefs {
  minMargin: number;
  c1: number;
  c2: number;
  c3: number;
}

const defaultPrefs: Prefs = { minMargin: 25, c1: 3, c2: 4, c3: 5 };

function loadPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") };
  } catch {
    return defaultPrefs;
  }
}

function fmtPct(n: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

export default function CommissionCalculatorPage() {
  const { settings, formatCurrency } = useSettings();

  // Period — last 12 months
  const monthOptions = useMemo(() => {
    const arr: { value: string; label: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = subMonths(new Date(), i);
      arr.push({
        value: format(d, "yyyy-MM"),
        label: format(d, "MMM yyyy"),
      });
    }
    return arr;
  }, []);
  const [month, setMonth] = useState(format(new Date(), "yyyy-MM"));

  const { from, to } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1, 1);
    return {
      from: format(startOfMonth(d), "yyyy-MM-dd"),
      to: format(endOfMonth(d), "yyyy-MM-dd"),
    };
  }, [month]);

  // Prefs (tiers + min margin)
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(prefs));
  }, [prefs]);

  // Manual override
  const [manual, setManual] = useState(false);
  const [manualSales, setManualSales] = useState<string>("");
  const [manualMargin, setManualMargin] = useState<string>("");
  const [manualTarget, setManualTarget] = useState<string>("");

  // Pull data — sales (posted), returns (posted), COGS movements
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["commission-data", from, to],
    queryFn: async () => {
      const [invRes, retRes, movRes] = await Promise.all([
        supabase
          .from("sales_invoices")
          .select("id, sales_invoice_items(net_total)")
          .eq("status", "posted")
          .gte("invoice_date", from)
          .lte("invoice_date", to),
        supabase
          .from("sales_returns")
          .select("id, sales_return_items(net_total)")
          .eq("status", "posted")
          .gte("return_date", from)
          .lte("return_date", to),
        supabase
          .from("inventory_movements")
          .select("movement_type, total_cost")
          .in("movement_type", ["sale", "sale_return"])
          .gte("movement_date", from)
          .lte("movement_date", to),
      ]);

      if (invRes.error) throw invRes.error;
      if (retRes.error) throw retRes.error;
      if (movRes.error) throw movRes.error;

      const grossSales = (invRes.data ?? []).reduce(
        (s, inv: any) =>
          s + (inv.sales_invoice_items ?? []).reduce((x: number, it: any) => x + Number(it.net_total || 0), 0),
        0,
      );
      const returns = (retRes.data ?? []).reduce(
        (s, r: any) =>
          s + (r.sales_return_items ?? []).reduce((x: number, it: any) => x + Number(it.net_total || 0), 0),
        0,
      );
      const netSales = grossSales - returns;

      // total_cost is negative for sale (outflow) and positive for sale_return.
      // COGS = -sum(sale) - sum(sale_return) → we use Math.abs of sale minus sale_return positive
      let saleCost = 0;
      let returnCost = 0;
      for (const m of movRes.data ?? []) {
        const v = Math.abs(Number(m.total_cost || 0));
        if (m.movement_type === "sale") saleCost += v;
        else if (m.movement_type === "sale_return") returnCost += v;
      }
      const cogs = saleCost - returnCost;

      return { netSales, cogs };
    },
  });

  const target = manual
    ? parseFloat(manualTarget) || 0
    : Number(settings?.monthly_sales_target || 0);
  const netSales = manual ? parseFloat(manualSales) || 0 : data?.netSales ?? 0;
  const computedMargin =
    netSales > 0 && data ? ((netSales - (data?.cogs ?? 0)) / netSales) * 100 : 0;
  const margin = manual ? parseFloat(manualMargin) || 0 : computedMargin;

  // Calculation
  const achievement = target > 0 ? (netSales / target) * 100 : 0;
  const reachedTarget = achievement >= 100;
  const marginOk = margin >= prefs.minMargin;
  const canEarn = reachedTarget && marginOk && netSales > 0;

  let rate = 0;
  let tierLabel = "—";
  let tierIdx = -1;
  if (canEarn) {
    if (achievement >= 140) { rate = prefs.c3; tierLabel = "140%+"; tierIdx = 2; }
    else if (achievement >= 120) { rate = prefs.c2; tierLabel = "120% – 139%"; tierIdx = 1; }
    else { rate = prefs.c1; tierLabel = "100% – 119%"; tierIdx = 0; }
  }
  const diff = netSales - target;
  const commission = canEarn ? (diff * rate) / 100 : 0;

  const tiers = [
    { idx: 0, range: "100% – 119%", label: "الشريحة الأولى", key: "c1" as const, val: prefs.c1 },
    { idx: 1, range: "120% – 139%", label: "الشريحة الثانية", key: "c2" as const, val: prefs.c2 },
    { idx: 2, range: "140%+", label: "الشريحة الثالثة", key: "c3" as const, val: prefs.c3 },
  ];

  const progressColor =
    achievement >= 120 ? "bg-primary" : achievement >= 100 ? "bg-orange-500" : "bg-destructive";

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={Calculator}
        title="حاسبة عمولة البائع"
        description="احسب عمولة البائع تلقائياً بناءً على نسبة تحقيق الهدف وهامش الربح"
      />

      {/* Period */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">الفترة</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label>الشهر</Label>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {monthOptions.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn("h-4 w-4 ml-2", isFetching && "animate-spin")} />
            تحديث
          </Button>
        </CardContent>
      </Card>

      {/* Auto-pulled data */}
      <Card>
        <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            البيانات الفعلية
            <span className="text-xs font-normal text-muted-foreground inline-flex items-center gap-1">
              <Info className="h-3.5 w-3.5" />
              محسوبة تلقائياً من فواتير الشهر
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="manual" className="text-sm text-muted-foreground">تعديل يدوي</Label>
            <Switch id="manual" checked={manual} onCheckedChange={setManual} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-20 rounded-md" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatBox label="الهدف الشهري" value={formatCurrency(target)}>
                {manual && (
                  <Input
                    type="number"
                    className="mt-2 h-8"
                    value={manualTarget}
                    placeholder={String(settings?.monthly_sales_target ?? 0)}
                    onChange={(e) => setManualTarget(e.target.value)}
                  />
                )}
              </StatBox>
              <StatBox label="صافي المبيعات" value={formatCurrency(netSales)}>
                {manual && (
                  <Input
                    type="number"
                    className="mt-2 h-8"
                    value={manualSales}
                    placeholder={String((data?.netSales ?? 0).toFixed(2))}
                    onChange={(e) => setManualSales(e.target.value)}
                  />
                )}
              </StatBox>
              <StatBox label="هامش الربح" value={fmtPct(margin)}>
                {manual && (
                  <Input
                    type="number"
                    className="mt-2 h-8"
                    value={manualMargin}
                    placeholder={computedMargin.toFixed(1)}
                    onChange={(e) => setManualMargin(e.target.value)}
                  />
                )}
              </StatBox>
              <StatBox label="نسبة الإنجاز" value={fmtPct(achievement)} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Calculator settings */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إعدادات الحاسبة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الحد الأدنى المقبول لهامش الربح %</Label>
              <Input
                type="number"
                value={prefs.minMargin}
                onChange={(e) => setPrefs({ ...prefs, minMargin: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div>
            <div className="text-xs text-muted-foreground mb-2">
              شرائح العمولة — النسبة تُطبَّق على الفرق (المبيعات − الهدف)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {tiers.map((t) => (
                <div
                  key={t.idx}
                  className={cn(
                    "rounded-md border p-3 text-center transition-all",
                    tierIdx === t.idx
                      ? "border-primary bg-primary/10"
                      : "border-border bg-muted/30",
                  )}
                >
                  <div className="text-xs text-muted-foreground">{t.range}</div>
                  <div className="my-2 flex items-baseline justify-center gap-1">
                    <Input
                      type="number"
                      step="0.5"
                      value={t.val}
                      onChange={(e) =>
                        setPrefs({ ...prefs, [t.key]: parseFloat(e.target.value) || 0 })
                      }
                      className="w-16 h-9 text-center text-lg font-medium"
                    />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{t.label}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Result */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">النتيجة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-all", progressColor)}
                style={{ width: `${Math.min(achievement / 2, 100)}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1.5 text-left">
              {fmtPct(achievement)} من الهدف
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatBox label="نسبة الإنجاز" value={fmtPct(achievement)} />
            <StatBox
              label="الشريحة المطبّقة"
              value={canEarn ? tierLabel : reachedTarget ? "—" : "لم يُبلَغ الهدف"}
            />
            <StatBox
              label="العمولة الإجمالية"
              value={formatCurrency(commission)}
              valueClassName={commission > 0 ? "text-primary" : "text-destructive"}
            />
          </div>

          {canEarn && diff > 0 && (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
              الفرق:{" "}
              <span className="text-foreground font-medium">
                {formatCurrency(netSales)} − {formatCurrency(target)} = {formatCurrency(diff)}
              </span>{" "}
              &nbsp;×&nbsp; نسبة الشريحة{" "}
              <span className="text-foreground font-medium">{rate}%</span>{" "}
              &nbsp;=&nbsp;{" "}
              <span className="text-foreground font-medium">{formatCurrency(commission)}</span>
            </div>
          )}

          {netSales === 0 && !isLoading && (
            <Alert variant="destructive">
              <AlertDescription>لا توجد مبيعات مسجّلة خلال الفترة المحددة.</AlertDescription>
            </Alert>
          )}
          {netSales > 0 && !reachedTarget && (
            <Alert variant="destructive">
              <AlertDescription>لم يتم بلوغ الهدف — لا تُصرف أي عمولة.</AlertDescription>
            </Alert>
          )}
          {reachedTarget && !marginOk && netSales > 0 && (
            <Alert>
              <AlertDescription>
                هامش الربح ({fmtPct(margin)}) أقل من الحد الأدنى ({fmtPct(prefs.minMargin)}) —
                تم إلغاء العمولة.
              </AlertDescription>
            </Alert>
          )}

          {target <= 0 && (
            <Alert>
              <AlertDescription>
                لم يتم تحديد الهدف الشهري في الإعدادات. يمكنك تعيينه من{" "}
                <strong>الإعدادات</strong> أو استخدام التعديل اليدوي.
              </AlertDescription>
            </Alert>
          )}

          {/* Breakdown */}
          <div>
            <div className="text-xs text-muted-foreground mb-2">تفصيل الحساب</div>
            <div className="rounded-md border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">البند</TableHead>
                    <TableHead className="text-right">القيمة</TableHead>
                    <TableHead className="text-right">النسبة</TableHead>
                    <TableHead className="text-right">العمولة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {canEarn && diff > 0 ? (
                    <>
                      <TableRow>
                        <TableCell>إجمالي المبيعات</TableCell>
                        <TableCell>{formatCurrency(netSales)}</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>الهدف المطلوب</TableCell>
                        <TableCell>{formatCurrency(target)}</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                      <TableRow className="bg-primary/5 font-medium">
                        <TableCell>الفرق الخاضع للعمولة</TableCell>
                        <TableCell>{formatCurrency(diff)}</TableCell>
                        <TableCell>{rate}%</TableCell>
                        <TableCell>{formatCurrency(commission)}</TableCell>
                      </TableRow>
                    </>
                  ) : (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                        لا توجد عمولة لعرض تفصيلها
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({
  label,
  value,
  valueClassName,
  children,
}: {
  label: string;
  value: string;
  valueClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 text-center">
      <div className="text-xs text-muted-foreground mb-1">{label}</div>
      <div className={cn("text-lg font-semibold text-foreground", valueClassName)}>{value}</div>
      {children}
    </div>
  );
}
