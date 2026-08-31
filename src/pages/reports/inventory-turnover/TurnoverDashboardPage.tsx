import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Coins,
  Info,
  PackageX,
  ShoppingCart,
  Undo2,
  Wallet,
  Clock,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import {
  ReconciliationBanner,
  computeReconciliation,
} from "./ReconciliationBanner";
import { DAYS_CONSIDERED_NEW, MetricHelp, fmt } from "./types";
import { ActionBadge } from "@/components/reports/ActionBadge";
import {
  ACTION_ROUTES,
  computeMoneyMap,
  groupByAction,
  topDecisions,
} from "@/lib/turnover/decisions";
import { RULE_EXPLANATIONS } from "@/lib/inventory/definitions";

const ACTION_STYLE: Record<string, { ring: string; text: string; bar: string }> =
  {
    buy_now: {
      ring: "hover:ring-red-400",
      text: "text-red-600 dark:text-red-400",
      bar: "bg-red-500",
    },
    buy_soon: {
      ring: "hover:ring-amber-400",
      text: "text-amber-600 dark:text-amber-400",
      bar: "bg-amber-500",
    },
    supplier_return: {
      ring: "hover:ring-purple-400",
      text: "text-purple-600 dark:text-purple-400",
      bar: "bg-purple-500",
    },
    discount: {
      ring: "hover:ring-orange-400",
      text: "text-orange-600 dark:text-orange-400",
      bar: "bg-orange-500",
    },
    fix_pricing: {
      ring: "hover:ring-rose-400",
      text: "text-rose-600 dark:text-rose-400",
      bar: "bg-rose-500",
    },
    reduce_orders: {
      ring: "hover:ring-yellow-400",
      text: "text-yellow-600 dark:text-yellow-500",
      bar: "bg-yellow-500",
    },
    deactivate: {
      ring: "hover:ring-gray-400",
      text: "text-gray-600 dark:text-gray-300",
      bar: "bg-gray-500",
    },
  };

export default function TurnoverDashboardPage() {
  const {
    kpis,
    eligibleData,
    newProductsCount,
    allProductsNew,
    isLoading,
  } = useTurnoverData();
  const navigate = useNavigate();

  const money = useMemo(
    () => computeMoneyMap(eligibleData, kpis.operationalTotalValue),
    [eligibleData, kpis.operationalTotalValue],
  );
  const groups = useMemo(() => groupByAction(eligibleData), [eligibleData]);
  const top = useMemo(() => topDecisions(eligibleData, 10), [eligibleData]);
  const watchCount = useMemo(
    () =>
      eligibleData.filter((p) => p.recommendedAction === "watch").length +
      newProductsCount,
    [eligibleData, newProductsCount],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={Wallet}
        title="مركز قرارات المخزون"
        description="أين أموالك الآن، وما الذي يجب أن تفعله اليوم — بالترتيب حسب الأثر المالي"
      />

      <TurnoverFilterBar />

      {!isLoading && kpis.shortPeriodWarning && (
        <Card className="border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 shadow-sm">
          <CardContent className="py-2.5 px-4 flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              فترة التقرير أقل من 14 يوم — تم تعطيل مقارنة الفترة السابقة
              لتفادي مؤشرات مضلِّلة.
            </p>
          </CardContent>
        </Card>
      )}

      {!isLoading && (
        <ReconciliationBanner
          data={computeReconciliation(
            kpis.operationalTotalValue,
            kpis.glInventoryBalance,
          )}
        />
      )}

      {allProductsNew && !isLoading ? (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold mb-2">لا توجد بيانات كافية بعد</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              جميع المنتجات جديدة (أقل من {DAYS_CONSIDERED_NEW} يوم). سيبدأ
              التقرير بعرض التوصيات تلقائيًا بعد مرور فترة كافية.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ───────── أين أموالي؟ ───────── */}
          <div>
            <h2 className="text-sm font-bold mb-2 flex items-center gap-1.5">
              أين أموالي الآن؟
              <MetricHelp text={RULE_EXPLANATIONS.WAC} />
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <MoneyCard
                icon={Wallet}
                color="bg-primary"
                label="قيمة المخزون الحالي"
                value={money.inventoryValue}
                note="كمية × تكلفة الوحدة (نفس أساس حساب 1104)"
                isLoading={isLoading}
              />
              <MoneyCard
                icon={Coins}
                color="bg-red-500"
                label="أموال مجمّدة تحتاج قرارًا"
                value={money.frozenCapital}
                note={`${money.frozenPct.toFixed(1)}% من قيمة المخزون`}
                valueClass="text-red-600 dark:text-red-400"
                isLoading={isLoading}
                onClick={() => navigate("/reports/inventory-turnover/dormant")}
              />
              <MoneyCard
                icon={Undo2}
                color="bg-purple-500"
                label="قابل للاسترداد من المورد"
                value={money.recoverable}
                note="أصناف يُقترح إرجاعها بدل تخفيضها"
                valueClass="text-purple-600 dark:text-purple-400"
                isLoading={isLoading}
                onClick={() =>
                  navigate("/reports/inventory-turnover/dormant?tab=return")
                }
              />
              <MoneyCard
                icon={ShoppingCart}
                color="bg-blue-500"
                label="مطلوب إنفاقه لإعادة التخزين"
                value={money.buyNeeded}
                note="تكلفة الأصناف العاجلة فقط"
                valueClass="text-blue-600 dark:text-blue-400"
                isLoading={isLoading}
                onClick={() => navigate("/reports/inventory-turnover/buy-now")}
              />
            </div>
          </div>

          {/* ───────── قرارات اليوم ───────── */}
          <div>
            <h2 className="text-sm font-bold mb-2">ماذا أفعل اليوم؟</h2>
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : groups.length === 0 ? (
              <Card className="border shadow-sm">
                <CardContent className="py-8 text-center">
                  <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm font-semibold">
                    لا توجد إجراءات مطلوبة الآن — مخزونك متوازن
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {groups.map((g) => {
                  const style = ACTION_STYLE[g.action] ?? {
                    ring: "hover:ring-primary",
                    text: "text-foreground",
                    bar: "bg-muted",
                  };
                  return (
                    <button
                      key={g.action}
                      type="button"
                      onClick={() => navigate(ACTION_ROUTES[g.action])}
                      className="text-right"
                    >
                      <Card
                        className={cn(
                          "border shadow-sm overflow-hidden h-full transition hover:ring-2",
                          style.ring,
                        )}
                      >
                        <div className={cn("h-1", style.bar)} />
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <ActionBadge action={g.action} />
                            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
                          </div>
                          <p
                            className={cn(
                              "text-xl font-black tabular-nums truncate",
                              style.text,
                            )}
                          >
                            {fmt(g.moneyImpact)}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            {g.count} صنف
                          </p>
                        </CardContent>
                      </Card>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* ───────── أهم 10 قرارات ───────── */}
          <Card className="border shadow-sm">
            <CardContent className="py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-bold">
                  أهم 10 قرارات بأعلى أثر مالي
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px]"
                  onClick={() =>
                    navigate("/reports/inventory-turnover/analysis")
                  }
                >
                  كل الأصناف
                </Button>
              </div>

              {isLoading ? (
                <div className="space-y-2">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Skeleton key={i} className="h-10 rounded-lg" />
                  ))}
                </div>
              ) : top.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  لا توجد أصناف تستحق قرارًا في هذه الفترة
                </p>
              ) : (
                <div className="divide-y">
                  {top.map((p) => (
                    <button
                      key={p.productId}
                      type="button"
                      onClick={() => navigate(ACTION_ROUTES[p.recommendedAction])}
                      className="w-full text-right py-2.5 flex items-start gap-3 hover:bg-muted/40 rounded-lg px-2 transition"
                    >
                      <span className="text-sm font-black tabular-nums w-24 shrink-0">
                        {fmt(p.moneyImpact)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold truncate">
                          <span className="font-mono text-[10px] text-muted-foreground ml-1">
                            {p.productCode}
                          </span>
                          {p.productName}
                        </span>
                        <span className="block text-[11px] text-muted-foreground leading-5">
                          {p.decisionBasis}
                        </span>
                      </span>
                      <ActionBadge
                        action={p.recommendedAction}
                        className="shrink-0"
                      />
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ───────── تحت المراقبة ───────── */}
          <button
            type="button"
            onClick={() =>
              navigate("/reports/inventory-turnover/under-observation")
            }
            className="w-full text-right"
          >
            <Card className="border shadow-sm hover:ring-2 hover:ring-primary/40 transition">
              <CardContent className="py-3 flex items-center gap-3">
                <PackageX className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground flex-1">
                  {watchCount} صنف تحت المراقبة (جديد أو بلا بيانات كافية) — لا
                  نصدر عليه حكمًا الآن. {RULE_EXPLANATIONS.NEW_PRODUCT_DAYS}
                </p>
                <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
              </CardContent>
            </Card>
          </button>
        </>
      )}
    </div>
  );
}

// ─── بطاقة مالية ─────────────────────────────────────────────────────────────

interface MoneyCardProps {
  icon: typeof Wallet;
  color: string;
  label: string;
  value: number;
  note: string;
  valueClass?: string;
  isLoading?: boolean;
  onClick?: () => void;
}

function MoneyCard({
  icon: Icon,
  color,
  label,
  value,
  note,
  valueClass,
  isLoading,
  onClick,
}: MoneyCardProps) {
  const body = (
    <Card
      className={cn(
        "border shadow-sm overflow-hidden h-full",
        onClick && "transition hover:ring-2 hover:ring-primary/40",
      )}
    >
      <div className={cn("h-1", color)} />
      <CardContent className="pt-3 pb-3">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {isLoading ? (
          <Skeleton className="h-7 w-24" />
        ) : (
          <p
            className={cn(
              "text-xl font-black tabular-nums truncate",
              valueClass,
            )}
          >
            {fmt(value)}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground mt-0.5">{note}</p>
      </CardContent>
    </Card>
  );

  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="text-right">
      {body}
    </button>
  );
}
