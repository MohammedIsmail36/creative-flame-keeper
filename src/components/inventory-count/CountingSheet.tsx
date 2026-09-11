import React, { useMemo, useRef, useState } from "react";
import { Search, ListChecks, PackagePlus, CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { LookupCombobox } from "@/components/LookupCombobox";
import { SectionHeader } from "@/components/SectionHeader";
import { productsToLookupItems, ProductWithBrand } from "@/lib/product-utils";
import { cn } from "@/lib/utils";
import {
  CountLine,
  countProgress,
  isCounted,
} from "@/lib/inventory-count";

interface CountingSheetProps {
  lines: CountLine[];
  products: ProductWithBrand[];
  readOnly?: boolean;
  onCountedChange: (lineId: string, value: number | null) => void;
  onNotesChange: (lineId: string, value: string) => void;
  /** يُستدعى عند اختيار منتج غير موجود في قائمة الجرد */
  onAddExtraProduct: (productId: string) => Promise<string | null>;
}

/**
 * شاشة العد: لا تُظهر كمية النظام إطلاقاً.
 * الوصول للصنف يتم عبر البحث بالكود/الموديل/الماركة/الاسم.
 */
export function CountingSheet({
  lines,
  products,
  readOnly = false,
  onCountedChange,
  onNotesChange,
  onAddExtraProduct,
}: CountingSheetProps) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [onlyRemaining, setOnlyRemaining] = useState(false);
  const [search, setSearch] = useState("");

  const progress = countProgress(lines);

  const lineByProduct = useMemo(() => {
    const map: Record<string, CountLine> = {};
    lines.forEach((l) => (map[l.product_id] = l));
    return map;
  }, [lines]);

  const lookupItems = useMemo(
    () => productsToLookupItems(products, false, true),
    [products],
  );

  function focusLine(lineId: string) {
    setHighlightId(lineId);
    setOnlyRemaining(false);
    setSearch("");
    setTimeout(() => {
      const el = inputRefs.current[lineId];
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      el?.focus();
      el?.select();
    }, 60);
  }

  async function handleQuickSelect(productId: string) {
    if (!productId) return;
    const existing = lineByProduct[productId];
    if (existing) {
      focusLine(existing.id);
      return;
    }
    const newId = await onAddExtraProduct(productId);
    if (newId) focusLine(newId);
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return lines.filter((l) => {
      if (onlyRemaining && isCounted(l)) return false;
      if (!q) return true;
      return (
        l.code.toLowerCase().includes(q) ||
        l.product_name.toLowerCase().includes(q)
      );
    });
  }, [lines, onlyRemaining, search]);

  return (
    <div className="bg-card rounded-2xl border shadow-sm overflow-hidden">
      {/* رأس البطاقة: التقدّم */}
      <div className="px-6 py-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <SectionHeader icon={ListChecks} title="ورقة العد" />
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold tabular-nums">
              تم جرد {progress.counted.toLocaleString("en-US")} من{" "}
              {progress.total.toLocaleString("en-US")}
            </span>
            {progress.remaining > 0 ? (
              <Badge variant="secondary" className="tabular-nums">
                متبقي {progress.remaining.toLocaleString("en-US")}
              </Badge>
            ) : (
              <Badge className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                اكتمل العد
              </Badge>
            )}
          </div>
        </div>
        <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress.percent}%` }}
          />
        </div>
      </div>

      {/* البحث السريع */}
      {!readOnly && (
        <div className="px-6 py-4 border-b border-border bg-muted/10 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[280px] flex-1">
              <LookupCombobox
                value=""
                onValueChange={(v) => void handleQuickSelect(v)}
                items={lookupItems}
                placeholder="ابحث بكود المنتج أو الموديل أو الماركة أو الاسم…"
                searchPlaceholder="اكتب الكود / الموديل / الماركة…"
              />
            </div>
            <div className="relative min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="تصفية القائمة…"
                className="rounded-xl pr-9"
              />
            </div>
            <button
              type="button"
              onClick={() => setOnlyRemaining((v) => !v)}
              className={cn(
                "text-xs font-semibold px-3 py-2 rounded-lg border transition-all",
                onlyRemaining
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/40 border-border text-muted-foreground hover:bg-muted",
              )}
            >
              غير المجرودة فقط
            </button>
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <PackagePlus className="h-3.5 w-3.5" />
            اختيار منتج غير موجود في القائمة يضيفه تلقائياً كصنف موجود فعلياً.
            اكتب <strong>0</strong> إذا لم تجد الصنف — الخانة الفارغة تعني «لم
            يُجرد».
          </p>
        </div>
      )}

      {/* الجدول */}
      <div className="overflow-x-auto">
        <table className="w-full text-right border-collapse" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "4%" }} />
            <col style={{ width: "12%" }} />
            <col style={{ width: "39%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
            <col style={{ width: "15%" }} />
          </colgroup>
          <thead>
            <tr className="border-b border-border bg-muted/20">
              <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">#</th>
              <th className="py-2 px-3 text-xs font-medium text-muted-foreground">الكود</th>
              <th className="py-2 px-3 text-xs font-medium text-muted-foreground">المنتج</th>
              <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                الكمية المعدودة
              </th>
              <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                الحالة
              </th>
              <th className="py-2 px-3 text-xs font-medium text-muted-foreground text-center">
                ملاحظة
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="py-14 text-center text-sm text-muted-foreground">
                    لا توجد أصناف مطابقة
                  </div>
                </td>
              </tr>
            ) : (
              visible.map((line, i) => {
                const counted = isCounted(line);
                return (
                  <tr
                    key={line.id}
                    className={cn(
                      "border-b border-border/40 last:border-0 transition-colors",
                      highlightId === line.id
                        ? "bg-primary/5"
                        : "hover:bg-muted/20",
                    )}
                  >
                    <td className="py-2 px-3 text-center text-xs text-muted-foreground/50 tabular-nums">
                      {i + 1}
                    </td>
                    <td className="py-2 px-3 font-mono text-xs">{line.code}</td>
                    <td className="py-2 px-3 min-w-0">
                      <span className="text-sm font-medium block truncate" title={line.product_name}>
                        {line.product_name}
                      </span>
                      {line.is_extra && (
                        <span className="text-[11px] text-amber-700 dark:text-amber-400">
                          صنف مُضاف أثناء الجرد
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {readOnly ? (
                        <span className="block text-center font-mono tabular-nums text-sm">
                          {counted
                            ? Number(line.counted_quantity).toLocaleString("en-US")
                            : "—"}
                        </span>
                      ) : (
                        <Input
                          inputMode="decimal"
                          value={
                            line.counted_quantity === null
                              ? ""
                              : String(line.counted_quantity)
                          }
                          onChange={(e) => {
                            const raw = toWesternDigits(e.target.value)
                              .replace(/,/g, ".")
                              .trim();
                            if (raw === "") {
                              onCountedChange(line.id, null);
                              return;
                            }
                            if (!/^\d*\.?\d*$/.test(raw)) return;
                            const num = parseFloat(raw);
                            if (!Number.isNaN(num)) onCountedChange(line.id, num);
                          }}
                          placeholder="—"
                          ref={(el) => {
                            inputRefs.current[line.id] = el;
                          }}
                          className={cn(
                            "font-mono tabular-nums text-center rounded-md h-9 w-full",
                            counted
                              ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-700"
                              : "bg-muted/30 border-border",
                          )}
                        />
                      )}

                    </td>
                    <td className="py-2 px-3 text-center">
                      {counted ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          تم الجرد
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <Circle className="h-3.5 w-3.5" />
                          لم يُجرد
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {readOnly ? (
                        <span className="text-xs text-muted-foreground truncate block">
                          {line.notes || "—"}
                        </span>
                      ) : (
                        <Input
                          value={line.notes}
                          onChange={(e) => onNotesChange(line.id, e.target.value)}
                          placeholder="ملاحظة…"
                          className="text-xs bg-muted/30 border-border rounded-md h-9 w-full"
                        />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
