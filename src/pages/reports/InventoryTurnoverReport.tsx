import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ExportMenu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryTreeSelect } from "@/components/CategoryTreeSelect";
import { DatePickerInput } from "@/components/DatePickerInput";
import { ColumnDef } from "@tanstack/react-table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip, Legend } from "recharts";
import { useSettings } from "@/contexts/SettingsContext";
import { format, startOfMonth, differenceInDays, subDays, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Package,
  DollarSign,
  ShoppingCart,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  Info,
  AlertCircle,
  Flame,
  Eye,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

const DAYS_CONSIDERED_NEW = 30;

// ─── types ───────────────────────────────────────────────────────────────────

type TurnoverClass = "excellent" | "good" | "slow" | "stagnant" | "new" | "new_unlisted";
type ABCClass = "A" | "B" | "C" | "excluded";

interface ProductTurnoverData {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  categoryId: string | null;
  currentStock: number;
  stockValue: number | null;
  soldQty: number;
  purchasedQty: number;
  turnoverRate: number | null;
  coverageDays: number | null;
  avgDailySales: number;
  lastSaleDate: string | null;
  lastPurchaseDate: string | null;
  lastPurchasePrice: number | null;
  turnoverClass: TurnoverClass;
  abcClass: ABCClass;
  actionPriority: 1 | 2 | 3 | null;
  actionLabel: string | null;
  revenue: number;
  lastSupplierName: string | null;
}

// ─── label / color maps ───────────────────────────────────────────────────────

const TURNOVER_LABELS: Record<TurnoverClass, string> = {
  excellent: "ممتاز",
  good: "جيد",
  slow: "بطيء",
  stagnant: "راكد",
  new: "جديد",
  new_unlisted: "غير مُدرج",
};

const TURNOVER_PIE_COLORS: Record<string, string> = {
  ممتاز: "hsl(152,60%,42%)",
  جيد: "hsl(217,80%,50%)",
  بطيء: "hsl(38,92%,50%)",
  راكد: "hsl(0,72%,51%)",
  جديد: "hsl(0,0%,72%)",
};

const MATRIX_DECISIONS: Record<string, { icon: string; text: string; bg: string; border: string }> = {
  "A-fast": {
    icon: "✅",
    text: "استمر وزِد",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
  },
  "A-medium": {
    icon: "⚠️",
    text: "حافظ على المخزون",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
  },
  "A-slow": {
    icon: "🔴",
    text: "خطر — راجع فوراً",
    bg: "bg-red-50 dark:bg-red-500/10",
    border: "border-red-200 dark:border-red-500/30",
  },
  "B-fast": {
    icon: "✅",
    text: "أداء جيد",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
  },
  "B-medium": {
    icon: "🟡",
    text: "راقب الأداء",
    bg: "bg-yellow-50 dark:bg-yellow-500/10",
    border: "border-yellow-200 dark:border-yellow-500/30",
  },
  "B-slow": {
    icon: "⚠️",
    text: "قلّل المخزون",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
  },
  "C-fast": {
    icon: "🟡",
    text: "راجع التسعير",
    bg: "bg-yellow-50 dark:bg-yellow-500/10",
    border: "border-yellow-200 dark:border-yellow-500/30",
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

function getTurnoverSpeed(tc: TurnoverClass): "fast" | "medium" | "slow" {
  if (tc === "excellent") return "fast";
  if (tc === "good") return "medium";
  return "slow";
}

// ─── sub-components ───────────────────────────────────────────────────────────

/** KPI change arrow badge */
const ChangeIndicator = ({ value, inverted = false }: { value: number | null; inverted?: boolean }) => {
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
      {value > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
};

/** Metric tooltip helper */
const MetricHelp = ({ text }: { text: string }) => (
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
const PriorityDot = ({ priority }: { priority: 1 | 2 | 3 | null }) => {
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

// ─── main component ───────────────────────────────────────────────────────────

export default function InventoryTurnoverReport() {
  const { settings } = useSettings();

  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [turnoverFilter, setTurnoverFilter] = useState<TurnoverClass | "all">("all");
  const [abcFilter, setAbcFilter] = useState<ABCClass | "all">("all");
  const [matrixFilter, setMatrixFilter] = useState<string | null>(null);

  const periodDays = Math.max(differenceInDays(new Date(dateTo), new Date(dateFrom)), 1);
  const prevFrom = format(subDays(new Date(dateFrom), periodDays), "yyyy-MM-dd");
  const prevTo = format(subDays(new Date(dateFrom), 1), "yyyy-MM-dd");
  const today = new Date();

  // ── queries ────────────────────────────────────────────────────────────────

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["turnover-products"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, code, name, quantity_on_hand, purchase_price, category_id, is_active, created_at, product_categories(name)",
        )
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: salesData = [], isLoading: loadingSales } = useQuery({
    queryKey: ["turnover-sales", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select("product_id, quantity, total, unit_price, invoice:sales_invoices!inner(invoice_date, status)")
        .gte("invoice.invoice_date", dateFrom)
        .lte("invoice.invoice_date", dateTo)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: prevSalesData = [] } = useQuery({
    queryKey: ["turnover-prev-sales", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select("product_id, quantity, total, invoice:sales_invoices!inner(invoice_date, status)")
        .gte("invoice.invoice_date", prevFrom)
        .lte("invoice.invoice_date", prevTo)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return data as any[];
    },
  });

  // FIX: Use foreignTable for ordering in Supabase, with a 2-year window to limit data
  const twoYearsAgo = format(subDays(new Date(), 730), "yyyy-MM-dd");
  const { data: purchaseData = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["turnover-purchases"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select(
          "product_id, quantity, unit_price, invoice:purchase_invoices!inner(invoice_date, status, supplier_id, suppliers(name))",
        )
        .eq("invoice.status", "posted")
        .gte("invoice.invoice_date", twoYearsAgo)
        .order("invoice_date", { ascending: false, foreignTable: "purchase_invoices" });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["turnover-categories"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, parent_id")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const isLoading = loadingProducts || loadingSales || loadingPurchases;

  // ── aggregations ───────────────────────────────────────────────────────────

  const salesByProduct = useMemo(() => {
    const map: Record<string, { soldQty: number; revenue: number; lastDate: string | null }> = {};
    salesData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { soldQty: 0, revenue: 0, lastDate: null };
      map[pid].soldQty += Number(item.quantity);
      map[pid].revenue += Number(item.total);
      const d = item.invoice?.invoice_date;
      if (d && (!map[pid].lastDate || d > map[pid].lastDate!)) map[pid].lastDate = d;
    });
    return map;
  }, [salesData]);

  const prevSalesByProduct = useMemo(() => {
    const map: Record<string, { soldQty: number; revenue: number }> = {};
    prevSalesData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { soldQty: 0, revenue: 0 };
      map[pid].soldQty += Number(item.quantity);
      map[pid].revenue += Number(item.total);
    });
    return map;
  }, [prevSalesData]);

  const purchasesByProduct = useMemo(() => {
    const map: Record<
      string,
      { purchasedQty: number; lastDate: string | null; lastPrice: number | null; lastSupplierName: string | null }
    > = {};
    purchaseData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      const d = item.invoice?.invoice_date;
      if (!map[pid]) {
        map[pid] = {
          purchasedQty: 0,
          lastDate: d || null,
          lastPrice: item.unit_price != null ? Number(item.unit_price) : null,
          lastSupplierName: item.invoice?.suppliers?.name || null,
        };
      }
      map[pid].purchasedQty += Number(item.quantity);
      // Keep most recent purchase data (query is already ordered DESC)
      if (d && (!map[pid].lastDate || d > map[pid].lastDate!)) {
        map[pid].lastDate = d;
        map[pid].lastPrice = item.unit_price != null ? Number(item.unit_price) : map[pid].lastPrice;
        map[pid].lastSupplierName = item.invoice?.suppliers?.name || map[pid].lastSupplierName;
      }
    });
    return map;
  }, [purchaseData]);

  // ── core calculation ──────────────────────────────────────────────────────

  const allTurnoverData = useMemo(() => {
    const items: ProductTurnoverData[] = products.map((p: any) => {
      const sales = salesByProduct[p.id];
      const purchases = purchasesByProduct[p.id];

      const currentStock = Number(p.quantity_on_hand);
      const soldQty = sales?.soldQty || 0;
      const purchasedQty = purchases?.purchasedQty || 0;
      const lastPurchasePrice = purchases?.lastPrice ?? (p.purchase_price != null ? Number(p.purchase_price) : null);
      const lastSupplierName = purchases?.lastSupplierName || null;
      const revenue = sales?.revenue || 0;
      const lastSaleDate = sales?.lastDate || null;
      const lastPurchaseDate = purchases?.lastDate || null;

      // ── Step A: new-product detection (must run first) ───────────────────
      const daysSinceAdded = p.created_at ? differenceInDays(today, new Date(p.created_at)) : Infinity;
      const daysSinceLastPurchase = lastPurchaseDate ? differenceInDays(today, new Date(lastPurchaseDate)) : Infinity;

      const isNeverPurchased = lastPurchaseDate === null && soldQty === 0;
      const isNewProduct = soldQty === 0 && !isNeverPurchased && daysSinceLastPurchase < DAYS_CONSIDERED_NEW;
      const isRecentlyAdded = soldQty === 0 && isNeverPurchased && daysSinceAdded < DAYS_CONSIDERED_NEW;

      const stockValue = lastPurchasePrice !== null ? currentStock * lastPurchasePrice : null;

      const baseProps = {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        categoryName: p.product_categories?.name || "بدون تصنيف",
        categoryId: p.category_id,
        currentStock,
        stockValue,
        soldQty,
        purchasedQty,
        avgDailySales: 0,
        lastSaleDate,
        lastPurchaseDate,
        lastPurchasePrice,
        abcClass: "excluded" as ABCClass,
        actionPriority: null as 1 | 2 | 3 | null,
        actionLabel: null as string | null,
        revenue,
        lastSupplierName,
      };

      if (isNeverPurchased && !isRecentlyAdded) {
        return { ...baseProps, turnoverRate: null, coverageDays: null, turnoverClass: "new_unlisted" as TurnoverClass };
      }
      if (isNewProduct || isRecentlyAdded) {
        return { ...baseProps, turnoverRate: null, coverageDays: null, turnoverClass: "new" as TurnoverClass };
      }

      // ── Step B: normal calculations ───────────────────────────────────────
      let turnoverRate: number;
      let turnoverClass: TurnoverClass;
      let coverageDays: number | null;

      if (currentStock === 0 && soldQty > 0) {
        // Out of stock due to high demand
        turnoverRate = soldQty;
        turnoverClass = "excellent";
        coverageDays = 0;
      } else {
        turnoverRate = soldQty / Math.max(currentStock, 1);
        const annualizedRate = turnoverRate * (365 / periodDays);
        const daysSinceLastSale = lastSaleDate ? differenceInDays(today, new Date(lastSaleDate)) : Infinity;

        if (annualizedRate >= 6) turnoverClass = "excellent";
        else if (annualizedRate >= 3) turnoverClass = "good";
        else if (annualizedRate >= 1 && daysSinceLastSale <= 90) turnoverClass = "slow";
        else turnoverClass = "stagnant";
        // Note: daysSinceLastSale > 90 forces stagnant regardless of annualizedRate

        const avgDaily = soldQty / periodDays;
        coverageDays = avgDaily > 0 ? Math.round(currentStock / avgDaily) : null;
      }

      const avgDailySales = soldQty / periodDays;

      return {
        ...baseProps,
        turnoverRate,
        coverageDays,
        avgDailySales,
        turnoverClass,
        abcClass: "C" as ABCClass,
      };
    });

    // ── Step C: ABC (eligible only) ───────────────────────────────────────
    const eligible = items.filter((p) => p.abcClass !== "excluded");
    const sorted = [...eligible].sort((a, b) => b.revenue - a.revenue);
    const totalRev = sorted.reduce((s, p) => s + p.revenue, 0);
    let cumulative = 0;
    sorted.forEach((p) => {
      cumulative += p.revenue;
      const pct = totalRev > 0 ? cumulative / totalRev : 1;
      p.abcClass = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
    });
    const abcMap = new Map(sorted.map((p) => [p.productId, p.abcClass]));
    items.forEach((p) => {
      if (p.abcClass !== "excluded") p.abcClass = abcMap.get(p.productId) || "C";
    });

    // ── Step D: action priority (skip new) ────────────────────────────────
    items.forEach((p) => {
      if (p.turnoverClass === "new" || p.turnoverClass === "new_unlisted") return;

      if (p.currentStock === 0 && p.soldQty > 0 && p.abcClass === "A") {
        p.actionPriority = 1;
        p.actionLabel = `نفد المخزون — ${p.lastSupplierName ?? "راجع الموردين"}`;
      } else if (
        p.coverageDays !== null &&
        p.coverageDays < 15 &&
        (p.abcClass === "A" || p.abcClass === "B") &&
        p.currentStock > 0
      ) {
        p.actionPriority = 1;
        p.actionLabel = `شراء عاجل (${p.coverageDays} يوم) — ${p.lastSupplierName ?? ""}`;
      } else if (p.turnoverClass === "stagnant" && (p.stockValue ?? 0) > 1000) {
        p.actionPriority = 2;
        p.actionLabel = "مخزون راكد — فكّر في تخفيض السعر";
      } else if (p.coverageDays !== null && p.coverageDays > 180 && p.abcClass === "A") {
        p.actionPriority = 2;
        p.actionLabel = "مخزون زائد — قلّل كمية الطلب";
      } else if (p.turnoverClass === "slow" && p.abcClass === "C") {
        p.actionPriority = 3;
        p.actionLabel = "إيراد منخفض ودوران بطيء — راجع الاستمرار";
      } else if (p.coverageDays !== null && p.coverageDays > 180 && p.abcClass !== "A") {
        p.actionPriority = 3;
        p.actionLabel = "مخزون فائض";
      }
    });

    return items;
  }, [products, salesByProduct, purchasesByProduct, periodDays, today]);

  // ── derived lists ─────────────────────────────────────────────────────────

  const eligibleData = useMemo(() => allTurnoverData.filter((p) => p.abcClass !== "excluded"), [allTurnoverData]);
  const newProductsCount = useMemo(
    () => allTurnoverData.filter((p) => p.turnoverClass === "new" || p.turnoverClass === "new_unlisted").length,
    [allTurnoverData],
  );
  const allProductsNew = eligibleData.length === 0 && allTurnoverData.length > 0;

  const filteredData = useMemo(
    () =>
      allTurnoverData.filter((p) => {
        if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
        if (turnoverFilter !== "all" && p.turnoverClass !== turnoverFilter) return false;
        if (abcFilter !== "all" && p.abcClass !== abcFilter) return false;
        if (matrixFilter) {
          const [abc, speed] = matrixFilter.split("-");
          if (p.abcClass !== abc) return false;
          if (getTurnoverSpeed(p.turnoverClass) !== speed) return false;
        }
        return true;
      }),
    [allTurnoverData, categoryFilter, turnoverFilter, abcFilter, matrixFilter],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const withSales = eligibleData.filter((p) => p.soldQty > 0);
    const avgTurnover =
      withSales.length > 0 ? withSales.reduce((s, p) => s + (p.turnoverRate ?? 0), 0) / withSales.length : 0;
    const stagnantVal = eligibleData
      .filter((p) => p.turnoverClass === "stagnant")
      .reduce((s, p) => s + (p.stockValue ?? 0), 0);
    const urgentBuy = eligibleData.filter((p) => p.actionPriority === 1).length;
    const classA = eligibleData.filter((p) => p.abcClass === "A");
    const totalRev = eligibleData.reduce((s, p) => s + p.revenue, 0);
    const classAPct = totalRev > 0 ? (classA.reduce((s, p) => s + p.revenue, 0) / totalRev) * 100 : 0;

    // Previous period — apply same new-product exclusion logic
    const prevCalc = products
      .filter((p: any) => {
        const purchases = purchasesByProduct[p.id];
        const soldQty = prevSalesByProduct[p.id]?.soldQty || 0;
        const lpd = purchases?.lastDate || null;
        const dsa = p.created_at ? differenceInDays(today, new Date(p.created_at)) : Infinity;
        const dslp = lpd ? differenceInDays(today, new Date(lpd)) : Infinity;
        const neverPurchased = lpd === null && soldQty === 0;
        if (neverPurchased && dsa >= DAYS_CONSIDERED_NEW) return false; // new_unlisted
        if (soldQty === 0 && !neverPurchased && dslp < DAYS_CONSIDERED_NEW) return false; // new
        if (soldQty === 0 && neverPurchased && dsa < DAYS_CONSIDERED_NEW) return false; // recently_added
        return true;
      })
      .map((p: any) => {
        const ps = prevSalesByProduct[p.id];
        const stock = Number(p.quantity_on_hand);
        const sold = ps?.soldQty || 0;
        const lpp = purchasesByProduct[p.id]?.lastPrice ?? (p.purchase_price ? Number(p.purchase_price) : null);
        const tr = stock > 0 ? sold / stock : sold > 0 ? sold : 0;
        const ann = tr * (365 / periodDays);
        const tc: TurnoverClass = ann >= 6 ? "excellent" : ann >= 3 ? "good" : ann >= 1 ? "slow" : "stagnant";
        return { turnoverRate: tr, turnoverClass: tc, stockValue: lpp !== null ? stock * lpp : 0 };
      });

    const prevWithSales = prevCalc.filter((p) => p.turnoverRate > 0);
    const prevAvgTR =
      prevWithSales.length > 0 ? prevWithSales.reduce((s, p) => s + p.turnoverRate, 0) / prevWithSales.length : 0;
    const prevStagnantV = prevCalc.filter((p) => p.turnoverClass === "stagnant").reduce((s, p) => s + p.stockValue, 0);

    return {
      avgTurnover,
      stagnantVal,
      urgentBuy,
      classACount: classA.length,
      classAPct,
      turnoverChange: prevAvgTR > 0 ? ((avgTurnover - prevAvgTR) / prevAvgTR) * 100 : null,
      stagnantChange: prevStagnantV > 0 ? ((stagnantVal - prevStagnantV) / prevStagnantV) * 100 : null,
    };
  }, [eligibleData, products, prevSalesByProduct, purchasesByProduct, periodDays, today]);

  // ── alerts ────────────────────────────────────────────────────────────────

  const alerts = useMemo(
    () => ({
      urgent: eligibleData.filter((p) => p.actionPriority === 1),
      followup: eligibleData.filter((p) => p.actionPriority === 2),
      review: eligibleData.filter((p) => p.actionPriority === 3),
    }),
    [eligibleData],
  );

  // ── matrix counts ─────────────────────────────────────────────────────────

  const matrixCounts = useMemo(() => {
    const c: Record<string, number> = {};
    ["A", "B", "C"].forEach((abc) =>
      ["fast", "medium", "slow"].forEach((speed) => {
        c[`${abc}-${speed}`] = eligibleData.filter(
          (p) => p.abcClass === abc && getTurnoverSpeed(p.turnoverClass) === speed,
        ).length;
      }),
    );
    return c;
  }, [eligibleData]);

  // ── pie data ──────────────────────────────────────────────────────────────

  const pieData = useMemo(() => {
    const groups: Record<string, number> = { ممتاز: 0, جيد: 0, بطيء: 0, راكد: 0, جديد: 0 };
    allTurnoverData.forEach((p) => {
      const label =
        p.turnoverClass === "new" || p.turnoverClass === "new_unlisted" ? "جديد" : TURNOVER_LABELS[p.turnoverClass];
      if (label in groups) groups[label] += p.stockValue ?? 0;
    });
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({ name, value, color: TURNOVER_PIE_COLORS[name] || "hsl(0,0%,60%)" }));
  }, [allTurnoverData]);

  // ── export config ─────────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      filenamePrefix: "تقرير-دوران-المخزون",
      sheetName: "دوران المخزون",
      pdfTitle: "تقرير دوران المخزون",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "ABC",
        "المخزون",
        "القيمة",
        "المباع",
        "معدل الدوران",
        "أيام التغطية",
        "آخر بيع",
        "فئة الدوران",
        "الأولوية",
      ],
      rows: filteredData.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.abcClass === "excluded" ? "مستبعد" : p.abcClass,
        p.currentStock,
        p.stockValue !== null ? p.stockValue : "—",
        p.soldQty,
        p.turnoverRate !== null ? Number(p.turnoverRate.toFixed(1)) : "—",
        p.coverageDays !== null ? p.coverageDays : "—",
        p.lastSaleDate || "—",
        TURNOVER_LABELS[p.turnoverClass],
        p.actionPriority ? `P${p.actionPriority}` : "—",
      ]),
      summaryCards: [
        { label: "متوسط الدوران", value: kpis.avgTurnover.toFixed(2) },
        { label: "قيمة الراكد", value: fmt(kpis.stagnantVal) },
        { label: "شراء عاجل", value: String(kpis.urgentBuy) },
        { label: "فئة A", value: `${kpis.classACount} (${kpis.classAPct.toFixed(0)}%)` },
      ],
      settings,
      pdfOrientation: "landscape" as const,
    }),
    [filteredData, kpis, settings],
  );

  // ── table columns ─────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
    () => [
      {
        id: "priority_dot",
        header: "",
        accessorKey: "actionPriority",
        enableSorting: false,
        cell: ({ getValue }) => (
          <div className="flex justify-center">
            <PriorityDot priority={getValue() as 1 | 2 | 3 | null} />
          </div>
        ),
        size: 28,
      },
      {
        accessorKey: "productCode",
        header: "الكود",
        cell: ({ getValue }) => <span className="font-mono text-xs text-muted-foreground">{getValue() as string}</span>,
      },
      {
        accessorKey: "productName",
        header: "المنتج",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-sm leading-tight">{row.original.productName}</p>
            {row.original.categoryName !== "بدون تصنيف" && (
              <p className="text-[11px] text-muted-foreground mt-0.5">{row.original.categoryName}</p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "abcClass",
        header: "ABC",
        cell: ({ getValue }) => {
          const v = getValue() as ABCClass;
          const cls =
            v === "A"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 font-bold"
              : v === "B"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-bold"
                : v === "excluded"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"
                  : "bg-muted text-muted-foreground";
          return (
            <Badge variant="secondary" className={cn("text-xs", cls)}>
              {v === "excluded" ? "جديد" : v}
            </Badge>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            <span
              className={cn(
                "font-semibold text-sm",
                row.original.currentStock === 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {fmtInt(row.original.currentStock)}
            </span>
            {row.original.currentStock === 0 && <span className="text-[10px] text-destructive block">نفد</span>}
          </div>
        ),
      },
      {
        accessorKey: "stockValue",
        header: "القيمة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null || isNaN(v)) return <span className="text-muted-foreground text-sm">—</span>;
          return <span className="tabular-nums font-mono text-xs">{fmt(v)}</span>;
        },
      },
      {
        accessorKey: "soldQty",
        header: "المباع",
        cell: ({ getValue }) => <span className="tabular-nums text-sm">{fmtInt(getValue() as number)}</span>,
      },
      {
        accessorKey: "turnoverRate",
        header: () => (
          <div className="flex items-center gap-1">
            <span>معدل الدوران</span>
            <MetricHelp text="عدد مرات تجديد المخزون خلال الفترة. كلما ارتفع كان أفضل." />
          </div>
        ),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null) return <span className="text-muted-foreground">—</span>;
          return <span className="tabular-nums font-semibold">{v.toFixed(1)}</span>;
        },
      },
      {
        accessorKey: "coverageDays",
        header: () => (
          <div className="flex items-center gap-1">
            <span>أيام التغطية</span>
            <MetricHelp text="كم يوم يكفي المخزون الحالي بناءً على معدل البيع الحالي." />
          </div>
        ),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "tabular-nums font-semibold text-sm",
                v < 15 ? "text-destructive" : v <= 90 ? "text-emerald-600" : "text-foreground",
              )}
            >
              {v}
              <span className="text-xs font-normal text-muted-foreground"> يوم</span>
            </span>
          );
        },
      },
      {
        accessorKey: "lastSaleDate",
        header: "آخر بيع",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          if (!v) return <span className="text-muted-foreground text-xs italic">لم يُباع</span>;
          try {
            return (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(v), { addSuffix: true, locale: ar })}
              </span>
            );
          } catch {
            return <span className="text-xs">{v}</span>;
          }
        },
      },
      {
        accessorKey: "turnoverClass",
        header: "الفئة",
        cell: ({ getValue }) => {
          const v = getValue() as TurnoverClass;
          const cls =
            v === "excellent"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
              : v === "good"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                : v === "slow"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                  : v === "stagnant"
                    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                    : v === "new"
                      ? "bg-muted text-muted-foreground"
                      : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";
          return (
            <Badge variant="secondary" className={cn("text-xs", cls)}>
              {TURNOVER_LABELS[v]}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  // ── row class name helper (pass to DataTable if it supports it) ───────────

  const getRowClassName = (row: ProductTurnoverData): string => {
    if (row.actionPriority === 1) return "bg-red-50/60 dark:bg-red-500/5 hover:bg-red-100/60";
    if (row.actionPriority === 2) return "bg-amber-50/60 dark:bg-amber-500/5 hover:bg-amber-100/60";
    return "";
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-5 p-1">
        {/* ── Filters bar ───────────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
                <BarChart2 className="h-3.5 w-3.5" />
                <span>الفترة:</span>
              </div>
              <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من" />
              <span className="text-muted-foreground text-xs">—</span>
              <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى" />

              <div className="w-px h-5 bg-border mx-1" />

              <CategoryTreeSelect
                categories={categories}
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                placeholder="كافة التصنيفات"
                className="w-44"
              />
              <Select
                value={turnoverFilter}
                onValueChange={(v) => {
                  setTurnoverFilter(v as any);
                  setMatrixFilter(null);
                }}
              >
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="فئة الدوران" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات</SelectItem>
                  <SelectItem value="excellent">✅ ممتاز</SelectItem>
                  <SelectItem value="good">🔵 جيد</SelectItem>
                  <SelectItem value="slow">🟡 بطيء</SelectItem>
                  <SelectItem value="stagnant">🔴 راكد</SelectItem>
                  <SelectItem value="new">⬜ جديد</SelectItem>
                  <SelectItem value="new_unlisted">🟣 غير مُدرج</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={abcFilter}
                onValueChange={(v) => {
                  setAbcFilter(v as any);
                  setMatrixFilter(null);
                }}
              >
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="ABC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="A">🟢 A</SelectItem>
                  <SelectItem value="B">🔵 B</SelectItem>
                  <SelectItem value="C">⚫ C</SelectItem>
                  <SelectItem value="excluded">مستبعد</SelectItem>
                </SelectContent>
              </Select>

              {matrixFilter && (
                <button
                  onClick={() => setMatrixFilter(null)}
                  className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  إلغاء فلتر المصفوفة
                </button>
              )}

              <div className="mr-auto">
                <ExportMenu config={exportConfig} disabled={isLoading} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── All products are new ───────────────────────────────────────── */}
        {allProductsNew && !isLoading && (
          <Card className="border shadow-sm">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Clock className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">لا توجد بيانات كافية بعد</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                جميع المنتجات جديدة (أقل من {DAYS_CONSIDERED_NEW} يوم). سيبدأ التقرير بعرض التحليل تلقائياً بعد مرور
                فترة كافية من النشاط.
              </p>
            </CardContent>
          </Card>
        )}

        {!allProductsNew && (
          <>
            {/* ── KPI Cards ───────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Average Turnover */}
              <Card className="border shadow-sm overflow-hidden">
                <div className="h-1 bg-primary/60" />
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4 text-primary" />
                    </div>
                    {isLoading ? <Skeleton className="h-5 w-14" /> : <ChangeIndicator value={kpis.turnoverChange} />}
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20 mb-1" />
                  ) : (
                    <p className="text-3xl font-black tabular-nums text-foreground leading-none mb-1">
                      {kpis.avgTurnover.toFixed(2)}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">متوسط معدل الدوران</p>
                    <MetricHelp text="متوسط عدد مرات تجديد المخزون عبر المنتجات خلال الفترة المحددة." />
                  </div>
                </CardContent>
              </Card>

              {/* Stagnant Value */}
              <Card className="border shadow-sm overflow-hidden">
                <div
                  className={cn(
                    "h-1",
                    kpis.stagnantVal > 10000 ? "bg-red-500" : kpis.stagnantVal > 5000 ? "bg-amber-500" : "bg-muted",
                  )}
                />
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center",
                        kpis.stagnantVal > 10000
                          ? "bg-red-500/10"
                          : kpis.stagnantVal > 5000
                            ? "bg-amber-500/10"
                            : "bg-muted",
                      )}
                    >
                      <DollarSign
                        className={cn(
                          "w-4 h-4",
                          kpis.stagnantVal > 10000
                            ? "text-red-500"
                            : kpis.stagnantVal > 5000
                              ? "text-amber-500"
                              : "text-muted-foreground",
                        )}
                      />
                    </div>
                    {isLoading ? (
                      <Skeleton className="h-5 w-14" />
                    ) : (
                      <ChangeIndicator value={kpis.stagnantChange} inverted />
                    )}
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-8 w-24 mb-1" />
                  ) : (
                    <p className="text-2xl font-black tabular-nums text-foreground leading-none mb-1 truncate">
                      {fmt(kpis.stagnantVal)}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">قيمة المخزون الراكد</p>
                    <MetricHelp text="إجمالي قيمة المنتجات الراكدة بالجنيه المصري. ↓ الانخفاض هنا إيجابي." />
                  </div>
                </CardContent>
              </Card>

              {/* Urgent Buy */}
              <Card className={cn("border shadow-sm overflow-hidden", kpis.urgentBuy > 0 && "ring-1 ring-red-500/30")}>
                <div className={cn("h-1", kpis.urgentBuy > 0 ? "bg-red-500" : "bg-muted")} />
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div
                      className={cn(
                        "w-9 h-9 rounded-xl flex items-center justify-center",
                        kpis.urgentBuy > 0 ? "bg-red-500/10" : "bg-muted",
                      )}
                    >
                      <ShoppingCart
                        className={cn("w-4 h-4", kpis.urgentBuy > 0 ? "text-red-500" : "text-muted-foreground")}
                      />
                    </div>
                    {kpis.urgentBuy > 0 && (
                      <span className="text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-1.5 py-0.5 rounded-full animate-pulse">
                        عاجل
                      </span>
                    )}
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mb-1" />
                  ) : (
                    <p
                      className={cn(
                        "text-3xl font-black tabular-nums leading-none mb-1",
                        kpis.urgentBuy > 0 ? "text-red-600 dark:text-red-400" : "text-foreground",
                      )}
                    >
                      {kpis.urgentBuy}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">أصناف تحتاج شراء عاجل</p>
                    <MetricHelp text="منتجات تغطيتها أقل من 15 يوم من فئة A أو B." />
                  </div>
                </CardContent>
              </Card>

              {/* Class A */}
              <Card className="border shadow-sm overflow-hidden">
                <div className="h-1 bg-emerald-500/60" />
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                      <Package className="w-4 h-4 text-emerald-600" />
                    </div>
                    <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 px-1.5 py-0.5 rounded-full">
                      {kpis.classAPct.toFixed(0)}% إيراد
                    </span>
                  </div>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mb-1" />
                  ) : (
                    <p className="text-3xl font-black tabular-nums text-foreground leading-none mb-1">
                      {kpis.classACount}
                    </p>
                  )}
                  <div className="flex items-center gap-1">
                    <p className="text-xs text-muted-foreground">أصناف فئة A</p>
                    <MetricHelp text="المنتجات التي تولد 80% من إجمالي الإيرادات." />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* ── Smart Alerts ────────────────────────────────────────────── */}
            {(alerts.urgent.length > 0 || alerts.followup.length > 0 || alerts.review.length > 0) && (
              <Accordion
                type="multiple"
                defaultValue={alerts.urgent.length > 0 ? ["urgent"] : []}
                className="space-y-2"
              >
                {alerts.urgent.length > 0 && (
                  <AccordionItem
                    value="urgent"
                    className="border rounded-xl bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20 overflow-hidden"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-red-500/15 flex items-center justify-center">
                          <Flame className="h-3.5 w-3.5 text-red-600" />
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-red-700 dark:text-red-400">إجراء فوري</span>
                          <span className="text-xs text-red-500 mr-2">({alerts.urgent.length} صنف)</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2 mt-1">
                        {alerts.urgent.map((p) => (
                          <div
                            key={p.productId}
                            className="flex flex-wrap justify-between items-start gap-2 bg-white dark:bg-red-500/5 rounded-lg px-3 py-2.5 border border-red-100 dark:border-red-500/10"
                          >
                            <div>
                              <span className="font-semibold text-sm text-foreground">{p.productName}</span>
                              <span className="text-xs text-muted-foreground mr-1">({p.productCode})</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 text-xs">
                              <span className="bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400 px-2 py-0.5 rounded-full">
                                تغطية {p.coverageDays ?? 0} يوم
                              </span>
                              <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                مخزون: {p.currentStock}
                              </span>
                              {p.lastSupplierName && (
                                <span className="bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 px-2 py-0.5 rounded-full">
                                  {p.lastSupplierName}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {alerts.followup.length > 0 && (
                  <AccordionItem
                    value="followup"
                    className="border rounded-xl bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20 overflow-hidden"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-amber-100/50 dark:hover:bg-amber-500/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/15 flex items-center justify-center">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-amber-700 dark:text-amber-400">يحتاج متابعة</span>
                          <span className="text-xs text-amber-500 mr-2">({alerts.followup.length} صنف)</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2 mt-1">
                        {alerts.followup.map((p) => (
                          <div
                            key={p.productId}
                            className="flex flex-wrap justify-between items-center gap-2 bg-white dark:bg-amber-500/5 rounded-lg px-3 py-2.5 border border-amber-100 dark:border-amber-500/10"
                          >
                            <span className="font-medium text-sm">{p.productName}</span>
                            <div className="flex items-center gap-1.5 text-xs">
                              <span className="text-amber-600 dark:text-amber-400">{p.actionLabel}</span>
                              {p.stockValue !== null && (
                                <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                                  {fmt(p.stockValue)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}

                {alerts.review.length > 0 && (
                  <AccordionItem
                    value="review"
                    className="border rounded-xl bg-yellow-50 dark:bg-yellow-500/5 border-yellow-200 dark:border-yellow-500/20 overflow-hidden"
                  >
                    <AccordionTrigger className="px-4 py-3 hover:no-underline hover:bg-yellow-100/50 dark:hover:bg-yellow-500/10 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-yellow-500/15 flex items-center justify-center">
                          <AlertCircle className="h-3.5 w-3.5 text-yellow-600" />
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold text-yellow-700 dark:text-yellow-400">للمراجعة</span>
                          <span className="text-xs text-yellow-500 mr-2">({alerts.review.length} صنف)</span>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-2 mt-1">
                        {alerts.review.map((p) => (
                          <div
                            key={p.productId}
                            className="flex flex-wrap justify-between items-center gap-2 bg-white dark:bg-yellow-500/5 rounded-lg px-3 py-2.5 border border-yellow-100 dark:border-yellow-500/10"
                          >
                            <span className="font-medium text-sm">{p.productName}</span>
                            <span className="text-xs text-yellow-600 dark:text-yellow-400">{p.actionLabel}</span>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                )}
              </Accordion>
            )}

            {/* ── Decision Matrix ──────────────────────────────────────────── */}
            <Card className="border shadow-sm">
              <CardContent className="py-4 px-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-foreground">مصفوفة القرار</h3>
                  <span className="text-xs text-muted-foreground">ABC × معدل الدوران</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-center border-separate border-spacing-1">
                    <thead>
                      <tr>
                        <th className="w-10" />
                        <th className="pb-1">
                          <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                            سريع ↑
                          </span>
                        </th>
                        <th className="pb-1">
                          <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                            متوسط
                          </span>
                        </th>
                        <th className="pb-1">
                          <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
                            بطيء ↓
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(["A", "B", "C"] as const).map((abc) => (
                        <tr key={abc}>
                          <td className="py-1">
                            <span
                              className={cn(
                                "inline-block w-7 h-7 rounded-lg text-xs font-black leading-7 text-center",
                                abc === "A"
                                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                  : abc === "B"
                                    ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {abc}
                            </span>
                          </td>
                          {(["fast", "medium", "slow"] as const).map((speed) => {
                            const key = `${abc}-${speed}`;
                            const count = matrixCounts[key] || 0;
                            const decision = MATRIX_DECISIONS[key];
                            const isActive = matrixFilter === key;
                            return (
                              <td key={key} className="py-1">
                                <button
                                  onClick={() => setMatrixFilter(isActive ? null : key)}
                                  className={cn(
                                    "w-full rounded-xl border transition-all duration-150 px-2 py-2 text-center",
                                    decision.bg,
                                    decision.border,
                                    isActive
                                      ? "ring-2 ring-primary ring-offset-1 scale-105"
                                      : "hover:scale-102 hover:shadow-sm",
                                  )}
                                >
                                  <div className="text-base leading-none mb-1">{decision.icon}</div>
                                  <div className="text-[10px] text-muted-foreground leading-tight mb-0.5">
                                    {decision.text}
                                  </div>
                                  <div
                                    className={cn(
                                      "text-xs font-black",
                                      count > 0 ? "text-foreground" : "text-muted-foreground",
                                    )}
                                  >
                                    {count}
                                  </div>
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {newProductsCount > 0 && (
                  <p className="text-[11px] text-muted-foreground mt-3 text-center flex items-center justify-center gap-1">
                    <Info className="h-3 w-3" />
                    لا تشمل {newProductsCount} منتج جديد (أقل من {DAYS_CONSIDERED_NEW} يوم)
                  </p>
                )}
              </CardContent>
            </Card>

            {/* ── Pie Chart ───────────────────────────────────────────────── */}
            {pieData.length > 0 && (
              <Card className="border shadow-sm">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-foreground">توزيع فئات الدوران بالقيمة المالية</h3>
                    {newProductsCount > 0 && (
                      <span className="text-[11px] text-muted-foreground">يشمل {newProductsCount} منتج جديد</span>
                    )}
                  </div>
                  <div className="h-60">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={80}
                          innerRadius={35}
                          paddingAngle={2}
                          label={({ name, percent }) =>
                            percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                          }
                          labelLine={false}
                        >
                          {pieData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} strokeWidth={0} />
                          ))}
                        </Pie>
                        <RTooltip
                          formatter={(value: number) => [fmt(value), "القيمة"]}
                          contentStyle={{
                            fontSize: "12px",
                            direction: "rtl",
                            borderRadius: "8px",
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: "12px", direction: "rtl" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ── Data Table (always shown) ──────────────────────────────────── */}
        {(!allProductsNew || filteredData.length > 0) && (
          <DataTable
            columns={columns}
            data={filteredData}
            searchPlaceholder="البحث بالاسم أو الكود..."
            isLoading={isLoading}
            emptyMessage={
              allProductsNew ? "لا توجد بيانات — جميع المنتجات جديدة" : "لا توجد نتائج تطابق الفلاتر المحددة"
            }
            // Pass row class if DataTable supports it:
            // getRowClassName={getRowClassName}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
