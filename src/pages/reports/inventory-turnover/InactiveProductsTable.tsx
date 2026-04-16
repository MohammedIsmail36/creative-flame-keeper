import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu, type ExportConfig } from "@/components/ExportMenu";
import { ColumnDef } from "@tanstack/react-table";
import { Ban } from "lucide-react";
import type { CompanySettings } from "@/contexts/SettingsContext";
import { ProductTurnoverData, fmt, fmtInt } from "./types";

interface InactiveProductsTableProps {
  data: ProductTurnoverData[];
  totalValue: number;
  settings: CompanySettings | null;
  isLoading?: boolean;
}

export function InactiveProductsTable({
  data,
  totalValue,
  settings,
  isLoading,
}: InactiveProductsTableProps) {
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
            <span className="tabular-nums font-mono text-xs text-gray-600">
              {fmt(v)}
            </span>
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
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "منتجات-غير-نشطة",
      sheetName: "غير نشطة",
      pdfTitle: "منتجات غير نشطة بمخزون مجمّد",
      headers: ["الكود", "المنتج", "المخزون", "القيمة", "المورد"],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.currentStock,
        p.stockValue !== null ? p.stockValue : "—",
        p.lastSupplierName || "—",
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
    <Card className="border shadow-sm border-gray-200 dark:border-gray-500/20 bg-gray-50/30 dark:bg-gray-500/5">
      <CardContent className="py-4 px-4">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          showSearch={false}
          showColumnToggle={false}
          showPagination={data.length > 10}
          pageSize={10}
          emptyMessage="لا توجد منتجات غير نشطة"
          toolbarStart={
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-gray-500/15 flex items-center justify-center">
                <Ban className="h-3.5 w-3.5 text-gray-600" />
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-400">
                  منتجات غير نشطة بمخزون مجمّد
                </span>
                <span className="text-xs text-gray-500 mr-2">
                  ({data.length} صنف — {fmt(totalValue)})
                </span>
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
