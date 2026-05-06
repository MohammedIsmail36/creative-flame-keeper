import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { ColumnDef } from "@tanstack/react-table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  Plus,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import {
  ProductTurnoverData,
  PriorityDot,
  fmt,
  fmtInt,
} from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

type TabKey = "all" | "p1" | "p2" | "p3" | "plan";

export default function BuyNowPage() {
  const {
    alerts,
    purchaseSuggestions,
    uniqueSuppliers,
    isLoading,
    settings,
  } = useTurnoverData();

  const [tab, setTab] = useState<TabKey>("all");
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");

  // Union deduped by product id; merge priority data so a product gets both columns
  const unionData = useMemo<ProductTurnoverData[]>(() => {
    const map = new Map<string, ProductTurnoverData>();
    for (const p of purchaseSuggestions) map.set(p.productId, p);
    for (const p of [...alerts.urgent, ...alerts.followup, ...alerts.review]) {
      const existing = map.get(p.productId);
      if (existing) {
        // Keep priority info from alerts if missing in plan
        map.set(p.productId, {
          ...existing,
          actionPriority: p.actionPriority ?? existing.actionPriority,
          actionLabel: p.actionLabel ?? existing.actionLabel,
        });
      } else {
        map.set(p.productId, p);
      }
    }
    return Array.from(map.values());
  }, [purchaseSuggestions, alerts]);

  const data = useMemo(() => {
    let d = unionData;
    if (tab === "p1") d = d.filter((p) => p.actionPriority === 1);
    else if (tab === "p2") d = d.filter((p) => p.actionPriority === 2);
    else if (tab === "p3") d = d.filter((p) => p.actionPriority === 3);
    else if (tab === "plan")
      d = d.filter((p) => (p.suggestedPurchaseQty ?? 0) > 0);
    if (supplierFilter !== "all")
      d = d.filter((p) => p.lastSupplierName === supplierFilter);
    if (abcFilter !== "all") d = d.filter((p) => p.abcClass === abcFilter);
    // Sort: by priority then by suggested purchase qty desc
    return [...d].sort((a, b) => {
      const pa = a.actionPriority ?? 9;
      const pb = b.actionPriority ?? 9;
      if (pa !== pb) return pa - pb;
      return (b.suggestedPurchaseQty ?? 0) - (a.suggestedPurchaseQty ?? 0);
    });
  }, [unionData, tab, supplierFilter, abcFilter]);

  // Counters per tab from full union
  const counts = useMemo(() => {
    const p1 = unionData.filter((p) => p.actionPriority === 1).length;
    const p2 = unionData.filter((p) => p.actionPriority === 2).length;
    const p3 = unionData.filter((p) => p.actionPriority === 3).length;
    const plan = unionData.filter(
      (p) => (p.suggestedPurchaseQty ?? 0) > 0,
    ).length;
    return { p1, p2, p3, plan, all: unionData.length };
  }, [unionData]);

  const summary = useMemo(() => {
    const totalCost = data.reduce(
      (s, p) =>
        s + (p.suggestedPurchaseQty ?? 0) * (p.lastPurchasePrice ?? 0),
      0,
    );
    const outOfStock = data.filter(
      (p) => p.currentStock === 0 && p.soldQty > 0,
    ).length;
    const belowMin = data.filter(
      (p) => p.belowMinStock && p.currentStock > 0,
    ).length;
    const totalRiskValue = data.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    return {
      totalItems: data.length,
      totalCost,
      outOfStock,
      belowMin,
      totalRiskValue,
    };
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
          <span className="text-xs font-medium truncate max-w-[200px] block">
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
                  ↓
                </Badge>
              )}
            </div>
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
          const v = (getValue() as number) ?? 0;
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
          (row.suggestedPurchaseQty ?? 0) * (row.lastPurchasePrice ?? 0),
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-xs font-semibold tabular-nums">
              {fmt(v)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          );
        },
      },
      {
        accessorKey: "lastPurchasePrice",
        header: "سعر الشراء",
        cell: ({ row }) => {
          const v = row.original.lastPurchasePrice;
          const wac = row.original.wac;
          const variance =
            v != null && wac != null && wac > 0
              ? Math.abs((v - wac) / wac) * 100
              : 0;
          const high = variance > 20;
          return (
            <span
              className={cn(
                "text-xs tabular-nums",
                high && "text-amber-600 font-semibold",
              )}
              title={
                high
                  ? `فرق ${variance.toFixed(0)}% عن WAC (${fmt(wac ?? 0)})`
                  : undefined
              }
            >
              {v != null ? fmt(v) : "—"}
              {high && " ⚠"}
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
        accessorKey: "actionLabel",
        header: "الإجراء",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            asChild
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-[11px] gap-1"
          >
            <Link
              to={`/purchases/new?product=${row.original.productId}&qty=${row.original.suggestedPurchaseQty || ""}`}
              title="إنشاء فاتورة شراء بهذا المنتج"
            >
              <Plus className="h-3 w-3" />
              شراء
            </Link>
          </Button>
        ),
      },
    ],
    [],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: "اشتر-الآن",
      sheetName: "قائمة الشراء",
      pdfTitle: "قائمة الشراء — أولويات وخطة 30 يوم",
      headers: [
        "الأولوية",
        "الكود",
        "المنتج",
        "ABC",
        "المخزون",
        "يومي",
        "التغطية",
        "كمية الشراء",
        "التكلفة",
        "سعر الشراء",
        "آخر مورد",
        "الإجراء",
      ],
      rows: data.map((p) => [
        p.actionPriority ? `P${p.actionPriority}` : "—",
        p.productCode,
        p.productName,
        p.abcClass,
        p.currentStock,
        p.avgDailySales > 0 ? Number(p.avgDailySales.toFixed(1)) : "—",
        p.coverageDays ?? "—",
        p.suggestedPurchaseQty || "—",
        (p.suggestedPurchaseQty ?? 0) * (p.lastPurchasePrice ?? 0) || "—",
        p.lastPurchasePrice ?? "—",
        p.lastSupplierName || "—",
        p.actionLabel || "—",
      ]),
      summaryCards: [
        { label: "إجمالي البنود", value: String(summary.totalItems) },
        { label: "تكلفة الشراء المقدّرة", value: fmt(summary.totalCost) },
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
        title="اشترِ الآن — أولويات وخطة شراء"
        description="قائمة موحّدة تجمع الإجراءات العاجلة وخطة التغطية لـ 30 يوم"
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

      {/* Tabs: priority / plan */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="h-auto flex-wrap gap-1 bg-muted/40 p-1">
          <TabsTrigger value="all" className="text-xs gap-1.5">
            الكل
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {counts.all}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="p1" className="text-xs gap-1.5">
            <AlertTriangle className="h-3 w-3 text-red-500" />
            فوري (P1)
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] px-1.5",
                counts.p1 > 0 && "bg-red-100 text-red-700",
              )}
            >
              {counts.p1}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="p2" className="text-xs gap-1.5">
            <Clock className="h-3 w-3 text-amber-500" />
            متابعة (P2)
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {counts.p2}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="p3" className="text-xs gap-1.5">
            مراجعة (P3)
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {counts.p3}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="plan" className="text-xs gap-1.5">
            <ShoppingCart className="h-3 w-3" />
            خطة 30 يوم
            <Badge variant="secondary" className="text-[10px] px-1.5">
              {counts.plan}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-blue-500" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-blue-600" />
              <span className="text-xs text-muted-foreground">
                إجمالي البنود
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
                تكلفة الشراء المقدَّرة
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
              <span className="text-xs text-muted-foreground">
                نفد المخزون
              </span>
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
            emptyMessage="لا توجد بنود في هذا التبويب"
            pageSize={15}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              abcClass: "ABC",
              currentStock: "المخزون",
              avgDailySales: "يومي",
              coverageDays: "التغطية",
              suggestedPurchaseQty: "كمية الشراء",
              estimatedCost: "التكلفة",
              lastPurchasePrice: "سعر الشراء",
              lastSupplierName: "آخر مورد",
              actionLabel: "الإجراء",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
