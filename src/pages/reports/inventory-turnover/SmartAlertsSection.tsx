import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu, type ExportConfig } from "@/components/ExportMenu";
import { ColumnDef } from "@tanstack/react-table";
import { Flame, AlertTriangle, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/contexts/SettingsContext";
import { ProductTurnoverData, fmt, fmtInt } from "./types";

interface SmartAlertsSectionProps {
  alerts: {
    urgent: ProductTurnoverData[];
    followup: ProductTurnoverData[];
    review: ProductTurnoverData[];
  };
}

function AlertTable({
  data,
  tier,
}: {
  data: ProductTurnoverData[];
  tier: "urgent" | "followup" | "review";
}) {
  const { settings } = useSettings();

  const tierConfig = {
    urgent: {
      icon: <Flame className="h-3.5 w-3.5 text-red-600" />,
      iconBg: "bg-red-500/15",
      title: "إجراء فوري",
      cardBg: "bg-red-50 dark:bg-red-500/5",
      cardBorder: "border-red-200 dark:border-red-500/20",
      titleColor: "text-red-700 dark:text-red-400",
      countColor: "text-red-500",
      filenamePrefix: "تنبيهات-إجراء-فوري",
    },
    followup: {
      icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />,
      iconBg: "bg-amber-500/15",
      title: "يحتاج متابعة",
      cardBg: "bg-amber-50 dark:bg-amber-500/5",
      cardBorder: "border-amber-200 dark:border-amber-500/20",
      titleColor: "text-amber-700 dark:text-amber-400",
      countColor: "text-amber-500",
      filenamePrefix: "تنبيهات-متابعة",
    },
    review: {
      icon: <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />,
      iconBg: "bg-yellow-500/15",
      title: "للمراجعة",
      cardBg: "bg-yellow-50 dark:bg-yellow-500/5",
      cardBorder: "border-yellow-200 dark:border-yellow-500/20",
      titleColor: "text-yellow-700 dark:text-yellow-400",
      countColor: "text-yellow-500",
      filenamePrefix: "تنبيهات-مراجعة",
    },
  };

  const cfg = tierConfig[tier];

  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
    () => [
      {
        accessorKey: "productCode",
        header: "الكود",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "productName",
        header: "المنتج",
        cell: ({ getValue }) => (
          <span className="font-medium text-sm">{getValue() as string}</span>
        ),
      },
      {
        accessorKey: "actionLabel",
        header: "الإجراء",
        cell: ({ getValue }) => (
          <span className={cn("text-xs", cfg.titleColor)}>
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "coverageDays",
        header: "التغطية",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "tabular-nums text-sm",
                v < 15 ? "text-destructive font-semibold" : "",
              )}
            >
              {v} يوم
            </span>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ getValue }) => (
          <span
            className={cn(
              "tabular-nums font-semibold text-sm",
              (getValue() as number) === 0 ? "text-destructive" : "",
            )}
          >
            {fmtInt(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "stockValue",
        header: "القيمة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span className="tabular-nums font-mono text-xs">{fmt(v)}</span>
          );
        },
      },
      {
        accessorKey: "lastSupplierName",
        header: "المورد",
        cell: ({ getValue }) => (
          <span className="text-xs text-muted-foreground">
            {(getValue() as string) || "—"}
          </span>
        ),
      },
    ],
    [cfg.titleColor],
  );

  const exportConfig = useMemo<ExportConfig>(
    () => ({
      filenamePrefix: cfg.filenamePrefix,
      sheetName: cfg.title,
      pdfTitle: `تنبيهات — ${cfg.title}`,
      headers: [
        "الكود",
        "المنتج",
        "الإجراء",
        "التغطية",
        "المخزون",
        "القيمة",
        "المورد",
      ],
      rows: data.map((p) => [
        p.productCode,
        p.productName,
        p.actionLabel || "—",
        p.coverageDays ?? "—",
        p.currentStock,
        p.stockValue !== null ? p.stockValue : "—",
        p.lastSupplierName || "—",
      ]),
      settings,
    }),
    [data, settings, cfg.filenamePrefix, cfg.title],
  );

  return (
    <Card
      className={cn(
        "border shadow-sm overflow-hidden",
        cfg.cardBorder,
        cfg.cardBg,
      )}
    >
      <CardContent className="py-4 px-4">
        <DataTable
          columns={columns}
          data={data}
          showSearch={false}
          showColumnToggle={false}
          showPagination={data.length > 10}
          pageSize={10}
          emptyMessage="لا توجد تنبيهات"
          toolbarStart={
            <div className="flex items-center gap-2.5">
              <div
                className={cn(
                  "w-7 h-7 rounded-lg flex items-center justify-center",
                  cfg.iconBg,
                )}
              >
                {cfg.icon}
              </div>
              <div className="text-right">
                <span className={cn("text-sm font-bold", cfg.titleColor)}>
                  {cfg.title}
                </span>
                <span className={cn("text-xs mr-2", cfg.countColor)}>
                  ({data.length} صنف)
                </span>
              </div>
            </div>
          }
          toolbarContent={
            <ExportMenu config={exportConfig} disabled={data.length === 0} />
          }
        />
      </CardContent>
    </Card>
  );
}

export function SmartAlertsSection({ alerts }: SmartAlertsSectionProps) {
  if (
    alerts.urgent.length === 0 &&
    alerts.followup.length === 0 &&
    alerts.review.length === 0
  ) {
    return null;
  }

  return (
    <div className="space-y-2">
      {alerts.urgent.length > 0 && (
        <AlertTable data={alerts.urgent} tier="urgent" />
      )}
      {alerts.followup.length > 0 && (
        <AlertTable data={alerts.followup} tier="followup" />
      )}
      {alerts.review.length > 0 && (
        <AlertTable data={alerts.review} tier="review" />
      )}
    </div>
  );
}
