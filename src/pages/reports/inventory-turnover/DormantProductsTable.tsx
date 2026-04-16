import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu, type ExportConfig } from "@/components/ExportMenu";
import { ColumnDef } from "@tanstack/react-table";
import { PackageX } from "lucide-react";
import type { CompanySettings } from "@/contexts/SettingsContext";
import { ProductTurnoverData, fmt, fmtInt } from "./types";

interface DormantProductsTableProps {
  data: ProductTurnoverData[];
  settings: CompanySettings | null;
  isLoading?: boolean;
}

export function DormantProductsTable({
  data,
  settings,
  isLoading,
}: DormantProductsTableProps) {
  const totalValue = useMemo(
    () => data.reduce((s, p) => s + (p.stockValue ?? 0), 0),
    [data],
  );

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
            <span className="tabular-nums font-mono text-xs text-orange-600">
              {fmt(v)}
            </span>
          );
        },
      },
      {
        accessorKey: "daysSinceLastSale",
        header: "آخر بيع",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return (
              <span className="text-xs text-red-600 font-medium">
                لم يُباع إطلاقاً
              </span>
            );
          return (
            <span className="tabular-nums text-xs text-muted-foreground">
              منذ {v} يوم
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
      filenamePrefix: "منتجات-خاملة",
      sheetName: "منتجات خاملة",
      pdfTitle: "منتجات خاملة — صفر مبيعات",
      headers: ["الكود", "المنتج", "المخزون", "القيمة", "آخر بيع", "المورد"],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.currentStock,
        p.stockValue !== null ? p.stockValue : "—",
        p.daysSinceLastSale !== null
          ? `منذ ${p.daysSinceLastSale} يوم`
          : "لم يُباع إطلاقاً",
        p.lastSupplierName || "—",
      ]),
      summaryCards: [
        { label: "عدد المنتجات", value: String(data.length) },
        { label: "إجمالي القيمة", value: fmt(totalValue) },
      ],
      settings,
    }),
    [data, totalValue, settings],
  );

  if (data.length === 0) return null;

  return (
    <Card className="border shadow-sm border-orange-200 dark:border-orange-500/20 bg-orange-50/30 dark:bg-orange-500/5">
      <CardContent className="py-4 px-4">
        <DataTable
          columns={columns}
          data={data}
          isLoading={isLoading}
          showSearch={false}
          showColumnToggle={false}
          showPagination={data.length > 10}
          pageSize={10}
          emptyMessage="لا توجد منتجات خاملة"
          toolbarStart={
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-orange-500/15 flex items-center justify-center">
                <PackageX className="h-3.5 w-3.5 text-orange-600" />
              </div>
              <div className="text-right">
                <span className="text-sm font-bold text-orange-700 dark:text-orange-400">
                  منتجات خاملة — صفر مبيعات
                </span>
                <span className="text-xs text-orange-500 mr-2">
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
