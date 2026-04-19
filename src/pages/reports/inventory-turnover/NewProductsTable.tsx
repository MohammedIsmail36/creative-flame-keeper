import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu, type ExportConfig } from "@/components/ExportMenu";
import { ColumnDef } from "@tanstack/react-table";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanySettings } from "@/contexts/SettingsContext";
import { ProductTurnoverData, fmt, fmtInt, DAYS_CONSIDERED_NEW } from "./types";

interface NewProductsTableProps {
  data: ProductTurnoverData[];
  settings: CompanySettings | null;
  isLoading?: boolean;
}

export function NewProductsTable({
  data,
  settings,
  isLoading,
}: NewProductsTableProps) {
  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
    () => [
      {
        accessorKey: "productCode",
        header: "الكود",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "productName",
        header: "المنتج",
        cell: ({ getValue }) => (
          <span className="font-medium text-sm">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "categoryName",
        header: "التصنيف",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ getValue }) => (
          <span className="tabular-nums font-semibold text-sm">
            {fmtInt(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "stockValue",
        header: "القيمة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span className="tabular-nums font-mono text-xs">{fmt(v)}</span>
          );
        },
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        id: "daysElapsed",
        header: "الأيام المنقضية",
        accessorFn: (row) => Math.min(row.effectiveAge, DAYS_CONSIDERED_NEW),
        cell: ({ getValue }) => (
          <span className="tabular-nums text-sm">
            {getValue() as number} يوم
          </span>
        ),
      },
      {
        id: "daysRemaining",
        header: "المتبقي",
        accessorFn: (row) =>
          Math.max(
            0,
            DAYS_CONSIDERED_NEW -
              Math.min(row.effectiveAge, DAYS_CONSIDERED_NEW),
          ),
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <Badge variant="secondary" className="text-[10px]">
              {v > 0 ? `${v} يوم متبقي` : "انتهت الفترة"}
            </Badge>
          );
        },
      },
      {
        id: "progress",
        header: "التقدم %",
        accessorFn: (row) =>
          Math.round(
            (Math.min(row.effectiveAge, DAYS_CONSIDERED_NEW) /
              DAYS_CONSIDERED_NEW) *
              100,
          ),
        cell: ({ getValue }) => {
          const pct = getValue() as number;
          return (
            <div className="flex items-center gap-2 min-w-[80px]">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    pct >= 80
                      ? "bg-red-500"
                      : pct >= 50
                        ? "bg-amber-500"
                        : "bg-primary",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tabular-nums text-xs font-semibold w-8 text-left">
                {pct}%
              </span>
            </div>
          );
        },
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "منتجات-جديدة-تحت-الاختبار",
      sheetName: "منتجات جديدة",
      pdfTitle: "المنتجات الجديدة تحت الاختبار",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "المخزون",
        "القيمة",
        "المورد",
        "الأيام المنقضية",
        "المتبقي",
        "التقدم %",
      ],
      rows: data.map((p) => {
        const elapsed = Math.min(p.effectiveAge, DAYS_CONSIDERED_NEW);
        const remaining = Math.max(0, DAYS_CONSIDERED_NEW - elapsed);
        const progress = Math.round((elapsed / DAYS_CONSIDERED_NEW) * 100);
        return [
          p.productCode,
          p.productName,
          p.categoryName,
          p.currentStock,
          p.stockValue !== null ? p.stockValue : "—",
          p.lastSupplierName || "—",
          elapsed,
          remaining,
          `${progress}%`,
        ];
      }),
      settings,
    }),
    [data, settings],
  );

  if (data.length === 0) return null;

  return (
    <Card className="border shadow-sm">
      <CardContent className="py-4 px-4">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          showSearch={false}
          showColumnToggle={false}
          showPagination={data.length > 10}
          pageSize={10}
          emptyMessage="لا توجد منتجات جديدة"
          toolbarStart={
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  المنتجات الجديدة تحت الاختبار
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {data.length} منتج — فترة اختبار {DAYS_CONSIDERED_NEW} يوم
                </p>
              </div>
            </div>
          }
          toolbarContent={
            <ExportMenu config={exportConfig} disabled={data.length === 0} />
          }
        />
      </CardContent>
    </Card>
  );
}
