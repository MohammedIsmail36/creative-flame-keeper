import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  BookOpen,
  Wrench,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fmt } from "./types";

export interface ReconciliationData {
  operational: number;
  accounting: number;
  diff: number;
  absDiff: number;
  deviationPct: number;
  level: "match" | "rounding" | "minor" | "critical";
}

export function computeReconciliation(
  operational: number,
  accounting: number,
): ReconciliationData {
  const diff = operational - accounting;
  const absDiff = Math.abs(diff);
  const deviationPct =
    accounting !== 0 ? (absDiff / Math.abs(accounting)) * 100 : 0;
  let level: ReconciliationData["level"];
  if (absDiff === 0) level = "match";
  else if (absDiff <= 1) level = "rounding";
  else if (absDiff > 1000 || deviationPct > 5) level = "critical";
  else level = "minor";
  return { operational, accounting, diff, absDiff, deviationPct, level };
}

interface ReconciliationBannerProps {
  data: ReconciliationData;
}

export function ReconciliationBanner({ data: r }: ReconciliationBannerProps) {
  const navigate = useNavigate();

  if (r.level === "match") {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5 shadow-sm">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              ✓ المخزون متطابق محاسبياً
            </span>
            <span className="text-muted-foreground">
              التقرير:{" "}
              <span className="font-mono font-semibold text-foreground">
                {fmt(r.operational)}
              </span>
            </span>
            <span className="text-muted-foreground">
              دفتر الأستاذ (1104):{" "}
              <span className="font-mono font-semibold text-foreground">
                {fmt(r.accounting)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (r.level === "rounding") {
    return (
      <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm">
        <CardContent className="py-3 px-4 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="flex-1 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
              ✓ متطابق (فرق تقريب: {fmt(r.absDiff)})
            </span>
            <span className="text-muted-foreground">
              التقرير:{" "}
              <span className="font-mono font-semibold text-foreground">
                {fmt(r.operational)}
              </span>
            </span>
            <span className="text-muted-foreground">
              دفتر الأستاذ:{" "}
              <span className="font-mono font-semibold text-foreground">
                {fmt(r.accounting)}
              </span>
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (r.level === "minor") {
    return (
      <Card className="border-amber-500/50 bg-amber-500/5 shadow-sm">
        <CardContent className="py-4 px-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="font-semibold text-amber-700 dark:text-amber-400 text-sm">
                  ⚠ فرق محاسبي: {fmt(r.absDiff)}
                </span>
                <span className="text-xs text-muted-foreground">
                  التقرير (تشغيلي):{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {fmt(r.operational)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  دفتر الأستاذ:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {fmt(r.accounting)}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  نسبة الانحراف:{" "}
                  <span className="font-mono font-semibold">
                    {r.deviationPct.toFixed(2)}%
                  </span>
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                السبب المحتمل: قيد محاسبي مباشر على حساب 1104 لا يقابله حركة
                مخزون (مثل: فروقات أسعار PPV، تسوية جرد، إعادة تقييم).
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-500/50 hover:bg-amber-500/10"
                  onClick={() => navigate("/ledger?account=1104")}
                >
                  <BookOpen className="w-3.5 h-3.5 ml-1" />
                  فتح دفتر الأستاذ
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-500/50 hover:bg-amber-500/10"
                  onClick={() => navigate("/inventory-adjustments")}
                >
                  <Wrench className="w-3.5 h-3.5 ml-1" />
                  تسويات المخزون
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // critical
  return (
    <Card className="border-destructive/60 bg-destructive/5 shadow-md">
      <CardContent className="py-4 px-4 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="w-6 h-6 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
              <span className="font-bold text-destructive text-sm">
                🚨 فرق جوهري — يتطلب تدقيق فوري
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs">
              <span className="text-muted-foreground">
                التقرير:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {fmt(r.operational)}
                </span>
              </span>
              <span className="text-muted-foreground">
                دفتر الأستاذ:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {fmt(r.accounting)}
                </span>
              </span>
              <span className="text-muted-foreground">
                الفرق:{" "}
                <span className="font-mono font-bold text-destructive">
                  {fmt(r.absDiff)}
                </span>
              </span>
              <span className="text-muted-foreground">
                نسبة الانحراف:{" "}
                <span className="font-mono font-bold text-destructive">
                  {r.deviationPct.toFixed(2)}%
                </span>
              </span>
            </div>
            <div className="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2">
              <p className="text-xs font-semibold text-destructive">
                ⛔ يُرجى إيقاف إقفال الشهر حتى تسوية هذا الفرق مع إدارة
                المالية.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="destructive"
                className="h-8 text-xs"
                onClick={() => navigate("/ledger?account=1104")}
              >
                <BookOpen className="w-3.5 h-3.5 ml-1" />
                فتح دفتر الأستاذ
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-destructive/50 hover:bg-destructive/10"
                onClick={() => navigate("/inventory-adjustments")}
              >
                <Wrench className="w-3.5 h-3.5 ml-1" />
                تسويات المخزون
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
