import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable } from "@/components/ui/data-table";
import { Ban, Archive, DollarSign, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { ProductTurnoverData, TURNOVER_LABELS, fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

export default function DormantInventoryPage() {
  const {
    dormantProducts,
    inactiveProducts,
    uniqueSuppliers,
    isLoading,
    settings,
  } = useTurnoverData();

  const [tab, setTab] = useState<"dormant" | "inactive">("dormant");
  const [supplierFilter, setSupplierFilter] = useState("all");

  const activeData = tab === "dormant" ? dormantProducts : inactiveProducts;

  const filtered = useMemo(() => {
    if (supplierFilter === "all") return activeData;
    return activeData.filter((p) => p.lastSupplierName === supplierFilter);
  }, [activeData, supplierFilter]);

  const summary = useMemo(() => {
    const dormantVal = dormantProducts.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    const inactiveVal = inactiveProducts.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    return {
      dormantCount: dormantProducts.length,
      dormantVal,
      inactiveCount: inactiveProducts.length,
      inactiveVal,
      totalVal: dormantVal + inactiveVal,
    };
  }, [dormantProducts, inactiveProducts]);

  const supplierItems = useMemo(
    () => uniqueSuppliers.map((s) => ({ id: s, name: s })),
    [uniqueSuppliers],
  );

  const dormantColumns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
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
          <span className="text-xs truncate max-w-[120px] block">
            {getValue() as string}
          </span>
        ),
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
        header: "القيمة المجمّدة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span
              className={cn(
                "text-xs tabular-nums font-semibold",
                v && v > 1000 && "text-red-600",
              )}
            >
              {v != null ? fmt(v) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "daysSinceLastSale",
        header: "آخر بيع (أيام)",
        cell: ({ getValue }) => {
          const d = getValue() as number | null;
          return d != null ? (
            <span className="text-xs tabular-nums">{d} يوم</span>
          ) : (
            <span className="text-xs text-muted-foreground">لم يُباع</span>
          );
        },
      },
      {
        accessorKey: "daysSinceLastPurchase",
        header: "آخر شراء (أيام)",
        cell: ({ getValue }) => {
          const d = getValue() as number | null;
          return d != null ? (
            <span className="text-xs tabular-nums">{d} يوم</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
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
        accessorKey: "supplierReturnCandidate",
        header: "إرجاع؟",
        cell: ({ row }) => {
          const c = row.original.supplierReturnCandidate;
          return c ? (
            <Badge className="text-[9px] bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400">
              مقترح
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
    ],
    [],
  );

  const inactiveColumns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
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
          <span className="text-xs truncate max-w-[120px] block">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "currentStock",
        header: "المخزون المحتجز",
        cell: ({ getValue }) => (
          <span className="text-xs font-semibold tabular-nums">
            {fmtInt(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "stockValue",
        header: "القيمة المجمّدة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span
              className={cn(
                "text-xs tabular-nums font-semibold",
                v && v > 1000 && "text-red-600",
              )}
            >
              {v != null ? fmt(v) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "lastSaleDate",
        header: "آخر بيع",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
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
      {
        accessorKey: "lastSupplierName",
        header: "آخر مورد",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[120px] block">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix:
        tab === "dormant" ? "المخزون-الراكد" : "المخزون-غير-النشط",
      sheetName: tab === "dormant" ? "المخزون الراكد" : "المخزون غير النشط",
      pdfTitle:
        tab === "dormant" ? "تقرير المخزون الراكد" : "تقرير المخزون غير النشط",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "المخزون",
        "القيمة المجمّدة",
        "آخر بيع",
        "آخر شراء",
        "آخر مورد",
      ],
      rows: filtered.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.currentStock,
        p.stockValue ?? "—",
        p.lastSaleDate || "—",
        p.lastPurchaseDate || "—",
        p.lastSupplierName || "—",
      ]),
      summaryCards: [
        { label: "أصناف راكدة", value: String(summary.dormantCount) },
        { label: "قيمة الراكد", value: fmt(summary.dormantVal) },
        { label: "أصناف غير نشطة", value: String(summary.inactiveCount) },
        { label: "قيمة غير النشط", value: fmt(summary.inactiveVal) },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [filtered, tab, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={Archive}
        title="المخزون الراكد وغير النشط"
        description="رأس مال مجمّد يحتاج قرارات تصفية"
      />

      <TurnoverFilterBar exportConfig={exportConfig}>
        <div className="w-px h-5 bg-border mx-1" />
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
          <div className="h-1 bg-red-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">
                إجمالي المبلغ المجمّد
              </span>
            </div>
            <p className="text-xl font-black tabular-nums text-red-600 truncate">
              {fmt(summary.totalVal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-amber-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Archive className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">أصناف راكدة</span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.dormantCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              بقيمة {fmt(summary.dormantVal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-gray-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Ban className="h-4 w-4 text-gray-600" />
              <span className="text-xs text-muted-foreground">
                أصناف غير نشطة
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.inactiveCount}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              بقيمة {fmt(summary.inactiveVal)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                الأصناف معروضة
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {filtered.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "dormant" | "inactive")}
        className="w-full"
      >
        <TabsList className="grid w-full max-w-sm grid-cols-2">
          <TabsTrigger value="dormant" className="text-xs">
            راكد ({summary.dormantCount})
          </TabsTrigger>
          <TabsTrigger value="inactive" className="text-xs">
            غير نشط ({summary.inactiveCount})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dormant" className="mt-4">
          <Card className="border shadow-sm">
            <CardContent className="pt-4">
              <DataTable
                columns={dormantColumns}
                data={filtered}
                isLoading={isLoading}
                searchPlaceholder="ابحث بالكود أو الاسم..."
                emptyMessage="لا توجد أصناف راكدة"
                pageSize={15}
                columnLabels={{
                  productCode: "الكود",
                  productName: "المنتج",
                  categoryName: "التصنيف",
                  currentStock: "المخزون",
                  stockValue: "القيمة",
                  daysSinceLastSale: "آخر بيع",
                  daysSinceLastPurchase: "آخر شراء",
                  lastSupplierName: "المورد",
                  supplierReturnCandidate: "إرجاع",
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inactive" className="mt-4">
          <Card className="border shadow-sm">
            <CardContent className="pt-4">
              <DataTable
                columns={inactiveColumns}
                data={filtered}
                isLoading={isLoading}
                searchPlaceholder="ابحث بالكود أو الاسم..."
                emptyMessage="لا توجد أصناف غير نشطة بمخزون"
                pageSize={15}
                columnLabels={{
                  productCode: "الكود",
                  productName: "المنتج",
                  categoryName: "التصنيف",
                  currentStock: "المخزون",
                  stockValue: "القيمة",
                  lastSaleDate: "آخر بيع",
                  lastPurchaseDate: "آخر شراء",
                  lastSupplierName: "المورد",
                }}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
