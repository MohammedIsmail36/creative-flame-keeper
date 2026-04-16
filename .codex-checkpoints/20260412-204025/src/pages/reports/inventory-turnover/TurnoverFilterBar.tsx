import { ReactNode, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CategoryTreeSelect } from "@/components/CategoryTreeSelect";
import { DatePickerInput } from "@/components/DatePickerInput";
import { ExportMenu, ExportConfig } from "@/components/ExportMenu";
import { BarChart2, RotateCcw } from "lucide-react";
import { format, subDays } from "date-fns";
import { useTurnoverData } from "./TurnoverDataContext";

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
  } = useTurnoverData();

  const defaultDateFrom = useMemo(
    () => format(subDays(new Date(), 30), "yyyy-MM-dd"),
    [],
  );
  const defaultDateTo = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const hasActiveFilters =
    categoryFilter !== "all" ||
    dateFrom !== defaultDateFrom ||
    dateTo !== defaultDateTo;

  const handleClearFilters = () => {
    setCategoryFilter("all");
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
  };

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
              <ExportMenu config={exportConfig} disabled={isLoading} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
