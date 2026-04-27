import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/ui/data-table";
import { LookupCombobox } from "@/components/LookupCombobox";
import { ColumnDef } from "@tanstack/react-table";
import {
  Archive,
  AlertTriangle,
  Coins,
  Clock,
  Undo2,
  TrendingDown,
  Sparkles,
  Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import { fmt, fmtInt } from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import {
  enrichDormantList,
  riskColor,
  REASON_LABELS,
  REASON_COLORS,
  DormantBucket,
  DormantReason,
  DormantEnriched,
} from "./dormant-utils";
import { DormantActionMenu } from "./DormantActionMenu";

const BUCKET_META: Record<
  DormantBucket,
  { label: string; color: string; ring: string; icon: typeof Archive }
> = {
  critical: {
    label: "حرج — إرجاع/تصفية",
    color: "text-red-700 dark:text-red-400",
    ring: "ring-red-500/40 bg-red-500/5",
    icon: AlertTriangle,
  },
  watch: {
    label: "مراقبة — حملة ترويج",
    color: "text-amber-700 dark:text-amber-400",
    ring: "ring-amber-500/40 bg-amber-500/5",
    icon: Clock,
  },
  archive: {
    label: "أرشفة",
    color: "text-gray-700 dark:text-gray-300",
    ring: "ring-gray-500/40 bg-gray-500/5",
    icon: Archive,
  },
};

export default function DormantInventoryPage() {
  const navigate = useNavigate();
  const {
    dormantProducts,
    inactiveProducts,
    uniqueSuppliers,
    categories,
    isLoading,
    settings,
    kpis,
  } = useTurnoverData();

  const [bucket, setBucket] = useState<DormantBucket | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<DormantReason | "all">("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [minValue, setMinValue] = useState<string>("");
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshTick, setRefreshTick] = useState(0);

  // Combine + enrich
  const enriched = useMemo<DormantEnriched[]>(() => {
    const merged = [...dormantProducts, ...inactiveProducts];
    // dedupe by productId (in case overlap)
    const seen = new Set<string>();
    const unique = merged.filter((p) => {
      if (seen.has(p.productId)) return false;
      seen.add(p.productId);
      return true;
    });
    return enrichDormantList(unique).filter((p) => !ignored.has(p.productId));
  }, [dormantProducts, inactiveProducts, ignored, refreshTick]);

  // Diagnostic strip aggregations
  const reasonStats = useMemo(() => {
    const map = new Map<DormantReason, { count: number; value: number }>();
    enriched.forEach((p) => {
      const cur = map.get(p.primaryReason) ?? { count: 0, value: 0 };
      cur.count += 1;
      cur.value += p.stockValue ?? 0;
      map.set(p.primaryReason, cur);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].value - a[1].value);
  }, [enriched]);

  // Bucket counts
  const bucketCounts = useMemo(() => {
    const c = { critical: 0, watch: 0, archive: 0 };
    enriched.forEach((p) => {
      c[p.bucket] += 1;
    });
    return c;
  }, [enriched]);

  // Apply filters
  const filtered = useMemo(() => {
    const minV = parseFloat(minValue) || 0;
    return enriched
      .filter((p) => bucket === "all" || p.bucket === bucket)
      .filter((p) => reasonFilter === "all" || p.primaryReason === reasonFilter)
      .filter(
        (p) => supplierFilter === "all" || p.lastSupplierName === supplierFilter,
      )
      .filter(
        (p) => categoryFilter === "all" || p.categoryId === categoryFilter,
      )
      .filter((p) => (p.stockValue ?? 0) >= minV)
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [enriched, bucket, reasonFilter, supplierFilter, categoryFilter, minValue]);

  // KPIs
  const summary = useMemo(() => {
    const totalFrozen = enriched.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    const opTotal = kpis.operationalTotalValue || 0;
    const frozenPct = opTotal > 0 ? (totalFrozen / opTotal) * 100 : 0;
    const avgValue =
      enriched.length > 0 ? totalFrozen / enriched.length : 0;
    const highRisk = enriched.filter(
      (p) => (p.stockValue ?? 0) > avgValue * 2,
    );
    const supplierReturnList = enriched.filter((p) => p.supplierReturnCandidate);
    const supplierReturnVal = supplierReturnList.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    const profitLossList = enriched.filter(
      (p) => p.flagNegativeMargin || p.flagNoSellingPrice,
    );
    const profitLossVal = profitLossList.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    const ages = enriched
      .map((p) => p.daysSinceLastSale ?? p.effectiveAge)
      .filter((d): d is number => typeof d === "number" && d > 0);
    const avgAge = ages.length
      ? Math.round(ages.reduce((s, d) => s + d, 0) / ages.length)
      : 0;

    return {
      totalFrozen,
      frozenPct,
      highRiskCount: highRisk.length,
      highRiskValue: highRisk.reduce((s, p) => s + (p.stockValue ?? 0), 0),
      supplierReturnCount: supplierReturnList.length,
      supplierReturnVal,
      profitLossCount: profitLossList.length,
      profitLossVal,
      avgAge,
    };
  }, [enriched, kpis.operationalTotalValue]);

  // Selection impact
  const selectionImpact = useMemo(() => {
    const items = filtered.filter((p) => selected.has(p.productId));
    let recoverable = 0;
    let writedown = 0;
    items.forEach((p) => {
      const v = p.stockValue ?? 0;
      if (p.bucket === "critical" && p.supplierReturnCandidate)
        recoverable += v;
      else writedown += v;
    });
    return { count: items.length, recoverable, writedown, items };
  }, [filtered, selected]);

  const supplierItems = useMemo(
    () => uniqueSuppliers.map((s) => ({ id: s, name: s })),
    [uniqueSuppliers],
  );
  const categoryItems = useMemo(
    () => categories.map((c: any) => ({ id: c.id, name: c.name })),
    [categories],
  );

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (filtered.every((p) => selected.has(p.productId))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((p) => p.productId)));
    }
  };

  const handleIgnore = (id: string) => {
    setIgnored((prev) => new Set(prev).add(id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  };

  const columns = useMemo<ColumnDef<DormantEnriched, any>[]>(
    () => [
      {
        id: "select",
        header: () => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={
              filtered.length > 0 &&
              filtered.every((p) => selected.has(p.productId))
            }
            onChange={toggleSelectAll}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-primary"
            checked={selected.has(row.original.productId)}
            onChange={() => toggleSelect(row.original.productId)}
          />
        ),
        enableSorting: false,
      },
      {
        accessorKey: "riskScore",
        header: "خطورة",
        cell: ({ row }) => {
          const s = row.original.riskScore;
          return (
            <div className="flex items-center gap-1.5 min-w-[70px]">
              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn("h-full", riskColor(s))}
                  style={{ width: `${s}%` }}
                />
              </div>
              <span className="text-[10px] tabular-nums font-bold w-6">
                {s}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "productCode",
        header: "الكود",
        cell: ({ getValue }) => (
          <span className="font-mono text-[11px] text-muted-foreground">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "productName",
        header: "المنتج",
        cell: ({ getValue }) => (
          <span className="text-xs font-medium truncate max-w-[200px] block">
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
            <span className="text-xs tabular-nums font-bold text-red-600">
              {v != null ? fmt(v) : "—"}
            </span>
          );
        },
      },
      {
        accessorKey: "lastActivityDays",
        header: "آخر حركة",
        cell: ({ getValue }) => {
          const d = getValue() as number | null;
          return d != null ? (
            <span className="text-xs tabular-nums">منذ {d} يوم</span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "primaryReason",
        header: "السبب",
        cell: ({ row }) => {
          const r = row.original.primaryReason;
          return (
            <Badge
              className={cn(
                "text-[10px] text-white border-0",
                REASON_COLORS[r],
              )}
            >
              {REASON_LABELS[r]}
            </Badge>
          );
        },
      },
      {
        accessorKey: "recommendedAction",
        header: "الإجراء المقترح",
        cell: ({ getValue }) => (
          <span className="text-[11px] text-foreground/80">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs truncate max-w-[120px] block text-muted-foreground">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <DormantActionMenu
            product={row.original}
            onIgnore={handleIgnore}
            onChanged={() => setRefreshTick((t) => t + 1)}
          />
        ),
        enableSorting: false,
      },
    ],
    [filtered, selected],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "خطة-معالجة-المخزون-الراكد",
      sheetName: "خطة المعالجة",
      pdfTitle: "خطة معالجة المخزون الراكد",
      headers: [
        "الخطورة",
        "الكود",
        "المنتج",
        "المخزون",
        "القيمة",
        "آخر حركة (يوم)",
        "السبب",
        "الإجراء",
        "المورد",
      ],
      rows: filtered.map((p) => [
        p.riskScore,
        p.productCode,
        p.productName,
        p.currentStock,
        p.stockValue ?? "—",
        p.lastActivityDays ?? "—",
        REASON_LABELS[p.primaryReason],
        p.recommendedAction,
        p.lastSupplierName || "—",
      ]),
      summaryCards: [
        { label: "أصناف ضمن الخطة", value: String(filtered.length) },
        { label: "قيمة مجمّدة", value: fmt(summary.totalFrozen) },
        {
          label: "نسبة من المخزون",
          value: `${summary.frozenPct.toFixed(1)}%`,
        },
        {
          label: "متوسط العمر (يوم)",
          value: String(summary.avgAge),
        },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [filtered, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={Archive}
        title="المخزون الراكد — لوحة القرار"
        description="رتّب المشكلات حسب الخطورة المالية، فهم الأسباب، ونفّذ الإجراءات مباشرة"
      />

      {/* ───────── KPIs ───────── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-red-500" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Coins className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">
                رأس المال المجمّد
              </span>
            </div>
            <p className="text-xl font-black tabular-nums text-red-600 truncate">
              {fmt(summary.totalFrozen)}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {summary.frozenPct.toFixed(1)}% من قيمة المخزون
            </p>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={() => {
            setBucket("all");
            const limit = (
              enriched.reduce((s, p) => s + (p.stockValue ?? 0), 0) /
                Math.max(1, enriched.length)
            ) * 2;
            setMinValue(String(Math.round(limit)));
          }}
          className="text-right"
        >
          <Card className="border shadow-sm overflow-hidden hover:ring-2 hover:ring-orange-400 transition cursor-pointer">
            <div className="h-1 bg-orange-500" />
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-orange-500" />
                <span className="text-xs text-muted-foreground">
                  أصناف عالية الخطورة
                </span>
              </div>
              <p className="text-2xl font-black tabular-nums">
                {summary.highRiskCount}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                بقيمة {fmt(summary.highRiskValue)}
              </p>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => setBucket("critical")}
          className="text-right"
        >
          <Card className="border shadow-sm overflow-hidden hover:ring-2 hover:ring-purple-400 transition cursor-pointer">
            <div className="h-1 bg-purple-500" />
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <Undo2 className="h-4 w-4 text-purple-500" />
                <span className="text-xs text-muted-foreground">
                  مرشح للإرجاع للمورد
                </span>
              </div>
              <p className="text-2xl font-black tabular-nums">
                {summary.supplierReturnCount}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                بقيمة {fmt(summary.supplierReturnVal)}
              </p>
            </CardContent>
          </Card>
        </button>

        <button
          type="button"
          onClick={() => {
            setReasonFilter("negative_margin");
          }}
          className="text-right"
        >
          <Card className="border shadow-sm overflow-hidden hover:ring-2 hover:ring-rose-400 transition cursor-pointer">
            <div className="h-1 bg-rose-500" />
            <CardContent className="pt-3 pb-3">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="h-4 w-4 text-rose-500" />
                <span className="text-xs text-muted-foreground">
                  خسارة ربحية متوقعة
                </span>
              </div>
              <p className="text-xl font-black tabular-nums text-rose-600 truncate">
                {fmt(summary.profitLossVal)}
              </p>
              <p className="text-[10px] text-muted-foreground mt-0.5">
                {summary.profitLossCount} صنف
              </p>
            </CardContent>
          </Card>
        </button>

        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-amber-500" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">
                متوسط العمر بدون بيع
              </span>
            </div>
            <p className="text-2xl font-black tabular-nums text-amber-600">
              {summary.avgAge}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5">يوم</p>
          </CardContent>
        </Card>
      </div>

      {/* ───────── Diagnostic strip ───────── */}
      {reasonStats.length > 0 && (
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Filter className="h-4 w-4 text-primary" />
                توزيع الأسباب الرئيسية للركود
              </h3>
              {reasonFilter !== "all" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-[11px]"
                  onClick={() => setReasonFilter("all")}
                >
                  مسح الفلتر
                </Button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {reasonStats.map(([reason, stat]) => {
                const totalVal = enriched.reduce(
                  (s, p) => s + (p.stockValue ?? 0),
                  0,
                );
                const pct = totalVal > 0 ? (stat.value / totalVal) * 100 : 0;
                const active = reasonFilter === reason;
                return (
                  <button
                    key={reason}
                    type="button"
                    onClick={() =>
                      setReasonFilter(active ? "all" : (reason as DormantReason))
                    }
                    className={cn(
                      "text-right rounded-lg border p-2.5 transition hover:shadow-md",
                      active && "ring-2 ring-primary",
                    )}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold">
                        {REASON_LABELS[reason as DormantReason]}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {stat.count} صنف
                      </span>
                    </div>
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-1">
                      <div
                        className={cn(
                          "h-full",
                          REASON_COLORS[reason as DormantReason],
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="tabular-nums font-bold text-red-600">
                        {fmt(stat.value)}
                      </span>
                      <span className="text-muted-foreground">
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ───────── Bucket pills ───────── */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant={bucket === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setBucket("all")}
          className="h-8"
        >
          الكل ({enriched.length})
        </Button>
        {(["critical", "watch", "archive"] as DormantBucket[]).map((b) => {
          const meta = BUCKET_META[b];
          const Icon = meta.icon;
          return (
            <Button
              key={b}
              variant={bucket === b ? "default" : "outline"}
              size="sm"
              onClick={() => setBucket(b)}
              className={cn("h-8 gap-1.5", bucket !== b && meta.color)}
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label} ({bucketCounts[b]})
            </Button>
          );
        })}
      </div>

      {/* ───────── Filters ───────── */}
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
        <div className="w-44">
          <LookupCombobox
            items={categoryItems}
            value={categoryFilter === "all" ? "" : categoryFilter}
            onValueChange={(v) => setCategoryFilter(v || "all")}
            placeholder="كل التصنيفات"
            searchPlaceholder="ابحث عن تصنيف..."
            className="h-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground whitespace-nowrap">
            الحد الأدنى للقيمة
          </span>
          <Input
            type="number"
            value={minValue}
            onChange={(e) => setMinValue(e.target.value)}
            placeholder="0"
            className="h-9 w-24 text-xs"
          />
        </div>
      </TurnoverFilterBar>

      {/* ───────── Table ───────── */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            searchPlaceholder="ابحث بالكود أو الاسم..."
            emptyMessage={
              enriched.length === 0
                ? "🎉 لا توجد أصناف راكدة — مخزونك صحي!"
                : "لا توجد أصناف تطابق الفلاتر الحالية"
            }
            pageSize={20}
            columnLabels={{
              riskScore: "الخطورة",
              productCode: "الكود",
              productName: "المنتج",
              currentStock: "المخزون",
              stockValue: "القيمة",
              lastActivityDays: "آخر حركة",
              primaryReason: "السبب",
              recommendedAction: "الإجراء",
              lastSupplierName: "المورد",
            }}
          />
        </CardContent>
      </Card>

      {/* ───────── Sticky impact bar ───────── */}
      {selectionImpact.count > 0 && (
        <div className="sticky bottom-4 z-20">
          <Card className="border-2 border-primary shadow-2xl bg-background/95 backdrop-blur">
            <CardContent className="py-3 px-4">
              <div className="flex flex-wrap items-center gap-4 justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-bold">
                    تم اختيار {selectionImpact.count} صنف
                  </span>
                </div>
                <div className="flex items-center gap-5 text-xs">
                  <div>
                    <span className="text-muted-foreground">
                      قابل للاسترداد:{" "}
                    </span>
                    <span className="font-bold tabular-nums text-emerald-600">
                      {fmt(selectionImpact.recoverable)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      يحتاج تخفيض/شطب:{" "}
                    </span>
                    <span className="font-bold tabular-nums text-rose-600">
                      {fmt(selectionImpact.writedown)}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">
                      صافي التحرير:{" "}
                    </span>
                    <span className="font-bold tabular-nums text-primary">
                      {fmt(
                        selectionImpact.recoverable + selectionImpact.writedown,
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setSelected(new Set())}
                  >
                    إلغاء التحديد
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => navigate("/purchase-returns/new")}
                  >
                    <Undo2 className="h-3.5 w-3.5 ml-1.5" />
                    إنشاء مرتجع للمحدّد
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
