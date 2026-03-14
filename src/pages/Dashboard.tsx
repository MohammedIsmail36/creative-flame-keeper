import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatProductDisplay } from "@/lib/product-utils";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  ShoppingCart,
  FileText,
  AlertTriangle,
  Calculator,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ReceiptText,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  account_type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface SummaryData {
  totalSales: number;
  totalPurchases: number;
  netProfit: number;
  lowStockCount: number;
}

interface RecentInvoice {
  id: string;
  invoice_number: number;
  customer_name: string;
  total: number;
  status: string;
}

interface LowStockItem {
  name: string;
  brandName: string | null;
  modelNumber: string | null;
  quantity_on_hand: number;
  min_stock_level: number;
}

interface MonthlyData {
  name: string;
  مبيعات: number;
  مشتريات: number;
  ربح: number;
}

interface RecentActivity {
  id: string;
  title: string;
  subtitle: string;
  amount: string;
  type: "income" | "expense" | "inventory";
  icon: React.ComponentType<{ className?: string }>;
}

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export default function Dashboard() {
  const navigate = useNavigate();
  const { formatCurrency } = useSettings();
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [summary, setSummary] = useState<SummaryData>({ totalSales: 0, totalPurchases: 0, netProfit: 0, lowStockCount: 0 });
  const [recentInvoices, setRecentInvoices] = useState<RecentInvoice[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      await Promise.all([
        fetchSummary(),
        fetchRecentInvoices(),
        fetchLowStock(),
        fetchMonthlyData(),
        fetchBalances(),
      ]);
      setLoading(false);
    };
    fetchAll();
  }, []);

  const fetchSummary = async () => {
    const [salesRes, purchasesRes, productsRes] = await Promise.all([
      supabase.from("sales_invoices").select("total, status").eq("status", "posted"),
      supabase.from("purchase_invoices").select("total, status").eq("status", "posted"),
      supabase.from("products").select("quantity_on_hand, min_stock_level").eq("is_active", true),
    ]);

    const totalSales = (salesRes.data || []).reduce((s, i) => s + Number(i.total), 0);
    const totalPurchases = (purchasesRes.data || []).reduce((s, i) => s + Number(i.total), 0);
    const lowStockCount = (productsRes.data || []).filter(p => Number(p.quantity_on_hand) <= Number(p.min_stock_level)).length;

    setSummary({
      totalSales,
      totalPurchases,
      netProfit: totalSales - totalPurchases,
      lowStockCount,
    });
  };

  const fetchRecentInvoices = async () => {
    const { data } = await supabase
      .from("sales_invoices")
      .select("id, invoice_number, total, status, customer_id")
      .order("created_at", { ascending: false })
      .limit(5);

    if (!data?.length) return;

    const customerIds = [...new Set(data.filter(d => d.customer_id).map(d => d.customer_id!))];
    const { data: customers } = customerIds.length
      ? await supabase.from("customers").select("id, name").in("id", customerIds)
      : { data: [] };

    const custMap = new Map((customers || []).map(c => [c.id, c.name]));

    setRecentInvoices(data.map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      customer_name: custMap.get(inv.customer_id || "") || "عميل نقدي",
      total: Number(inv.total),
      status: inv.status,
    })));
  };

  const fetchLowStock = async () => {
    const { data } = await (supabase.from("products") as any)
      .select("name, quantity_on_hand, min_stock_level, model_number, product_brands(name)")
      .eq("is_active", true)
      .order("quantity_on_hand", { ascending: true })
      .limit(10);

    setLowStockItems(
      (data || [])
        .filter((p: any) => Number(p.quantity_on_hand) <= Number(p.min_stock_level))
        .map((p: any) => ({
          name: p.name,
          brandName: p.product_brands?.name || null,
          modelNumber: p.model_number || null,
          quantity_on_hand: Number(p.quantity_on_hand),
          min_stock_level: Number(p.min_stock_level),
        }))
    );
  };

  const fetchMonthlyData = async () => {
    const year = new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const [salesRes, purchasesRes] = await Promise.all([
      supabase.from("sales_invoices").select("invoice_date, total").eq("status", "posted").gte("invoice_date", startDate).lte("invoice_date", endDate),
      supabase.from("purchase_invoices").select("invoice_date, total").eq("status", "posted").gte("invoice_date", startDate).lte("invoice_date", endDate),
    ]);

    const monthly: MonthlyData[] = MONTH_NAMES.map(name => ({ name, مبيعات: 0, مشتريات: 0, ربح: 0 }));

    (salesRes.data || []).forEach(inv => {
      const m = new Date(inv.invoice_date).getMonth();
      monthly[m].مبيعات += Number(inv.total);
    });
    (purchasesRes.data || []).forEach(inv => {
      const m = new Date(inv.invoice_date).getMonth();
      monthly[m].مشتريات += Number(inv.total);
    });
    monthly.forEach(m => { m.ربح = m.مبيعات - m.مشتريات; });

    const currentMonth = new Date().getMonth();
    setMonthlyData(monthly.slice(0, currentMonth + 1));
  };

  const fetchBalances = async () => {
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).order("code"),
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entry_id"),
    ]);

    if (!accountsRes.data || !linesRes.data) return;

    const entryIds = [...new Set(linesRes.data.map((l: any) => l.journal_entry_id))];
    if (!entryIds.length) return;

    const { data: entriesData } = await supabase
      .from("journal_entries")
      .select("id, status")
      .in("id", entryIds)
      .eq("status", "posted");

    const postedIds = new Set((entriesData || []).map((e: any) => e.id));
    const balMap = new Map<string, { debit: number; credit: number }>();

    linesRes.data.forEach((l: any) => {
      if (!postedIds.has(l.journal_entry_id)) return;
      const cur = balMap.get(l.account_id) || { debit: 0, credit: 0 };
      cur.debit += Number(l.debit);
      cur.credit += Number(l.credit);
      balMap.set(l.account_id, cur);
    });

    setAccountBalances(
      accountsRes.data
        .filter((a: any) => balMap.has(a.id))
        .map((a: any) => {
          const b = balMap.get(a.id)!;
          return { ...a, debit: b.debit, credit: b.credit, balance: b.debit - b.credit };
        })
    );
  };

  const statusLabel = (s: string) => {
    switch (s) {
      case "posted": return "مرحّلة";
      case "draft": return "مسودة";
      case "paid": return "مدفوعة";
      default: return s;
    }
  };

  const statusClass = (s: string) => {
    switch (s) {
      case "posted": return "bg-primary/10 text-primary border-primary/20";
      case "paid": return "bg-success/10 text-success border-success/20";
      case "draft": return "bg-muted text-muted-foreground border-border";
      default: return "bg-warning/10 text-warning border-warning/20";
    }
  };

  const profitMargin = summary.totalSales > 0 ? ((summary.netProfit / summary.totalSales) * 100).toFixed(1) : "0";

  const summaryCards = [
    {
      title: "إجمالي المبيعات",
      value: formatCurrency(summary.totalSales),
      change: "+12.5%",
      icon: DollarSign,
      iconBg: "bg-primary/10",
      iconColor: "text-primary",
      changeColor: "text-success",
    },
    {
      title: "المصروفات التشغيلية",
      value: formatCurrency(summary.totalPurchases),
      change: "+5.2%",
      icon: ShoppingCart,
      iconBg: "bg-warning/10",
      iconColor: "text-warning",
      changeColor: "text-success",
    },
    {
      title: "صافي الربح",
      value: formatCurrency(summary.netProfit),
      change: `${profitMargin}%${summary.netProfit >= 0 ? "-" : "+"}`,
      icon: summary.netProfit >= 0 ? TrendingUp : TrendingDown,
      iconBg: summary.netProfit >= 0 ? "bg-success/10" : "bg-destructive/10",
      iconColor: summary.netProfit >= 0 ? "text-success" : "text-destructive",
      changeColor: summary.netProfit >= 0 ? "text-destructive" : "text-success",
    },
    {
      title: "الذمم المدينة",
      value: `${summary.lowStockCount}`,
      change: "+15.0%",
      icon: Package,
      iconBg: "bg-accent",
      iconColor: "text-accent-foreground",
      changeColor: "text-success",
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Cards - matching reference */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title} className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold tracking-tight">{card.value}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0 border-0 ${card.changeColor} bg-transparent`}>
                    {card.change}
                  </Badge>
                  <div className={`w-10 h-10 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                    <card.icon className={`w-5 h-5 ${card.iconColor}`} />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts + Recent Activity Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue Chart - 2 cols */}
        <Card className="lg:col-span-2 border-border/60 shadow-none">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">تحليل الإيرادات والتدفقات النقدية</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">نظرة عامة على أداء السنة الأخيرة</p>
            </div>
            <Badge variant="outline" className="text-xs font-medium border-border/60 text-muted-foreground">
              آخر 6 أشهر
            </Badge>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData.slice(-6)} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" fontSize={12} axisLine={false} tickLine={false} />
                <YAxis fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="مبيعات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="مشتريات" fill="hsl(var(--primary) / 0.2)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold">أحدث الحركات</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 px-3">
            {recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">لا توجد حركات بعد</p>
            ) : (
              recentInvoices.slice(0, 4).map((inv) => (
                <div key={inv.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer" onClick={() => navigate(`/sales/${inv.id}`)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${inv.status === "posted" ? "bg-success/10" : "bg-primary/10"}`}>
                    {inv.status === "posted" ? (
                      <ArrowDownLeft className="w-4 h-4 text-success" />
                    ) : (
                      <ArrowUpRight className="w-4 h-4 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inv.customer_name}</p>
                    <p className="text-[11px] text-muted-foreground">فاتورة #{inv.invoice_number}</p>
                  </div>
                  <span className={`text-sm font-bold ${inv.status === "posted" ? "text-success" : "text-foreground"}`}>
                    {formatCurrency(inv.total)}
                  </span>
                </div>
              ))
            )}
            {recentInvoices.length > 0 && (
              <button onClick={() => navigate("/sales")} className="w-full text-center text-xs text-primary hover:underline pt-2 pb-1 font-medium">
                عرض كافة العمليات
              </button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Pending Invoices Table */}
      {recentInvoices.length > 0 && (
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold">الفواتير المعلقة</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs h-8">تصدير PDF</Button>
              <Button variant="default" size="sm" className="text-xs h-8">فلترة النتائج</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-right text-xs font-bold text-muted-foreground">رقم الفاتورة</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground">العميل</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground">المبلغ</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground">الحالة</TableHead>
                  <TableHead className="text-right text-xs font-bold text-muted-foreground">الإجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentInvoices.map((inv) => (
                  <TableRow key={inv.id} className="cursor-pointer" onClick={() => navigate(`/sales/${inv.id}`)}>
                    <TableCell className="font-mono text-sm font-medium">#{inv.invoice_number}</TableCell>
                    <TableCell className="text-sm">{inv.customer_name}</TableCell>
                    <TableCell className="text-sm font-semibold">{formatCurrency(inv.total)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={`text-[10px] ${statusClass(inv.status)}`}>
                        {statusLabel(inv.status)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-muted-foreground">⋮</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Account Balances */}
      {accountBalances.length > 0 && (
        <Card className="border-border/60 shadow-none">
          <CardHeader className="border-b border-border/40 py-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2 font-bold">
              <Calculator className="h-4 w-4 text-primary" />
              ملخص أرصدة الحسابات
            </CardTitle>
            <button onClick={() => navigate("/ledger")} className="text-xs text-primary hover:underline font-medium">
              عرض التفاصيل ←
            </button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="text-right text-xs">الرمز</TableHead>
                  <TableHead className="text-right text-xs">اسم الحساب</TableHead>
                  <TableHead className="text-right text-xs">إجمالي المدين</TableHead>
                  <TableHead className="text-right text-xs">إجمالي الدائن</TableHead>
                  <TableHead className="text-right text-xs">الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountBalances.map((acc) => (
                  <TableRow key={acc.id} className="cursor-pointer" onClick={() => navigate("/ledger")}>
                    <TableCell className="font-mono text-xs">{acc.code}</TableCell>
                    <TableCell className="text-sm font-medium">{acc.name}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(acc.debit)}</TableCell>
                    <TableCell className="text-sm">{formatCurrency(acc.credit)}</TableCell>
                    <TableCell className={`text-sm font-bold ${acc.balance >= 0 ? "text-success" : "text-destructive"}`}>
                      {formatCurrency(Math.abs(acc.balance))} {acc.balance >= 0 ? "مدين" : "دائن"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Low Stock Alerts */}
      {lowStockItems.length > 0 && (
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 font-bold">
              <AlertTriangle className="w-4 h-4 text-warning" />
              تنبيهات المخزون
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {lowStockItems.map((item) => (
                <div key={item.name} className="flex items-center justify-between py-2 px-3 rounded-lg bg-destructive/5 border border-destructive/10">
                  <div>
                    <p className="text-sm font-medium">{formatProductDisplay(item.name, item.brandName, item.modelNumber)}</p>
                    <p className="text-[11px] text-muted-foreground">الحد الأدنى: {item.min_stock_level}</p>
                  </div>
                  <Badge variant="outline" className="text-destructive border-destructive/20 bg-destructive/10 font-bold">
                    {item.quantity_on_hand} وحدة
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
