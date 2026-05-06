import { ReactNode, Suspense, lazy, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CategoryTreeSelect } from "@/components/CategoryTreeSelect";
import { DatePickerInput } from "@/components/DatePickerInput";
import { BarChart2, RotateCcw, CalendarClock, Info } from "lucide-react";
import { format, subDays } from "date-fns";
import { useTurnoverData } from "./TurnoverDataContext";
import type { ExportConfig } from "@/components/ExportMenu";

const LazyExportMenu = lazy(() =>
  import("@/components/ExportMenu").then((module) => ({
    default: module.ExportMenu,
  })),
);

interface TurnoverFilterBarProps {
  children?: ReactNode;
  exportConfig?: ExportConfig;
}

export function TurnoverFilterBar({
  children,
  exportConfig,
}: TurnoverFilterBarProps) {
  const {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    categoryFilter,
    setCategoryFilter,
    categories,
    isLoading,
    lastActivityDate,
    isPeriodAutoAligned,
    resetPeriodToLastActivity,
  } = useTurnoverData();

  // Default period = last 30 days ending at last activity date (fallback to today)
  const { defaultDateFrom, defaultDateTo } = useMemo(() => {
    const anchor = lastActivityDate ? new Date(lastActivityDate) : new Date();
    return {
      defaultDateFrom: format(subDays(anchor, 30), "yyyy-MM-dd"),
      defaultDateTo: format(anchor, "yyyy-MM-dd"),
    };
  }, [lastActivityDate]);

  const hasActiveFilters =
    categoryFilter !== "all" ||
    dateFrom !== defaultDateFrom ||
    dateTo !== defaultDateTo;

  const handleClearFilters = () => {
    setCategoryFilter("all");
    if (lastActivityDate) {
      resetPeriodToLastActivity();
    } else {
      setDateFrom(defaultDateFrom);
      setDateTo(defaultDateTo);
    }
  };

  // Stale-data warning: last activity > 14 days before "today"
  const staleDaysGap = useMemo(() => {
    if (!lastActivityDate) return 0;
    const diff = Math.floor(
      (Date.now() - new Date(lastActivityDate).getTime()) / 86400000,
    );
    return diff;
  }, [lastActivityDate]);
  const showStaleWarning = staleDaysGap > 14;

  return (
    <Card className="border shadow-sm">
      <CardContent className="py-3 px-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
            <BarChart2 className="h-3.5 w-3.5" />
            <span>الفترة:</span>
          </div>
          <DatePickerInput
            value={dateFrom}
            onChange={setDateFrom}
            placeholder="من"
            className="w-36 h-9"
          />
          <span className="text-muted-foreground text-xs">—</span>
          <DatePickerInput
            value={dateTo}
            onChange={setDateTo}
            placeholder="إلى"
            className="w-36 h-9"
          />

          {lastActivityDate && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge
                    variant="secondary"
                    className={
                      showStaleWarning
                        ? "h-9 gap-1.5 px-2.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300/60 cursor-help"
                        : "h-9 gap-1.5 px-2.5 text-xs bg-muted text-muted-foreground cursor-help"
                    }
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    آخر نشاط: {lastActivityDate}
                    {isPeriodAutoAligned && (
                      <span className="text-[10px] font-normal opacity-80">
                        (تمت المحاذاة)
                      </span>
                    )}
                    <Info className="h-3 w-3 opacity-70" />
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                  {showStaleWarning ? (
                    <>
                      آخر فاتورة مبيعات مسجَّلة بتاريخ <b>{lastActivityDate}</b> (قبل {staleDaysGap} يوم).
                      <br />
                      تم ضبط نهاية الفترة افتراضياً عند هذا التاريخ لتجنب ظهور كل المخزون كـ "راكد" بسبب فجوة بدون مبيعات.
                    </>
                  ) : (
                    <>
                      آخر فاتورة مبيعات مسجَّلة بتاريخ <b>{lastActivityDate}</b>.
                      <br />
                      الفترة الافتراضية تنتهي عند هذا التاريخ لضمان قراءة سليمة لمعدلات الدوران.
                    </>
                  )}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          <div className="w-px h-5 bg-border mx-1" />
          <CategoryTreeSelect
            categories={categories}
            value={categoryFilter}
            onValueChange={setCategoryFilter}
            placeholder="كافة التصنيفات"
            className="w-44"
          />

          {children}

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 px-2.5 text-xs text-muted-foreground hover:text-foreground gap-1.5"
              onClick={handleClearFilters}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              مسح الفلاتر
            </Button>
          )}

          {exportConfig && (
            <div className="mr-auto">
              <Suspense
                fallback={
                  <Button
                    variant="outline"
                    className="gap-1.5 shadow-sm"
                    disabled
                  >
                    تصدير
                  </Button>
                }
              >
                <LazyExportMenu config={exportConfig} disabled={isLoading} />
              </Suspense>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
