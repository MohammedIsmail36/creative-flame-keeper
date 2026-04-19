import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { Sparkles, Package, ShoppingBag, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { ProductTurnoverData, DAYS_CONSIDERED_NEW, fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";

export default function NewProductsPage() {
  const { newProductsUnderTest, isLoading, settings } = useTurnoverData();

  const [salesFilter, setSalesFilter] = useState("all");

  const data = useMemo(() => {
    if (salesFilter === "has_sales")
      return newProductsUnderTest.filter((p) => p.soldQty > 0);
    if (salesFilter === "no_sales")
      return newProductsUnderTest.filter((p) => p.soldQty === 0);
    return newProductsUnderTest;
  }, [newProductsUnderTest, salesFilter]);

  const summary = useMemo(() => {
    const withSales = data.filter((p) => p.soldQty > 0).length;
    const totalStockValue = data.reduce((s, p) => s + (p.stockValue ?? 0), 0);
    const avgAge =
      data.length > 0
        ? data.reduce((s, p) => s + p.effectiveAge, 0) / data.length
        : 0;
    return {
      total: data.length,
      withSales,
      noSales: data.length - withSales,
      totalStockValue,
      avgAge,
    };
  }, [data]);

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
        cell: ({ row }) => {
          const age = row.original.effectiveAge;
          const pct = Math.min(100, (age / DAYS_CONSIDERED_NEW) * 100);
          return (
            <div className="flex items-center gap-2 min-w-[90px]">
              <Progress value={pct} className="h-1.5 flex-1" />
              <span className="text-xs tabular-nums font-medium">{age}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ getValue }) => (
          <span className="text-xs font-semibold tabular-nums">
            {fmtInt(getValue() as number)}
          </span>
        ),
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
        accessorKey: "soldQty",
        header: "المباع",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-xs font-semibold text-emerald-600 tabular-nums">
              {fmtInt(v)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">0</span>
          );
        },
      },
      {
        accessorKey: "revenue",
        header: "الإيراد",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-xs tabular-nums">{fmt(v)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "purchasedQty",
        header: "المشترى",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
            {fmtInt(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "lastPurchaseDate",
        header: "تاريخ الإضافة",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[120px] block">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        id: "salesStatus",
        header: "الحالة",
        accessorFn: (row) => (row.soldQty > 0 ? "بدأ البيع" : "لم يُباع"),
        cell: ({ row }) => {
          const hasSales = row.original.soldQty > 0;
          return (
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px]",
                hasSales
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {hasSales ? "بدأ البيع ✓" : "لم يُباع"}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "منتجات-جديدة",
      sheetName: "منتجات جديدة",
      pdfTitle: "تقرير المنتجات الجديدة تحت الاختبار",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "العمر",
        "المخزون",
        "القيمة",
        "المباع",
        "الإيراد",
        "المشترى",
        "تاريخ الإضافة",
        "المورد",
        "الحالة",
      ],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.effectiveAge,
        p.currentStock,
        p.stockValue ?? "—",
        p.soldQty,
        p.revenue > 0 ? Number(p.revenue.toFixed(2)) : "—",
        p.purchasedQty,
        p.lastPurchaseDate || "—",
        p.lastSupplierName || "—",
        p.soldQty > 0 ? "بدأ البيع" : "لم يُباع",
      ]),
      summaryCards: [
        { label: "إجمالي المنتجات الجديدة", value: String(summary.total) },
        { label: "بدأ البيع", value: String(summary.withSales) },
        { label: "لم يُباع بعد", value: String(summary.noSales) },
        { label: "متوسط العمر", value: `${summary.avgAge.toFixed(0)} يوم` },
      ],
      settings,
    }),
    [data, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={Sparkles}
        title="منتجات جديدة تحت الاختبار"
        description={`أصناف عمرها أقل من ${DAYS_CONSIDERED_NEW} يوم`}
      />

      <TurnoverFilterBar exportConfig={exportConfig}>
        <div className="w-px h-5 bg-border mx-1" />
        <Select value={salesFilter} onValueChange={setSalesFilter}>
          <SelectTrigger className="w-32 h-9 text-xs">
            <SelectValue placeholder="حالة البيع" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="has_sales">بدأ البيع</SelectItem>
            <SelectItem value="no_sales">لم يُباع</SelectItem>
          </SelectContent>
        </Select>
      </TurnoverFilterBar>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-indigo-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-indigo-600" />
              <span className="text-xs text-muted-foreground">
                إجمالي المنتجات
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-emerald-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">بدأ البيع</span>
            </div>
            <p className="text-2xl font-black tabular-nums text-emerald-600">
              {summary.withSales}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                لم يُباع بعد
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.noSales}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">متوسط العمر</span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.avgAge.toFixed(0)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                يوم
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            searchPlaceholder="ابحث بالكود أو الاسم..."
            emptyMessage="لا توجد منتجات جديدة"
            pageSize={15}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              categoryName: "التصنيف",
              effectiveAge: "العمر",
              currentStock: "المخزون",
              stockValue: "القيمة",
              soldQty: "المباع",
              revenue: "الإيراد",
              purchasedQty: "المشترى",
              lastPurchaseDate: "تاريخ الإضافة",
              lastSupplierName: "المورد",
              salesStatus: "الحالة",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
