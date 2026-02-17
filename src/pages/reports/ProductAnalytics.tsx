import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { FileSpreadsheet, FileText, Trophy, TrendingUp, DollarSign } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";
import { useSettings } from "@/contexts/SettingsContext";

export default function ProductAnalytics() {
  const { settings } = useSettings();
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [view, setView] = useState<"top-sellers" | "most-profitable" | "by-category" | "turnover">("top-sellers");

  const { data: salesItems, isLoading } = useQuery({
    queryKey: ["product-analytics-sales", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select("quantity, total, unit_price, product_id, product:products(name, code, purchase_price, category_id, quantity_on_hand, category:product_categories(name)), invoice:sales_invoices!inner(invoice_date, status)")
        .gte("invoice.invoice_date", dateFrom)
        .lte("invoice.invoice_date", dateTo)
        .eq("invoice.status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseItems } = useQuery({
    queryKey: ["product-analytics-purchases", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select("quantity, total, product_id, invoice:purchase_invoices!inner(invoice_date, status)")
        .gte("invoice.invoice_date", dateFrom)
        .lte("invoice.invoice_date", dateTo)
        .eq("invoice.status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: products } = useQuery({
    queryKey: ["product-analytics-all-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, code, purchase_price, selling_price, quantity_on_hand, category_id, category:product_categories(name)")
        .eq("is_active", true);
      if (error) throw error;
      return data;
    },
  });

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  // Top sellers
  const productSales: Record<string, { name: string; code: string; quantitySold: number; revenue: number; cost: number; profit: number; category: string }> = {};
  salesItems?.forEach((item: any) => {
    const id = item.product_id || "unknown";
    if (!productSales[id]) {
      productSales[id] = {
        name: item.product?.name || "محذوف",
        code: item.product?.code || "-",
        quantitySold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
        category: item.product?.category?.name || "بدون تصنيف",
      };
    }
    const qty = Number(item.quantity);
    const rev = Number(item.total);
    const cost = qty * Number(item.product?.purchase_price || 0);
    productSales[id].quantitySold += qty;
    productSales[id].revenue += rev;
    productSales[id].cost += cost;
    productSales[id].profit += rev - cost;
  });

  const topSellers = Object.values(productSales).sort((a, b) => b.quantitySold - a.quantitySold);
  const mostProfitable = Object.values(productSales).sort((a, b) => b.profit - a.profit);

  // By category
  const categorySales: Record<string, { name: string; quantitySold: number; revenue: number; cost: number; profit: number; productCount: number }> = {};
  Object.values(productSales).forEach((p) => {
    if (!categorySales[p.category]) categorySales[p.category] = { name: p.category, quantitySold: 0, revenue: 0, cost: 0, profit: 0, productCount: 0 };
    categorySales[p.category].quantitySold += p.quantitySold;
    categorySales[p.category].revenue += p.revenue;
    categorySales[p.category].cost += p.cost;
    categorySales[p.category].profit += p.profit;
    categorySales[p.category].productCount++;
  });
  const categoryList = Object.values(categorySales).sort((a, b) => b.revenue - a.revenue);

  // Inventory turnover
  const purchaseTotals: Record<string, number> = {};
  purchaseItems?.forEach((item: any) => {
    const id = item.product_id || "unknown";
    purchaseTotals[id] = (purchaseTotals[id] || 0) + Number(item.total);
  });

  const turnoverData = (products || []).map((p: any) => {
    const sold = productSales[p.id]?.cost || 0; // COGS
    const currentStock = Number(p.quantity_on_hand) * Number(p.purchase_price);
    const purchased = purchaseTotals[p.id] || 0;
    const avgInventory = (currentStock + purchased) / 2;
    const turnover = avgInventory > 0 ? sold / avgInventory : 0;
    return {
      name: p.name,
      code: p.code,
      category: p.category?.name || "بدون تصنيف",
      cogs: sold,
      avgInventory,
      turnover: Math.round(turnover * 100) / 100,
      currentStock: Number(p.quantity_on_hand),
    };
  }).sort((a, b) => b.turnover - a.turnover);

  const chartData = (view === "top-sellers" ? topSellers : mostProfitable).slice(0, 10).map((p) => ({
    name: p.name.length > 15 ? p.name.slice(0, 15) + "..." : p.name,
    value: view === "top-sellers" ? p.quantitySold : p.profit,
  }));

  const handleExport = () => {
    if (view === "top-sellers") {
      exportToExcel({ filename: `أكثر-المنتجات-مبيعاً`, sheetName: "الأكثر مبيعاً", headers: ["الكود", "المنتج", "التصنيف", "الكمية المباعة", "الإيرادات", "التكلفة", "الربح"], rows: topSellers.map((p) => [p.code, p.name, p.category, p.quantitySold, p.revenue, p.cost, p.profit]) });
    } else if (view === "most-profitable") {
      exportToExcel({ filename: `الأكثر-ربحية`, sheetName: "الأكثر ربحية", headers: ["الكود", "المنتج", "التصنيف", "الإيرادات", "التكلفة", "الربح", "هامش الربح %"], rows: mostProfitable.map((p) => [p.code, p.name, p.category, p.revenue, p.cost, p.profit, p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + "%" : "0%"]) });
    } else if (view === "by-category") {
      exportToExcel({ filename: `المبيعات-بالتصنيف`, sheetName: "بالتصنيف", headers: ["التصنيف", "عدد المنتجات", "الكمية المباعة", "الإيرادات", "التكلفة", "الربح"], rows: categoryList.map((c) => [c.name, c.productCount, c.quantitySold, c.revenue, c.cost, c.profit]) });
    } else {
      exportToExcel({ filename: `معدل-دوران-المخزون`, sheetName: "دوران المخزون", headers: ["الكود", "المنتج", "التصنيف", "تكلفة المبيعات", "متوسط المخزون", "معدل الدوران", "المخزون الحالي"], rows: turnoverData.map((p) => [p.code, p.name, p.category, p.cogs, p.avgInventory, p.turnover, p.currentStock]) });
    }
  };

  const handlePdfExport = () => {
    const titles: Record<string, string> = { "top-sellers": "أكثر المنتجات مبيعاً", "most-profitable": "المنتجات الأكثر ربحية", "by-category": "المبيعات حسب التصنيف", turnover: "معدل دوران المخزون" };
    if (view === "top-sellers") {
      exportReportPdf({ title: titles[view], settings, headers: ["الكود", "المنتج", "التصنيف", "الكمية", "الإيرادات", "التكلفة", "الربح"], rows: topSellers.map((p) => [p.code, p.name, p.category, fmtN(p.quantitySold), fmt(p.revenue), fmt(p.cost), fmt(p.profit)]), filename: "أكثر-المنتجات-مبيعاً", orientation: "landscape" });
    } else if (view === "most-profitable") {
      exportReportPdf({ title: titles[view], settings, headers: ["الكود", "المنتج", "التصنيف", "الإيرادات", "التكلفة", "الربح", "هامش %"], rows: mostProfitable.map((p) => [p.code, p.name, p.category, fmt(p.revenue), fmt(p.cost), fmt(p.profit), p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) + "%" : "0%"]), filename: "الأكثر-ربحية", orientation: "landscape" });
    } else if (view === "by-category") {
      exportReportPdf({ title: titles[view], settings, headers: ["التصنيف", "عدد المنتجات", "الكمية", "الإيرادات", "التكلفة", "الربح"], rows: categoryList.map((c) => [c.name, c.productCount, fmtN(c.quantitySold), fmt(c.revenue), fmt(c.cost), fmt(c.profit)]), filename: "مبيعات-بالتصنيف" });
    } else {
      exportReportPdf({ title: titles[view], settings, headers: ["الكود", "المنتج", "التصنيف", "ت.المبيعات", "م.المخزون", "الدوران", "المخزون"], rows: turnoverData.map((p) => [p.code, p.name, p.category, fmt(p.cogs), fmt(p.avgInventory), String(p.turnover), fmtN(p.currentStock)]), filename: "دوران-المخزون", orientation: "landscape" });
    }
  };

  const viewLabels: Record<string, { icon: React.ReactNode; label: string }> = {
    "top-sellers": { icon: <Trophy className="w-4 h-4" />, label: "الأكثر مبيعاً" },
    "most-profitable": { icon: <DollarSign className="w-4 h-4" />, label: "الأكثر ربحية" },
    "by-category": { icon: <TrendingUp className="w-4 h-4" />, label: "حسب التصنيف" },
    turnover: { icon: <TrendingUp className="w-4 h-4" />, label: "دوران المخزون" },
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1"><Label>من تاريخ</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><Label>إلى تاريخ</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" /></div>
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
            <Button variant="outline" onClick={handleExport} disabled={isLoading}><FileSpreadsheet className="w-4 h-4 ml-2" />Excel</Button>
            <Button variant="outline" onClick={handlePdfExport} disabled={isLoading}><FileText className="w-4 h-4 ml-2" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart for top sellers / most profitable */}
      {(view === "top-sellers" || view === "most-profitable") && chartData.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">{viewLabels[view].label} (أعلى 10)</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-[250px] w-full" /> : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={chartData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" fontSize={10} />
                  <YAxis dataKey="name" type="category" width={120} fontSize={10} />
                  <Tooltip formatter={(v: number) => view === "top-sellers" ? fmtN(v) : fmt(v)} />
                  <Bar dataKey="value" name={view === "top-sellers" ? "الكمية" : "الربح"} fill={view === "top-sellers" ? "hsl(217, 91%, 50%)" : "hsl(142, 71%, 45%)"} radius={[0, 4, 4, 0]} />
                </BarChart>
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
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>التصنيف</TableHead><TableHead>الكمية المباعة</TableHead><TableHead>الإيرادات</TableHead><TableHead>التكلفة</TableHead><TableHead>الربح</TableHead></TableRow></TableHeader>
                <TableBody>
                  {topSellers.map((p, i) => (
                    <TableRow key={p.code}><TableCell>{i + 1}</TableCell><TableCell>{p.code}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant="secondary">{p.category}</Badge></TableCell><TableCell className="font-bold">{fmtN(p.quantitySold)}</TableCell><TableCell>{fmt(p.revenue)}</TableCell><TableCell>{fmt(p.cost)}</TableCell><TableCell className="text-success font-bold">{fmt(p.profit)}</TableCell></TableRow>
                  ))}
                  {!topSellers.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد مبيعات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          ) : view === "most-profitable" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>#</TableHead><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>التصنيف</TableHead><TableHead>الإيرادات</TableHead><TableHead>التكلفة</TableHead><TableHead>الربح</TableHead><TableHead>هامش الربح</TableHead></TableRow></TableHeader>
                <TableBody>
                  {mostProfitable.map((p, i) => {
                    const margin = p.revenue > 0 ? (p.profit / p.revenue) * 100 : 0;
                    return (
                      <TableRow key={p.code}><TableCell>{i + 1}</TableCell><TableCell>{p.code}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant="secondary">{p.category}</Badge></TableCell><TableCell>{fmt(p.revenue)}</TableCell><TableCell>{fmt(p.cost)}</TableCell><TableCell className="text-success font-bold">{fmt(p.profit)}</TableCell><TableCell><Badge variant={margin > 30 ? "default" : margin > 15 ? "secondary" : "destructive"}>{margin.toFixed(1)}%</Badge></TableCell></TableRow>
                    );
                  })}
                  {!mostProfitable.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          ) : view === "by-category" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>التصنيف</TableHead><TableHead>عدد المنتجات</TableHead><TableHead>الكمية المباعة</TableHead><TableHead>الإيرادات</TableHead><TableHead>التكلفة</TableHead><TableHead>الربح</TableHead><TableHead>هامش الربح</TableHead></TableRow></TableHeader>
                <TableBody>
                  {categoryList.map((c) => {
                    const margin = c.revenue > 0 ? (c.profit / c.revenue) * 100 : 0;
                    return (
                      <TableRow key={c.name}><TableCell className="font-medium">{c.name}</TableCell><TableCell>{c.productCount}</TableCell><TableCell>{fmtN(c.quantitySold)}</TableCell><TableCell>{fmt(c.revenue)}</TableCell><TableCell>{fmt(c.cost)}</TableCell><TableCell className="text-success font-bold">{fmt(c.profit)}</TableCell><TableCell><Badge variant={margin > 30 ? "default" : "secondary"}>{margin.toFixed(1)}%</Badge></TableCell></TableRow>
                    );
                  })}
                  {!categoryList.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>التصنيف</TableHead><TableHead>تكلفة المبيعات</TableHead><TableHead>متوسط المخزون</TableHead><TableHead>معدل الدوران</TableHead><TableHead>المخزون الحالي</TableHead><TableHead>التقييم</TableHead></TableRow></TableHeader>
                <TableBody>
                  {turnoverData.map((p) => (
                    <TableRow key={p.code}><TableCell>{p.code}</TableCell><TableCell className="font-medium">{p.name}</TableCell><TableCell><Badge variant="secondary">{p.category}</Badge></TableCell><TableCell>{fmt(p.cogs)}</TableCell><TableCell>{fmt(p.avgInventory)}</TableCell><TableCell className="font-bold">{p.turnover}</TableCell><TableCell>{fmtN(p.currentStock)}</TableCell><TableCell><Badge variant={p.turnover > 2 ? "default" : p.turnover > 0.5 ? "secondary" : "destructive"}>{p.turnover > 2 ? "ممتاز" : p.turnover > 0.5 ? "متوسط" : "بطيء"}</Badge></TableCell></TableRow>
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
