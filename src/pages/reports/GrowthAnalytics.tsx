import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  TrendingUp, TrendingDown, Minus, DollarSign, ShoppingCart,
  Receipt, BarChart3, Percent, FileSpreadsheet, FileText, Users, Package, RotateCcw,
  AlertTriangle, Info, AlertCircle
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend
} from "recharts";
import { format, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { ar } from "date-fns/locale";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";

const CHART_COLORS = [
  "hsl(24, 95%, 53%)",
  "hsl(152, 60%, 42%)",
  "hsl(217, 80%, 50%)",
  "hsl(340, 65%, 50%)",
  "hsl(262, 60%, 50%)",
  "hsl(38, 92%, 50%)",
];

export default function GrowthAnalytics() {
  const { formatCurrency, settings } = useSettings();
  const [period, setPeriod] = useState("6");

  const months = parseInt(period);
  const dateFrom = format(startOfMonth(subMonths(new Date(), months - 1)), "yyyy-MM-dd");
  const dateTo = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const prevFrom = format(startOfMonth(subMonths(new Date(), months * 2 - 1)), "yyyy-MM-dd");
  const prevTo = format(endOfMonth(subMonths(new Date(), months)), "yyyy-MM-dd");

  // --- Data Queries ---

  // Sales invoices
  const { data: salesData, isLoading: loadingSales, isError: errorSales } = useQuery({
    queryKey: ["growth-sales", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("invoice_date, subtotal, tax, total, paid_amount, status")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: prevSalesData, isLoading: loadingPrevSales } = useQuery({
    queryKey: ["growth-prev-sales", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("subtotal, tax, total, paid_amount")
        .gte("invoice_date", prevFrom)
        .lte("invoice_date", prevTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchasesData, isLoading: loadingPurchases, isError: errorPurchases } = useQuery({
    queryKey: ["growth-purchases", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("invoice_date, subtotal, tax, total, status")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: prevPurchasesData, isLoading: loadingPrevPurchases } = useQuery({
    queryKey: ["growth-prev-purchases", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("subtotal, tax, total")
        .gte("invoice_date", prevFrom)
        .lte("invoice_date", prevTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: expensesData, isLoading: loadingExpenses, isError: errorExpenses } = useQuery({
    queryKey: ["growth-expenses", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("expense_date, amount, status")
        .gte("expense_date", dateFrom)
        .lte("expense_date", dateTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: prevExpensesData, isLoading: loadingPrevExpenses } = useQuery({
    queryKey: ["growth-prev-expenses", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("amount")
        .gte("expense_date", prevFrom)
        .lte("expense_date", prevTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  // COGS from inventory_movements (sale movements in period)
  const { data: cogsData, isLoading: loadingCogs } = useQuery({
    queryKey: ["growth-cogs", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("movement_date, total_cost, movement_type")
        .in("movement_type", ["sale", "sale_return"])
        .gte("movement_date", dateFrom)
        .lte("movement_date", dateTo);
      if (error) throw error;
      return data;
    },
  });

  const { data: prevCogsData, isLoading: loadingPrevCogs } = useQuery({
    queryKey: ["growth-prev-cogs", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("total_cost, movement_type")
        .in("movement_type", ["sale", "sale_return"])
        .gte("movement_date", prevFrom)
        .lte("movement_date", prevTo);
      if (error) throw error;
      return data;
    },
  });

  // Customer data scoped to period (invoices in period)
  const { data: periodCustomersData, isLoading: loadingCustomers } = useQuery({
    queryKey: ["growth-period-customers", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("customer_id, total, paid_amount")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  // Top products with returns deducted
  const { data: topProducts, isLoading: loadingProducts } = useQuery({
    queryKey: ["growth-top-products", dateFrom, dateTo],
    queryFn: async () => {
      const [salesRes, returnsRes] = await Promise.all([
        supabase
          .from("sales_invoice_items")
          .select("quantity, total, net_total, product_id, product:products(name), invoice:sales_invoices!inner(invoice_date, status)")
          .gte("invoice.invoice_date", dateFrom)
          .lte("invoice.invoice_date", dateTo)
          .eq("invoice.status", "posted"),
        supabase
          .from("sales_return_items")
          .select("quantity, total, product_id, product:products(name), return:sales_returns!inner(return_date, status)")
          .gte("return.return_date", dateFrom)
          .lte("return.return_date", dateTo)
          .eq("return.status", "posted"),
      ]);
      if (salesRes.error) throw salesRes.error;
      if (returnsRes.error) throw returnsRes.error;
      return { sales: salesRes.data, returns: returnsRes.data };
    },
  });

  // Returns
  const { data: salesReturnsData, isLoading: loadingSalesReturns } = useQuery({
    queryKey: ["growth-sales-returns", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select("return_date, subtotal, tax, total, status")
        .gte("return_date", dateFrom)
        .lte("return_date", dateTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: prevSalesReturnsData, isLoading: loadingPrevSalesReturns } = useQuery({
    queryKey: ["growth-prev-sales-returns", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_returns")
        .select("subtotal, tax, total")
        .gte("return_date", prevFrom)
        .lte("return_date", prevTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseReturnsData, isLoading: loadingPurchaseReturns } = useQuery({
    queryKey: ["growth-purchase-returns", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("return_date, subtotal, tax, total, status")
        .gte("return_date", dateFrom)
        .lte("return_date", dateTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  const { data: prevPurchaseReturnsData, isLoading: loadingPrevPurchaseReturns } = useQuery({
    queryKey: ["growth-prev-purchase-returns", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_returns")
        .select("subtotal, tax, total")
        .gte("return_date", prevFrom)
        .lte("return_date", prevTo)
        .eq("status", "posted");
      if (error) throw error;
      return data;
    },
  });

  // --- Calculations ---
  // Use `total` to match journal entries (Income Statement source of truth)
  // The posting engine records `total` as revenue, so we must use the same
  // to ensure Growth Analytics matches the Income Statement exactly.
  const calcCogs = (data: any[] | null | undefined) => {
    if (!data) return 0;
    const saleCost = data.filter(d => d.movement_type === "sale").reduce((s, i) => s + Number(i.total_cost), 0);
    const returnCost = data.filter(d => d.movement_type === "sale_return").reduce((s, i) => s + Number(i.total_cost), 0);
    return saleCost - returnCost;
  };

  const totalSales = salesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const prevTotalSales = prevSalesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const totalSalesTax = salesData?.reduce((s, i) => s + Number(i.tax), 0) ?? 0;
  const totalPaidSales = salesData?.reduce((s, i) => s + Number(i.paid_amount), 0) ?? 0;

  const totalSalesReturns = salesReturnsData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const prevTotalSalesReturns = prevSalesReturnsData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const netSales = totalSales - totalSalesReturns;
  const prevNetSales = prevTotalSales - prevTotalSalesReturns;

  const totalPurchases = purchasesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const prevTotalPurchases = prevPurchasesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const totalPurchaseReturns = purchaseReturnsData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const prevTotalPurchaseReturns = prevPurchaseReturnsData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;

  const netPurchases = totalPurchases - totalPurchaseReturns;
  const prevNetPurchases = prevTotalPurchases - prevTotalPurchaseReturns;

  const totalExpenses = expensesData?.reduce((s, i) => s + Number(i.amount), 0) ?? 0;
  const prevTotalExpenses = prevExpensesData?.reduce((s, i) => s + Number(i.amount), 0) ?? 0;

  // COGS from inventory movements (accurate)
  const cogs = calcCogs(cogsData);
  const prevCogs = calcCogs(prevCogsData);

  // Gross Profit = Net Sales - COGS (matches Income Statement)
  const grossProfit = netSales - cogs;
  const prevGrossProfit = prevNetSales - prevCogs;
  const grossMargin = netSales > 0 ? (grossProfit / netSales) * 100 : 0;

  // Net Profit = Gross Profit - Operating Expenses
  const netProfit = grossProfit - totalExpenses;
  const prevNetProfit = prevGrossProfit - prevTotalExpenses;
  const netMargin = netSales > 0 ? (netProfit / netSales) * 100 : 0;

  // Ratios
  const returnRate = totalSales > 0 ? (totalSalesReturns / totalSales) * 100 : 0;
  const expenseRate = netSales > 0 ? (totalExpenses / netSales) * 100 : 0;
  const collectionRate = (netSales > 0 && totalPaidSales > 0) ? (totalPaidSales / netSales) * 100 : 0;

  const avgInvoice = salesData?.length ? totalSales / salesData.length : 0;

  // Customer count in period
  const uniqueCustomerCount = useMemo(() => {
    if (!periodCustomersData) return 0;
    return new Set(periodCustomersData.filter(d => d.customer_id).map(d => d.customer_id)).size;
  }, [periodCustomersData]);

  const calcGrowth = (current: number, prev: number) => {
    if (prev === 0) return current > 0 ? 100 : current < 0 ? -100 : 0;
    return ((current - prev) / Math.abs(prev)) * 100;
  };

  // --- Executive alerts ---
  const alerts = useMemo(() => {
    const list: { type: "warning" | "destructive"; text: string }[] = [];
    if (grossMargin < 20 && netSales > 0) list.push({ type: "warning", text: `⚠ هامش مجمل الربح منخفض (${grossMargin.toFixed(1)}%) — راجع تسعير المنتجات أو تكلفة الشراء` });
    if (returnRate > 10) list.push({ type: "destructive", text: `⚠ نسبة مرتجعات المبيعات مرتفعة (${returnRate.toFixed(1)}%) — تحقق من جودة المنتجات أو رضا العملاء` });
    if (expenseRate > 30 && netSales > 0) list.push({ type: "warning", text: `⚠ نسبة المصروفات إلى المبيعات مرتفعة (${expenseRate.toFixed(1)}%) — راجع بنود المصروفات` });
    if (netProfit < 0) list.push({ type: "destructive", text: `⚠ صافي الربح سالب (${formatCurrency(netProfit)}) — الشركة تحقق خسارة تشغيلية` });
    return list;
  }, [grossMargin, returnRate, expenseRate, netProfit, netSales, formatCurrency]);

  // --- Monthly chart data ---
  const chartData = useMemo(() => {
    const monthlyData: Record<string, { month: string; sales: number; cogs: number; purchases: number; expenses: number; grossProfit: number; netProfit: number }> = {};
    for (let i = months - 1; i >= 0; i--) {
      const d = subMonths(new Date(), i);
      const key = format(d, "yyyy-MM");
      const label = format(d, "MMM yyyy", { locale: ar });
      monthlyData[key] = { month: label, sales: 0, cogs: 0, purchases: 0, expenses: 0, grossProfit: 0, netProfit: 0 };
    }
    salesData?.forEach((inv) => {
      const key = inv.invoice_date.substring(0, 7);
      if (monthlyData[key]) monthlyData[key].sales += Number(inv.total);
    });
    salesReturnsData?.forEach((ret) => {
      const key = ret.return_date.substring(0, 7);
      if (monthlyData[key]) monthlyData[key].sales -= Number(ret.total);
    });
    cogsData?.forEach((m) => {
      const key = m.movement_date.substring(0, 7);
      if (monthlyData[key]) {
        if (m.movement_type === "sale") monthlyData[key].cogs += Number(m.total_cost);
        else if (m.movement_type === "sale_return") monthlyData[key].cogs -= Number(m.total_cost);
      }
    });
    purchasesData?.forEach((inv) => {
      const key = inv.invoice_date.substring(0, 7);
      if (monthlyData[key]) monthlyData[key].purchases += Number(inv.total);
    });
    purchaseReturnsData?.forEach((ret) => {
      const key = ret.return_date.substring(0, 7);
      if (monthlyData[key]) monthlyData[key].purchases -= Number(ret.total);
    });
    expensesData?.forEach((exp) => {
      const key = exp.expense_date.substring(0, 7);
      if (monthlyData[key]) monthlyData[key].expenses += Number(exp.amount);
    });
    Object.values(monthlyData).forEach((m) => {
      m.grossProfit = m.sales - m.cogs;
      m.netProfit = m.grossProfit - m.expenses;
    });
    return Object.values(monthlyData);
  }, [salesData, salesReturnsData, cogsData, purchasesData, purchaseReturnsData, expensesData, months]);

  // --- Top products (with returns deducted) ---
  const topProductsList = useMemo(() => {
    const productMap: Record<string, { name: string; total: number }> = {};
    topProducts?.sales?.forEach((item: any) => {
      const name = item.product?.name || "أخرى";
      if (!productMap[name]) productMap[name] = { name, total: 0 };
      productMap[name].total += Number(item.net_total || item.total);
    });
    topProducts?.returns?.forEach((item: any) => {
      const name = item.product?.name || "أخرى";
      if (!productMap[name]) productMap[name] = { name, total: 0 };
      productMap[name].total -= Number(item.total);
    });
    return Object.values(productMap).filter(p => p.total > 0).sort((a, b) => b.total - a.total).slice(0, 6);
  }, [topProducts]);

  const fmt = (n: number) => formatCurrency(n);
  const fmtPct = (n: number) => Math.abs(n).toFixed(1) + "%";

  // Unified loading: wait for ALL critical queries
  const isLoading = loadingSales || loadingPurchases || loadingExpenses || loadingCogs
    || loadingSalesReturns || loadingPurchaseReturns || loadingPrevSales || loadingPrevPurchases
    || loadingPrevExpenses || loadingPrevCogs || loadingPrevSalesReturns || loadingPrevPurchaseReturns
    || loadingCustomers || loadingProducts;

  const hasError = errorSales || errorPurchases || errorExpenses;

  // --- Trend Icon ---
  const TrendBadge = ({ value, inverted = false }: { value: number; inverted?: boolean }) => {
    const isPositive = inverted ? value < 0 : value >= 0;
    if (value === 0) return <span className="text-[11px] text-muted-foreground flex items-center gap-0.5"><Minus className="w-3 h-3" /> 0%</span>;
    return (
      <span className={`text-[11px] flex items-center gap-0.5 ${isPositive ? "text-success" : "text-destructive"}`}>
        {value > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {fmtPct(value)}
      </span>
    );
  };

  const FormulaTooltip = ({ formula }: { formula: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help inline-block mr-1" />
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-medium">كيف حُسب؟</p>
          <p className="text-muted-foreground mt-0.5">{formula}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );

  // --- Export ---
  const getExportData = () => {
    const headers = ["الشهر", "صافي المبيعات", "تكلفة البضاعة المباعة", "المصروفات", "مجمل الربح", "صافي الربح"];
    const rows = chartData.map((m) => [m.month, m.sales, m.cogs, m.expenses, m.grossProfit, m.netProfit]);
    return { headers, rows };
  };

  const handleExcelExport = () => {
    const { headers, rows } = getExportData();
    exportToExcel({ filename: `الأداء-المالي`, sheetName: "الأداء المالي", headers, rows });
  };

  const handlePdfExport = async () => {
    const { headers, rows } = getExportData();
    // Preserve negative signs
    const fmtN = (n: number) => {
      const sign = n < 0 ? "-" : "";
      return sign + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };
    await exportReportPdf({
      title: `لوحة الأداء المالي - آخر ${period} أشهر`,
      settings: settings || null,
      headers,
      rows: rows.map((r) => [r[0], ...r.slice(1).map((v) => fmtN(Number(v)))]),
      summaryCards: [
        { label: "صافي المبيعات", value: fmtN(netSales) },
        { label: "مرتجعات المبيعات", value: fmtN(totalSalesReturns) },
        { label: "تكلفة البضاعة المباعة", value: fmtN(cogs) },
        { label: "مجمل الربح", value: fmtN(grossProfit) },
        { label: "المصروفات التشغيلية", value: fmtN(totalExpenses) },
        { label: "صافي الربح", value: fmtN(netProfit) },
        { label: "هامش مجمل الربح", value: grossMargin.toFixed(1) + "%" },
        { label: "هامش صافي الربح", value: netMargin.toFixed(1) + "%" },
        { label: "نسبة المرتجعات", value: returnRate.toFixed(1) + "%" },
        { label: "نسبة التحصيل", value: collectionRate.toFixed(1) + "%" },
      ],
      filename: `الأداء-المالي`,
      orientation: "landscape",
    });
  };

  // --- KPI cards config ---
  const kpiCards = [
    {
      label: "صافي المبيعات",
      formula: "إجمالي المبيعات − مرتجعات المبيعات",
      value: fmt(netSales),
      growth: calcGrowth(netSales, prevNetSales),
      icon: DollarSign,
      color: "text-success",
      bgColor: "bg-success/10",
      count: salesData?.length ?? 0,
      countLabel: "فاتورة",
    },
    {
      label: "تكلفة البضاعة المباعة",
      formula: "تكلفة حركات البيع من المخزون − تكلفة حركات مرتجع البيع",
      value: fmt(cogs),
      growth: calcGrowth(cogs, prevCogs),
      inverted: true,
      icon: Package,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      label: "المصروفات التشغيلية",
      formula: "مجموع المصروفات المعتمدة في الفترة",
      value: fmt(totalExpenses),
      growth: calcGrowth(totalExpenses, prevTotalExpenses),
      inverted: true,
      icon: Receipt,
      color: "text-destructive",
      bgColor: "bg-destructive/10",
    },
    {
      label: "مجمل الربح",
      formula: "صافي المبيعات − تكلفة البضاعة المباعة (COGS)",
      value: fmt(grossProfit),
      growth: calcGrowth(grossProfit, prevGrossProfit),
      icon: BarChart3,
      color: grossProfit >= 0 ? "text-success" : "text-destructive",
      bgColor: grossProfit >= 0 ? "bg-success/10" : "bg-destructive/10",
      subtitle: `هامش: ${grossMargin.toFixed(1)}%`,
    },
    {
      label: "صافي الربح",
      formula: "مجمل الربح − المصروفات التشغيلية",
      value: fmt(netProfit),
      growth: calcGrowth(netProfit, prevNetProfit),
      icon: DollarSign,
      color: netProfit >= 0 ? "text-success" : "text-destructive",
      bgColor: netProfit >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      label: "هامش صافي الربح",
      formula: "(صافي الربح ÷ صافي المبيعات) × 100",
      value: netMargin.toFixed(1) + "%",
      icon: Percent,
      color: netMargin >= 0 ? "text-success" : "text-destructive",
      bgColor: netMargin >= 0 ? "bg-success/10" : "bg-destructive/10",
      noGrowth: true,
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-[300px]" />
          <Skeleton className="h-[300px]" />
        </div>
      </div>
    );
  }

  if (hasError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          حدث خطأ أثناء تحميل بيانات التقرير. يرجى تحديث الصفحة والمحاولة مرة أخرى.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">آخر 3 أشهر</SelectItem>
            <SelectItem value="6">آخر 6 أشهر</SelectItem>
            <SelectItem value="12">آخر 12 شهر</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={handleExcelExport}>
          <FileSpreadsheet className="w-4 h-4 ml-2" />
          Excel
        </Button>
        <Button variant="outline" size="sm" onClick={handlePdfExport}>
          <FileText className="w-4 h-4 ml-2" />
          PDF
        </Button>
      </div>

      {/* Executive Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, i) => (
            <Alert key={i} variant={alert.type === "destructive" ? "destructive" : "default"} className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-sm">{alert.text}</AlertDescription>
            </Alert>
          ))}
        </div>
      )}

      {/* Executive Summary Bar */}
      <Card className="border-primary/20 bg-primary/5 shadow-none">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-primary" />
            <span className="text-sm font-bold">ملخص تنفيذي</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-center text-sm">
            <div>
              <p className="text-muted-foreground text-xs">صافي المبيعات</p>
              <p className="font-bold text-success">{fmt(netSales)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">ت.ب.م (COGS)</p>
              <p className="font-bold">{fmt(cogs)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">مجمل الربح</p>
              <p className={`font-bold ${grossProfit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(grossProfit)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">المصروفات</p>
              <p className="font-bold text-destructive">{fmt(totalExpenses)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">صافي الربح</p>
              <p className={`font-bold ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>{fmt(netProfit)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="border-border/60 shadow-none">
            <CardContent className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-xl ${kpi.bgColor} flex items-center justify-center`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
                <p className="text-sm font-medium text-muted-foreground">
                  {kpi.label}
                  <FormulaTooltip formula={kpi.formula} />
                </p>
              </div>
              <p className={`text-2xl font-bold ${kpi.color}`}>{kpi.value}</p>
              {'subtitle' in kpi && kpi.subtitle && (
                <p className="text-xs text-muted-foreground mt-0.5">{kpi.subtitle}</p>
              )}
              <div className="flex items-center justify-between mt-2">
                {!kpi.noGrowth ? (
                  <TrendBadge value={kpi.growth!} inverted={kpi.inverted} />
                ) : (
                  <span className="text-xs text-muted-foreground">من صافي المبيعات</span>
                )}
                {kpi.count !== undefined && (
                  <span className="text-xs text-muted-foreground">{kpi.count} {kpi.countLabel}</span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Operational Ratios */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "نسبة المرتجعات", value: returnRate.toFixed(1) + "%", formula: "مرتجعات المبيعات ÷ إجمالي المبيعات × 100", color: returnRate > 10 ? "text-destructive" : "text-success", icon: RotateCcw },
          { label: "نسبة المصروفات", value: expenseRate.toFixed(1) + "%", formula: "المصروفات ÷ صافي المبيعات × 100", color: expenseRate > 30 ? "text-destructive" : "text-success", icon: Receipt },
          { label: "نسبة التحصيل", value: collectionRate.toFixed(1) + "%", formula: "المبالغ المحصلة ÷ صافي المبيعات (شامل الضريبة) × 100", color: collectionRate > 80 ? "text-success" : "text-destructive", icon: DollarSign },
          { label: "متوسط قيمة الفاتورة", value: fmt(avgInvoice), formula: "إجمالي المبيعات ÷ عدد الفواتير", color: "text-primary", icon: Receipt },
        ].map((item) => (
          <Card key={item.label} className="border-border/60 shadow-none">
            <CardContent className="p-4 text-center">
              <item.icon className={`w-5 h-5 mx-auto mb-2 ${item.color}`} />
              <p className="text-xs text-muted-foreground mb-1">
                {item.label}
                <FormulaTooltip formula={item.formula} />
              </p>
              <p className={`text-lg font-bold ${item.color}`}>{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Sales vs COGS Bar */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" />
              الإيرادات مقابل التكلفة
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                <XAxis dataKey="month" fontSize={10} tick={{ fill: "hsl(220, 8%, 46%)" }} />
                <YAxis fontSize={10} tick={{ fill: "hsl(220, 8%, 46%)" }} />
                <RechartsTooltip formatter={(v: number) => fmt(v)} contentStyle={{ direction: "rtl", fontSize: 12 }} />
                <Legend />
                <Bar dataKey="sales" name="صافي المبيعات" fill="hsl(152, 60%, 42%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="cogs" name="ت.ب.م" fill="hsl(24, 95%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Profit & Expense Trend Line */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-success" />
              اتجاه الربح والمصروفات
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 13%, 91%)" />
                <XAxis dataKey="month" fontSize={10} tick={{ fill: "hsl(220, 8%, 46%)" }} />
                <YAxis fontSize={10} tick={{ fill: "hsl(220, 8%, 46%)" }} />
                <RechartsTooltip formatter={(v: number) => fmt(v)} contentStyle={{ direction: "rtl", fontSize: 12 }} />
                <Legend />
                <Line type="monotone" dataKey="grossProfit" name="مجمل الربح" stroke="hsl(152, 60%, 42%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="netProfit" name="صافي الربح" stroke="hsl(217, 80%, 50%)" strokeWidth={2} dot={{ r: 3 }} />
                <Line type="monotone" dataKey="expenses" name="المصروفات" stroke="hsl(0, 72%, 51%)" strokeWidth={2} dot={{ r: 3 }} strokeDasharray="5 5" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top Products Pie (with returns deducted) */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              أكثر المنتجات مبيعاً (بعد المرتجعات)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topProductsList.length > 0 ? (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie
                    data={topProductsList}
                    dataKey="total"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={85}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {topProductsList.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <RechartsTooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-20">لا توجد بيانات</p>
            )}
          </CardContent>
        </Card>

        {/* Customer & Collection Indicators (period-scoped) */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-cat-accounting" />
              مؤشرات العملاء (خلال الفترة)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-3">
            {[
              { label: "عملاء تعاملوا خلال الفترة", value: String(uniqueCustomerCount), icon: Users, color: "text-cat-accounting" },
              { label: "عدد فواتير المبيعات", value: String(salesData?.length ?? 0), icon: Receipt, color: "text-primary" },
              { label: "متوسط قيمة الفاتورة", value: fmt(avgInvoice), icon: DollarSign, color: "text-success" },
              { label: "نسبة التحصيل", value: collectionRate.toFixed(1) + "%", icon: Percent, color: collectionRate > 80 ? "text-success" : "text-destructive" },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-sm text-muted-foreground">{item.label}</span>
                </div>
                <span className="text-base font-bold">{item.value}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Summary Table: Sales vs Purchases side by side */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Sales Summary */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-success" />
              ملخص المبيعات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border/40">
                  <td className="px-5 py-3 text-muted-foreground">إجمالي المبيعات</td>
                  <td className="px-5 py-3 text-left font-semibold">{fmt(totalSales)}</td>
                  <td className="px-5 py-3 text-left text-xs text-muted-foreground">{salesData?.length ?? 0} فاتورة</td>
                </tr>
                <tr className="border-b border-border/40 bg-muted/30">
                  <td className="px-5 py-3 text-muted-foreground flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-destructive" />
                    مرتجعات المبيعات
                  </td>
                  <td className="px-5 py-3 text-left font-semibold text-destructive">({fmt(totalSalesReturns)})</td>
                  <td className="px-5 py-3 text-left text-xs text-muted-foreground">{salesReturnsData?.length ?? 0} مرتجع</td>
                </tr>
                <tr className="bg-success/5">
                  <td className="px-5 py-3 font-bold">صافي المبيعات</td>
                  <td className="px-5 py-3 text-left font-bold text-success text-base">{fmt(netSales)}</td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Purchases Summary */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-primary" />
              ملخص المشتريات
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-border/40">
                  <td className="px-5 py-3 text-muted-foreground">إجمالي المشتريات</td>
                  <td className="px-5 py-3 text-left font-semibold">{fmt(totalPurchases)}</td>
                  <td className="px-5 py-3 text-left text-xs text-muted-foreground">{purchasesData?.length ?? 0} فاتورة</td>
                </tr>
                <tr className="border-b border-border/40 bg-muted/30">
                  <td className="px-5 py-3 text-muted-foreground flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5 text-success" />
                    مرتجعات المشتريات
                  </td>
                  <td className="px-5 py-3 text-left font-semibold text-success">({fmt(totalPurchaseReturns)})</td>
                  <td className="px-5 py-3 text-left text-xs text-muted-foreground">{purchaseReturnsData?.length ?? 0} مرتجع</td>
                </tr>
                <tr className="bg-primary/5">
                  <td className="px-5 py-3 font-bold">صافي المشتريات</td>
                  <td className="px-5 py-3 text-left font-bold text-primary text-base">{fmt(netPurchases)}</td>
                  <td className="px-5 py-3"></td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
