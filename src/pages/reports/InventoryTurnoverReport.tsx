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
  CheckCircle2, XCircle, AlertCircle,
} from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

type TurnoverClass = "excellent" | "good" | "slow" | "stagnant";
type ABCClass = "A" | "B" | "C";

interface ProductTurnoverData {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  categoryId: string | null;
  currentStock: number;
  stockValue: number;
  soldQty: number;
  purchasedQty: number;
  turnoverRate: number;
  coverageDays: number;
  avgDailySales: number;
  lastSaleDate: string | null;
  lastPurchaseDate: string | null;
  lastPurchasePrice: number;
  turnoverClass: TurnoverClass;
  abcClass: ABCClass;
  actionPriority: 1 | 2 | 3 | null;
  actionLabel: string | null;
  revenue: number;
}

const TURNOVER_LABELS: Record<TurnoverClass, string> = {
  excellent: "ممتاز", good: "جيد", slow: "بطيء", stagnant: "راكد",
};
const TURNOVER_COLORS: Record<TurnoverClass, string> = {
  excellent: "hsl(152, 60%, 42%)", good: "hsl(217, 80%, 50%)", slow: "hsl(38, 92%, 50%)", stagnant: "hsl(0, 72%, 51%)",
};
const ABC_COLORS: Record<ABCClass, string> = { A: "hsl(152, 60%, 42%)", B: "hsl(217, 80%, 50%)", C: "hsl(0, 0%, 60%)" };

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
  if (tc === "excellent" || tc === "good") return tc === "excellent" ? "fast" : "medium";
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

  // Query 1: Active products
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["turnover-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, quantity_on_hand, purchase_price, selling_price, category_id, is_active, product_categories(name)")
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

  // Query 4: Purchases (for last purchase info)
  const { data: purchaseData = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["turnover-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select("product_id, quantity, unit_price, invoice:purchase_invoices!inner(invoice_date, status, supplier_id)")
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

  // Aggregate purchases by product (last purchase info)
  const purchasesByProduct = useMemo(() => {
    const map: Record<string, { purchasedQty: number; lastDate: string | null; lastPrice: number }> = {};
    purchaseData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) {
        map[pid] = { purchasedQty: 0, lastDate: item.invoice?.invoice_date || null, lastPrice: Number(item.unit_price) };
      }
      map[pid].purchasedQty += Number(item.quantity);
      const d = item.invoice?.invoice_date;
      if (d && (!map[pid].lastDate || d > map[pid].lastDate!)) {
        map[pid].lastDate = d;
        map[pid].lastPrice = Number(item.unit_price);
      }
    });
    return map;
  }, [purchaseData]);

  // Compute turnover data
  const allTurnoverData = useMemo(() => {
    const items: ProductTurnoverData[] = products.map((p: any) => {
      const sales = salesByProduct[p.id];
      const purchases = purchasesByProduct[p.id];
      const currentStock = Number(p.quantity_on_hand);
      const soldQty = sales?.soldQty || 0;
      const purchasedQty = purchases?.purchasedQty || 0;
      const lastPurchasePrice = purchases?.lastPrice || Number(p.purchase_price);
      const stockValue = currentStock * lastPurchasePrice;
      const revenue = sales?.revenue || 0;

      // Edge case: stock is zero
      let turnoverRate: number;
      let turnoverClass: TurnoverClass;
      if (currentStock === 0 && soldQty > 0) {
        // Out of stock due to high demand
        turnoverRate = soldQty; // show actual sold qty as rate indicator
        turnoverClass = "excellent";
      } else if (currentStock === 0 && soldQty === 0) {
        turnoverRate = 0;
        turnoverClass = "stagnant";
      } else {
        turnoverRate = soldQty / Math.max(currentStock, 1);
        const annualizedRate = turnoverRate * (365 / periodDays);
        // Check if last sale was >90 days ago
        const lastSaleDate = sales?.lastDate || null;
        const daysSinceLastSale = lastSaleDate ? differenceInDays(new Date(), new Date(lastSaleDate)) : Infinity;
        if (annualizedRate >= 6) turnoverClass = "excellent";
        else if (annualizedRate >= 3) turnoverClass = "good";
        else if (annualizedRate >= 1) turnoverClass = "slow";
        else turnoverClass = daysSinceLastSale > 90 ? "stagnant" : (annualizedRate < 1 ? "stagnant" : "slow");
      }

      const avgDailySales = soldQty / periodDays;
      const coverageDays = avgDailySales > 0 ? currentStock / avgDailySales : Infinity;

      return {
        productId: p.id,
        productCode: p.code,
        productName: p.name,
        categoryName: (p as any).product_categories?.name || "بدون تصنيف",
        categoryId: p.category_id,
        currentStock,
        stockValue,
        soldQty,
        purchasedQty,
        turnoverRate,
        coverageDays,
        avgDailySales,
        lastSaleDate: sales?.lastDate || null,
        lastPurchaseDate: purchases?.lastDate || null,
        lastPurchasePrice,
        turnoverClass,
        abcClass: "C" as ABCClass, // will be set below
        actionPriority: null as any,
        actionLabel: null as any,
        revenue,
      };
    });

    // ABC Analysis
    const sorted = [...items].sort((a, b) => b.revenue - a.revenue);
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
    items.forEach(p => { p.abcClass = abcMap.get(p.productId) || "C"; });

    // Action Priority
    items.forEach((p) => {
      if (p.coverageDays < 15 && (p.abcClass === "A" || p.abcClass === "B") && p.currentStock > 0) {
        p.actionPriority = 1;
        p.actionLabel = p.abcClass === "A" ? "شراء عاجل" : "شراء قريباً";
      } else if (p.turnoverClass === "stagnant" && p.stockValue > 1000) {
        p.actionPriority = 2;
        p.actionLabel = "مخزون راكد — فكّر في تخفيض السعر";
      } else if (p.coverageDays > 180 && p.abcClass === "A") {
        p.actionPriority = 2;
        p.actionLabel = "مخزون زائد — راجع كمية الطلب";
      } else if (p.coverageDays > 180 && p.abcClass !== "A") {
        p.actionPriority = 3;
        p.actionLabel = "مخزون فائض";
      } else if (p.turnoverClass === "slow" && p.abcClass === "C") {
        p.actionPriority = 3;
        p.actionLabel = "إيراد منخفض ودوران بطيء";
      }
    });

    return items;
  }, [products, salesByProduct, purchasesByProduct, periodDays]);

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

  // KPIs
  const kpis = useMemo(() => {
    const active = allTurnoverData;
    const withSales = active.filter(p => p.soldQty > 0);
    const avgTurnover = withSales.length > 0 ? withSales.reduce((s, p) => s + p.turnoverRate, 0) / withSales.length : 0;
    const stagnantValue = active.filter(p => p.turnoverClass === "stagnant").reduce((s, p) => s + p.stockValue, 0);
    const urgentBuy = active.filter(p => p.coverageDays < 15 && p.currentStock > 0 && p.soldQty > 0).length;
    const classA = active.filter(p => p.abcClass === "A");
    const classARevenue = classA.reduce((s, p) => s + p.revenue, 0);
    const totalRevenue = active.reduce((s, p) => s + p.revenue, 0);
    const classAPct = totalRevenue > 0 ? (classARevenue / totalRevenue * 100) : 0;

    // Previous period comparison
    const prevProducts = products.map((p: any) => {
      const prevSales = prevSalesByProduct[p.id];
      const currentStock = Number(p.quantity_on_hand);
      const soldQty = prevSales?.soldQty || 0;
      const lastPurchasePrice = purchasesByProduct[p.id]?.lastPrice || Number(p.purchase_price);
      const turnoverRate = currentStock > 0 ? soldQty / currentStock : (soldQty > 0 ? soldQty : 0);
      const turnoverClass: TurnoverClass = (() => {
        const ann = turnoverRate * (365 / periodDays);
        if (ann >= 6) return "excellent";
        if (ann >= 3) return "good";
        if (ann >= 1) return "slow";
        return "stagnant";
      })();
      return { turnoverRate, turnoverClass, stockValue: currentStock * lastPurchasePrice };
    });
    const prevWithSales2 = prevProducts.filter(p => p.turnoverRate > 0);
    const prevAvgTurnover = prevWithSales2.length > 0 ? prevWithSales2.reduce((s, p) => s + p.turnoverRate, 0) / prevWithSales2.length : 0;
    const prevStagnantValue = prevProducts.filter(p => p.turnoverClass === "stagnant").reduce((s, p) => s + p.stockValue, 0);

    const turnoverChange = prevAvgTurnover > 0 ? ((avgTurnover - prevAvgTurnover) / prevAvgTurnover * 100) : null;
    const stagnantChange = prevStagnantValue > 0 ? ((stagnantValue - prevStagnantValue) / prevStagnantValue * 100) : null;

    return { avgTurnover, stagnantValue, urgentBuy, classACount: classA.length, classAPct, turnoverChange, stagnantChange };
  }, [allTurnoverData, products, prevSalesByProduct, purchasesByProduct, periodDays]);

  // Action alerts
  const alerts = useMemo(() => ({
    urgent: allTurnoverData.filter(p => p.actionPriority === 1),
    followup: allTurnoverData.filter(p => p.actionPriority === 2),
    review: allTurnoverData.filter(p => p.actionPriority === 3),
  }), [allTurnoverData]);

  // Decision matrix counts
  const matrixCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ["A", "B", "C"].forEach(abc => {
      ["fast", "medium", "slow"].forEach(speed => {
        counts[`${abc}-${speed}`] = allTurnoverData.filter(p => p.abcClass === abc && getTurnoverSpeed(p.turnoverClass) === speed).length;
      });
    });
    return counts;
  }, [allTurnoverData]);

  // Pie chart data
  const pieData = useMemo(() => {
    const groups: Record<TurnoverClass, number> = { excellent: 0, good: 0, slow: 0, stagnant: 0 };
    allTurnoverData.forEach(p => { groups[p.turnoverClass] += p.stockValue; });
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([key, value]) => ({ name: TURNOVER_LABELS[key as TurnoverClass], value, color: TURNOVER_COLORS[key as TurnoverClass] }));
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
        const cls = v === "A" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400" : v === "B" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" : "bg-muted text-muted-foreground";
        return <Badge variant="secondary" className={cls}>{v}</Badge>;
      },
    },
    {
      accessorKey: "currentStock", header: "المخزون",
      cell: ({ getValue }) => <span className="tabular-nums">{fmtInt(getValue() as number)}</span>,
    },
    {
      accessorKey: "stockValue", header: `القيمة`,
      cell: ({ getValue }) => <span className="tabular-nums font-mono text-xs">{fmt(getValue() as number)}</span>,
    },
    {
      accessorKey: "soldQty", header: "المباع",
      cell: ({ getValue }) => <span className="tabular-nums">{fmtInt(getValue() as number)}</span>,
    },
    {
      accessorKey: "turnoverRate", header: "معدل الدوران",
      cell: ({ getValue }) => <span className="tabular-nums font-medium">{(getValue() as number).toFixed(1)}</span>,
    },
    {
      accessorKey: "coverageDays", header: "أيام التغطية",
      cell: ({ getValue }) => {
        const v = getValue() as number;
        if (!isFinite(v)) return <span className="text-muted-foreground">∞</span>;
        const color = v < 15 ? "text-destructive font-bold" : v <= 90 ? "text-emerald-600 font-medium" : "text-foreground";
        return <span className={`tabular-nums ${color}`}>{Math.round(v)}</span>;
      },
    },
    {
      accessorKey: "lastSaleDate", header: "آخر بيع",
      cell: ({ getValue }) => {
        const v = getValue() as string | null;
        if (!v) return <span className="text-muted-foreground text-xs">—</span>;
        try {
          return <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(v), { addSuffix: true, locale: ar })}</span>;
        } catch { return <span className="text-xs">{v}</span>; }
      },
    },
    {
      accessorKey: "turnoverClass", header: "فئة الدوران",
      cell: ({ getValue }) => {
        const v = getValue() as TurnoverClass;
        const cls = v === "excellent" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
          : v === "good" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
          : v === "slow" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";
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
      p.productCode, p.productName, p.categoryName, p.abcClass,
      p.currentStock, p.stockValue, p.soldQty,
      Number(p.turnoverRate.toFixed(1)),
      isFinite(p.coverageDays) ? Math.round(p.coverageDays) : "∞",
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

  const ChangeIndicator = ({ value }: { value: number | null }) => {
    if (value === null) return <span className="text-xs text-muted-foreground"><Minus className="h-3 w-3 inline" /></span>;
    const isPositive = value > 0;
    return (
      <span className={`text-xs font-medium flex items-center gap-0.5 ${isPositive ? "text-emerald-600" : "text-destructive"}`}>
        {isPositive ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
        {Math.abs(value).toFixed(1)}%
      </span>
    );
  };

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
              </SelectContent>
            </Select>
            <Select value={abcFilter} onValueChange={(v) => { setAbcFilter(v as any); setMatrixFilter(null); }}>
              <SelectTrigger className="w-28 h-9"><SelectValue placeholder="ABC" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="A">A</SelectItem>
                <SelectItem value="B">B</SelectItem>
                <SelectItem value="C">C</SelectItem>
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
                    <ChangeIndicator value={kpis.stagnantChange !== null ? (kpis.stagnantChange * -1) : null} />
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
                      <span className="text-xs text-red-600">{p.actionLabel} — تغطية {isFinite(p.coverageDays) ? Math.round(p.coverageDays) : 0} يوم</span>
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
                      <span className="text-xs text-amber-600">{p.actionLabel}</span>
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
          </CardContent>
        </Card>
      )}

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="البحث بالاسم أو الكود..."
        isLoading={isLoading}
        emptyMessage="لا توجد بيانات"
        rowClassName={(row) => row.original.actionPriority === 1 ? "bg-red-50/50 dark:bg-red-500/5" : undefined}
      />
    </div>
  );
}
