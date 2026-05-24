import { useMemo, useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useSearchParams } from "react-router-dom";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  SlidersHorizontal,
  X,
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
} from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

type ViewKey =
  | "all"
  | "action"
  | "fast"
  | "stagnant"
  | "out"
  | "below"
  | "no_sales";

const VIEWS: { key: ViewKey; label: string; hint: string }[] = [
  { key: "all", label: "الكل", hint: "كل المنتجات" },
  { key: "action", label: "يحتاج إجراء", hint: "أولوية P1 — فوري" },
  { key: "fast", label: "حركة سريعة", hint: "دوران ممتاز/جيد" },
  { key: "stagnant", label: "راكد", hint: "بدون حركة طويلة" },
  { key: "out", label: "نفد المخزون", hint: "رصيد = 0" },
  { key: "below", label: "تحت الأدنى", hint: "رصيد < الحد الأدنى" },
  { key: "no_sales", label: "بدون مبيعات", hint: "لم يُباع في الفترة" },
];

const STORAGE_KEY = "turnover_full_analysis_view";

export default function FullAnalysisPage() {
  const {
    filteredData,
    uniqueSuppliers,
    isLoading,
    settings,
  } = useTurnoverData();
  const [searchParams] = useSearchParams();
  const matrixParam = searchParams.get("matrix"); // e.g. "A-fast"

  // Quick view chip (persisted)
  const [view, setView] = useState<ViewKey>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as ViewKey | null;
      return saved && VIEWS.find((v) => v.key === saved) ? saved : "all";
    } catch {
      return "all";
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, view);
    } catch {
      /* noop */
    }
  }, [view]);

  // Advanced filters (collapsed by default)
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState(() =>
    matrixParam ? matrixParam.split("-")[0] : "all",
  );

  // Expand advanced if matrix param drove a filter
  useEffect(() => {
    if (matrixParam) setShowAdvanced(true);
  }, [matrixParam]);

  const resetAdvanced = () => {
    setSupplierFilter("all");
    setAbcFilter("all");
  };

  const advancedActive =
    (supplierFilter !== "all" ? 1 : 0) + (abcFilter !== "all" ? 1 : 0);

  const data = useMemo(() => {
    let d = [...filteredData];
    // Quick view
    if (view === "action") d = d.filter((p) => p.actionPriority === 1);
    else if (view === "fast")
      d = d.filter(
        (p) => p.turnoverClass === "excellent" || p.turnoverClass === "good",
      );
    else if (view === "stagnant")
      d = d.filter((p) => p.turnoverClass === "stagnant");
    else if (view === "out") d = d.filter((p) => p.currentStock === 0);
    else if (view === "below")
      d = d.filter((p) => p.belowMinStock && p.currentStock > 0);
    else if (view === "no_sales") d = d.filter((p) => p.soldQty === 0);

    // Advanced
    if (supplierFilter !== "all")
      d = d.filter((p) => p.lastSupplierName === supplierFilter);
    if (abcFilter !== "all") d = d.filter((p) => p.abcClass === abcFilter);
    return d;
  }, [filteredData, view, supplierFilter, abcFilter]);

  // Counts per view (computed once on filteredData)
  const viewCounts = useMemo(() => {
    const c: Record<ViewKey, number> = {
      all: filteredData.length,
      action: 0,
      fast: 0,
      stagnant: 0,
      out: 0,
      below: 0,
      no_sales: 0,
    };
    for (const p of filteredData) {
      if (p.actionPriority === 1) c.action++;
      if (p.turnoverClass === "excellent" || p.turnoverClass === "good")
        c.fast++;
      if (p.turnoverClass === "stagnant") c.stagnant++;
      if (p.currentStock === 0) c.out++;
      if (p.belowMinStock && p.currentStock > 0) c.below++;
      if (p.soldQty === 0) c.no_sales++;
    }
    return c;
  }, [filteredData]);

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

  const currentView = VIEWS.find((v) => v.key === view)!;

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: `تقرير-دوران-المخزون-${currentView.label}`,
      sheetName: "دوران المخزون",
      pdfTitle: `تقرير دوران المخزون — ${currentView.label}`,
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
        { label: "العرض", value: currentView.label },
        { label: "إجمالي المنتجات", value: String(summary.total) },
        { label: "متوسط الدوران", value: summary.avgTurnover.toFixed(2) },
        { label: "إجمالي قيمة المخزون", value: fmt(summary.totalStock) },
        { label: "إجمالي الإيرادات", value: fmt(summary.totalRev) },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [data, summary, settings, currentView],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={BarChart3}
        title="مستكشف البيانات"
        description="استكشف منتجاتك بعروض جاهزة، ثم خصّص بالتصفية المتقدمة عند الحاجة"
      />

      <TurnoverFilterBar exportConfig={exportConfig} />

      {/* Quick views — chips */}
      <Card className="border shadow-sm">
        <CardContent className="py-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-muted-foreground ml-2">
              عرض سريع:
            </span>
            {VIEWS.map((v) => {
              const active = view === v.key;
              const count = viewCounts[v.key];
              return (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setView(v.key)}
                  title={v.hint}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-medium border transition-all",
                    active
                      ? "bg-primary text-primary-foreground border-primary shadow-sm"
                      : "bg-background hover:bg-muted border-border text-foreground/80",
                  )}
                >
                  {v.label}
                  <span
                    className={cn(
                      "tabular-nums text-[10px] px-1.5 rounded-full",
                      active
                        ? "bg-primary-foreground/20"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}

            <div className="flex-1" />

            <Button
              variant={showAdvanced ? "default" : "outline"}
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setShowAdvanced((s) => !s)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              تصفية متقدمة
              {advancedActive > 0 && (
                <Badge
                  variant="secondary"
                  className="h-4 px-1.5 text-[10px] tabular-nums"
                >
                  {advancedActive}
                </Badge>
              )}
            </Button>
          </div>

          {showAdvanced && (
            <div className="mt-3 pt-3 border-t flex flex-wrap items-center gap-2">
              <Select value={abcFilter} onValueChange={setAbcFilter}>
                <SelectTrigger className="w-28 h-9 text-xs">
                  <SelectValue placeholder="فئة ABC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل فئات ABC</SelectItem>
                  <SelectItem value="A">A — حيوي</SelectItem>
                  <SelectItem value="B">B — مهم</SelectItem>
                  <SelectItem value="C">C — هامشي</SelectItem>
                </SelectContent>
              </Select>
              <div className="w-48">
                <LookupCombobox
                  items={supplierItems}
                  value={supplierFilter === "all" ? "" : supplierFilter}
                  onValueChange={(v) => setSupplierFilter(v || "all")}
                  placeholder="كل الموردين"
                  searchPlaceholder="ابحث عن مورد..."
                  className="h-9"
                />
              </div>
              {advancedActive > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1 text-xs text-muted-foreground"
                  onClick={resetAdvanced}
                >
                  <X className="h-3.5 w-3.5" />
                  مسح المتقدمة
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
            emptyMessage="لا توجد بيانات مطابقة لهذا العرض"
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
