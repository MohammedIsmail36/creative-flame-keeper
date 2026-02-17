import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  ShoppingCart,
  FileText,
  AlertTriangle,
  Calculator,
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
  quantity_on_hand: number;
  min_stock_level: number;
}

interface MonthlyData {
  name: string;
  مبيعات: number;
  مشتريات: number;
  ربح: number;
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
    const { data } = await supabase
      .from("products")
      .select("name, quantity_on_hand, min_stock_level")
      .eq("is_active", true)
      .order("quantity_on_hand", { ascending: true })
      .limit(10);

    setLowStockItems(
      (data || [])
        .filter(p => Number(p.quantity_on_hand) <= Number(p.min_stock_level))
        .map(p => ({
          name: p.name,
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

    // Only show months that have data or up to current month
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
      case "posted": return "bg-success/10 text-success";
      case "paid": return "bg-success/10 text-success";
      case "draft": return "bg-muted text-muted-foreground";
      default: return "bg-warning/10 text-warning";
    }
  };

  const profitMargin = summary.totalSales > 0 ? ((summary.netProfit / summary.totalSales) * 100).toFixed(1) : "0";

  const summaryCards = [
    {
      title: "إجمالي المبيعات",
      value: formatCurrency(summary.totalSales),
      icon: DollarSign,
      color: "text-primary",
      bgColor: "bg-primary/10",
    },
    {
      title: "إجمالي المشتريات",
      value: formatCurrency(summary.totalPurchases),
      icon: ShoppingCart,
      color: "text-warning",
      bgColor: "bg-warning/10",
    },
    {
      title: "صافي الربح",
      value: formatCurrency(summary.netProfit),
      subtitle: `هامش الربح: ${profitMargin}%`,
      icon: summary.netProfit >= 0 ? TrendingUp : TrendingDown,
      color: summary.netProfit >= 0 ? "text-success" : "text-destructive",
      bgColor: summary.netProfit >= 0 ? "bg-success/10" : "bg-destructive/10",
    },
    {
      title: "تنبيهات المخزون",
      value: `${summary.lowStockCount}`,
      subtitle: "منتجات أقل من الحد الأدنى",
      icon: Package,
      color: summary.lowStockCount > 0 ? "text-destructive" : "text-success",
      bgColor: summary.lowStockCount > 0 ? "bg-destructive/10" : "bg-success/10",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="text-muted-foreground text-sm mt-1">نظرة عامة على النشاط التجاري</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card) => (
          <Card key={card.title}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">{card.title}</p>
                  <p className="text-2xl font-bold">{card.value}</p>
                  {card.subtitle && (
                    <p className="text-xs text-muted-foreground">{card.subtitle}</p>
                  )}
                </div>
                <div className={`p-2.5 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`w-5 h-5 ${card.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Account Balances */}
      {accountBalances.length > 0 && (
        <Card>
          <CardHeader className="border-b bg-muted/30 py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                ملخص أرصدة الحسابات
              </CardTitle>
              <button onClick={() => navigate("/ledger")} className="text-sm text-primary hover:underline">
                عرض التفاصيل ←
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-right">الرمز</TableHead>
                  <TableHead className="text-right">اسم الحساب</TableHead>
                  <TableHead className="text-right">إجمالي المدين</TableHead>
                  <TableHead className="text-right">إجمالي الدائن</TableHead>
                  <TableHead className="text-right">الرصيد</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accountBalances.map((acc) => (
                  <TableRow key={acc.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate("/ledger")}>
                    <TableCell className="font-mono text-sm">{acc.code}</TableCell>
                    <TableCell className="font-medium">{acc.name}</TableCell>
                    <TableCell>{formatCurrency(acc.debit)}</TableCell>
                    <TableCell>{formatCurrency(acc.credit)}</TableCell>
                    <TableCell className={`font-bold ${acc.balance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {formatCurrency(Math.abs(acc.balance))} {acc.balance >= 0 ? "مدين" : "دائن"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">المبيعات والمشتريات ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="مبيعات" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="مشتريات" fill="hsl(38, 92%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">صافي الربح الشهري ({new Date().getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="ربح" stroke="hsl(142, 71%, 45%)" strokeWidth={2.5} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="w-4 h-4" />
              آخر الفواتير
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد فواتير بعد</p>
            ) : (
              <div className="space-y-3">
                {recentInvoices.map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{inv.customer_name}</p>
                      <p className="text-xs text-muted-foreground">#{inv.invoice_number}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold">{formatCurrency(inv.total)}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusClass(inv.status)}`}>
                        {statusLabel(inv.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              تنبيهات المخزون
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">لا توجد تنبيهات حالياً ✓</p>
            ) : (
              <div className="space-y-3">
                {lowStockItems.map((item) => (
                  <div key={item.name} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{item.name}</p>
                      <p className="text-xs text-muted-foreground">الحد الأدنى: {item.min_stock_level}</p>
                    </div>
                    <span className="text-sm font-bold text-destructive">{item.quantity_on_hand}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
