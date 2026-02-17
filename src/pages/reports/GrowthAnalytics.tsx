import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, Package, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ar } from "date-fns/locale";

const COLORS = ["hsl(217, 91%, 50%)", "hsl(142, 71%, 45%)", "hsl(38, 92%, 50%)", "hsl(0, 84%, 60%)", "hsl(270, 50%, 50%)", "hsl(180, 50%, 40%)"];

export default function GrowthAnalytics() {
  const [period, setPeriod] = useState("6");

  const months = parseInt(period);
  const dateFrom = format(startOfMonth(subMonths(new Date(), months - 1)), "yyyy-MM-dd");
  const dateTo = format(endOfMonth(new Date()), "yyyy-MM-dd");
  const prevFrom = format(startOfMonth(subMonths(new Date(), months * 2 - 1)), "yyyy-MM-dd");
  const prevTo = format(endOfMonth(subMonths(new Date(), months)), "yyyy-MM-dd");

  const { data: salesData, isLoading: loadingSales } = useQuery({
    queryKey: ["growth-sales", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("invoice_date, total, paid_amount, status, items:sales_invoice_items(quantity, total, product:products(name, purchase_price))")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: prevSalesData } = useQuery({
    queryKey: ["growth-prev-sales", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("total")
        .gte("invoice_date", prevFrom)
        .lte("invoice_date", prevTo)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchasesData, isLoading: loadingPurchases } = useQuery({
    queryKey: ["growth-purchases", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("invoice_date, total, status")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: customersData } = useQuery({
    queryKey: ["growth-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id, created_at, balance").eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const { data: topProducts } = useQuery({
    queryKey: ["growth-top-products", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select("quantity, total, product:products(name), invoice:sales_invoices!inner(invoice_date, status)")
        .gte("invoice.invoice_date", dateFrom)
        .lte("invoice.invoice_date", dateTo)
        .eq("invoice.status", "approved");
      if (error) throw error;
      return data;
    },
  });

  // Calculations
  const totalSales = salesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const prevTotalSales = prevSalesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;
  const salesGrowth = prevTotalSales > 0 ? ((totalSales - prevTotalSales) / prevTotalSales) * 100 : 0;

  const totalPurchases = purchasesData?.reduce((s, i) => s + Number(i.total), 0) ?? 0;

  // Gross profit calculation
  const grossProfit = salesData?.reduce((acc, inv) => {
    const cost = inv.items?.reduce((c: number, item: any) => c + (Number(item.quantity) * Number(item.product?.purchase_price || 0)), 0) ?? 0;
    return acc + Number(inv.total) - cost;
  }, 0) ?? 0;
  const profitMargin = totalSales > 0 ? (grossProfit / totalSales) * 100 : 0;

  // Monthly chart data
  const monthlyData: Record<string, { month: string; sales: number; purchases: number; profit: number }> = {};
  for (let i = months - 1; i >= 0; i--) {
    const d = subMonths(new Date(), i);
    const key = format(d, "yyyy-MM");
    const label = format(d, "MMM yyyy", { locale: ar });
    monthlyData[key] = { month: label, sales: 0, purchases: 0, profit: 0 };
  }
  salesData?.forEach((inv) => {
    const key = inv.invoice_date.substring(0, 7);
    if (monthlyData[key]) monthlyData[key].sales += Number(inv.total);
  });
  purchasesData?.forEach((inv) => {
    const key = inv.invoice_date.substring(0, 7);
    if (monthlyData[key]) monthlyData[key].purchases += Number(inv.total);
  });
  Object.values(monthlyData).forEach((m) => { m.profit = m.sales - m.purchases; });
  const chartData = Object.values(monthlyData);

  // Top products pie
  const productMap: Record<string, { name: string; total: number }> = {};
  topProducts?.forEach((item: any) => {
    const name = item.product?.name || "أخرى";
    if (!productMap[name]) productMap[name] = { name, total: 0 };
    productMap[name].total += Number(item.total);
  });
  const topProductsList = Object.values(productMap).sort((a, b) => b.total - a.total).slice(0, 6);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const fmtPct = (n: number) => n.toFixed(1) + "%";

  const isLoading = loadingSales || loadingPurchases;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-end gap-4">
            <div className="space-y-1">
              <Label>الفترة الزمنية</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">آخر 3 أشهر</SelectItem>
                  <SelectItem value="6">آخر 6 أشهر</SelectItem>
                  <SelectItem value="12">آخر 12 شهر</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div><p className="text-xs text-muted-foreground">إجمالي المبيعات</p><p className="text-xl font-bold">{fmt(totalSales)}</p></div>
              <div className={`flex items-center gap-1 text-xs ${salesGrowth >= 0 ? "text-success" : "text-destructive"}`}>
                {salesGrowth >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {fmtPct(Math.abs(salesGrowth))}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div><p className="text-xs text-muted-foreground">إجمالي المشتريات</p><p className="text-xl font-bold">{fmt(totalPurchases)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div><p className="text-xs text-muted-foreground">مجمل الربح</p><p className="text-xl font-bold text-success">{fmt(grossProfit)}</p></div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div><p className="text-xs text-muted-foreground">هامش الربح</p><p className="text-xl font-bold">{fmtPct(profitMargin)}</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">المبيعات مقابل المشتريات</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[250px] w-full" /> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Bar dataKey="sales" name="المبيعات" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="purchases" name="المشتريات" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">اتجاه الربح الشهري</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[250px] w-full" /> : (
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} />
                  <Tooltip formatter={(v: number) => fmt(v)} />
                  <Line type="monotone" dataKey="profit" name="الربح" stroke="hsl(142, 71%, 45%)" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">أكثر المنتجات مبيعاً</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[250px] w-full" /> : topProductsList.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={topProductsList} dataKey="total" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`} labelLine={false} fontSize={10}>
                    {topProductsList.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            ) : <p className="text-center text-muted-foreground text-sm py-16">لا توجد بيانات</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">مؤشرات العملاء</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">إجمالي العملاء النشطين</span>
              <span className="text-lg font-bold">{customersData?.length ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">عملاء لديهم أرصدة مدينة</span>
              <span className="text-lg font-bold text-destructive">{customersData?.filter((c) => Number(c.balance) > 0).length ?? 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">إجمالي أرصدة العملاء</span>
              <span className="text-lg font-bold">{fmt(customersData?.reduce((s, c) => s + Number(c.balance), 0) ?? 0)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">متوسط قيمة الفاتورة</span>
              <span className="text-lg font-bold">{fmt(salesData?.length ? totalSales / salesData.length : 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
