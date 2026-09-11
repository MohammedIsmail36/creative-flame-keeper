import React, { useMemo, useState } from "react";
import { ClipboardCheck, Search, TrendingDown, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/SectionHeader";
import { cn } from "@/lib/utils";
import {
  CountLine,
  isCounted,
  lineDifference,
  lineDifferenceValue,
  summarizeCount,
} from "@/lib/inventory-count";

interface ReviewSheetProps {
  lines: CountLine[];
  formatCurrency: (v: number) => string;
}

type Tab = "all" | "diff" | "uncounted";

/** شاشة المراجعة: تُظهر كمية النظام والفعلي والفرق وقيمته */
export function ReviewSheet({ lines, formatCurrency }: ReviewSheetProps) {
  const [tab, setTab] = useState<Tab>("diff");
  const [search, setSearch] = useState("");
  const summary = summarizeCount(lines);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      const diff = lineDifference(l);
      if (tab === "diff" && (diff === null || diff === 0)) return false;
      if (tab === "uncounted" && isCounted(l)) return false;
      if (!q) return true;
      return (
        l.code.toLowerCase().includes(q) ||
        l.product_name.toLowerCase().includes(q)
      );
    });
  }, [lines, tab, search]);

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "diff", label: "الفروق", count: summary.gainCount + summary.lossCount },
    { key: "uncounted", label: "لم يُجرد", count: summary.uncountedCount },
    { key: "all", label: "كل الأصناف", count: lines.length },
  ];

  return (
    <div className="space-y-4">
      {/* ملخص الفروق */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl border shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingUp className="h-4 w-4 text-emerald-600" />
            زيادة عن النظام
          </div>
          <div className="text-xl font-bold text-emerald-600 tabular-nums">
            {formatCurrency(summary.totalGain)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {summary.gainCount.toLocaleString("en-US")} صنف
          </div>
        </div>
        <div className="bg-card rounded-2xl border shadow-sm p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <TrendingDown className="h-4 w-4 text-destructive" />
            نقص عن النظام
          </div>
          <div className="text-xl font-bold text-destructive tabular-nums">
            {formatCurrency(summary.totalLoss)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            {summary.lossCount.toLocaleString("en-US")} صنف
          </div>
        </div>
        <div className="bg-card rounded-2xl border shadow-sm p-4">
          <div className="text-xs text-muted-foreground mb-1">صافي أثر التسوية</div>
          <div
            className={cn(
              "text-xl font-bold tabular-nums",
              summary.net > 0
                ? "text-emerald-600"
                : summary.net < 0
                  ? "text-destructive"
                  : "text-foreground",
            )}
          >
            {formatCurrency(summary.net)}
          </div>
          <div className="text-xs text-muted-foreground mt-1 tabular-nums">
            مطابق: {summary.matchCount.toLocaleString("en-US")} — لم يُجرد:{" "}
            {summary.uncountedCount.toLocaleString("en-US")}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <SectionHeader icon={ClipboardCheck} title="مراجعة نتائج الجرد" />
          <div className="flex items-center gap-2 flex-wrap">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all tabular-nums",
                  tab === t.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {t.label} ({t.count.toLocaleString("en-US")})
              </button>
            ))}
            <div className="relative min-w-[180px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث…"
                className="rounded-xl pr-9 h-9"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/20">
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">الكود</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">المنتج</th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                  النظام عند بدء الجرد
                </th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                  الفعلي
                </th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                  الفرق
                </th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                  قيمة الفرق
                </th>
                <th className="py-2 px-3 text-xs font-medium text-muted-foreground">ملاحظة</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="py-14 text-center text-sm text-muted-foreground">
                      لا توجد أصناف في هذا التصنيف
                    </div>
                  </td>
                </tr>
              ) : (
                visible.map((l) => {
                  const diff = lineDifference(l);
                  return (
                    <tr key={l.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                      <td className="py-2 px-3 font-mono text-xs">{l.code}</td>
                      <td className="py-2 px-3 text-sm">
                        {l.product_name}
                        {l.is_extra && (
                          <span className="text-[11px] text-amber-700 dark:text-amber-400 block">
                            صنف مُضاف أثناء الجرد
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono tabular-nums text-sm">
                        {l.system_quantity.toLocaleString("en-US")}
                      </td>
                      <td className="py-2 px-3 text-center font-mono tabular-nums text-sm">
                        {isCounted(l)
                          ? Number(l.counted_quantity).toLocaleString("en-US")
                          : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        {diff === null ? (
                          <Badge variant="secondary">لم يُجرد</Badge>
                        ) : diff === 0 ? (
                          <span className="text-xs text-muted-foreground">مطابق</span>
                        ) : (
                          <span
                            className={cn(
                              "font-mono tabular-nums text-sm font-semibold",
                              diff > 0 ? "text-emerald-600" : "text-destructive",
                            )}
                          >
                            {diff > 0 ? "+" : ""}
                            {diff.toLocaleString("en-US")}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center font-mono tabular-nums text-sm">
                        {diff === null || diff === 0
                          ? "—"
                          : formatCurrency(lineDifferenceValue(l))}
                      </td>
                      <td className="py-2 px-3 text-xs text-muted-foreground">
                        {l.notes || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
