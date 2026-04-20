import { useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { ColumnDef } from "@tanstack/react-table";
import { ShieldAlert, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { ProductTurnoverData, fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";

export default function ProductHealthPage() {
  const { allTurnoverData, isLoading, settings, kpis } = useTurnoverData();

  const data = useMemo(
    () => allTurnoverData.filter((p) => p.hasAnyHealthFlag),
    [allTurnoverData],
  );

  const flagCounts = useMemo(() => {
    return {
      highReturns: data.filter((p) => p.flagHighReturns).length,
      noPrice: data.filter((p) => p.flagNoSellingPrice).length,
      negMargin: data.filter((p) => p.flagNegativeMargin).length,
      zeroWac: data.filter((p) => p.flagZeroWac).length,
      fullyReturned: data.filter((p) => p.flagFullySupplierReturned).length,
      noMin: data.filter((p) => p.flagNoMinStock).length,
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
          <span className="text-xs font-medium">{getValue() as string}</span>
        ),
      },
      {
        id: "flags",
        header: "علامات الصحة",
        cell: ({ row }) => {
          const p = row.original;
          const flags: { label: string; cls: string }[] = [];
          if (p.flagHighReturns)
            flags.push({
              label: "إرجاع مرتفع",
              cls: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
            });
          if (p.flagNoSellingPrice)
            flags.push({
              label: "بدون سعر بيع",
              cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
            });
          if (p.flagNegativeMargin)
            flags.push({
              label: "بيع بخسارة",
              cls: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
            });
          if (p.flagZeroWac)
            flags.push({
              label: "WAC = 0",
              cls: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400",
            });
          if (p.flagFullySupplierReturned)
            flags.push({
              label: "مرتجع كلياً للمورد",
              cls: "bg-gray-100 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400",
            });
          if (p.flagNoMinStock)
            flags.push({
              label: "بدون حد أدنى (A/B)",
              cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400",
            });
          if (p.isSeasonalOrVolatile)
            flags.push({
              label: "موسمي/متذبذب",
              cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
            });
          return (
            <div className="flex flex-wrap gap-1">
              {flags.map((f, i) => (
                <Badge key={i} variant="secondary" className={cn("text-[10px]", f.cls)}>
                  {f.label}
                </Badge>
              ))}
            </div>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
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
        accessorKey: "returnedQty",
        header: "مرتجع عملاء",
        cell: ({ row }) => {
          const r = row.original.returnedQty;
          const g = row.original.grossSoldQty;
          const pct = g > 0 ? (r / g) * 100 : 0;
          return (
            <span className="text-xs tabular-nums">
              {fmtInt(r)}{r > 0 && g > 0 && ` (${pct.toFixed(0)}%)`}
            </span>
          );
        },
      },
      {
        accessorKey: "wac",
        header: "WAC",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span className="text-xs tabular-nums text-muted-foreground">
              {v != null ? fmt(v) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "sellingPrice",
        header: "سعر البيع",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span className="text-xs tabular-nums">
              {v != null && v > 0 ? fmt(v) : "—"}
            </span>
          );
        },
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "مؤشرات-صحة-المنتجات",
      sheetName: "صحة المنتجات",
      pdfTitle: "مؤشرات صحة المنتجات",
      headers: ["الكود", "المنتج", "العلامات", "المخزون", "القيمة", "WAC", "سعر البيع"],
      rows: data.map((p) => {
        const flags: string[] = [];
        if (p.flagHighReturns) flags.push("إرجاع مرتفع");
        if (p.flagNoSellingPrice) flags.push("بدون سعر بيع");
        if (p.flagNegativeMargin) flags.push("بيع بخسارة");
        if (p.flagZeroWac) flags.push("WAC=0");
        if (p.flagFullySupplierReturned) flags.push("مرتجع كلياً");
        if (p.flagNoMinStock) flags.push("بدون حد أدنى");
        return [
          p.productCode,
          p.productName,
          flags.join("، "),
          p.currentStock,
          p.stockValue ?? "—",
          p.wac ?? "—",
          p.sellingPrice ?? "—",
        ];
      }),
      summaryCards: [
        { label: "إجمالي المنتجات بمشكلات", value: String(data.length) },
        { label: "معدل إرجاع العملاء", value: `${kpis.customerReturnRate.toFixed(1)}%` },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [data, settings, kpis.customerReturnRate],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={ShieldAlert}
        title="مؤشرات صحة المنتجات"
        description="منتجات تستلزم مراجعة: تسعير، جودة، أو بيانات ناقصة"
      />

      <TurnoverFilterBar exportConfig={exportConfig} />

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "إرجاع مرتفع", value: flagCounts.highReturns, color: "bg-red-500" },
          { label: "بدون سعر بيع", value: flagCounts.noPrice, color: "bg-amber-500" },
          { label: "بيع بخسارة", value: flagCounts.negMargin, color: "bg-red-500" },
          { label: "WAC = 0", value: flagCounts.zeroWac, color: "bg-purple-500" },
          { label: "مرتجع للمورد", value: flagCounts.fullyReturned, color: "bg-gray-500" },
          { label: "بدون حد أدنى", value: flagCounts.noMin, color: "bg-yellow-500" },
        ].map((s) => (
          <Card key={s.label} className="border shadow-sm overflow-hidden">
            <div className={cn("h-1", s.value > 0 ? s.color : "bg-muted")} />
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-[11px] text-muted-foreground">{s.label}</span>
              </div>
              <p className="text-2xl font-black tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border shadow-sm">
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={data}
            isLoading={isLoading}
            searchPlaceholder="ابحث بالكود أو الاسم..."
            emptyMessage="لا توجد منتجات بمؤشرات صحة سلبية"
            pageSize={20}
          />
        </CardContent>
      </Card>
    </div>
  );
}
