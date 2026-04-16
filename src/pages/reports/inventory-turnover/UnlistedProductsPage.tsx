import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { AlertTriangle, Package, DollarSign, Clock } from "lucide-react";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { ProductTurnoverData, fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";

export default function UnlistedProductsPage() {
  const { unlistedProducts, isLoading, settings } = useTurnoverData();

  const summary = useMemo(() => {
    const totalStockValue = unlistedProducts.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    const withStock = unlistedProducts.filter((p) => p.currentStock > 0).length;
    const avgAge =
      unlistedProducts.length > 0
        ? unlistedProducts.reduce((s, p) => s + p.effectiveAge, 0) /
          unlistedProducts.length
        : 0;
    return {
      total: unlistedProducts.length,
      withStock,
      noStock: unlistedProducts.length - withStock,
      totalStockValue,
      avgAge,
    };
  }, [unlistedProducts]);

  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
    () => [
      {
        accessorKey: "productCode",
        header: "الكود",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "productName",
        header: "المنتج",
        cell: ({ getValue }) => (
          <span className="text-xs font-medium truncate max-w-[180px] block">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "categoryName",
        header: "التصنيف",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[100px] block">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "effectiveAge",
        header: "العمر (أيام)",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums font-medium">
            {getValue() as number}
          </span>
        ),
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className="text-xs font-semibold tabular-nums">
              {fmtInt(v)}
            </span>
          );
        },
      },
      {
        accessorKey: "stockValue",
        header: "القيمة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span className="text-xs tabular-nums">
              {v != null ? fmt(v) : "—"}
            </span>
          );
        },
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => {
          const p = row.original;
          return (
            <Badge
              variant="secondary"
              className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
            >
              {p.currentStock > 0 ? "يحتاج مراجعة" : "بدون رصيد"}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "منتجات-مراجعة-مطلوبة",
      sheetName: "مراجعة مطلوبة",
      pdfTitle: "تقرير المنتجات التي تحتاج مراجعة",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "العمر",
        "المخزون",
        "القيمة",
        "الحالة",
      ],
      rows: unlistedProducts.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.effectiveAge,
        p.currentStock,
        p.stockValue ?? "—",
        p.currentStock > 0 ? "يحتاج مراجعة" : "بدون رصيد",
      ]),
      summaryCards: [
        { label: "إجمالي المنتجات", value: String(summary.total) },
        { label: "بمخزون", value: String(summary.withStock) },
        { label: "بدون رصيد", value: String(summary.noStock) },
        {
          label: "قيمة المخزون",
          value: fmt(summary.totalStockValue),
        },
      ],
      settings,
    }),
    [unlistedProducts, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={AlertTriangle}
        title="مراجعة مطلوبة"
        description="منتجات لم تُشترَ ولم تُباع — تحتاج مراجعة أو حذف"
      />

      <TurnoverFilterBar exportConfig={exportConfig} />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-amber-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">
                إجمالي المنتجات
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-orange-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-orange-600" />
              <span className="text-xs text-muted-foreground">بمخزون</span>
            </div>
            <p className="text-2xl font-black tabular-nums text-orange-600">
              {summary.withStock}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">بدون رصيد</span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.noStock}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                قيمة المخزون
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {fmt(summary.totalStockValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={unlistedProducts}
            isLoading={isLoading}
            searchPlaceholder="ابحث بالكود أو الاسم..."
            emptyMessage="لا توجد منتجات تحتاج مراجعة"
            pageSize={15}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              categoryName: "التصنيف",
              effectiveAge: "العمر",
              currentStock: "المخزون",
              stockValue: "القيمة",
              status: "الحالة",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
