import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import {
  ShoppingCart,
  PackageX,
  AlertTriangle,
  TrendingDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { ProductTurnoverData, fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

export default function PurchasePlanningPage() {
  const { purchaseSuggestions, uniqueSuppliers, isLoading, settings } =
    useTurnoverData();

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");
  const [stockStatus, setStockStatus] = useState("all");

  const data = useMemo(() => {
    let d = [...purchaseSuggestions];
    if (supplierFilter !== "all")
      d = d.filter((p) => p.lastSupplierName === supplierFilter);
    if (abcFilter !== "all") d = d.filter((p) => p.abcClass === abcFilter);
    if (stockStatus === "out") d = d.filter((p) => p.currentStock === 0);
    else if (stockStatus === "below")
      d = d.filter((p) => p.belowMinStock && p.currentStock > 0);
    else if (stockStatus === "normal")
      d = d.filter((p) => !p.belowMinStock && p.currentStock > 0);
    return d;
  }, [purchaseSuggestions, supplierFilter, abcFilter, stockStatus]);

  const summary = useMemo(() => {
    const totalCost = data.reduce(
      (s, p) => s + p.suggestedPurchaseQty * (p.lastPurchasePrice ?? 0),
      0,
    );
    const outOfStock = data.filter((p) => p.currentStock === 0).length;
    const belowMin = data.filter(
      (p) => p.belowMinStock && p.currentStock > 0,
    ).length;
    const avgCoverage = data
      .filter((p) => p.coverageDays !== null)
      .reduce((s, p, _, a) => s + (p.coverageDays ?? 0) / a.length, 0);
    return {
      totalItems: data.length,
      totalCost,
      outOfStock,
      belowMin,
      avgCoverage,
    };
  }, [data]);

  const supplierItems = useMemo(
    () => uniqueSuppliers.map((s) => ({ id: s, name: s })),
    [uniqueSuppliers],
  );

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
        accessorKey: "abcClass",
        header: "ABC",
        cell: ({ getValue }) => {
          const v = getValue() as string;
          return (
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                v === "A"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : v === "B"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {v}
            </Badge>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ row }) => {
          const s = row.original.currentStock;
          return (
            <div className="flex items-center gap-1">
              <span
                className={cn(
                  "text-xs font-semibold tabular-nums",
                  s === 0 && "text-red-600",
                )}
              >
                {fmtInt(s)}
              </span>
              {row.original.belowMinStock && (
                <Badge variant="destructive" className="text-[9px] px-1 py-0">
                  ↓ أقل
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "minStockLevel",
        header: "الحد الأدنى",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span className="text-xs tabular-nums">
              {v != null ? fmtInt(v) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "avgDailySales",
        header: "متوسط يومي",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className="text-xs tabular-nums">
              {v > 0 ? v.toFixed(1) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "coverageDays",
        header: "التغطية",
        cell: ({ getValue }) => {
          const d = getValue() as number | null;
          if (d === null || d === undefined)
            return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                d === 0
                  ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                  : d < 15
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                    : d < 30
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400"
                      : "bg-muted text-muted-foreground",
              )}
            >
              {d} يوم
            </Badge>
          );
        },
      },
      {
        accessorKey: "suggestedPurchaseQty",
        header: "كمية الشراء",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-xs font-bold text-blue-600 tabular-nums">
              {fmtInt(v)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        id: "estimatedCost",
        header: "التكلفة التقديرية",
        accessorFn: (row) =>
          row.suggestedPurchaseQty * (row.lastPurchasePrice ?? 0),
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-xs font-semibold tabular-nums">{fmt(v)}</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "lastPurchasePrice",
        header: "سعر الشراء",
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
        accessorKey: "lastSupplierName",
        header: "آخر مورد",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[120px] block">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "lastPurchaseDate",
        header: "آخر شراء",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "خطة-الشراء",
      sheetName: "خطة الشراء",
      pdfTitle: "خطة الشراء المقترحة",
      headers: [
        "الكود",
        "المنتج",
        "ABC",
        "المخزون",
        "الحد الأدنى",
        "يومي",
        "التغطية",
        "كمية الشراء",
        "التكلفة",
        "سعر الشراء",
        "آخر مورد",
        "آخر شراء",
      ],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.abcClass,
        p.currentStock,
        p.minStockLevel ?? "—",
        p.avgDailySales > 0 ? Number(p.avgDailySales.toFixed(1)) : "—",
        p.coverageDays ?? "—",
        p.suggestedPurchaseQty || "—",
        p.suggestedPurchaseQty * (p.lastPurchasePrice ?? 0) || "—",
        p.lastPurchasePrice ?? "—",
        p.lastSupplierName || "—",
        p.lastPurchaseDate || "—",
      ]),
      summaryCards: [
        { label: "إجمالي الأصناف", value: String(summary.totalItems) },
        { label: "التكلفة الإجمالية", value: fmt(summary.totalCost) },
        { label: "نفد المخزون", value: String(summary.outOfStock) },
        { label: "تحت الحد الأدنى", value: String(summary.belowMin) },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [data, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={ShoppingCart}
        title="خطة الشراء المقترحة"
        description="أصناف تحتاج إعادة شراء لتغطية 30 يوم"
      />

      <TurnoverFilterBar exportConfig={exportConfig}>
        <div className="w-px h-5 bg-border mx-1" />
        <Select value={stockStatus} onValueChange={setStockStatus}>
          <SelectTrigger className="w-32 h-9 text-xs">
            <SelectValue placeholder="حالة المخزون" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="out">نفد المخزون</SelectItem>
            <SelectItem value="below">تحت الحد الأدنى</SelectItem>
            <SelectItem value="normal">عادي</SelectItem>
          </SelectContent>
        </Select>
        <Select value={abcFilter} onValueChange={setAbcFilter}>
          <SelectTrigger className="w-24 h-9 text-xs">
            <SelectValue placeholder="ABC" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="A">A</SelectItem>
            <SelectItem value="B">B</SelectItem>
            <SelectItem value="C">C</SelectItem>
          </SelectContent>
        </Select>
        <div className="w-40">
          <LookupCombobox
            items={supplierItems}
            value={supplierFilter === "all" ? "" : supplierFilter}
            onValueChange={(v) => setSupplierFilter(v || "all")}
            placeholder="كل الموردين"
            searchPlaceholder="ابحث عن مورد..."
            className="h-9"
          />
        </div>
      </TurnoverFilterBar>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-blue-500" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">
                إجمالي الأصناف
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.totalItems}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-primary/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">
                التكلفة الإجمالية
              </span>
            </div>
            <p className="text-xl font-black tabular-nums truncate">
              {fmt(summary.totalCost)}
            </p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "border shadow-sm overflow-hidden",
            summary.outOfStock > 0 && "ring-1 ring-red-500/20",
          )}
        >
          <div
            className={cn(
              "h-1",
              summary.outOfStock > 0 ? "bg-red-500" : "bg-muted",
            )}
          />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <PackageX
                className={cn(
                  "h-4 w-4",
                  summary.outOfStock > 0
                    ? "text-red-500"
                    : "text-muted-foreground",
                )}
              />
              <span className="text-xs text-muted-foreground">نفد المخزون</span>
            </div>
            <p
              className={cn(
                "text-2xl font-black tabular-nums",
                summary.outOfStock > 0 && "text-red-600",
              )}
            >
              {summary.outOfStock}
            </p>
          </CardContent>
        </Card>
        <Card
          className={cn(
            "border shadow-sm overflow-hidden",
            summary.belowMin > 0 && "ring-1 ring-amber-500/20",
          )}
        >
          <div
            className={cn(
              "h-1",
              summary.belowMin > 0 ? "bg-amber-500" : "bg-muted",
            )}
          />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  summary.belowMin > 0
                    ? "text-amber-500"
                    : "text-muted-foreground",
                )}
              />
              <span className="text-xs text-muted-foreground">
                تحت الحد الأدنى
              </span>
            </div>
            <p
              className={cn(
                "text-2xl font-black tabular-nums",
                summary.belowMin > 0 && "text-amber-600",
              )}
            >
              {summary.belowMin}
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
            searchPlaceholder="ابحث بالكود أو الاسم أو المورد..."
            emptyMessage="لا توجد اقتراحات شراء حالياً"
            pageSize={15}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              abcClass: "ABC",
              currentStock: "المخزون",
              minStockLevel: "الحد الأدنى",
              avgDailySales: "يومي",
              coverageDays: "التغطية",
              suggestedPurchaseQty: "كمية الشراء",
              estimatedCost: "التكلفة",
              lastPurchasePrice: "سعر الشراء",
              lastSupplierName: "آخر مورد",
              lastPurchaseDate: "آخر شراء",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
