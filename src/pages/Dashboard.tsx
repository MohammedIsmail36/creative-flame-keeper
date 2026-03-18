import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatProductDisplay } from "@/lib/product-utils";
import { useSettings } from "@/contexts/SettingsContext";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Package,
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Calculator,
  ArrowDownLeft,
  ArrowUpRight,
  Boxes,
  ReceiptText,
  Wallet,
  Users,
  Landmark,
  Banknote,
  BarChart3,
  Award,
  Target,
  PackageX,
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

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

interface MonthlyData { name: string; مبيعات: number; مشتريات: number; }
interface MonthlyExpense { name: string; مصروفات: number; }
interface AccountBalance { id: string; code: string; name: string; account_type: string; debit: number; credit: number; balance: number; }
interface UnpaidInvoice { id: string; invoice_number: number; customer_name: string; total: number; paid_amount: number; remaining: number; }
interface TopProduct { product_id: string; name: string; totalQty: number; totalAmount: number; }
interface LowStockItem { name: string; brandName: string | null; modelNumber: string | null; quantity_on_hand: number; min_stock_level: number; }
interface ExpenseByType { name: string; amount: number; }
interface RecentActivity { id: string; title: string; subtitle: string; amount: number; type: "sale" | "purchase" | "expense"; date: string; }
interface TopCategory { name: string; totalSales: number; totalProfit: number; }
interface StagnantItem { name: string; brandName: string | null; modelNumber: string | null; quantity_on_hand: number; lastMovement: string | null; }

export default function Dashboard() {
  const navigate = useNavigate();
  const { formatCurrency, settings } = useSettings();
  const [loading, setLoading] = useState(true);

  // KPI state
  const [totalSales, setTotalSales] = useState(0);
  const [totalPurchases, setTotalPurchases] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalSalesReturns, setTotalSalesReturns] = useState(0);
  const [totalPurchaseReturns, setTotalPurchaseReturns] = useState(0);
  const [salesChange, setSalesChange] = useState<number | null>(null);
  const [purchasesChange, setPurchasesChange] = useState<number | null>(null);
  const [expensesChange, setExpensesChange] = useState<number | null>(null);

  // Secondary KPIs
  const [receivables, setReceivables] = useState(0);
  const [payables, setPayables] = useState(0);
  const [inventoryValue, setInventoryValue] = useState(0);
  const [lowStockCount, setLowStockCount] = useState(0);

  // Charts
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [monthlyExpenses, setMonthlyExpenses] = useState<MonthlyExpense[]>([]);

  // Right column
  const [liquidity, setLiquidity] = useState({ total: 0, cash: 0, bank: 0 });
  const [expensesByType, setExpensesByType] = useState<ExpenseByType[]>([]);
  const [recentActivities, setRecentActivities] = useState<RecentActivity[]>([]);

  // Tables
  const [unpaidInvoices, setUnpaidInvoices] = useState<UnpaidInvoice[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [lowStockItems, setLowStockItems] = useState<LowStockItem[]>([]);
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [topCategories, setTopCategories] = useState<TopCategory[]>([]);
  const [currentMonthSales, setCurrentMonthSales] = useState(0);
  const [stagnantItems, setStagnantItems] = useState<StagnantItem[]>([]);

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    setLoading(true);
    await Promise.all([
      fetchKPIs(),
      fetchSecondaryKPIs(),
      fetchCharts(),
      fetchLiquidity(),
      fetchExpensesByType(),
      fetchRecentActivities(),
      fetchUnpaidInvoices(),
      fetchTopProducts(),
      fetchLowStock(),
      fetchBalances(),
      fetchTopCategories(),
      fetchStagnantStock(),
    ]);
    setLoading(false);
  };

  const fetchKPIs = async () => {
    const now = new Date();
    const currMonth = now.getMonth();
    const currYear = now.getFullYear();

    const [salesRes, purchasesRes, expensesRes, salesReturnsRes, purchaseReturnsRes] = await Promise.all([
      supabase.from("sales_invoices").select("total, invoice_date").eq("status", "posted"),
      supabase.from("purchase_invoices").select("total, invoice_date").eq("status", "posted"),
      supabase.from("expenses").select("amount, expense_date").eq("status", "posted"),
      supabase.from("sales_returns").select("total").eq("status", "posted"),
      supabase.from("purchase_returns").select("total").eq("status", "posted"),
    ]);

    const sales = salesRes.data || [];
    const purchases = purchasesRes.data || [];
    const expenses = expensesRes.data || [];

    const sumTotal = (arr: any[]) => arr.reduce((s, i) => s + Number(i.total || i.amount || 0), 0);

    setTotalSales(sumTotal(sales));
    setTotalPurchases(sumTotal(purchases));
    setTotalExpenses(sumTotal(expenses));
    setTotalSalesReturns(sumTotal(salesReturnsRes.data || []));
    setTotalPurchaseReturns(sumTotal(purchaseReturnsRes.data || []));

    // Current month sales
    const currMonthSales = sales.filter(i => { const d = new Date(i.invoice_date); return d.getMonth() === currMonth && d.getFullYear() === currYear; }).reduce((s, i) => s + Number(i.total || 0), 0);
    setCurrentMonthSales(currMonthSales);

    // Monthly change calculations
    const calcChange = (items: any[], dateField: string) => {
      const currTotal = items.filter(i => { const d = new Date(i[dateField]); return d.getMonth() === currMonth && d.getFullYear() === currYear; }).reduce((s, i) => s + Number(i.total || i.amount || 0), 0);
      const prevMonth = currMonth === 0 ? 11 : currMonth - 1;
      const prevYear = currMonth === 0 ? currYear - 1 : currYear;
      const prevTotal = items.filter(i => { const d = new Date(i[dateField]); return d.getMonth() === prevMonth && d.getFullYear() === prevYear; }).reduce((s, i) => s + Number(i.total || i.amount || 0), 0);
      return prevTotal > 0 ? ((currTotal - prevTotal) / prevTotal) * 100 : null;
    };

    setSalesChange(calcChange(sales, "invoice_date"));
    setPurchasesChange(calcChange(purchases, "invoice_date"));
    setExpensesChange(calcChange(expenses, "expense_date"));
  };

  const fetchSecondaryKPIs = async () => {
    const [customersRes, suppliersRes, productsRes] = await Promise.all([
      supabase.from("customers").select("balance"),
      supabase.from("suppliers").select("balance"),
      supabase.from("products").select("quantity_on_hand, min_stock_level, purchase_price").eq("is_active", true),
    ]);

    const customers = customersRes.data || [];
    const suppliers = suppliersRes.data || [];
    const products = productsRes.data || [];

    setReceivables(customers.filter(c => Number(c.balance) > 0).reduce((s, c) => s + Number(c.balance), 0));
    setPayables(suppliers.filter(s => Number(s.balance) > 0).reduce((s2, s) => s2 + Number(s.balance), 0));
    setInventoryValue(products.reduce((s, p) => s + Number(p.quantity_on_hand) * Number(p.purchase_price), 0));
    setLowStockCount(products.filter(p => Number(p.quantity_on_hand) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0).length);
  };

  const fetchCharts = async () => {
    const year = new Date().getFullYear();
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const [salesRes, purchasesRes, expensesRes] = await Promise.all([
      supabase.from("sales_invoices").select("invoice_date, total").eq("status", "posted").gte("invoice_date", startDate).lte("invoice_date", endDate),
      supabase.from("purchase_invoices").select("invoice_date, total").eq("status", "posted").gte("invoice_date", startDate).lte("invoice_date", endDate),
      supabase.from("expenses").select("expense_date, amount").eq("status", "posted").gte("expense_date", startDate).lte("expense_date", endDate),
    ]);

    const monthly: MonthlyData[] = MONTH_NAMES.map(name => ({ name, مبيعات: 0, مشتريات: 0 }));
    const monthlyExp: MonthlyExpense[] = MONTH_NAMES.map(name => ({ name, مصروفات: 0 }));

    (salesRes.data || []).forEach(inv => { monthly[new Date(inv.invoice_date).getMonth()].مبيعات += Number(inv.total); });
    (purchasesRes.data || []).forEach(inv => { monthly[new Date(inv.invoice_date).getMonth()].مشتريات += Number(inv.total); });
    (expensesRes.data || []).forEach(exp => { monthlyExp[new Date(exp.expense_date).getMonth()].مصروفات += Number(exp.amount); });

    const currentMonth = new Date().getMonth();
    setMonthlyData(monthly.slice(0, currentMonth + 1));
    setMonthlyExpenses(monthlyExp.slice(0, currentMonth + 1));
  };

  const fetchLiquidity = async () => {
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name").eq("is_active", true),
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entry_id"),
    ]);

    if (!accountsRes.data || !linesRes.data) return;

    const cashAccounts = accountsRes.data.filter(a => a.code.startsWith("1101"));
    const bankAccounts = accountsRes.data.filter(a => a.code.startsWith("1102"));
    const allLiquidIds = new Set([...cashAccounts, ...bankAccounts].map(a => a.id));

    const entryIds = [...new Set(linesRes.data.map((l: any) => l.journal_entry_id))];
    if (!entryIds.length) return;

    const { data: entries } = await supabase.from("journal_entries").select("id").in("id", entryIds).eq("status", "posted");
    const postedIds = new Set((entries || []).map(e => e.id));

    let cashBal = 0, bankBal = 0;
    const cashIds = new Set(cashAccounts.map(a => a.id));
    const bankIds = new Set(bankAccounts.map(a => a.id));

    linesRes.data.forEach((l: any) => {
      if (!postedIds.has(l.journal_entry_id) || !allLiquidIds.has(l.account_id)) return;
      const net = Number(l.debit) - Number(l.credit);
      if (cashIds.has(l.account_id)) cashBal += net;
      if (bankIds.has(l.account_id)) bankBal += net;
    });

    setLiquidity({ total: cashBal + bankBal, cash: cashBal, bank: bankBal });
  };

  const fetchExpensesByType = async () => {
    const [expensesRes, typesRes] = await Promise.all([
      supabase.from("expenses").select("expense_type_id, amount").eq("status", "posted"),
      supabase.from("expense_types").select("id, name"),
    ]);

    const typeMap = new Map((typesRes.data || []).map(t => [t.id, t.name]));
    const grouped = new Map<string, number>();

    (expensesRes.data || []).forEach(e => {
      const name = typeMap.get(e.expense_type_id) || "أخرى";
      grouped.set(name, (grouped.get(name) || 0) + Number(e.amount));
    });

    setExpensesByType(
      Array.from(grouped.entries())
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
    );
  };

  const fetchRecentActivities = async () => {
    const [salesRes, purchasesRes] = await Promise.all([
      supabase.from("sales_invoices").select("id, invoice_number, total, invoice_date, customer_id").order("created_at", { ascending: false }).limit(3),
      supabase.from("purchase_invoices").select("id, invoice_number, total, invoice_date, supplier_id").order("created_at", { ascending: false }).limit(2),
    ]);

    const activities: RecentActivity[] = [];

    if (salesRes.data?.length) {
      const custIds = [...new Set(salesRes.data.filter(d => d.customer_id).map(d => d.customer_id!))];
      const { data: custs } = custIds.length ? await supabase.from("customers").select("id, name").in("id", custIds) : { data: [] };
      const custMap = new Map((custs || []).map(c => [c.id, c.name]));

      salesRes.data.forEach(inv => {
        activities.push({
          id: inv.id,
          title: `فاتورة مبيعات #${inv.invoice_number}`,
          subtitle: custMap.get(inv.customer_id || "") || "عميل نقدي",
          amount: Number(inv.total),
          type: "sale",
          date: inv.invoice_date,
        });
      });
    }

    if (purchasesRes.data?.length) {
      const suppIds = [...new Set(purchasesRes.data.filter(d => d.supplier_id).map(d => d.supplier_id!))];
      const { data: supps } = suppIds.length ? await supabase.from("suppliers").select("id, name").in("id", suppIds) : { data: [] };
      const suppMap = new Map((supps || []).map(s => [s.id, s.name]));

      purchasesRes.data.forEach(inv => {
        activities.push({
          id: inv.id,
          title: `فاتورة مشتريات #${inv.invoice_number}`,
          subtitle: suppMap.get(inv.supplier_id || "") || "مورد",
          amount: Number(inv.total),
          type: "purchase",
          date: inv.invoice_date,
        });
      });
    }

    activities.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setRecentActivities(activities.slice(0, 4));
  };

  const fetchUnpaidInvoices = async () => {
    const { data } = await supabase
      .from("sales_invoices")
      .select("id, invoice_number, total, paid_amount, customer_id")
      .eq("status", "posted")
      .order("created_at", { ascending: false })
      .limit(100);

    if (!data) return;
    const unpaid = data.filter(inv => Number(inv.paid_amount) < Number(inv.total));
    const custIds = [...new Set(unpaid.filter(d => d.customer_id).map(d => d.customer_id!))];
    const { data: custs } = custIds.length ? await supabase.from("customers").select("id, name").in("id", custIds) : { data: [] };
    const custMap = new Map((custs || []).map(c => [c.id, c.name]));

    setUnpaidInvoices(
      unpaid.slice(0, 10).map(inv => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        customer_name: custMap.get(inv.customer_id || "") || "عميل نقدي",
        total: Number(inv.total),
        paid_amount: Number(inv.paid_amount),
        remaining: Number(inv.total) - Number(inv.paid_amount),
      }))
    );
  };

  const fetchTopProducts = async () => {
    const { data: items } = await (supabase.from("sales_invoice_items") as any)
      .select("product_id, quantity, total, invoice_id");

    if (!items?.length) return;

    const invoiceIds = [...new Set(items.map((i: any) => i.invoice_id))] as string[];
    const { data: invoices } = await supabase.from("sales_invoices").select("id, status").in("id", invoiceIds).eq("status", "posted");
    const postedIds = new Set((invoices || []).map(i => i.id));

    const grouped = new Map<string, { qty: number; amount: number }>();
    items.forEach((item: any) => {
      if (!postedIds.has(item.invoice_id) || !item.product_id) return;
      const cur = grouped.get(item.product_id) || { qty: 0, amount: 0 };
      cur.qty += Number(item.quantity);
      cur.amount += Number(item.total);
      grouped.set(item.product_id, cur);
    });

    const productIds = [...grouped.keys()] as string[];
    const { data: products } = await (supabase.from("products") as any)
      .select("id, name, model_number, product_brands(name)")
      .in("id", productIds);

    const productMap = new Map((products || []).map((p: any) => [p.id, formatProductDisplay(p.name, p.product_brands?.name, p.model_number)]));

    setTopProducts(
      Array.from(grouped.entries())
        .map(([pid, data]) => ({ product_id: pid, name: (productMap.get(pid) as string) || "منتج", totalQty: data.qty, totalAmount: data.amount }))
        .sort((a, b) => b.totalAmount - a.totalAmount)
        .slice(0, 10)
    );
  };

  const fetchLowStock = async () => {
    const { data } = await (supabase.from("products") as any)
      .select("name, quantity_on_hand, min_stock_level, model_number, product_brands(name)")
      .eq("is_active", true)
      .order("quantity_on_hand", { ascending: true })
      .limit(20);

    setLowStockItems(
      (data || [])
        .filter((p: any) => Number(p.quantity_on_hand) <= Number(p.min_stock_level) && Number(p.min_stock_level) > 0)
        .map((p: any) => ({
          name: p.name,
          brandName: p.product_brands?.name || null,
          modelNumber: p.model_number || null,
          quantity_on_hand: Number(p.quantity_on_hand),
          min_stock_level: Number(p.min_stock_level),
        }))
    );
  };

  const fetchBalances = async () => {
    const [accountsRes, linesRes] = await Promise.all([
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code"),
      supabase.from("journal_entry_lines").select("account_id, debit, credit, journal_entry_id"),
    ]);

    if (!accountsRes.data || !linesRes.data) return;

    const entryIds = [...new Set(linesRes.data.map((l: any) => l.journal_entry_id))];
    if (!entryIds.length) return;

    const { data: entries } = await supabase.from("journal_entries").select("id").in("id", entryIds).eq("status", "posted");
    const postedIds = new Set((entries || []).map(e => e.id));

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

  const fetchTopCategories = async () => {
    const { data: items } = await (supabase.from("sales_invoice_items") as any)
      .select("product_id, quantity, total, unit_price, invoice_id");

    if (!items?.length) { setTopCategories([]); return; }

    const invoiceIds = [...new Set(items.map((i: any) => i.invoice_id))] as string[];
    const { data: invoices } = await supabase.from("sales_invoices").select("id").in("id", invoiceIds).eq("status", "posted");
    const postedIds = new Set((invoices || []).map(i => i.id));

    const productIds = [...new Set(items.filter((i: any) => i.product_id && postedIds.has(i.invoice_id)).map((i: any) => i.product_id))] as string[];
    if (!productIds.length) { setTopCategories([]); return; }

    const { data: products } = await supabase.from("products").select("id, category_id, purchase_price").in("id", productIds as string[]);
    const { data: categories } = await supabase.from("product_categories").select("id, name");

    const prodMap = new Map((products || []).map(p => [p.id, p]));
    const catMap = new Map((categories || []).map(c => [c.id, c.name]));

    const grouped = new Map<string, { sales: number; profit: number }>();

    items.forEach((item: any) => {
      if (!postedIds.has(item.invoice_id) || !item.product_id) return;
      const prod = prodMap.get(item.product_id);
      if (!prod) return;
      const catName = prod.category_id ? (catMap.get(prod.category_id) || "بدون تصنيف") : "بدون تصنيف";
      const cur = grouped.get(catName) || { sales: 0, profit: 0 };
      cur.sales += Number(item.total);
      cur.profit += Number(item.total) - (Number(prod.purchase_price) * Number(item.quantity));
      grouped.set(catName, cur);
    });

    setTopCategories(
      Array.from(grouped.entries())
        .map(([name, d]) => ({ name, totalSales: d.sales, totalProfit: d.profit }))
        .sort((a, b) => b.totalSales - a.totalSales)
        .slice(0, 8)
    );
  };

  const fetchStagnantStock = async () => {
    // Get products with stock > 0
    const { data: products } = await (supabase.from("products") as any)
      .select("id, name, quantity_on_hand, model_number, product_brands(name)")
      .eq("is_active", true)
      .gt("quantity_on_hand", 0);

    if (!products?.length) { setStagnantItems([]); return; }

    // Get last movement date per product
    const productIds = products.map((p: any) => p.id);
    const { data: movements } = await supabase
      .from("inventory_movements")
      .select("product_id, movement_date")
      .in("product_id", productIds)
      .order("movement_date", { ascending: false });

    const lastMoveMap = new Map<string, string>();
    (movements || []).forEach((m: any) => {
      if (!lastMoveMap.has(m.product_id)) lastMoveMap.set(m.product_id, m.movement_date);
    });

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const stagnant = products
      .filter((p: any) => {
        const lastMove = lastMoveMap.get(p.id);
        if (!lastMove) return true; // no movement ever
        return new Date(lastMove) < thirtyDaysAgo;
      })
      .map((p: any) => ({
        name: p.name,
        brandName: p.product_brands?.name || null,
        modelNumber: p.model_number || null,
        quantity_on_hand: Number(p.quantity_on_hand),
        lastMovement: lastMoveMap.get(p.id) || null,
      }))
      .sort((a: StagnantItem, b: StagnantItem) => {
        if (!a.lastMovement) return -1;
        if (!b.lastMovement) return 1;
        return new Date(a.lastMovement).getTime() - new Date(b.lastMovement).getTime();
      })
      .slice(0, 10);

    setStagnantItems(stagnant);
  };

  const netProfit = totalSales - totalPurchases - totalExpenses - totalSalesReturns + totalPurchaseReturns;
  const profitMargin = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : "0";

  const renderChange = (change: number | null) => {
    if (change === null) return <span className="text-xs text-muted-foreground">لا توجد بيانات سابقة</span>;
    const isPositive = change >= 0;
    return (
      <span className={`text-xs font-semibold flex items-center gap-0.5 ${isPositive ? "text-success" : "text-destructive"}`}>
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        {Math.abs(change).toFixed(1)}%
        <span className="text-muted-foreground font-normal mr-1">مقارنة بالشهر السابق</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Row 1: Primary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Sales */}
        <Card className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">إجمالي المبيعات</p>
                <p className="text-2xl font-bold tracking-tight">{formatCurrency(totalSales)}</p>
                {renderChange(salesChange)}
              </div>
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Purchases */}
        <Card className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
                <p className="text-2xl font-bold tracking-tight">{formatCurrency(totalPurchases)}</p>
                {renderChange(purchasesChange)}
              </div>
              <div className="w-10 h-10 rounded-xl bg-warning/10 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Net Profit */}
        <Card className="border-border/60 shadow-none hover:shadow-sm transition-shadow border-r-4 border-r-primary">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{netProfit >= 0 ? "صافي الربح" : "صافي الخسارة"}</p>
                <p className={`text-2xl font-bold tracking-tight ${netProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(Math.abs(netProfit))}</p>
                <span className="text-xs text-muted-foreground">{netProfit >= 0 ? "هامش الربح" : "هامش الخسارة"} {profitMargin}%</span>
              </div>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${netProfit >= 0 ? "bg-success/10" : "bg-destructive/10"}`}>
                {netProfit >= 0 ? <TrendingUp className="w-5 h-5 text-success" /> : <TrendingDown className="w-5 h-5 text-destructive" />}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Expenses */}
        <Card className="border-border/60 shadow-none hover:shadow-sm transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
                <p className="text-2xl font-bold tracking-tight">{formatCurrency(totalExpenses)}</p>
                {renderChange(expensesChange)}
              </div>
              <div className="w-10 h-10 rounded-xl bg-destructive/10 flex items-center justify-center">
                <ReceiptText className="w-5 h-5 text-destructive" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Row 2: Secondary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">المستحقات (مدين)</p>
              <p className="text-lg font-bold">{formatCurrency(receivables)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center flex-shrink-0">
              <Landmark className="w-5 h-5 text-warning" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">المطلوبات (دائن)</p>
              <p className="text-lg font-bold">{formatCurrency(payables)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
              <Boxes className="w-5 h-5 text-success" />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">قيمة المخزون</p>
              <p className="text-lg font-bold">{formatCurrency(inventoryValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60 shadow-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${lowStockCount > 0 ? "bg-destructive/10" : "bg-success/10"}`}>
              <AlertTriangle className={`w-5 h-5 ${lowStockCount > 0 ? "text-destructive" : "text-success"}`} />
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">نقص المخزون</p>
              <p className="text-lg font-bold">{lowStockCount} <span className="text-xs font-normal text-muted-foreground">صنف</span></p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Middle Section: Charts + Right Column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Charts (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Bar Chart */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base font-bold">التحليل المالي (المبيعات مقابل المشتريات)</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">آخر 6 أشهر</p>
              </div>
              <Badge variant="outline" className="text-xs border-border/60 text-muted-foreground">
                <BarChart3 className="w-3 h-3 ml-1" /> {new Date().getFullYear()}
              </Badge>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthlyData.slice(-6)} barSize={36}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "12px" }} />
                  <Bar dataKey="مبيعات" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="مشتريات" fill="hsl(var(--primary) / 0.25)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Line Chart - Expenses */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold">تحليل المصروفات الشهرية</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={monthlyExpenses.slice(-6)}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" fontSize={12} axisLine={false} tickLine={false} />
                  <YAxis fontSize={11} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "12px" }} />
                  <Line type="monotone" dataKey="مصروفات" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ r: 4, fill: "hsl(var(--destructive))" }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Liquidity */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Wallet className="w-4 h-4 text-primary" /> السيولة النقدية
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="text-center py-2">
                <p className="text-xs text-muted-foreground">الإجمالي</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(liquidity.total)}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">البنوك</p>
                  <p className="text-sm font-bold">{formatCurrency(liquidity.bank)}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">الصندوق</p>
                  <p className="text-sm font-bold">{formatCurrency(liquidity.cash)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sales Target Progress */}
          {(() => {
            const target = Number((settings as any)?.monthly_sales_target || 0);
            if (target <= 0) return null;
            const progress = Math.min((currentMonthSales / target) * 100, 100);
            const exceeded = currentMonthSales > target;
            return (
              <Card className="border-border/60 shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" /> هدف المبيعات الشهري
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">المحقق</span>
                    <span className={`font-bold ${exceeded ? "text-success" : "text-foreground"}`}>{formatCurrency(currentMonthSales)}</span>
                  </div>
                  <Progress value={progress} className="h-3" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>الهدف: {formatCurrency(target)}</span>
                    <span className={`font-bold ${exceeded ? "text-success" : progress >= 70 ? "text-primary" : "text-destructive"}`}>
                      {progress.toFixed(0)}%
                    </span>
                  </div>
                  {exceeded && (
                    <div className="bg-success/10 text-success text-xs font-medium rounded-lg p-2 text-center flex items-center justify-center gap-1">
                      <TrendingUp className="w-3 h-3" /> تم تجاوز الهدف بـ {formatCurrency(currentMonthSales - target)}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}
          {/* Expenses by Type */}
          {expensesByType.length > 0 && (
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-base font-bold">تفاصيل المصروفات</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {expensesByType.map(et => (
                  <div key={et.name} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                    <span className="text-sm">{et.name}</span>
                    <span className="text-sm font-bold font-mono">{formatCurrency(et.amount)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Recent Activities */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base font-bold">أحدث الحركات</CardTitle>
              <button onClick={() => navigate("/sales")} className="text-xs text-primary hover:underline font-medium">عرض الكل</button>
            </CardHeader>
            <CardContent className="space-y-1 px-3">
              {recentActivities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">لا توجد حركات بعد</p>
              ) : (
                recentActivities.map(act => (
                  <div key={act.id} className="flex items-center gap-3 py-2.5 px-2 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={() => navigate(act.type === "sale" ? `/sales/${act.id}` : `/purchases/${act.id}`)}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${act.type === "sale" ? "bg-success/10" : "bg-primary/10"}`}>
                      {act.type === "sale" ? <ArrowDownLeft className="w-4 h-4 text-success" /> : <ArrowUpRight className="w-4 h-4 text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{act.title}</p>
                      <p className="text-[11px] text-muted-foreground">{act.subtitle}</p>
                    </div>
                    <span className={`text-sm font-bold ${act.type === "sale" ? "text-success" : "text-foreground"}`}>
                      {act.type === "sale" ? "+" : "-"}{formatCurrency(act.amount)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Bottom Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Unpaid Invoices */}
        <Card className={`shadow-none ${unpaidInvoices.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/60"}`}>
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ReceiptText className={`w-4 h-4 ${unpaidInvoices.length > 0 ? "text-destructive" : "text-warning"}`} /> فواتير لم تسدد
            </CardTitle>
            <Badge variant={unpaidInvoices.length > 0 ? "destructive" : "outline"} className="text-xs">{unpaidInvoices.length} فاتورة</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {unpaidInvoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد فواتير معلقة</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">رقم الفاتورة</TableHead>
                    <TableHead className="text-xs">العميل</TableHead>
                    <TableHead className="text-xs">الإجمالي</TableHead>
                    <TableHead className="text-xs">المتبقي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unpaidInvoices.map(inv => (
                    <TableRow key={inv.id} className="cursor-pointer" onClick={() => navigate(`/sales/${inv.id}`)}>
                      <TableCell className="font-mono text-sm">#{inv.invoice_number}</TableCell>
                      <TableCell className="text-sm">{inv.customer_name}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(inv.total)}</TableCell>
                      <TableCell className="text-sm font-bold text-destructive">{formatCurrency(inv.remaining)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top Products */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Award className="w-4 h-4 text-primary" /> الأصناف الأكثر مبيعاً
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد بيانات مبيعات</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">#</TableHead>
                    <TableHead className="text-xs">الصنف</TableHead>
                    <TableHead className="text-xs">الكمية</TableHead>
                    <TableHead className="text-xs">الإجمالي</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topProducts.map((p, idx) => (
                    <TableRow key={p.product_id}>
                      <TableCell className="text-sm font-mono">{idx + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{p.name}</TableCell>
                      <TableCell className="text-sm">{p.totalQty}</TableCell>
                      <TableCell className="text-sm font-bold">{formatCurrency(p.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Low Stock Table */}
        <Card className={`shadow-none ${lowStockItems.length > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/60"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <AlertTriangle className={`w-4 h-4 ${lowStockItems.length > 0 ? "text-destructive" : "text-warning"}`} /> تنبيهات المخزون المنخفض
              {lowStockItems.length > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{lowStockItems.length}</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد أصناف منخفضة</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">الصنف</TableHead>
                    <TableHead className="text-xs">الكمية الحالية</TableHead>
                    <TableHead className="text-xs">الحد الأدنى</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockItems.map(item => (
                    <TableRow key={item.name}>
                      <TableCell className="text-sm font-medium">{formatProductDisplay(item.name, item.brandName, item.modelNumber)}</TableCell>
                      <TableCell className="text-sm font-bold text-destructive">{item.quantity_on_hand}</TableCell>
                      <TableCell className="text-sm">{item.min_stock_level}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Top Categories */}
        <Card className="border-border/60 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> الفئات الأكثر مبيعاً وربحية
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد بيانات</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">الفئة</TableHead>
                    <TableHead className="text-xs">إجمالي المبيعات</TableHead>
                    <TableHead className="text-xs">إجمالي الربح</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topCategories.map(cat => (
                    <TableRow key={cat.name}>
                      <TableCell className="text-sm font-medium">{cat.name}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(cat.totalSales)}</TableCell>
                      <TableCell className={`text-sm font-bold ${cat.totalProfit >= 0 ? "text-success" : "text-destructive"}`}>{formatCurrency(cat.totalProfit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Stagnant Stock */}
        <Card className={`shadow-none ${stagnantItems.length > 0 ? "border-warning/40 bg-warning/5" : "border-border/60"}`}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <PackageX className="w-4 h-4 text-warning" /> مخزون راكد
              {stagnantItems.length > 0 && <Badge variant="outline" className="text-[10px] border-warning/40 text-warning">{stagnantItems.length} صنف</Badge>}
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">أصناف لم تتحرك منذ أكثر من 30 يوماً</p>
          </CardHeader>
          <CardContent className="p-0">
            {stagnantItems.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">لا توجد أصناف راكدة</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="text-xs">الصنف</TableHead>
                    <TableHead className="text-xs">الكمية</TableHead>
                    <TableHead className="text-xs">آخر حركة</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stagnantItems.map(item => (
                    <TableRow key={item.name}>
                      <TableCell className="text-sm font-medium">{formatProductDisplay(item.name, item.brandName, item.modelNumber)}</TableCell>
                      <TableCell className="text-sm">{item.quantity_on_hand}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.lastMovement || "لا توجد حركة"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Account Balances Summary */}
      {accountBalances.length > 0 && (() => {
        const typeGroups: Record<string, { label: string; total: number }> = {};
        const typeLabels: Record<string, string> = { asset: "الأصول", liability: "الخصوم", equity: "حقوق الملكية", revenue: "الإيرادات", expense: "المصروفات" };
        accountBalances.forEach(acc => {
          const key = acc.account_type;
          if (!typeGroups[key]) typeGroups[key] = { label: typeLabels[key] || key, total: 0 };
          typeGroups[key].total += acc.balance;
        });
        return (
          <Card className="border-border/60 shadow-none">
            <CardHeader className="border-b border-border/40 py-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2 font-bold">
                <Calculator className="h-4 w-4 text-primary" /> ملخص أرصدة الحسابات
              </CardTitle>
              <button onClick={() => navigate("/reports")} className="text-xs text-primary hover:underline font-medium">عرض التفاصيل ←</button>
            </CardHeader>
            <CardContent className="py-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(typeGroups).map(([key, g]) => (
                  <div key={key} className="bg-muted/40 rounded-lg p-3 text-center">
                    <p className="text-[11px] text-muted-foreground mb-1">{g.label}</p>
                    <p className={`text-sm font-bold ${g.total >= 0 ? "text-foreground" : "text-destructive"}`}>
                      {formatCurrency(Math.abs(g.total))}
                    </p>
                    <p className="text-[10px] text-muted-foreground">{g.total >= 0 ? "مدين" : "دائن"}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })()}
    </div>
  );
}
