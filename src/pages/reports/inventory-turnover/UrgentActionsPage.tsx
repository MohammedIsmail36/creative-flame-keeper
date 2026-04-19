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
import { AlertTriangle, ShoppingCart, PackageX, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTurnoverData } from "./TurnoverDataContext";
import { TurnoverFilterBar } from "./TurnoverFilterBar";
import {
  ProductTurnoverData,
  TURNOVER_LABELS,
  PriorityDot,
  fmt,
  fmtInt,
} from "./types";
import { ExportConfig } from "@/components/ExportMenu";
import { LookupCombobox } from "@/components/LookupCombobox";

export default function UrgentActionsPage() {
  const { alerts, eligibleData, uniqueSuppliers, isLoading, settings } =
    useTurnoverData();

  const [supplierFilter, setSupplierFilter] = useState("all");
  const [abcFilter, setAbcFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");

  const urgentData = useMemo(() => {
    let data = [...alerts.urgent, ...alerts.followup, ...alerts.review];
    if (supplierFilter !== "all")
      data = data.filter((p) => p.lastSupplierName === supplierFilter);
    if (abcFilter !== "all")
      data = data.filter((p) => p.abcClass === abcFilter);
    if (priorityFilter !== "all")
      data = data.filter((p) => String(p.actionPriority) === priorityFilter);
    return data;
  }, [alerts, supplierFilter, abcFilter, priorityFilter]);

  const summary = useMemo(() => {
    const p1 = urgentData.filter((p) => p.actionPriority === 1);
    const p2 = urgentData.filter((p) => p.actionPriority === 2);
    const outOfStock = urgentData.filter(
      (p) => p.currentStock === 0 && p.soldQty > 0,
    );
    const totalRiskValue = urgentData.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    return {
      p1Count: p1.length,
      p2Count: p2.length,
      outOfStock: outOfStock.length,
      totalRiskValue,
    };
  }, [urgentData]);

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
            <span
              className={cn(
                "text-xs font-semibold tabular-nums",
                s === 0 && "text-red-600",
              )}
            >
              {fmtInt(s)}
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
        cell: ({ getValue }) => (
          <span className="text-xs tabular-nums">
            {fmtInt(getValue() as number)}
          </span>
        ),
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
        header: "الكمية المقترحة",
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
        header: "الإجراء المطلوب",
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
      filenamePrefix: "إجراءات-عاجلة",
      sheetName: "إجراءات عاجلة",
      pdfTitle: "تقرير الإجراءات العاجلة",
      headers: [
        "الأولوية",
        "الكود",
        "المنتج",
        "ABC",
        "المخزون",
        "القيمة",
        "المباع",
        "التغطية",
        "الكمية المقترحة",
        "آخر مورد",
        "الإجراء",
      ],
      rows: urgentData.map((p) => [
        p.actionPriority ? `P${p.actionPriority}` : "—",
        p.productCode,
        p.productName,
        p.abcClass,
        p.currentStock,
        p.stockValue ?? "—",
        p.soldQty,
        p.coverageDays ?? "—",
        p.suggestedPurchaseQty || "—",
        p.lastSupplierName || "—",
        p.actionLabel || "—",
      ]),
      summaryCards: [
        { label: "إجراء فوري (P1)", value: String(summary.p1Count) },
        { label: "متابعة (P2)", value: String(summary.p2Count) },
        { label: "نفد المخزون", value: String(summary.outOfStock) },
        { label: "قيمة المخزون المعرّض", value: fmt(summary.totalRiskValue) },
      ],
      settings,
      pdfOrientation: "landscape",
    }),
    [urgentData, summary, settings],
  );

  return (
    <div className="space-y-5" dir="rtl">
      <PageHeader
        icon={AlertTriangle}
        title="إجراءات عاجلة ومتابعة"
        description="أصناف تحتاج تدخل فوري أو متابعة"
      />

      <TurnoverFilterBar exportConfig={exportConfig}>
        <div className="w-px h-5 bg-border mx-1" />
        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-32 h-9 text-xs">
            <SelectValue placeholder="الأولوية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأولويات</SelectItem>
            <SelectItem value="1">P1 — فوري</SelectItem>
            <SelectItem value="2">P2 — متابعة</SelectItem>
            <SelectItem value="3">P3 — مراجعة</SelectItem>
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

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card
          className={cn(
            "border shadow-sm overflow-hidden",
            summary.p1Count > 0 && "ring-1 ring-red-500/30",
          )}
        >
          <div
            className={cn(
              "h-1",
              summary.p1Count > 0 ? "bg-red-500" : "bg-muted",
            )}
          />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle
                className={cn(
                  "h-4 w-4",
                  summary.p1Count > 0
                    ? "text-red-500"
                    : "text-muted-foreground",
                )}
              />
              <span className="text-xs text-muted-foreground">
                إجراء فوري (P1)
              </span>
            </div>
            <p
              className={cn(
                "text-2xl font-black tabular-nums",
                summary.p1Count > 0 ? "text-red-600" : "text-foreground",
              )}
            >
              {summary.p1Count}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div
            className={cn(
              "h-1",
              summary.p2Count > 0 ? "bg-amber-500" : "bg-muted",
            )}
          />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">متابعة (P2)</span>
            </div>
            <p className="text-2xl font-black tabular-nums">
              {summary.p2Count}
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
              summary.outOfStock > 0 ? "bg-red-400" : "bg-muted",
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
                summary.outOfStock > 0 ? "text-red-600" : "text-foreground",
              )}
            >
              {summary.outOfStock}
            </p>
          </CardContent>
        </Card>
        <Card className="border shadow-sm overflow-hidden">
          <div className="h-1 bg-muted" />
          <CardContent className="pt-3 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">
                قيمة المخزون المعرّض
              </span>
            </div>
            <p className="text-xl font-black tabular-nums truncate">
              {fmt(summary.totalRiskValue)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* DataTable */}
      <Card className="border shadow-sm">
        <CardContent className="pt-4">
          <DataTable
            columns={columns}
            data={urgentData}
            isLoading={isLoading}
            searchPlaceholder="ابحث بالكود أو الاسم..."
            emptyMessage="لا توجد إجراءات مطلوبة حالياً"
            pageSize={15}
            columnLabels={{
              productCode: "الكود",
              productName: "المنتج",
              abcClass: "ABC",
              currentStock: "المخزون",
              stockValue: "القيمة",
              soldQty: "المباع",
              coverageDays: "التغطية",
              suggestedPurchaseQty: "الكمية المقترحة",
              lastSupplierName: "آخر مورد",
              actionLabel: "الإجراء",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
