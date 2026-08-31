import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ArrowUp, ArrowDown, Minus, Info } from "lucide-react";
import { cn } from "@/lib/utils";

// الأنواع والثوابت الحسابية موحّدة في src/lib/turnover/constants.ts
export {
  DAYS_CONSIDERED_NEW,
  TURNOVER_LABELS,
  TURNOVER_PIE_COLORS,
  getTurnoverSpeed,
} from "@/lib/turnover/constants";
export type {
  ABCClass,
  ProductTurnoverData,
  TurnoverClass,
} from "@/lib/turnover/constants";

// ─── helpers ────────────────────────────────────────────────────────────────

export const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtInt = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 0 });

// ─── constants (UI only) ────────────────────────────────────────────────────

export const MATRIX_DECISIONS: Record<
  string,
  { icon: string; text: string; bg: string; border: string }
> = {
  "A-fast": {
    icon: "🌟",
    text: "حافظ على المخزون",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
  },
  "A-medium": {
    icon: "📦",
    text: "زد التوفر",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
  },
  "A-slow": {
    icon: "🔎",
    text: "حلّل السبب",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
  },
  "B-fast": {
    icon: "📈",
    text: "ادفع نحو A",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
  },
  "B-medium": {
    icon: "✅",
    text: "أداء مقبول",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
  },
  "B-slow": {
    icon: "💡",
    text: "راجع التسعير",
    bg: "bg-yellow-50 dark:bg-yellow-500/10",
    border: "border-yellow-200 dark:border-yellow-500/30",
  },
  "C-fast": {
    icon: "🔄",
    text: "ارفع الربحية",
    bg: "bg-blue-50 dark:bg-blue-500/10",
    border: "border-blue-200 dark:border-blue-500/30",
  },
  "C-medium": {
    icon: "⚠️",
    text: "قلّل الطلبات",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
  },
  "C-slow": {
    icon: "❌",
    text: "أوقف الشراء",
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/30",
  },
};

// ─── shared sub-components ───────────────────────────────────────────────────

/** KPI change arrow badge */
export const ChangeIndicator = ({
  value,
  inverted = false,
}: {
  value: number | null;
  inverted?: boolean;
}) => {
  if (value === null)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground">
        <Minus className="h-3 w-3" />
        <span>—</span>
      </span>
    );
  const good = inverted ? value < 0 : value > 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-semibold rounded-full px-1.5 py-0.5",
        good
          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
      )}
    >
      {value > 0 ? (
        <ArrowUp className="h-2.5 w-2.5" />
      ) : (
        <ArrowDown className="h-2.5 w-2.5" />
      )}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

/** Metric tooltip helper */
export const MetricHelp = ({ text }: { text: string }) => (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="h-3 w-3 text-muted-foreground/50 cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs text-right">
        {text}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

/** Priority dot shown in table rows */
export const PriorityDot = ({ priority }: { priority: 1 | 2 | 3 | null }) => {
  if (!priority) return null;
  const map = {
    1: { cls: "bg-red-500 ring-red-200", tip: "إجراء فوري مطلوب" },
    2: { cls: "bg-amber-500 ring-amber-200", tip: "يحتاج متابعة" },
    3: { cls: "bg-yellow-400 ring-yellow-200", tip: "للمراجعة" },
  };
  const { cls, tip } = map[priority];
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={cn("inline-block w-2 h-2 rounded-full ring-2", cls)} />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
