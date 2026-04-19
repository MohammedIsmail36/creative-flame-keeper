import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu, type ExportConfig } from "@/components/ExportMenu";
import { ColumnDef } from "@tanstack/react-table";
import { Undo2 } from "lucide-react";
import type { CompanySettings } from "@/contexts/SettingsContext";
import { ProductTurnoverData, fmt, fmtInt, MetricHelp } from "./types";

interface SupplierReturnTableProps {
  data: ProductTurnoverData[];
  totalValue: number;
  settings: CompanySettings | null;
  isLoading?: boolean;
}

export function SupplierReturnTable({
  data,
  totalValue,
  settings,
  isLoading,
}: SupplierReturnTableProps) {
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
            <span className="tabular-nums font-mono text-xs font-semibold text-purple-600">
              {fmt(v)}
            </span>
          );
        },
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs text-blue-600 dark:text-blue-400">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "supplierReturnReason",
        header: "السبب",
        cell: ({ getValue }) => (
          <span className="text-[11px] text-purple-600 dark:text-purple-400">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "daysSinceLastSale",
        header: "آخر بيع",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return (
              <span className="text-xs text-muted-foreground italic">
                لم يُباع
              </span>
            );
          return (
            <span className="tabular-nums text-xs text-muted-foreground">
              منذ {v} يوم
            </span>
          );
        },
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "مقترح-إرجاع-المورد",
      sheetName: "إرجاع المورد",
      pdfTitle: "مقترح إرجاعها للمورد واستبدالها",
      headers: [
        "الكود",
        "المنتج",
        "المخزون",
        "القيمة",
        "المورد",
        "السبب",
        "آخر بيع",
      ],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.currentStock,
        p.stockValue !== null ? p.stockValue : "—",
        p.lastSupplierName || "—",
        p.supplierReturnReason || "—",
        p.daysSinceLastSale !== null
          ? `منذ ${p.daysSinceLastSale} يوم`
          : "لم يُباع",
      ]),
      summaryCards: [
        { label: "عدد المنتجات", value: String(data.length) },
        { label: "القيمة المجمّدة", value: fmt(totalValue) },
      ],
      settings,
    }),
    [data, totalValue, settings],
  );

  if (data.length === 0) return null;

  return (
    <Card className="border shadow-sm border-purple-200 dark:border-purple-500/20">
      <CardContent className="py-4 px-4">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          showSearch
          searchPlaceholder="بحث في المنتجات..."
          showColumnToggle={false}
          showPagination={data.length > 10}
          pageSize={10}
          emptyMessage="لا توجد منتجات مقترح إرجاعها"
          toolbarStart={
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <Undo2 className="h-3.5 w-3.5 text-purple-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">
                  مقترح إرجاعها للمورد واستبدالها
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  {data.length} منتج — قيمة مجمّدة:{" "}
                  <span className="font-semibold text-purple-600">
                    {fmt(totalValue)}
                  </span>
                </p>
              </div>
            </div>
          }
          toolbarContent={
            <div className="flex items-center gap-2">
              <MetricHelp text="منتجات راكدة لديها مورد معروف يمكن التفاوض معه على إرجاعها واستبدالها بمنتجات ذات دوران أفضل." />
              <ExportMenu config={exportConfig} />
            </div>
          }
        />
      </CardContent>
    </Card>
  );
}
