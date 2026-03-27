import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ExportMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CategoryTreeSelect } from "@/components/CategoryTreeSelect";
import { DatePickerInput } from "@/components/DatePickerInput";
import { ColumnDef } from "@tanstack/react-table";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { useSettings } from "@/contexts/SettingsContext";
import { format, startOfMonth, differenceInDays, subDays, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import {
  TrendingUp, TrendingDown, AlertTriangle, Package, DollarSign, ShoppingCart, ArrowUp, ArrowDown, Minus,
  CheckCircle2, XCircle, AlertCircle, Clock,
} from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/** Number of days after creation/purchase before a product is no longer considered "new" */
const DAYS_CONSIDERED_NEW = 30;

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

const TURNOVER_LABELS: Record<TurnoverClass, string> = {
  excellent: "ممتاز", good: "جيد", slow: "بطيء", stagnant: "راكد",
  new: "جديد", new_unlisted: "غير مُدرج",
};
const TURNOVER_COLORS: Record<TurnoverClass, string> = {
  excellent: "hsl(152, 60%, 42%)", good: "hsl(217, 80%, 50%)", slow: "hsl(38, 92%, 50%)", stagnant: "hsl(0, 72%, 51%)",
  new: "hsl(0, 0%, 60%)", new_unlisted: "hsl(270, 50%, 65%)",
};
const ABC_COLORS: Record<ABCClass, string> = {
  A: "hsl(152, 60%, 42%)", B: "hsl(217, 80%, 50%)", C: "hsl(0, 0%, 60%)", excluded: "hsl(270, 50%, 65%)",
};

// Decision matrix text
const MATRIX_DECISIONS: Record<string, { icon: string; text: string }> = {
  "A-fast": { icon: "✅", text: "استمر وزد" },
  "A-medium": { icon: "⚠️", text: "حافظ على المخزون" },
  "A-slow": { icon: "🔴", text: "شراء عاجل" },
  "B-fast": { icon: "✅", text: "أداء جيد" },
  "B-medium": { icon: "🟡", text: "راقب الأداء" },
  "B-slow": { icon: "⚠️", text: "قلل المخزون" },
  "C-fast": { icon: "🟡", text: "راجع التسعير" },
  "C-medium": { icon: "⚠️", text: "قلل الطلبات" },
  "C-slow": { icon: "❌", text: "أوقف الشراء" },
};

function getTurnoverSpeed(tc: TurnoverClass): "fast" | "medium" | "slow" {
  if (tc === "excellent") return "fast";
  if (tc === "good") return "medium";
  return "slow";
}

export default function InventoryTurnoverReport() {
  const { settings } = useSettings();
  const currency = settings?.default_currency || "EGP";
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

  // Query 1: Active products — include created_at
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["turnover-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, quantity_on_hand, purchase_price, selling_price, category_id, is_active, created_at, product_categories(name)")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Query 2: Sales in current period
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

  // Query 3: Sales in previous period (for KPI comparison)
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

  // Query 4: Purchases (for last purchase info + supplier name)
  const { data: purchaseData = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["turnover-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select("product_id, quantity, unit_price, invoice:purchase_invoices!inner(invoice_date, status, supplier_id, suppliers(name))")
        .eq("invoice.status", "posted")
        .order("invoice(invoice_date)", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Query 5: Categories
  const { data: categories = [] } = useQuery({
    queryKey: ["turnover-categories"],
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

  // Aggregate sales by product
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

  // Previous period sales
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

  // Aggregate purchases by product (last purchase info + supplier)
  const purchasesByProduct = useMemo(() => {
    const map: Record<string, { purchasedQty: number; lastDate: string | null; lastPrice: number | null; lastSupplierName: string | null }> = {};
    purchaseData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) {
        map[pid] = {
          purchasedQty: 0,
          lastDate: item.invoice?.invoice_date || null,
          lastPrice: item.unit_price != null ? Number(item.unit_price) : null,
          lastSupplierName: item.invoice?.suppliers?.name || null,
        };
      }
      map[pid].purchasedQty += Number(item.quantity);
      const d = item.invoice?.invoice_date;
      if (d && (!map[pid].lastDate || d > map[pid].lastDate!)) {
        map[pid].lastDate = d;
        map[pid].lastPrice = item.unit_price != null ? Number(item.unit_price) : map[pid].lastPrice;
        map[pid].lastSupplierName = item.invoice?.suppliers?.name || map[pid].lastSupplierName;
      }
    });
    return map;
  }, [purchaseData]);

  // Compute turnover data with edge-case handling
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

      // Step A: Classify new products FIRST
      const daysSinceAdded = p.created_at ? differenceInDays(today, new Date(p.created_at)) : Infinity;
      const daysSinceLastPurchase = lastPurchaseDate ? differenceInDays(today, new Date(lastPurchaseDate)) : Infinity;

      const isNeverPurchased = lastPurchaseDate === null && soldQty === 0;
      const isNewProduct = soldQty === 0 && !isNeverPurchased && daysSinceLastPurchase < DAYS_CONSIDERED_NEW;
      const isRecentlyAdded = soldQty === 0 && isNeverPurchased && daysSinceAdded < DAYS_CONSIDERED_NEW;

      // Safe stockValue: guard against null lastPurchasePrice
      const stockValue = lastPurchasePrice !== null ? currentStock * lastPurchasePrice : null;

      // New/unlisted products — skip all further calculations
      if (isNeverPurchased && !isRecentlyAdded) {
        return {
          productId: p.id, productCode: p.code, productName: p.name,
          categoryName: (p as any).product_categories?.name || "بدون تصنيف",
          categoryId: p.category_id, currentStock, stockValue,
          soldQty, purchasedQty, turnoverRate: null, coverageDays: null,
          avgDailySales: 0, lastSaleDate, lastPurchaseDate, lastPurchasePrice,
          turnoverClass: "new_unlisted" as TurnoverClass,
          abcClass: "excluded" as ABCClass,
          actionPriority: null, actionLabel: null, revenue, lastSupplierName,
        };
      }
      if (isNewProduct || isRecentlyAdded) {
        return {
          productId: p.id, productCode: p.code, productName: p.name,
          categoryName: (p as any).product_categories?.name || "بدون تصنيف",
          categoryId: p.category_id, currentStock, stockValue,
          soldQty, purchasedQty, turnoverRate: null, coverageDays: null,
          avgDailySales: 0, lastSaleDate, lastPurchaseDate, lastPurchasePrice,
          turnoverClass: "new" as TurnoverClass,
          abcClass: "excluded" as ABCClass,
          actionPriority: null, actionLabel: null, revenue, lastSupplierName,
        };
      }

      // Step B: Normal product calculations
      let turnoverRate: number;
      let turnoverClass: TurnoverClass;
      let coverageDays: number | null;

      // Edge case: out of stock due to high demand
      if (currentStock === 0 && soldQty > 0) {
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
        else turnoverClass = daysSinceLastSale > 90 ? "stagnant" : (annualizedRate < 1 ? "stagnant" : "slow");

        const avgDaily = soldQty / periodDays;
        coverageDays = avgDaily > 0 ? Math.round(currentStock / avgDaily) : null;
      }

      const avgDailySales = soldQty / periodDays;

      return {
        productId: p.id, productCode: p.code, productName: p.name,
        categoryName: (p as any).product_categories?.name || "بدون تصنيف",
        categoryId: p.category_id, currentStock, stockValue,
        soldQty, purchasedQty, turnoverRate, coverageDays, avgDailySales,
        lastSaleDate, lastPurchaseDate, lastPurchasePrice,
        turnoverClass,
        abcClass: "C" as ABCClass, // will be set below
        actionPriority: null as 1 | 2 | 3 | null,
        actionLabel: null as string | null,
        revenue, lastSupplierName,
      };
    });

    // Step C: ABC Analysis — only eligible products (not excluded)
    const eligible = items.filter(p => p.abcClass !== "excluded");
    const sorted = [...eligible].sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = sorted.reduce((s, p) => s + p.revenue, 0);
    let cumulative = 0;
    sorted.forEach((p) => {
      cumulative += p.revenue;
      const pct = totalRevenue > 0 ? cumulative / totalRevenue : 1;
      if (pct <= 0.8) p.abcClass = "A";
      else if (pct <= 0.95) p.abcClass = "B";
      else p.abcClass = "C";
    });

    // Update abcClass back in items array
    const abcMap = new Map(sorted.map(p => [p.productId, p.abcClass]));
    items.forEach(p => {
      if (p.abcClass !== "excluded") {
        p.abcClass = abcMap.get(p.productId) || "C";
      }
    });

    // Step D: Action Priority — skip new/unlisted products
    items.forEach((p) => {
      if (p.turnoverClass === "new" || p.turnoverClass === "new_unlisted") return;

      // Priority 1: out of stock, class A
      if (p.currentStock === 0 && p.soldQty > 0 && p.abcClass === "A") {
        p.actionPriority = 1;
        p.actionLabel = `نفد المخزون — ${p.lastSupplierName ?? "راجع الموردين"}`;
      }
      // Priority 1: low coverage, class A or B
      else if (p.coverageDays !== null && p.coverageDays < 15 && (p.abcClass === "A" || p.abcClass === "B") && p.currentStock > 0) {
        p.actionPriority = 1;
        p.actionLabel = `شراء عاجل (${p.coverageDays} يوم) — ${p.lastSupplierName ?? ""}`;
      }
      // Priority 2: stagnant with significant value
      else if (p.turnoverClass === "stagnant" && (p.stockValue ?? 0) > 1000) {
        p.actionPriority = 2;
        p.actionLabel = "مخزون راكد — فكّر في تخفيض السعر";
      }
      // Priority 2: excess stock, class A
      else if (p.coverageDays !== null && p.coverageDays > 180 && p.abcClass === "A") {
        p.actionPriority = 2;
        p.actionLabel = "مخزون زائد — قلّل كمية الطلب";
      }
      // Priority 3: slow + class C
      else if (p.turnoverClass === "slow" && p.abcClass === "C") {
        p.actionPriority = 3;
        p.actionLabel = "إيراد منخفض ودوران بطيء — راجع الاستمرار";
      }
      // Priority 3: excess stock, non-A
      else if (p.coverageDays !== null && p.coverageDays > 180 && p.abcClass !== "A") {
        p.actionPriority = 3;
        p.actionLabel = "مخزون فائض";
      }
    });

    return items;
  }, [products, salesByProduct, purchasesByProduct, periodDays, today]);

  // Eligible (non-new) products for KPIs and matrix
  const eligibleData = useMemo(() => allTurnoverData.filter(p => p.abcClass !== "excluded"), [allTurnoverData]);
  const newProductsCount = useMemo(() => allTurnoverData.filter(p => p.turnoverClass === "new" || p.turnoverClass === "new_unlisted").length, [allTurnoverData]);

  // Filtered data
  const filteredData = useMemo(() => {
    return allTurnoverData.filter((p) => {
      if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
      if (turnoverFilter !== "all" && p.turnoverClass !== turnoverFilter) return false;
      if (abcFilter !== "all" && p.abcClass !== abcFilter) return false;
      if (matrixFilter) {
        const [abc, speed] = matrixFilter.split("-");
        if (p.abcClass !== abc) return false;
        if (getTurnoverSpeed(p.turnoverClass) !== speed) return false;
      }
      return true;
    });
  }, [allTurnoverData, categoryFilter, turnoverFilter, abcFilter, matrixFilter]);

  // KPIs — exclude new products
  const kpis = useMemo(() => {
    const active = eligibleData;
    const withSales = active.filter(p => p.soldQty > 0);
    const avgTurnover = withSales.length > 0 ? withSales.reduce((s, p) => s + (p.turnoverRate ?? 0), 0) / withSales.length : 0;
    const stagnantValue = active.filter(p => p.turnoverClass === "stagnant").reduce((s, p) => s + (p.stockValue ?? 0), 0);
    const urgentBuy = active.filter(p => p.actionPriority === 1).length;
    const classA = active.filter(p => p.abcClass === "A");
    const classARevenue = classA.reduce((s, p) => s + p.revenue, 0);
    const totalRevenue = active.reduce((s, p) => s + p.revenue, 0);
    const classAPct = totalRevenue > 0 ? (classARevenue / totalRevenue * 100) : 0;

    // Previous period comparison — also exclude new products
    const prevProducts = products
      .filter((p: any) => {
        // Apply same new-product logic to previous period
        const purchases = purchasesByProduct[p.id];
        const prevSales = prevSalesByProduct[p.id];
        const soldQty = prevSales?.soldQty || 0;
        const lastPurchaseDate = purchases?.lastDate || null;
        const daysSinceAdded = p.created_at ? differenceInDays(today, new Date(p.created_at)) : Infinity;
        const daysSinceLastPurchase = lastPurchaseDate ? differenceInDays(today, new Date(lastPurchaseDate)) : Infinity;
        const isNeverPurchased = lastPurchaseDate === null && soldQty === 0;
        const isNewProduct = soldQty === 0 && !isNeverPurchased && daysSinceLastPurchase < DAYS_CONSIDERED_NEW;
        const isRecentlyAdded = soldQty === 0 && isNeverPurchased && daysSinceAdded < DAYS_CONSIDERED_NEW;
        if (isNeverPurchased && !isRecentlyAdded) return false;
        if (isNewProduct || isRecentlyAdded) return false;
        return true;
      })
      .map((p: any) => {
        const prevSales = prevSalesByProduct[p.id];
        const currentStock = Number(p.quantity_on_hand);
        const soldQty = prevSales?.soldQty || 0;
        const lastPurchasePrice = purchasesByProduct[p.id]?.lastPrice ?? (p.purchase_price != null ? Number(p.purchase_price) : null);
        const turnoverRate = currentStock > 0 ? soldQty / currentStock : (soldQty > 0 ? soldQty : 0);
        const ann = turnoverRate * (365 / periodDays);
        const turnoverClass: TurnoverClass = ann >= 6 ? "excellent" : ann >= 3 ? "good" : ann >= 1 ? "slow" : "stagnant";
        const stockValue = lastPurchasePrice !== null ? currentStock * lastPurchasePrice : 0;
        return { turnoverRate, turnoverClass, stockValue };
      });

    const prevWithSales2 = prevProducts.filter(p => p.turnoverRate > 0);
    const prevAvgTurnover = prevWithSales2.length > 0 ? prevWithSales2.reduce((s, p) => s + p.turnoverRate, 0) / prevWithSales2.length : 0;
    const prevStagnantValue = prevProducts.filter(p => p.turnoverClass === "stagnant").reduce((s, p) => s + p.stockValue, 0);

    const turnoverChange = prevAvgTurnover > 0 ? ((avgTurnover - prevAvgTurnover) / prevAvgTurnover * 100) : null;
    const stagnantChange = prevStagnantValue > 0 ? ((stagnantValue - prevStagnantValue) / prevStagnantValue * 100) : null;

    return { avgTurnover, stagnantValue, urgentBuy, classACount: classA.length, classAPct, turnoverChange, stagnantChange };
  }, [eligibleData, products, prevSalesByProduct, purchasesByProduct, periodDays, today]);

  // Action alerts — new products never appear
  const alerts = useMemo(() => ({
    urgent: eligibleData.filter(p => p.actionPriority === 1),
    followup: eligibleData.filter(p => p.actionPriority === 2),
    review: eligibleData.filter(p => p.actionPriority === 3),
  }), [eligibleData]);

  // Decision matrix counts — exclude new products
  const matrixCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ["A", "B", "C"].forEach(abc => {
      ["fast", "medium", "slow"].forEach(speed => {
        counts[`${abc}-${speed}`] = eligibleData.filter(p => p.abcClass === abc && getTurnoverSpeed(p.turnoverClass) === speed).length;
      });
    });
    return counts;
  }, [eligibleData]);

  // Pie chart data — add "new" category
  const pieData = useMemo(() => {
    const groups: Record<string, number> = { excellent: 0, good: 0, slow: 0, stagnant: 0, new: 0 };
    allTurnoverData.forEach(p => {
      if (p.turnoverClass === "new" || p.turnoverClass === "new_unlisted") {
        groups["new"] += (p.stockValue ?? 0);
      } else {
        groups[p.turnoverClass] += (p.stockValue ?? 0);
      }
    });
    const labels: Record<string, string> = { ...TURNOVER_LABELS, new: "جديد" };
    const colors: Record<string, string> = { ...TURNOVER_COLORS, new: "hsl(0, 0%, 75%)" };
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: labels[key] || key, value, color: colors[key] || "hsl(0,0%,60%)" }));
  }, [allTurnoverData]);

  // Table columns
  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(() => [
    { accessorKey: "productCode", header: "الكود", cell: ({ getValue }) => <span className="font-mono text-xs">{getValue() as string}</span> },
    { accessorKey: "productName", header: "المنتج", cell: ({ getValue }) => <span className="font-medium text-sm">{getValue() as string}</span> },
    { accessorKey: "categoryName", header: "التصنيف", cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{getValue() as string}</span> },
    {
      accessorKey: "abcClass", header: "ABC",
      cell: ({ getValue }) => {
        const v = getValue() as ABCClass;
        const cls =
          v === "A" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : v === "B" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
          : v === "excluded" ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"
          : "bg-muted text-muted-foreground";
        return <Badge variant="secondary" className={cls}>{v === "excluded" ? "مستبعد" : v}</Badge>;
      },
    },
    {
      accessorKey: "currentStock", header: "المخزون",
      cell: ({ getValue }) => <span className="tabular-nums">{fmtInt(getValue() as number)}</span>,
    },
    {
      accessorKey: "stockValue", header: "القيمة",
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null || v === undefined || isNaN(v)) return <span className="text-muted-foreground">—</span>;
        return <span className="tabular-nums font-mono text-xs">{fmt(v)}</span>;
      },
    },
    {
      accessorKey: "soldQty", header: "المباع",
      cell: ({ getValue }) => <span className="tabular-nums">{fmtInt(getValue() as number)}</span>,
    },
    {
      accessorKey: "turnoverRate", header: "معدل الدوران",
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
        return <span className="tabular-nums font-medium">{v.toFixed(1)}</span>;
      },
    },
    {
      accessorKey: "coverageDays", header: "أيام التغطية",
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null || v === undefined) return <span className="text-muted-foreground">—</span>;
        const color = v < 15 ? "text-destructive font-bold" : v <= 90 ? "text-emerald-600 font-medium" : "text-foreground";
        return <span className={`tabular-nums ${color}`}>{v}</span>;
      },
    },
    {
      accessorKey: "lastSaleDate", header: "آخر بيع",
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return <span className="text-muted-foreground text-xs">لم يُباع</span>;
        try {
          return <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(v), { addSuffix: true, locale: ar })}</span>;
        } catch { return <span className="text-xs">{v}</span>; }
      },
    },
    {
      accessorKey: "turnoverClass", header: "فئة الدوران",
      cell: ({ getValue }) => {
        const v = getValue() as TurnoverClass;
        const cls =
          v === "excellent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : v === "good" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
          : v === "slow" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
          : v === "stagnant" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
          : v === "new" ? "bg-muted text-muted-foreground"
          : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"; // new_unlisted
        return <Badge variant="secondary" className={cls}>{TURNOVER_LABELS[v]}</Badge>;
      },
    },
  ], []);

  // Export config
  const exportConfig = useMemo(() => ({
    filenamePrefix: "تقرير-دوران-المخزون",
    sheetName: "دوران المخزون",
    pdfTitle: "تقرير دوران المخزون",
    headers: ["الكود", "المنتج", "التصنيف", "ABC", "المخزون", "القيمة", "المباع", "معدل الدوران", "أيام التغطية", "آخر بيع", "فئة الدوران"],
    rows: filteredData.map(p => [
      p.productCode, p.productName, p.categoryName,
      p.abcClass === "excluded" ? "مستبعد" : p.abcClass,
      p.currentStock,
      p.stockValue !== null ? p.stockValue : "—",
      p.soldQty,
      p.turnoverRate !== null ? Number(p.turnoverRate.toFixed(1)) : "—",
      p.coverageDays !== null ? p.coverageDays : "—",
      p.lastSaleDate || "—",
      TURNOVER_LABELS[p.turnoverClass],
    ]),
    summaryCards: [
      { label: "متوسط الدوران", value: kpis.avgTurnover.toFixed(2) },
      { label: "قيمة الراكد", value: fmt(kpis.stagnantValue) },
      { label: "شراء عاجل", value: String(kpis.urgentBuy) },
      { label: "فئة A", value: `${kpis.classACount} (${kpis.classAPct.toFixed(0)}%)` },
    ],
    settings,
    pdfOrientation: "landscape" as const,
  }), [filteredData, kpis, settings]);

  const ChangeIndicator = ({ value, inverted = false }: { value: number | null; inverted?: boolean }) => {
    if (value === null) return <span className="text-xs text-muted-foreground"><Minus className="h-3 w-3 inline" /></span>;
    const isPositive = inverted ? value < 0 : value > 0;
    return (
      <span className={`text-xs font-medium flex items-center gap-0.5 ${isPositive ? "text-emerald-600" : "text-destructive"}`}>
        {value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

  // Check if all products are new (no data for analysis)
  const allProductsNew = eligibleData.length === 0 && allTurnoverData.length > 0;

  return (
    <div className="space-y-5 p-1">
      {/* Filters */}
      <Card className="border shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center gap-3">
            <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من" />
            <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى" />
            <CategoryTreeSelect categories={categories} value={categoryFilter} onValueChange={setCategoryFilter} placeholder="كافة التصنيفات" className="w-48" />
            <Select value={turnoverFilter} onValueChange={(v) => { setTurnoverFilter(v as any); setMatrixFilter(null); }}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="فئة الدوران" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفئات</SelectItem>
                <SelectItem value="excellent">ممتاز</SelectItem>
                <SelectItem value="good">جيد</SelectItem>
                <SelectItem value="slow">بطيء</SelectItem>
                <SelectItem value="stagnant">راكد</SelectItem>
                <SelectItem value="new">جديد</SelectItem>
                <SelectItem value="new_unlisted">غير مُدرج</SelectItem>
              </SelectContent>
            </Select>
            <Select value={abcFilter} onValueChange={(v) => { setAbcFilter(v as any); setMatrixFilter(null); }}>
              <SelectTrigger className="w-28 h-9"><SelectValue placeholder="ABC" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
                <SelectItem value="excluded">مستبعد</SelectItem>
              </SelectContent>
            </Select>
            {matrixFilter && (
              <button onClick={() => setMatrixFilter(null)} className="text-xs text-primary underline">إلغاء فلتر المصفوفة</button>
            )}
            <div className="mr-auto">
              <ExportMenu config={exportConfig} disabled={isLoading} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* All products are new — show message */}
      {allProductsNew && !isLoading && (
        <Card className="border shadow-sm">
          <CardContent className="py-8 text-center">
            <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
            <h3 className="text-lg font-bold text-foreground mb-1">لا توجد بيانات كافية بعد</h3>
            <p className="text-sm text-muted-foreground">جميع المنتجات جديدة (أقل من {DAYS_CONSIDERED_NEW} يوم). سيبدأ التقرير بعرض البيانات تلقائياً بعد مرور فترة كافية من النشاط.</p>
          </CardContent>
        </Card>
      )}

      {!allProductsNew && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Average Turnover */}
            <Card className="relative overflow-hidden border shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0"><TrendingUp className="w-5 h-5 text-primary" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">متوسط معدل الدوران</p>
                    {isLoading ? <Skeleton className="h-7 w-16" /> : (
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-extrabold tabular-nums">{kpis.avgTurnover.toFixed(2)}</p>
                        <ChangeIndicator value={kpis.turnoverChange} />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stagnant Value */}
            <Card className="relative overflow-hidden border shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent pointer-events-none" />
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${kpis.stagnantValue > 10000 ? "bg-red-500/10" : kpis.stagnantValue > 5000 ? "bg-amber-500/10" : "bg-muted"}`}>
                    <DollarSign className={`w-5 h-5 ${kpis.stagnantValue > 10000 ? "text-red-500" : kpis.stagnantValue > 5000 ? "text-amber-500" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">قيمة المخزون الراكد</p>
                    {isLoading ? <Skeleton className="h-7 w-20" /> : (
                      <div className="flex items-baseline gap-2">
                        <p className="text-2xl font-extrabold tabular-nums truncate">{fmt(kpis.stagnantValue)}</p>
                        <ChangeIndicator value={kpis.stagnantChange} inverted />
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Urgent Buy */}
            <Card className="relative overflow-hidden border shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 via-transparent to-transparent pointer-events-none" />
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-red-500/10 flex items-center justify-center shrink-0"><ShoppingCart className="w-5 h-5 text-red-500" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">أصناف تحتاج شراء عاجل</p>
                    {isLoading ? <Skeleton className="h-7 w-12" /> : <p className="text-2xl font-extrabold tabular-nums">{kpis.urgentBuy}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Class A */}
            <Card className="relative overflow-hidden border shadow-sm">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
              <CardContent className="pt-5 pb-4">
                <div className="flex items-start gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0"><Package className="w-5 h-5 text-emerald-600" /></div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">أصناف فئة A</p>
                    {isLoading ? <Skeleton className="h-7 w-16" /> : (
                      <p className="text-2xl font-extrabold tabular-nums">{kpis.classACount} <span className="text-sm font-medium text-muted-foreground">({kpis.classAPct.toFixed(0)}% إيراد)</span></p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Smart Alerts */}
          {(alerts.urgent.length > 0 || alerts.followup.length > 0 || alerts.review.length > 0) && (
            <Accordion type="multiple" className="space-y-2">
              {alerts.urgent.length > 0 && (
                <AccordionItem value="urgent" className="border rounded-lg bg-red-50 dark:bg-red-500/5 border-red-200 dark:border-red-500/20">
                  <AccordionTrigger className="px-4 py-2 text-sm font-bold text-red-700 dark:text-red-400 hover:no-underline">
                    <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> إجراء فوري ({alerts.urgent.length} صنف)</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3">
                    <div className="space-y-1.5">
                      {alerts.urgent.map(p => (
                        <div key={p.productId} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{p.productName} <span className="text-xs text-muted-foreground">({p.productCode})</span></span>
                          <span className="text-xs text-red-600">{p.actionLabel} — تغطية {p.coverageDays !== null ? p.coverageDays : 0} يوم | مخزون {p.currentStock} | {p.lastSupplierName ? `المورد: ${p.lastSupplierName}` : ""}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              {alerts.followup.length > 0 && (
                <AccordionItem value="followup" className="border rounded-lg bg-amber-50 dark:bg-amber-500/5 border-amber-200 dark:border-amber-500/20">
                  <AccordionTrigger className="px-4 py-2 text-sm font-bold text-amber-700 dark:text-amber-400 hover:no-underline">
                    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> يحتاج متابعة ({alerts.followup.length} صنف)</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3">
                    <div className="space-y-1.5">
                      {alerts.followup.map(p => (
                        <div key={p.productId} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{p.productName}</span>
                          <span className="text-xs text-amber-600">{p.actionLabel} — القيمة: {p.stockValue !== null ? fmt(p.stockValue) : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
              {alerts.review.length > 0 && (
                <AccordionItem value="review" className="border rounded-lg bg-yellow-50 dark:bg-yellow-500/5 border-yellow-200 dark:border-yellow-500/20">
                  <AccordionTrigger className="px-4 py-2 text-sm font-bold text-yellow-700 dark:text-yellow-400 hover:no-underline">
                    <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" /> للمراجعة ({alerts.review.length} صنف)</span>
                  </AccordionTrigger>
                  <AccordionContent className="px-4 pb-3">
                    <div className="space-y-1.5">
                      {alerts.review.map(p => (
                        <div key={p.productId} className="flex justify-between items-center text-sm">
                          <span className="font-medium">{p.productName}</span>
                          <span className="text-xs text-yellow-600">{p.actionLabel}</span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          )}

          {/* Decision Matrix 3x3 */}
          <Card className="border shadow-sm">
            <CardContent className="py-4 px-4">
              <h3 className="text-sm font-bold text-foreground mb-3">مصفوفة القرار (ABC × الدوران)</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-center text-sm border-collapse">
                  <thead>
                    <tr>
                      <th className="p-2 text-xs text-muted-foreground">ABC \ دوران</th>
                      <th className="p-2 text-xs font-medium text-emerald-600">سريع</th>
                      <th className="p-2 text-xs font-medium text-amber-600">متوسط</th>
                      <th className="p-2 text-xs font-medium text-red-600">بطيء/راكد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(["A", "B", "C"] as const).map(abc => (
                      <tr key={abc}>
                        <td className="p-2 font-bold text-foreground">{abc}</td>
                        {(["fast", "medium", "slow"] as const).map(speed => {
                          const key = `${abc}-${speed}`;
                          const count = matrixCounts[key] || 0;
                          const decision = MATRIX_DECISIONS[key];
                          const isActive = matrixFilter === key;
                          return (
                            <td
                              key={key}
                              className={`p-2 cursor-pointer rounded-lg transition-colors border ${isActive ? "bg-primary/10 border-primary" : "hover:bg-muted/50 border-transparent"}`}
                              onClick={() => setMatrixFilter(isActive ? null : key)}
                            >
                              <span className="text-base">{decision?.icon}</span>
                              <div className="text-[11px] text-muted-foreground mt-0.5">{decision?.text}</div>
                              <div className="text-xs font-bold mt-0.5">({count})</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {newProductsCount > 0 && (
                <p className="text-[11px] text-muted-foreground mt-2 text-center">
                  لا تشمل المنتجات الجديدة (أقل من {DAYS_CONSIDERED_NEW} يوم من الإضافة أو الشراء) — {newProductsCount} منتج مستبعد
                </p>
              )}
            </CardContent>
          </Card>

          {/* Pie Chart */}
          {pieData.length > 0 && (
            <Card className="border shadow-sm">
              <CardContent className="py-4">
                <h3 className="text-sm font-bold text-foreground mb-3">توزيع فئات الدوران بالقيمة المالية</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                        {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                      </Pie>
                      <Tooltip formatter={(value: number) => fmt(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                {newProductsCount > 0 && (
                  <p className="text-[11px] text-muted-foreground text-center mt-1">المنتجات المستبعدة = {newProductsCount} منتج جديد</p>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Data Table — always show, includes row coloring */}
      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="البحث بالاسم أو الكود..."
        isLoading={isLoading}
        emptyMessage="لا توجد بيانات"
      />
    </div>
  );
}
