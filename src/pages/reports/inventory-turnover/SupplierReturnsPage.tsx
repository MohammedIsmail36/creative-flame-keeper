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
import { Undo2, DollarSign, Package, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { ProductTurnoverData, TURNOVER_LABELS, fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

export default function SupplierReturnsPage() {
  const { supplierReturnCandidates, uniqueSuppliers, isLoading, settings } =
    useTurnoverData();

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");

  const data = useMemo(() => {
    let d = [...supplierReturnCandidates];
    if (supplierFilter !== "all")
      d = d.filter((p) => p.lastSupplierName === supplierFilter);
    if (abcFilter !== "all") d = d.filter((p) => p.abcClass === abcFilter);
    return d;
  }, [supplierReturnCandidates, supplierFilter, abcFilter]);

  const summary = useMemo(() => {
    const totalValue = data.reduce((s, p) => s + (p.stockValue ?? 0), 0);
    const totalQty = data.reduce((s, p) => s + p.currentStock, 0);
    const supplierSet = new Set(
      data.map((p) => p.lastSupplierName).filter(Boolean),
    );
    return {
      totalItems: data.length,
      totalValue,
      totalQty,
      supplierCount: supplierSet.size,
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
        accessorKey: "categoryName",
        header: "التصنيف",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[100px] block">
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
        accessorKey: "turnoverClass",
        header: "فئة الدوران",
        cell: ({ getValue }) => {
          const tc = getValue() as string;
          const label =
            TURNOVER_LABELS[tc as keyof typeof TURNOVER_LABELS] || tc;
          return (
            <Badge
              variant="secondary"
              className={cn(
                "text-xs",
                tc === "stagnant"
                  ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                  : tc === "slow"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {label}
            </Badge>
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
        header: "قيمة الإرجاع",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span
              className={cn(
                "text-xs tabular-nums font-semibold",
                v && v > 1000 && "text-purple-600",
              )}
            >
              {v != null ? fmt(v) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "coverageDays",
        header: "التغطية",
        cell: ({ getValue }) => {
          const d = getValue() as number | null;
          return d != null ? (
            <span className="text-xs tabular-nums">{d} يوم</span>
          ) : (
            <span className="text-xs text-muted-foreground">∞</span>
          );
        },
      },
      {
        accessorKey: "soldQty",
        header: "المباع",
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
            {fmtInt(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs font-medium truncate max-w-[120px] block">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        accessorKey: "supplierReturnReason",
        header: "سبب الإرجاع",
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
      filenamePrefix: "إرجاع-للمورد",
      sheetName: "مقترح إرجاع للمورد",
      pdfTitle: "تقرير الإرجاع المقترح للمورد",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "ABC",
        "فئة الدوران",
        "المخزون",
        "القيمة",
        "التغطية",
        "المباع",
        "المورد",
        "السبب",
      ],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.abcClass,
        TURNOVER_LABELS[p.turnoverClass] || p.turnoverClass,
        p.currentStock,
        p.stockValue ?? "—",
        p.coverageDays ?? "∞",
        p.soldQty,
        p.lastSupplierName || "—",
        p.supplierReturnReason || "—",
      ]),
      summaryCards: [
        { label: "أصناف مقترحة", value: String(summary.totalItems) },
        { label: "إجمالي القيمة", value: fmt(summary.totalValue) },
        { label: "إجمالي الكميات", value: fmtInt(summary.totalQty) },
        { label: "عدد الموردين", value: String(summary.supplierCount) },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [data, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={Undo2}
        title="مقترح الإرجاع للمورد"
        description="أصناف راكدة يُنصح بإرجاعها واستبدالها"
      />

      <TurnoverFilterBar exportConfig={exportConfig}>
        <div className="w-px h-5 bg-border mx-1" />
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
          <div className="h-1 bg-purple-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">
                أصناف مقترحة
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.totalItems}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div
            className={cn(
              "h-1",
              summary.totalValue > 5000 ? "bg-red-500" : "bg-purple-400",
            )}
          />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-purple-600" />
              <span className="text-xs text-muted-foreground">
                إجمالي القيمة
              </span>
            </div>
            <p className="text-xl font-black tabular-nums truncate text-purple-600">
              {fmt(summary.totalValue)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                إجمالي الكميات
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {fmtInt(summary.totalQty)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                عدد الموردين
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.supplierCount}
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
            emptyMessage="لا توجد أصناف مقترحة للإرجاع"
            pageSize={15}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              categoryName: "التصنيف",
              abcClass: "ABC",
              turnoverClass: "فئة الدوران",
              currentStock: "المخزون",
              stockValue: "القيمة",
              coverageDays: "التغطية",
              soldQty: "المباع",
              lastSupplierName: "المورد",
              supplierReturnReason: "السبب",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
