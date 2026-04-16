import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu, type ExportConfig } from "@/components/ExportMenu";
import { ColumnDef } from "@tanstack/react-table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ShoppingCart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CompanySettings } from "@/contexts/SettingsContext";
import { ProductTurnoverData, fmt, fmtInt, MetricHelp } from "./types";

interface PurchaseSuggestionsTableProps {
  data: ProductTurnoverData[];
  totalCost: number;
  settings: CompanySettings | null;
  isLoading?: boolean;
}

export function PurchaseSuggestionsTable({
  data,
  totalCost,
  settings,
  isLoading,
}: PurchaseSuggestionsTableProps) {
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
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ row }) => (
          <span
            className={cn(
              "tabular-nums font-semibold text-sm",
              row.original.currentStock === 0
                ? "text-destructive"
                : row.original.belowMinStock
                  ? "text-amber-600"
                  : "",
            )}
          >
            {fmtInt(row.original.currentStock)}
          </span>
        ),
      },
      {
        accessorKey: "minStockLevel",
        header: "الحد الأدنى",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span className="tabular-nums text-sm text-muted-foreground">
              {v ?? "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "avgDailySales",
        header: "متوسط البيع/يوم",
        cell: ({ getValue }) => (
          <span className="tabular-nums text-sm">
            {(getValue() as number).toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "coverageDays",
        header: "التغطية",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "tabular-nums text-sm",
                v < 15 ? "text-destructive font-semibold" : "",
              )}
            >
              {v} يوم
            </span>
          );
        },
      },
      {
        id: "suggestedQty",
        header: "الكمية المقترحة",
        accessorFn: (row) =>
          row.suggestedPurchaseQty > 0
            ? row.suggestedPurchaseQty
            : row.minStockLevel
              ? Math.max(0, row.minStockLevel - row.currentStock)
              : 0,
        cell: ({ row, getValue }) => {
          const qty = getValue() as number;
          const cost = qty * (row.original.lastPurchasePrice ?? 0);
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="tabular-nums font-bold text-sm text-blue-600 cursor-help">
                    {fmtInt(qty)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  التكلفة المتوقعة: {fmt(cost)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        id: "estimatedCost",
        header: "التكلفة",
        accessorFn: (row) => {
          const qty =
            row.suggestedPurchaseQty > 0
              ? row.suggestedPurchaseQty
              : Math.max(0, (row.minStockLevel ?? 0) - row.currentStock);
          return qty * (row.lastPurchasePrice ?? 0);
        },
        cell: ({ getValue }) => (
          <span className="tabular-nums font-mono text-xs">
            {fmt(getValue() as number)}
          </span>
        ),
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
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "قائمة-الشراء-المقترحة",
      sheetName: "الشراء المقترح",
      pdfTitle: "قائمة الشراء المقترحة — 30 يوم",
      headers: [
        "الكود",
        "المنتج",
        "المخزون",
        "الحد الأدنى",
        "متوسط البيع/يوم",
        "التغطية",
        "الكمية المقترحة",
        "التكلفة",
        "المورد",
      ],
      rows: data.map((p) => {
        const qty =
          p.suggestedPurchaseQty > 0
            ? p.suggestedPurchaseQty
            : Math.max(0, (p.minStockLevel ?? 0) - p.currentStock);
        return [
          p.productCode,
          p.productName,
          p.currentStock,
          p.minStockLevel ?? "—",
          Number(p.avgDailySales.toFixed(1)),
          p.coverageDays ?? "—",
          qty,
          qty * (p.lastPurchasePrice ?? 0),
          p.lastSupplierName || "—",
        ];
      }),
      summaryCards: [
        { label: "عدد المنتجات", value: String(data.length) },
        { label: "إجمالي التكلفة", value: fmt(totalCost) },
      ],
      settings,
      pdfOrientation: "landscape" as const,
    }),
    [data, totalCost, settings],
  );

  if (data.length === 0) return null;

  return (
    <Card className="border shadow-sm">
      <CardContent className="py-4 px-4">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          showSearch
          searchPlaceholder="بحث في المنتجات..."
          showPagination={data.length > 10}
          pageSize={10}
          emptyMessage="لا توجد اقتراحات شراء"
          toolbarStart={
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center">
                <ShoppingCart className="h-3.5 w-3.5 text-blue-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  قائمة الشراء المقترحة — 30 يوم
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {data.length} منتج — إجمالي التكلفة:{" "}
                  <span className="font-semibold">{fmt(totalCost)}</span>
                </p>
              </div>
            </div>
          }
          toolbarContent={
            <div className="flex items-center gap-2">
              <MetricHelp text="الكمية المقترح شراؤها لتغطية 30 يوم بناءً على متوسط البيع اليومي مع خصم المخزون الحالي." />
              <ExportMenu config={exportConfig} />
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
