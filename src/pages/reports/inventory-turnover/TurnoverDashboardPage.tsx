import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  Ban,
  Undo2,
  Clock,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import {
  ReconciliationBanner,
  computeReconciliation,
} from "./ReconciliationBanner";
import {
  MATRIX_DECISIONS,
  DAYS_CONSIDERED_NEW,
  ChangeIndicator,
  MetricHelp,
  fmt,
  getTurnoverSpeed,
} from "./types";
import { useNavigate } from "react-router-dom";

export default function TurnoverDashboardPage() {
  const {
    kpis,
    matrixCounts,
    pieData,
    newProductsCount,
    allProductsNew,
    eligibleData,
    isLoading,
    alerts,
  } = useTurnoverData();
  const navigate = useNavigate();

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={TrendingUp}
        title="لوحة مؤشرات دوران المخزون"
        description="نظرة عامة على مؤشرات الأداء الرئيسية ومصفوفة القرار"
      />

      <TurnoverFilterBar />

      {/* H14 — تحذير فترة قصيرة (مقارنة الفترة السابقة قد لا تكون موثوقة) */}
      {!isLoading && kpis.shortPeriodWarning && (
        <Card className="border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/5 shadow-sm">
          <CardContent className="py-2.5 px-4 flex items-center gap-2">
            <Info className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-800 dark:text-amber-300">
              فترة التقرير أقل من 14 يوم — تم تعطيل مقارنة الفترة السابقة لتفادي مؤشرات مضلِّلة.
            </p>
          </CardContent>
        </Card>
      )}

      {/* شريط التطابق المحاسبي مع GL لحساب 1104 — مطابق لـ InventoryReport */}
      {!isLoading && (
        <ReconciliationBanner
          data={computeReconciliation(
            kpis.operationalTotalValue,
            kpis.glInventoryBalance,
          )}
        />
      )}

      {allProductsNew && !isLoading && (
        <Card className="border shadow-sm">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <Clock className="w-7 h-7 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-bold text-foreground mb-2">
              لا توجد بيانات كافية بعد
            </h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              جميع المنتجات جديدة (أقل من {DAYS_CONSIDERED_NEW} يوم). سيبدأ
              التقرير بعرض التحليل تلقائياً بعد مرور فترة كافية.
            </p>
          </CardContent>
        </Card>
      )}

      {!allProductsNew && (
        <>
          {/* KPI Row 1 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Average Turnover */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="h-1 bg-primary/60" />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="w-4 h-4 text-primary" />
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <ChangeIndicator value={kpis.turnoverChange} />
                  )}
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-20 mb-1" />
                ) : (
                  <p className="text-3xl font-black tabular-nums text-foreground leading-none mb-1">
                    {kpis.avgTurnover.toFixed(2)}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    متوسط معدل الدوران
                  </p>
                  <MetricHelp text="متوسط عدد مرات تجديد المخزون عبر المنتجات خلال الفترة." />
                </div>
              </CardContent>
            </Card>

            {/* Stagnant Value */}
            <Card className="border shadow-sm overflow-hidden">
              <div
                className={cn(
                  "h-1",
                  kpis.stagnantVal > 10000
                    ? "bg-red-500"
                    : kpis.stagnantVal > 5000
                      ? "bg-amber-500"
                      : "bg-muted",
                )}
              />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center",
                      kpis.stagnantVal > 10000
                        ? "bg-red-500/10"
                        : kpis.stagnantVal > 5000
                          ? "bg-amber-500/10"
                          : "bg-muted",
                    )}
                  >
                    <DollarSign
                      className={cn(
                        "w-4 h-4",
                        kpis.stagnantVal > 10000
                          ? "text-red-500"
                          : kpis.stagnantVal > 5000
                            ? "text-amber-500"
                            : "text-muted-foreground",
                      )}
                    />
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <ChangeIndicator value={kpis.stagnantChange} inverted />
                  )}
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mb-1" />
                ) : (
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none mb-1 truncate">
                    {fmt(kpis.stagnantVal)}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    قيمة المخزون الراكد
                  </p>
                  <MetricHelp text="إجمالي قيمة المنتجات الراكدة. ↓ الانخفاض إيجابي." />
                </div>
              </CardContent>
            </Card>

            {/* Urgent Buy */}
            <Card
              className={cn(
                "border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow",
                kpis.urgentBuy > 0 && "ring-1 ring-red-500/30",
              )}
              onClick={() =>
                navigate("/reports/inventory-turnover/urgent-actions")
              }
            >
              <div
                className={cn(
                  "h-1",
                  kpis.urgentBuy > 0 ? "bg-red-500" : "bg-muted",
                )}
              />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center",
                      kpis.urgentBuy > 0 ? "bg-red-500/10" : "bg-muted",
                    )}
                  >
                    <ShoppingCart
                      className={cn(
                        "w-4 h-4",
                        kpis.urgentBuy > 0
                          ? "text-red-500"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                  {kpis.urgentBuy > 0 && (
                    <span className="text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-1.5 py-0.5 rounded-full animate-pulse">
                      عاجل
                    </span>
                  )}
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mb-1" />
                ) : (
                  <p
                    className={cn(
                      "text-3xl font-black tabular-nums leading-none mb-1",
                      kpis.urgentBuy > 0
                        ? "text-red-600 dark:text-red-400"
                        : "text-foreground",
                    )}
                  >
                    {kpis.urgentBuy}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    أصناف تحتاج شراء عاجل
                  </p>
                  <MetricHelp text="منتجات تغطيتها أقل من 15 يوم من فئة A أو B." />
                </div>
              </CardContent>
            </Card>

            {/* Class A */}
            <Card className="border shadow-sm overflow-hidden">
              <div className="h-1 bg-emerald-500/60" />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <Package className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                    {kpis.classAPct.toFixed(0)}% إيراد
                  </span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mb-1" />
                ) : (
                  <p className="text-3xl font-black tabular-nums text-foreground leading-none mb-1">
                    {kpis.classACount}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">أصناف فئة A</p>
                  <MetricHelp text="المنتجات التي تولد 80% من إجمالي الإيرادات." />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* KPI Row 2 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Below Min */}
            <Card
              className={cn(
                "border shadow-sm overflow-hidden",
                kpis.belowMinCount > 0 && "ring-1 ring-amber-500/30",
              )}
            >
              <div
                className={cn(
                  "h-1",
                  kpis.belowMinCount > 0 ? "bg-amber-500" : "bg-muted",
                )}
              />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center",
                      kpis.belowMinCount > 0 ? "bg-amber-500/10" : "bg-muted",
                    )}
                  >
                    <TrendingDown
                      className={cn(
                        "w-4 h-4",
                        kpis.belowMinCount > 0
                          ? "text-amber-500"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mb-1" />
                ) : (
                  <p
                    className={cn(
                      "text-3xl font-black tabular-nums leading-none mb-1",
                      kpis.belowMinCount > 0
                        ? "text-amber-600"
                        : "text-foreground",
                    )}
                  >
                    {kpis.belowMinCount}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    تحت الحد الأدنى
                  </p>
                  <MetricHelp text="منتجات مخزونها أقل من الحد الأدنى المحدد." />
                </div>
              </CardContent>
            </Card>

            {/* Suggested Cost */}
            <Card
              className="border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() =>
                navigate("/reports/inventory-turnover/purchase-planning")
              }
            >
              <div
                className={cn(
                  "h-1",
                  kpis.totalSuggestedCost > 0 ? "bg-blue-500" : "bg-muted",
                )}
              />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <ShoppingCart className="w-4 h-4 text-blue-600" />
                  </div>
                  <span className="text-[10px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
                    30 يوم
                  </span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mb-1" />
                ) : (
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none mb-1 truncate">
                    {fmt(kpis.totalSuggestedCost)}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    تكلفة الشراء المقترح
                  </p>
                  <MetricHelp text="إجمالي التكلفة المتوقعة لشراء الكميات المقترحة لتغطية 30 يوم." />
                </div>
              </CardContent>
            </Card>

            {/* Inactive Value */}
            <Card
              className="border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => navigate("/reports/inventory-turnover/dormant")}
            >
              <div
                className={cn(
                  "h-1",
                  kpis.inactiveStockValue > 0 ? "bg-gray-500" : "bg-muted",
                )}
              />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center",
                      kpis.inactiveStockValue > 0
                        ? "bg-gray-500/10"
                        : "bg-muted",
                    )}
                  >
                    <Ban
                      className={cn(
                        "w-4 h-4",
                        kpis.inactiveStockValue > 0
                          ? "text-gray-600"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mb-1" />
                ) : (
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none mb-1 truncate">
                    {kpis.inactiveStockValue > 0
                      ? fmt(kpis.inactiveStockValue)
                      : "0"}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    مخزون غير نشط مجمّد
                  </p>
                  <MetricHelp text="قيمة المخزون المحتجز في منتجات تم إيقافها." />
                </div>
              </CardContent>
            </Card>

            {/* Supplier Return */}
            <Card
              className="border shadow-sm overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
              onClick={() =>
                navigate("/reports/inventory-turnover/supplier-returns")
              }
            >
              <div
                className={cn(
                  "h-1",
                  kpis.supplierReturnValue > 0 ? "bg-purple-500" : "bg-muted",
                )}
              />
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div
                    className={cn(
                      "w-9 h-9 rounded-xl flex items-center justify-center",
                      kpis.supplierReturnValue > 0
                        ? "bg-purple-500/10"
                        : "bg-muted",
                    )}
                  >
                    <Undo2
                      className={cn(
                        "w-4 h-4",
                        kpis.supplierReturnValue > 0
                          ? "text-purple-600"
                          : "text-muted-foreground",
                      )}
                    />
                  </div>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mb-1" />
                ) : (
                  <p className="text-2xl font-black tabular-nums text-foreground leading-none mb-1 truncate">
                    {kpis.supplierReturnValue > 0
                      ? fmt(kpis.supplierReturnValue)
                      : "0"}
                  </p>
                )}
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground">
                    مقترح إرجاعه للمورد
                  </p>
                  <MetricHelp text="قيمة المخزون الراكد المقترح إرجاعه واستبداله." />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <button
              onClick={() =>
                navigate("/reports/inventory-turnover/urgent-actions")
              }
              className="text-right rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5 p-3 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-black text-red-600 dark:text-red-400">
                {alerts.urgent.length}
              </p>
              <p className="text-xs text-red-600/80">إجراء فوري مطلوب</p>
            </button>
            <button
              onClick={() =>
                navigate("/reports/inventory-turnover/purchase-planning")
              }
              className="text-right rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-3 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400">
                {alerts.followup.length}
              </p>
              <p className="text-xs text-amber-600/80">يحتاج متابعة</p>
            </button>
            <button
              onClick={() =>
                navigate("/reports/inventory-turnover/new-products")
              }
              className="text-right rounded-xl border border-muted bg-muted/30 p-3 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-black text-foreground">
                {newProductsCount}
              </p>
              <p className="text-xs text-muted-foreground">
                منتج جديد تحت الاختبار
              </p>
            </button>
            <button
              onClick={() => navigate("/reports/inventory-turnover/analysis")}
              className="text-right rounded-xl border border-primary/20 bg-primary/5 p-3 hover:shadow-md transition-shadow"
            >
              <p className="text-2xl font-black text-primary">
                {eligibleData.length}
              </p>
              <p className="text-xs text-primary/70">إجمالي المنتجات المحللة</p>
            </button>
          </div>

          {/* Decision Matrix + Pie side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Matrix */}
            <Card className="border shadow-sm">
              <CardContent className="py-4 px-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground">
                    مصفوفة القرار
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    ABC × معدل الدوران
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-separate border-spacing-1">
                    <thead>
                      <tr>
                        <th className="w-10" />
                        <th className="pb-1">
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            سريع ↑
                          </span>
                        </th>
                        <th className="pb-1">
                          <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                            متوسط
                          </span>
                        </th>
                        <th className="pb-1">
                          <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
                            بطيء ↓
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["A", "B", "C"] as const).map((abc) => (
                        <tr key={abc}>
                          <td className="py-1">
                            <span
                              className={cn(
                                "inline-block w-7 h-7 rounded-lg text-xs font-black leading-7 text-center",
                                abc === "A"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                  : abc === "B"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {abc}
                            </span>
                          </td>
                          {(["fast", "medium", "slow"] as const).map(
                            (speed) => {
                              const key = `${abc}-${speed}`;
                              const count = matrixCounts[key] || 0;
                              const decision = MATRIX_DECISIONS[key];
                              return (
                                <td key={key} className="py-1">
                                  <button
                                    onClick={() =>
                                      count > 0 &&
                                      navigate(
                                        `/reports/inventory-turnover/analysis?matrix=${key}`,
                                      )
                                    }
                                    className={cn(
                                      "w-full rounded-xl border transition-all duration-150 px-2 py-2 text-center",
                                      decision.bg,
                                      decision.border,
                                      count > 0
                                        ? "hover:scale-102 hover:shadow-sm cursor-pointer"
                                        : "opacity-70",
                                    )}
                                  >
                                    <div className="text-base leading-none mb-1">
                                      {decision.icon}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground leading-tight mb-0.5">
                                      {decision.text}
                                    </div>
                                    <div
                                      className={cn(
                                        "text-xs font-black",
                                        count > 0
                                          ? "text-foreground"
                                          : "text-muted-foreground",
                                      )}
                                    >
                                      {count}
                                    </div>
                                  </button>
                                </td>
                              );
                            },
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {newProductsCount > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-3 text-center flex items-center justify-center gap-1">
                    <Info className="h-3 w-3" />
                    لا تشمل {newProductsCount} منتج جديد (أقل من{" "}
                    {DAYS_CONSIDERED_NEW} يوم)
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Pie Chart */}
            {pieData.length > 0 && (
              <Card className="border shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-foreground">
                      توزيع فئات الدوران بالقيمة المالية
                    </h3>
                    {newProductsCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">
                        يشمل {newProductsCount} منتج جديد
                      </span>
                    )}
                  </div>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={35}
                          paddingAngle={2}
                          label={({ name, percent }) =>
                            percent > 0.05
                              ? `${name} ${(percent * 100).toFixed(0)}%`
                              : ""
                          }
                          labelLine={false}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <RTooltip
                          formatter={(value: number) => [fmt(value), "القيمة"]}
                          contentStyle={{
                            fontSize: "12px",
                            direction: "rtl",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: "12px", direction: "rtl" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
