import { useMemo } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, ChangeIndicator, MetricHelp } from "./types";

export interface TurnoverKPIValues {
  avgTurnover: number;
  stagnantVal: number;
  urgentBuy: number;
  classACount: number;
  classAPct: number;
  turnoverChange: number | null;
  stagnantChange: number | null;
  belowMinCount: number;
  totalSuggestedCost: number;
  inactiveStockValue: number;
  supplierReturnValue: number;
}

interface TurnoverKPIsProps {
  kpis: TurnoverKPIValues;
  isLoading: boolean;
}

export function TurnoverKPIs({ kpis, isLoading }: TurnoverKPIsProps) {
  return (
    <>
      {/* ── Row 1: Core KPIs ────────────────────────────────────────── */}
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
              <MetricHelp text="متوسط عدد مرات تجديد المخزون عبر المنتجات خلال الفترة المحددة." />
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
              <MetricHelp text="إجمالي قيمة المنتجات الراكدة بالجنيه المصري. ↓ الانخفاض هنا إيجابي." />
            </div>
          </CardContent>
        </Card>

        {/* Urgent Buy */}
        <Card
          className={cn(
            "border shadow-sm overflow-hidden",
            kpis.urgentBuy > 0 && "ring-1 ring-red-500/30",
          )}
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

      {/* ── Row 2: Extended KPIs ────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Below Min Stock */}
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
                  kpis.belowMinCount > 0 ? "text-amber-600" : "text-foreground",
                )}
              >
                {kpis.belowMinCount}
              </p>
            )}
            <div className="flex items-center gap-1">
              <p className="text-xs text-muted-foreground">تحت الحد الأدنى</p>
              <MetricHelp text="منتجات مخزونها أقل من الحد الأدنى المحدد لنقطة إعادة الطلب." />
            </div>
          </CardContent>
        </Card>

        {/* Suggested Purchase Cost */}
        <Card className="border shadow-sm overflow-hidden">
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

        {/* Inactive Stock Value */}
        <Card className="border shadow-sm overflow-hidden">
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
                  kpis.inactiveStockValue > 0 ? "bg-gray-500/10" : "bg-muted",
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
              <MetricHelp text="قيمة المخزون المحتجز في منتجات تم إيقافها (غير نشطة)." />
            </div>
          </CardContent>
        </Card>

        {/* Supplier Return Value */}
        <Card className="border shadow-sm overflow-hidden">
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
              <MetricHelp text="قيمة المخزون الراكد المقترح إرجاعه واستبداله بمنتجات أخرى." />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
