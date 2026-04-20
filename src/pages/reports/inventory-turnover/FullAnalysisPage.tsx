import { useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useSearchParams } from "react-router-dom";
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
  BarChart3,
  TrendingUp,
  DollarSign,
  Package,
  ShoppingCart,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import {
  ProductTurnoverData,
  TurnoverClass,
  TURNOVER_LABELS,
  PriorityDot,
  fmt,
  fmtInt,
  getTurnoverSpeed,
} from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

export default function FullAnalysisPage() {
  const {
    filteredData,
    eligibleData,
    kpis,
    uniqueSuppliers,
    isLoading,
    settings,
  } = useTurnoverData();
  const [searchParams] = useSearchParams();

  const matrixParam = searchParams.get("matrix"); // e.g. "A-fast"

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState(() =>
    matrixParam ? matrixParam.split("-")[0] : "all",
  );
  const [turnoverFilter, setTurnoverFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [stockStatusFilter, setStockStatusFilter] = useState("all");
  const [speedFilter, setSpeedFilter] = useState(() =>
    matrixParam ? matrixParam.split("-")[1] : "all",
  );

  const data = useMemo(() => {
    let d = [...filteredData];
    if (supplierFilter !== "all")
      d = d.filter((p) => p.lastSupplierName === supplierFilter);
    if (abcFilter !== "all") d = d.filter((p) => p.abcClass === abcFilter);
    if (turnoverFilter !== "all")
      d = d.filter((p) => p.turnoverClass === turnoverFilter);
    if (priorityFilter !== "all")
      d = d.filter((p) => String(p.actionPriority) === priorityFilter);
    if (stockStatusFilter === "out") d = d.filter((p) => p.currentStock === 0);
    else if (stockStatusFilter === "below")
      d = d.filter((p) => p.belowMinStock && p.currentStock > 0);
    else if (stockStatusFilter === "normal")
      d = d.filter((p) => !p.belowMinStock && p.currentStock > 0);
    if (speedFilter !== "all")
      d = d.filter((p) => getTurnoverSpeed(p.turnoverClass) === speedFilter);
    return d;
  }, [
    filteredData,
    supplierFilter,
    abcFilter,
    turnoverFilter,
    priorityFilter,
    stockStatusFilter,
    speedFilter,
  ]);

  const summary = useMemo(() => {
    const totalStock = data.reduce((s, p) => s + (p.stockValue ?? 0), 0);
    const totalRev = data.reduce((s, p) => s + p.revenue, 0);
    const avgTR = data.filter(
      (p) => p.turnoverRate !== null && p.turnoverRate > 0,
    );
    const avg =
      avgTR.length > 0
        ? avgTR.reduce((s, p) => s + (p.turnoverRate ?? 0), 0) / avgTR.length
        : 0;
    return { total: data.length, totalStock, totalRev, avgTurnover: avg };
  }, [data]);

  const supplierItems = useMemo(
    () => uniqueSuppliers.map((s) => ({ id: s, name: s })),
    [uniqueSuppliers],
  );

  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
    () => [
      {
        id: "priority_dot",
        header: "",
        accessorKey: "actionPriority",
        enableSorting: false,
        cell: ({ getValue }) => <PriorityDot priority={getValue()} />,
        size: 28,
      },
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
          <span className="text-xs font-medium truncate max-w-[160px] block">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "abcClass",
        header: "ABC",
        cell: ({ getValue }) => {
          const v = getValue() as string;
          if (v === "excluded")
            return <span className="text-xs text-muted-foreground">—</span>;
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
                <span className="text-[9px] text-red-500">↓</span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "wac",
        header: "WAC",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return (
            <span
              className="text-xs tabular-nums text-muted-foreground"
              title="متوسط التكلفة المرجح — محسوب من حركات المخزون"
            >
              {v != null ? fmt(v) : "—"}
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
        accessorKey: "soldQty",
        header: "المباع",
        cell: ({ row }) => {
          const g = row.original.grossSoldQty;
          const r = row.original.returnedQty;
          const n = row.original.soldQty;
          return (
            <div className="text-xs tabular-nums">
              <span className="font-semibold">{fmtInt(n)}</span>
              {r > 0 && (
                <span className="text-[10px] text-muted-foreground mr-1">
                  ({fmtInt(g)}-{fmtInt(r)})
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "turnoverRate",
        header: "معدل الدوران",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return v != null ? (
            <span className="text-xs font-semibold tabular-nums">
              {v.toFixed(1)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
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
                    : d > 180
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"
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
        header: "شراء مقترح",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-xs font-semibold text-blue-600 tabular-nums">
              {fmtInt(v)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "profitMargin",
        header: "هامش %",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-xs text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "text-xs tabular-nums font-medium",
                v >= 20
                  ? "text-emerald-600"
                  : v >= 10
                    ? "text-foreground"
                    : "text-amber-600",
              )}
            >
              {v.toFixed(1)}%
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
        accessorKey: "turnoverClass",
        header: "الفئة",
        cell: ({ getValue }) => {
          const tc = getValue() as TurnoverClass;
          const label = TURNOVER_LABELS[tc] || tc;
          return (
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px]",
                tc === "excellent"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                  : tc === "good"
                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                    : tc === "slow"
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                      : tc === "stagnant"
                        ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                        : tc === "new"
                          ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400"
                          : "bg-muted text-muted-foreground",
              )}
            >
              {label}
            </Badge>
          );
        },
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[100px] block">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "تقرير-دوران-المخزون-شامل",
      sheetName: "دوران المخزون",
      pdfTitle: "تقرير دوران المخزون الشامل",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "الحالة",
        "ABC",
        "المخزون",
        "الحد الأدنى",
        "القيمة",
        "المباع (صافي)",
        "المرتجع",
        "معدل الدوران",
        "أيام التغطية",
        "كمية الشراء المقترحة",
        "هامش الربح %",
        "آخر بيع",
        "آخر مورد",
        "فئة الدوران",
        "الأولوية",
      ],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.isActive ? "نشط" : "غير نشط",
        p.abcClass === "excluded" ? "مستبعد" : p.abcClass,
        p.currentStock,
        p.minStockLevel ?? "—",
        p.stockValue !== null ? p.stockValue : "—",
        p.soldQty,
        p.returnedQty > 0 ? p.returnedQty : "—",
        p.turnoverRate !== null ? Number(p.turnoverRate.toFixed(1)) : "—",
        p.coverageDays !== null ? p.coverageDays : "—",
        p.suggestedPurchaseQty > 0 ? p.suggestedPurchaseQty : "—",
        p.profitMargin !== null ? Number(p.profitMargin.toFixed(1)) : "—",
        p.lastSaleDate || "—",
        p.lastSupplierName || "—",
        TURNOVER_LABELS[p.turnoverClass],
        p.actionPriority ? `P${p.actionPriority}` : "—",
      ]),
      summaryCards: [
        { label: "إجمالي المنتجات", value: String(summary.total) },
        { label: "متوسط الدوران", value: summary.avgTurnover.toFixed(2) },
        { label: "إجمالي قيمة المخزون", value: fmt(summary.totalStock) },
        { label: "إجمالي الإيرادات", value: fmt(summary.totalRev) },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [data, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={BarChart3}
        title="التحليل الشامل"
        description="جميع المنتجات مع كافة المرشحات"
      />

      <TurnoverFilterBar exportConfig={exportConfig}>
        <div className="w-px h-5 bg-border mx-1" />
        <Select value={turnoverFilter} onValueChange={setTurnoverFilter}>
          <SelectTrigger className="w-28 h-9 text-xs">
            <SelectValue placeholder="فئة الدوران" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الفئات</SelectItem>
            <SelectItem value="excellent">ممتاز</SelectItem>
            <SelectItem value="good">جيد</SelectItem>
            <SelectItem value="slow">بطيء</SelectItem>
            <SelectItem value="stagnant">راكد</SelectItem>
            <SelectItem value="new">جديد</SelectItem>
            <SelectItem value="inactive">غير نشط</SelectItem>
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
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-28 h-9 text-xs">
            <SelectValue placeholder="الأولوية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأولويات</SelectItem>
            <SelectItem value="1">P1 — فوري</SelectItem>
            <SelectItem value="2">P2 — متابعة</SelectItem>
            <SelectItem value="3">P3 — مراجعة</SelectItem>
          </SelectContent>
        </Select>
        <Select value={stockStatusFilter} onValueChange={setStockStatusFilter}>
          <SelectTrigger className="w-28 h-9 text-xs">
            <SelectValue placeholder="المخزون" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            <SelectItem value="out">نفد المخزون</SelectItem>
            <SelectItem value="below">تحت الأدنى</SelectItem>
            <SelectItem value="normal">عادي</SelectItem>
          </SelectContent>
        </Select>
        <Select value={speedFilter} onValueChange={setSpeedFilter}>
          <SelectTrigger className="w-24 h-9 text-xs">
            <SelectValue placeholder="السرعة" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="fast">سريع</SelectItem>
            <SelectItem value="medium">متوسط</SelectItem>
            <SelectItem value="slow">بطيء</SelectItem>
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
          <div className="h-1 bg-primary/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-xs text-muted-foreground">المنتجات</span>
            </div>
            <p className="text-2xl font-black tabular-nums">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-emerald-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-xs text-muted-foreground">
                متوسط الدوران
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.avgTurnover.toFixed(2)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-blue-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">
                قيمة المخزون
              </span>
            </div>
            <p className="text-xl font-black tabular-nums truncate">
              {fmt(summary.totalStock)}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-amber-500/60" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-amber-600" />
              <span className="text-xs text-muted-foreground">
                إجمالي الإيرادات
              </span>
            </div>
            <p className="text-xl font-black tabular-nums truncate">
              {fmt(summary.totalRev)}
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
            searchPlaceholder="ابحث بالكود أو الاسم أو التصنيف أو المورد..."
            emptyMessage="لا توجد بيانات مطابقة"
            pageSize={20}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              abcClass: "ABC",
              currentStock: "المخزون",
              stockValue: "القيمة",
              soldQty: "المباع",
              turnoverRate: "الدوران",
              coverageDays: "التغطية",
              suggestedPurchaseQty: "شراء مقترح",
              profitMargin: "هامش %",
              lastSaleDate: "آخر بيع",
              turnoverClass: "الفئة",
              lastSupplierName: "المورد",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
