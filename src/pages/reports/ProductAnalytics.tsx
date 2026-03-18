import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { FileSpreadsheet, FileText, Trophy, TrendingUp, DollarSign, Package, Medal, AlertTriangle, Info, ShoppingCart } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";
import { useSettings } from "@/contexts/SettingsContext";

const CHART_COLORS = [
  "hsl(24, 95%, 53%)",
  "hsl(152, 60%, 42%)",
  "hsl(217, 80%, 50%)",
  "hsl(340, 65%, 50%)",
  "hsl(262, 60%, 50%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(190, 70%, 45%)",
];

const TURNOVER_COLORS = {
  excellent: "hsl(152, 60%, 42%)",
  medium: "hsl(38, 92%, 50%)",
  slow: "hsl(0, 72%, 51%)",
  dead: "hsl(0, 50%, 30%)",
};

type ViewType = "top-sellers" | "most-profitable" | "by-category" | "turnover";

interface ProductMetrics {
  name: string;
  code: string;
  category: string;
  categoryId: string | null;
  soldQty: number;
  returnedQty: number;
  netQty: number;
  revenue: number;
  returnsValue: number;
  netRevenue: number;
  cogs: number;
  returnsCogs: number;
  netCogs: number;
  profit: number;
  currentStock: number;
  minStockLevel: number;
  purchasePrice: number;
}

export default function ProductAnalytics() {
  const { settings } = useSettings();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [view, setView] = useState<ViewType>("top-sellers");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Query 1: Sales invoice items
  const { data: salesItems, isLoading: loadingSales } = useQuery({
    queryKey: ["pa-sales", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select("quantity, total, unit_price, product_id, product:products(name, code, category_id, quantity_on_hand, min_stock_level, purchase_price, category:product_categories(name)), invoice:sales_invoices!inner(invoice_date, status)")
        .gte("invoice.invoice_date", dateFrom)
        .lte("invoice.invoice_date", dateTo)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return data;
    },
  });

  // Query 2: Sales return items
  const { data: returnItems, isLoading: loadingReturns } = useQuery({
    queryKey: ["pa-returns", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_return_items")
        .select("quantity, total, product_id, return:sales_returns!inner(return_date, status)")
        .gte("return.return_date", dateFrom)
        .lte("return.return_date", dateTo)
        .eq("return.status", "posted");
      if (error) throw error;
      return data;
    },
  });

  // Query 3: Inventory movements for actual COGS
  const { data: movements, isLoading: loadingMovements } = useQuery({
    queryKey: ["pa-movements", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, movement_type, quantity, total_cost, movement_date")
        .in("movement_type", ["sale", "sale_return"])
        .gte("movement_date", dateFrom)
        .lte("movement_date", dateTo);
      if (error) throw error;
      return data;
    },
  });

  // Query 4: All active products
  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["pa-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, purchase_price, selling_price, quantity_on_hand, min_stock_level, category_id, category:product_categories(name)")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  // Query 5: Categories for filter
  const { data: categories } = useQuery({
    queryKey: ["pa-categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const isLoading = loadingSales || loadingReturns || loadingMovements || loadingProducts;

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Build product metrics
  const productMetrics = useMemo(() => {
    const metrics: Record<string, ProductMetrics> = {};

    // Initialize from sales
    salesItems?.forEach((item: any) => {
      const id = item.product_id || "unknown";
      if (!metrics[id]) {
        metrics[id] = {
          name: item.product?.name || "محذوف",
          code: item.product?.code || "-",
          category: item.product?.category?.name || "بدون تصنيف",
          categoryId: item.product?.category_id || null,
          soldQty: 0, returnedQty: 0, netQty: 0,
          revenue: 0, returnsValue: 0, netRevenue: 0,
          cogs: 0, returnsCogs: 0, netCogs: 0, profit: 0,
          currentStock: Number(item.product?.quantity_on_hand || 0),
          minStockLevel: Number(item.product?.min_stock_level || 0),
          purchasePrice: Number(item.product?.purchase_price || 0),
        };
      }
      metrics[id].soldQty += Number(item.quantity);
      metrics[id].revenue += Number(item.total);
    });

    // Add returns
    returnItems?.forEach((item: any) => {
      const id = item.product_id || "unknown";
      if (!metrics[id]) {
        metrics[id] = {
          name: "محذوف", code: "-", category: "بدون تصنيف", categoryId: null,
          soldQty: 0, returnedQty: 0, netQty: 0,
          revenue: 0, returnsValue: 0, netRevenue: 0,
          cogs: 0, returnsCogs: 0, netCogs: 0, profit: 0,
          currentStock: 0, minStockLevel: 0, purchasePrice: 0,
        };
      }
      metrics[id].returnedQty += Number(item.quantity);
      metrics[id].returnsValue += Number(item.total);
    });

    // Actual COGS from inventory_movements
    movements?.forEach((m: any) => {
      const id = m.product_id;
      if (!metrics[id]) return;
      if (m.movement_type === "sale") {
        metrics[id].cogs += Number(m.total_cost);
      } else if (m.movement_type === "sale_return") {
        metrics[id].returnsCogs += Number(m.total_cost);
      }
    });

    // Calculate net values
    Object.values(metrics).forEach((p) => {
      p.netQty = p.soldQty - p.returnedQty;
      p.netRevenue = p.revenue - p.returnsValue;
      p.netCogs = p.cogs - p.returnsCogs;
      p.profit = p.netRevenue - p.netCogs;
    });

    return metrics;
  }, [salesItems, returnItems, movements]);

  // Apply category filter
  const filteredMetrics = useMemo(() => {
    const all = Object.values(productMetrics);
    if (categoryFilter === "all") return all;
    return all.filter((p) => p.categoryId === categoryFilter);
  }, [productMetrics, categoryFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const distinctProducts = filteredMetrics.filter((p) => p.soldQty > 0).length;
    const totalNetQty = filteredMetrics.reduce((s, p) => s + p.netQty, 0);
    const totalNetRevenue = filteredMetrics.reduce((s, p) => s + p.netRevenue, 0);
    const totalProfit = filteredMetrics.reduce((s, p) => s + p.profit, 0);
    return { distinctProducts, totalNetQty, totalNetRevenue, totalProfit };
  }, [filteredMetrics]);

  // Views
  const topSellers = useMemo(() => [...filteredMetrics].sort((a, b) => b.netQty - a.netQty), [filteredMetrics]);
  const mostProfitable = useMemo(() => [...filteredMetrics].sort((a, b) => b.profit - a.profit), [filteredMetrics]);

  const categoryList = useMemo(() => {
    const cats: Record<string, { name: string; productCount: number; netQty: number; netRevenue: number; netCogs: number; profit: number }> = {};
    filteredMetrics.forEach((p) => {
      if (!cats[p.category]) cats[p.category] = { name: p.category, productCount: 0, netQty: 0, netRevenue: 0, netCogs: 0, profit: 0 };
      cats[p.category].productCount++;
      cats[p.category].netQty += p.netQty;
      cats[p.category].netRevenue += p.netRevenue;
      cats[p.category].netCogs += p.netCogs;
      cats[p.category].profit += p.profit;
    });
    return Object.values(cats).sort((a, b) => b.netRevenue - a.netRevenue);
  }, [filteredMetrics]);

  // Turnover data from all products
  const turnoverData = useMemo(() => {
    const allProducts = products || [];
    const filtered = categoryFilter === "all" ? allProducts : allProducts.filter((p: any) => p.category_id === categoryFilter);
    return filtered.map((p: any) => {
      const m = productMetrics[p.id];
      const cogs = m?.netCogs || 0;
      const currentStockValue = Number(p.quantity_on_hand) * Number(p.purchase_price);
      const avgInventory = currentStockValue > 0 ? currentStockValue : 1; // avoid division by zero
      const turnover = cogs > 0 ? Math.round((cogs / avgInventory) * 100) / 100 : 0;
      const hasSales = m && m.soldQty > 0;
      return {
        name: p.name,
        code: p.code,
        category: p.category?.name || "بدون تصنيف",
        cogs,
        avgInventory: currentStockValue,
        turnover,
        currentStock: Number(p.quantity_on_hand),
        minStockLevel: Number(p.min_stock_level),
        rating: !hasSales ? "dead" as const : turnover > 2 ? "excellent" as const : turnover > 0.5 ? "medium" as const : "slow" as const,
      };
    }).sort((a, b) => b.turnover - a.turnover);
  }, [products, productMetrics, categoryFilter]);

  // Dead stock & reorder alerts
  const deadStockCount = turnoverData.filter((p) => p.rating === "dead" && p.currentStock > 0).length;
  const deadStockValue = turnoverData.filter((p) => p.rating === "dead" && p.currentStock > 0).reduce((s, p) => s + p.avgInventory, 0);
  const reorderAlerts = turnoverData.filter((p) => p.currentStock > 0 && p.currentStock < p.minStockLevel && p.rating !== "dead");

  // Turnover distribution for donut chart
  const turnoverDistribution = useMemo(() => {
    const dist = { excellent: 0, medium: 0, slow: 0, dead: 0 };
    turnoverData.forEach((p) => { dist[p.rating]++; });
    return [
      { name: "ممتاز (>2)", value: dist.excellent, color: TURNOVER_COLORS.excellent },
      { name: "متوسط (0.5-2)", value: dist.medium, color: TURNOVER_COLORS.medium },
      { name: "بطيء (≤0.5)", value: dist.slow, color: TURNOVER_COLORS.slow },
      { name: "راكد (0)", value: dist.dead, color: TURNOVER_COLORS.dead },
    ].filter((d) => d.value > 0);
  }, [turnoverData]);

  // Chart data
  const chartData = useMemo(() => {
    if (view === "top-sellers") return topSellers.slice(0, 10).map((p) => ({ name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name, value: p.netQty }));
    if (view === "most-profitable") return mostProfitable.slice(0, 10).map((p) => ({ name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name, value: p.profit }));
    return [];
  }, [view, topSellers, mostProfitable]);

  const categoryChartData = useMemo(() =>
    categoryList.map((c, i) => ({ name: c.name, value: c.netRevenue, color: CHART_COLORS[i % CHART_COLORS.length] })),
    [categoryList]);

  const medalIcon = (index: number) => {
    if (index === 0) return <Medal className="w-4 h-4 text-yellow-500" />;
    if (index === 1) return <Medal className="w-4 h-4 text-gray-400" />;
    if (index === 2) return <Medal className="w-4 h-4 text-amber-700" />;
    return <span className="text-muted-foreground text-xs">{index + 1}</span>;
  };

  const profitColor = (val: number) => val >= 0 ? "text-success font-bold" : "text-destructive font-bold";

  // Export handlers
  const handleExport = () => {
    if (view === "top-sellers") {
      exportToExcel({ filename: "أكثر-المنتجات-مبيعاً", sheetName: "الأكثر مبيعاً", headers: ["الكود", "المنتج", "التصنيف", "الكمية المباعة", "المرتجعات", "صافي الكمية", "الإيرادات", "التكلفة الفعلية", "الربح"], rows: topSellers.map((p) => [p.code, p.name, p.category, p.soldQty, p.returnedQty, p.netQty, p.netRevenue, p.netCogs, p.profit]) });
    } else if (view === "most-profitable") {
      exportToExcel({ filename: "الأكثر-ربحية", sheetName: "الأكثر ربحية", headers: ["الكود", "المنتج", "التصنيف", "صافي الإيرادات", "التكلفة الفعلية", "الربح", "هامش الربح %"], rows: mostProfitable.map((p) => [p.code, p.name, p.category, p.netRevenue, p.netCogs, p.profit, p.netRevenue > 0 ? ((p.profit / p.netRevenue) * 100).toFixed(1) + "%" : "0%"]) });
    } else if (view === "by-category") {
      exportToExcel({ filename: "المبيعات-بالتصنيف", sheetName: "بالتصنيف", headers: ["التصنيف", "عدد المنتجات", "صافي الكمية", "صافي الإيرادات", "التكلفة", "الربح"], rows: categoryList.map((c) => [c.name, c.productCount, c.netQty, c.netRevenue, c.netCogs, c.profit]) });
    } else {
      exportToExcel({ filename: "معدل-دوران-المخزون", sheetName: "دوران المخزون", headers: ["الكود", "المنتج", "التصنيف", "تكلفة المبيعات", "قيمة المخزون", "معدل الدوران", "المخزون الحالي", "التقييم"], rows: turnoverData.map((p) => [p.code, p.name, p.category, p.cogs, p.avgInventory, p.turnover, p.currentStock, p.rating === "excellent" ? "ممتاز" : p.rating === "medium" ? "متوسط" : p.rating === "slow" ? "بطيء" : "راكد"]) });
    }
  };

  const handlePdfExport = async () => {
    const titles: Record<string, string> = { "top-sellers": "أكثر المنتجات مبيعاً", "most-profitable": "المنتجات الأكثر ربحية", "by-category": "المبيعات حسب التصنيف", turnover: "معدل دوران المخزون" };
    if (view === "top-sellers") {
      await exportReportPdf({ title: titles[view], settings, headers: ["الكود", "المنتج", "التصنيف", "مباع", "مرتجع", "صافي", "الإيرادات", "التكلفة", "الربح"], rows: topSellers.map((p) => [p.code, p.name, p.category, fmtN(p.soldQty), fmtN(p.returnedQty), fmtN(p.netQty), fmt(p.netRevenue), fmt(p.netCogs), fmt(p.profit)]), filename: "أكثر-المنتجات-مبيعاً", orientation: "landscape" });
    } else if (view === "most-profitable") {
      await exportReportPdf({ title: titles[view], settings, headers: ["الكود", "المنتج", "التصنيف", "الإيرادات", "التكلفة", "الربح", "هامش %"], rows: mostProfitable.map((p) => [p.code, p.name, p.category, fmt(p.netRevenue), fmt(p.netCogs), fmt(p.profit), p.netRevenue > 0 ? ((p.profit / p.netRevenue) * 100).toFixed(1) + "%" : "0%"]), filename: "الأكثر-ربحية", orientation: "landscape" });
    } else if (view === "by-category") {
      await exportReportPdf({ title: titles[view], settings, headers: ["التصنيف", "عدد المنتجات", "صافي الكمية", "الإيرادات", "التكلفة", "الربح"], rows: categoryList.map((c) => [c.name, c.productCount, fmtN(c.netQty), fmt(c.netRevenue), fmt(c.netCogs), fmt(c.profit)]), filename: "مبيعات-بالتصنيف" });
    } else {
      await exportReportPdf({ title: titles[view], settings, headers: ["الكود", "المنتج", "التصنيف", "ت.المبيعات", "ق.المخزون", "الدوران", "المخزون", "التقييم"], rows: turnoverData.map((p) => [p.code, p.name, p.category, fmt(p.cogs), fmt(p.avgInventory), String(p.turnover), fmtN(p.currentStock), p.rating === "excellent" ? "ممتاز" : p.rating === "medium" ? "متوسط" : p.rating === "slow" ? "بطيء" : "راكد"]), filename: "دوران-المخزون", orientation: "landscape" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1"><Label>من تاريخ</Label><DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" className="w-40" /></div>
            <div className="space-y-1"><Label>إلى تاريخ</Label><DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" className="w-40" /></div>
            <div className="space-y-1">
              <Label>نوع التقرير</Label>
              <Select value={view} onValueChange={(v: any) => setView(v)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="top-sellers">الأكثر مبيعاً</SelectItem>
                  <SelectItem value="most-profitable">الأكثر ربحية</SelectItem>
                  <SelectItem value="by-category">حسب التصنيف</SelectItem>
                  <SelectItem value="turnover">دوران المخزون</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>التصنيف</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-44"><SelectValue placeholder="الكل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع التصنيفات</SelectItem>
                  {categories?.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={isLoading}><FileSpreadsheet className="w-4 h-4 ml-2" />Excel</Button>
            <Button variant="outline" onClick={handlePdfExport} disabled={isLoading}><FileText className="w-4 h-4 ml-2" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><Package className="w-5 h-5 text-primary" /></div>
              <div>
                <p className="text-xs text-muted-foreground">أصناف مباعة</p>
                {isLoading ? <Skeleton className="h-6 w-16" /> : <p className="text-xl font-extrabold">{fmtN(kpis.distinctProducts)}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">صافي الكميات</p>
                {isLoading ? <Skeleton className="h-6 w-16" /> : <p className="text-xl font-extrabold">{fmtN(kpis.totalNetQty)}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-success" /></div>
              <div>
                <p className="text-xs text-muted-foreground">صافي الإيرادات</p>
                {isLoading ? <Skeleton className="h-6 w-16" /> : <p className="text-xl font-extrabold">{fmt(kpis.totalNetRevenue)}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: kpis.totalProfit >= 0 ? "hsl(152 60% 42% / 0.1)" : "hsl(0 72% 51% / 0.1)" }}>
                <DollarSign className="w-5 h-5" style={{ color: kpis.totalProfit >= 0 ? "hsl(152, 60%, 42%)" : "hsl(0, 72%, 51%)" }} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الربح</p>
                {isLoading ? <Skeleton className="h-6 w-16" /> : <p className={`text-xl font-extrabold ${profitColor(kpis.totalProfit)}`}>{fmt(kpis.totalProfit)}</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alerts for turnover view */}
      {view === "turnover" && !isLoading && (
        <div className="space-y-2">
          {deadStockCount > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <strong>{fmtN(deadStockCount)}</strong> منتج راكد بدون مبيعات خلال الفترة — قيمة مخزون محتجز: <strong>{fmt(deadStockValue)}</strong>
              </AlertDescription>
            </Alert>
          )}
          {reorderAlerts.length > 0 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                <strong>{reorderAlerts.length}</strong> منتج تحت نقطة إعادة الطلب وله مبيعات نشطة: {reorderAlerts.slice(0, 3).map((p) => p.name).join("، ")}{reorderAlerts.length > 3 ? ` و${reorderAlerts.length - 3} آخرين` : ""}
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {/* Charts */}
      {(view === "top-sellers" || view === "most-profitable") && chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{view === "top-sellers" ? "الأكثر مبيعاً" : "الأكثر ربحية"} (أعلى 10)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[250px] w-full" /> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis dataKey="name" type="category" width={120} fontSize={10} />
                  <Tooltip formatter={(v: number) => view === "top-sellers" ? fmtN(v) : fmt(v)} />
                  <Bar dataKey="value" name={view === "top-sellers" ? "صافي الكمية" : "الربح"} fill={view === "top-sellers" ? "hsl(217, 80%, 50%)" : "hsl(152, 60%, 42%)"} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {view === "by-category" && categoryChartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">توزيع الإيرادات حسب التصنيف</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[280px] w-full" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} fontSize={11}>
                    {categoryChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {view === "turnover" && turnoverDistribution.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm">توزيع فئات دوران المخزون</CardTitle>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger><Info className="w-3.5 h-3.5 text-muted-foreground" /></TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs">
                    <p>ممتاز: دوران أكبر من 2 — متوسط: بين 0.5 و 2 — بطيء: أقل من 0.5 — راكد: لم يُبع خلال الفترة</p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[280px] w-full" /> : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={turnoverDistribution} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} label={({ name, value }) => `${name}: ${value}`} fontSize={11}>
                    {turnoverDistribution.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Tables */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : view === "top-sellers" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>التصنيف</TableHead><TableHead>مباع</TableHead><TableHead>مرتجع</TableHead><TableHead>صافي</TableHead><TableHead>الإيرادات</TableHead><TableHead>التكلفة</TableHead><TableHead>الربح</TableHead></TableRow></TableHeader>
                <TableBody>
                  {topSellers.map((p, i) => (
                    <TableRow key={p.code + i}><TableCell>{medalIcon(i)}</TableCell><TableCell>{p.code}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant="secondary">{p.category}</Badge></TableCell><TableCell>{fmtN(p.soldQty)}</TableCell><TableCell className="text-destructive">{p.returnedQty > 0 ? fmtN(p.returnedQty) : "-"}</TableCell><TableCell className="font-bold">{fmtN(p.netQty)}</TableCell><TableCell>{fmt(p.netRevenue)}</TableCell><TableCell>{fmt(p.netCogs)}</TableCell><TableCell className={profitColor(p.profit)}>{fmt(p.profit)}</TableCell></TableRow>
                  ))}
                  {!topSellers.length && <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground">لا توجد مبيعات</TableCell></TableRow>}
                </TableBody>
                {topSellers.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4}>الإجمالي</TableCell>
                      <TableCell>{fmtN(topSellers.reduce((s, p) => s + p.soldQty, 0))}</TableCell>
                      <TableCell className="text-destructive">{fmtN(topSellers.reduce((s, p) => s + p.returnedQty, 0))}</TableCell>
                      <TableCell>{fmtN(topSellers.reduce((s, p) => s + p.netQty, 0))}</TableCell>
                      <TableCell>{fmt(topSellers.reduce((s, p) => s + p.netRevenue, 0))}</TableCell>
                      <TableCell>{fmt(topSellers.reduce((s, p) => s + p.netCogs, 0))}</TableCell>
                      <TableCell className={profitColor(topSellers.reduce((s, p) => s + p.profit, 0))}>{fmt(topSellers.reduce((s, p) => s + p.profit, 0))}</TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          ) : view === "most-profitable" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>التصنيف</TableHead><TableHead>صافي الإيرادات</TableHead><TableHead>التكلفة</TableHead><TableHead>الربح</TableHead><TableHead>هامش الربح</TableHead></TableRow></TableHeader>
                <TableBody>
                  {mostProfitable.map((p, i) => {
                    const margin = p.netRevenue > 0 ? (p.profit / p.netRevenue) * 100 : 0;
                    return (
                      <TableRow key={p.code + i}><TableCell>{medalIcon(i)}</TableCell><TableCell>{p.code}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant="secondary">{p.category}</Badge></TableCell><TableCell>{fmt(p.netRevenue)}</TableCell><TableCell>{fmt(p.netCogs)}</TableCell><TableCell className={profitColor(p.profit)}>{fmt(p.profit)}</TableCell><TableCell><Badge variant={margin > 30 ? "default" : margin > 15 ? "secondary" : "destructive"}>{margin.toFixed(1)}%</Badge></TableCell></TableRow>
                    );
                  })}
                  {!mostProfitable.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
                {mostProfitable.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell colSpan={4}>الإجمالي</TableCell>
                      <TableCell>{fmt(mostProfitable.reduce((s, p) => s + p.netRevenue, 0))}</TableCell>
                      <TableCell>{fmt(mostProfitable.reduce((s, p) => s + p.netCogs, 0))}</TableCell>
                      <TableCell className={profitColor(mostProfitable.reduce((s, p) => s + p.profit, 0))}>{fmt(mostProfitable.reduce((s, p) => s + p.profit, 0))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          ) : view === "by-category" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>التصنيف</TableHead><TableHead>عدد المنتجات</TableHead><TableHead>صافي الكمية</TableHead><TableHead>صافي الإيرادات</TableHead><TableHead>التكلفة</TableHead><TableHead>الربح</TableHead><TableHead>هامش الربح</TableHead></TableRow></TableHeader>
                <TableBody>
                  {categoryList.map((c) => {
                    const margin = c.netRevenue > 0 ? (c.profit / c.netRevenue) * 100 : 0;
                    return (
                      <TableRow key={c.name}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.productCount}</TableCell><TableCell>{fmtN(c.netQty)}</TableCell><TableCell>{fmt(c.netRevenue)}</TableCell><TableCell>{fmt(c.netCogs)}</TableCell><TableCell className={profitColor(c.profit)}>{fmt(c.profit)}</TableCell><TableCell><Badge variant={margin > 30 ? "default" : "secondary"}>{margin.toFixed(1)}%</Badge></TableCell></TableRow>
                    );
                  })}
                  {!categoryList.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
                {categoryList.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>الإجمالي</TableCell>
                      <TableCell>{categoryList.reduce((s, c) => s + c.productCount, 0)}</TableCell>
                      <TableCell>{fmtN(categoryList.reduce((s, c) => s + c.netQty, 0))}</TableCell>
                      <TableCell>{fmt(categoryList.reduce((s, c) => s + c.netRevenue, 0))}</TableCell>
                      <TableCell>{fmt(categoryList.reduce((s, c) => s + c.netCogs, 0))}</TableCell>
                      <TableCell className={profitColor(categoryList.reduce((s, c) => s + c.profit, 0))}>{fmt(categoryList.reduce((s, c) => s + c.profit, 0))}</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>التصنيف</TableHead><TableHead>تكلفة المبيعات</TableHead><TableHead>قيمة المخزون</TableHead><TableHead>معدل الدوران</TableHead><TableHead>المخزون الحالي</TableHead><TableHead>التقييم</TableHead></TableRow></TableHeader>
                <TableBody>
                  {turnoverData.map((p) => (
                    <TableRow key={p.code} className={p.rating === "dead" ? "bg-destructive/5" : ""}>
                      <TableCell>{p.code}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant="secondary">{p.category}</Badge></TableCell><TableCell>{fmt(p.cogs)}</TableCell><TableCell>{fmt(p.avgInventory)}</TableCell><TableCell className="font-bold">{p.turnover}</TableCell>
                      <TableCell>
                        <span className={p.currentStock > 0 && p.currentStock < p.minStockLevel ? "text-destructive font-bold" : ""}>
                          {fmtN(p.currentStock)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={p.rating === "excellent" ? "default" : p.rating === "medium" ? "secondary" : "destructive"}>
                          {p.rating === "excellent" ? "ممتاز" : p.rating === "medium" ? "متوسط" : p.rating === "slow" ? "بطيء" : "راكد"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!turnoverData.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
