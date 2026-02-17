import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Download, FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";

export default function SalesReport() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<"invoice" | "customer" | "product">("invoice");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["sales-report", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("*, customer:customers(name), items:sales_invoice_items(*, product:products(name))")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const summary = invoices?.reduce(
    (acc, inv) => ({
      count: acc.count + 1,
      subtotal: acc.subtotal + Number(inv.subtotal),
      discount: acc.discount + Number(inv.discount),
      tax: acc.tax + Number(inv.tax),
      total: acc.total + Number(inv.total),
      paid: acc.paid + Number(inv.paid_amount),
    }),
    { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0 }
  ) ?? { count: 0, subtotal: 0, discount: 0, tax: 0, total: 0, paid: 0 };

  const customerSummary = invoices?.reduce((acc, inv) => {
    const name = inv.customer?.name || "بدون عميل";
    if (!acc[name]) acc[name] = { name, count: 0, total: 0, paid: 0 };
    acc[name].count++;
    acc[name].total += Number(inv.total);
    acc[name].paid += Number(inv.paid_amount);
    return acc;
  }, {} as Record<string, { name: string; count: number; total: number; paid: number }>);

  const productSummary = invoices?.reduce((acc, inv) => {
    inv.items?.forEach((item: any) => {
      const name = item.product?.name || item.description || "منتج محذوف";
      if (!acc[name]) acc[name] = { name, quantity: 0, total: 0 };
      acc[name].quantity += Number(item.quantity);
      acc[name].total += Number(item.total);
    });
    return acc;
  }, {} as Record<string, { name: string; quantity: number; total: number }>);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = () => {
    if (groupBy === "invoice") {
      exportToExcel({
        filename: `تقرير-المبيعات-${dateFrom}-${dateTo}`,
        sheetName: "المبيعات",
        headers: ["رقم الفاتورة", "التاريخ", "العميل", "الحالة", "الإجمالي", "المدفوع", "المتبقي"],
        rows: (invoices || []).map((inv) => [
          inv.invoice_number,
          inv.invoice_date,
          inv.customer?.name || "-",
          inv.status,
          Number(inv.total),
          Number(inv.paid_amount),
          Number(inv.total) - Number(inv.paid_amount),
        ]),
      });
    } else if (groupBy === "customer") {
      exportToExcel({
        filename: `تقرير-مبيعات-بالعميل-${dateFrom}-${dateTo}`,
        sheetName: "بالعميل",
        headers: ["العميل", "عدد الفواتير", "الإجمالي", "المدفوع", "المتبقي"],
        rows: Object.values(customerSummary || {}).map((c) => [c.name, c.count, c.total, c.paid, c.total - c.paid]),
      });
    } else {
      exportToExcel({
        filename: `تقرير-مبيعات-بالمنتج-${dateFrom}-${dateTo}`,
        sheetName: "بالمنتج",
        headers: ["المنتج", "الكمية المباعة", "الإجمالي"],
        rows: Object.values(productSummary || {}).map((p) => [p.name, p.quantity, p.total]),
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>من تاريخ</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label>تجميع حسب</Label>
              <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="invoice">الفاتورة</SelectItem>
                  <SelectItem value="customer">العميل</SelectItem>
                  <SelectItem value="product">المنتج</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={isLoading}>
              <FileSpreadsheet className="w-4 h-4 ml-2" />تصدير Excel
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">عدد الفواتير</p><p className="text-xl font-bold">{summary.count}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي المبيعات</p><p className="text-xl font-bold text-primary">{fmt(summary.total)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">المدفوع</p><p className="text-xl font-bold text-success">{fmt(summary.paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">المتبقي</p><p className="text-xl font-bold text-destructive">{fmt(summary.total - summary.paid)}</p></CardContent></Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : groupBy === "invoice" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow><TableHead>رقم</TableHead><TableHead>التاريخ</TableHead><TableHead>العميل</TableHead><TableHead>الحالة</TableHead><TableHead>الإجمالي</TableHead><TableHead>المدفوع</TableHead><TableHead>المتبقي</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {invoices?.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.invoice_number}</TableCell>
                      <TableCell>{inv.invoice_date}</TableCell>
                      <TableCell>{inv.customer?.name || "-"}</TableCell>
                      <TableCell><Badge variant={inv.status === "approved" ? "default" : "secondary"}>{inv.status === "approved" ? "معتمد" : inv.status === "cancelled" ? "ملغي" : "مسودة"}</Badge></TableCell>
                      <TableCell>{fmt(Number(inv.total))}</TableCell>
                      <TableCell>{fmt(Number(inv.paid_amount))}</TableCell>
                      <TableCell className="text-destructive">{fmt(Number(inv.total) - Number(inv.paid_amount))}</TableCell>
                    </TableRow>
                  ))}
                  {!invoices?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          ) : groupBy === "customer" ? (
            <Table>
              <TableHeader><TableRow><TableHead>العميل</TableHead><TableHead>عدد الفواتير</TableHead><TableHead>الإجمالي</TableHead><TableHead>المدفوع</TableHead><TableHead>المتبقي</TableHead></TableRow></TableHeader>
              <TableBody>
                {Object.values(customerSummary || {}).sort((a, b) => b.total - a.total).map((c) => (
                  <TableRow key={c.name}><TableCell>{c.name}</TableCell><TableCell>{c.count}</TableCell><TableCell>{fmt(c.total)}</TableCell><TableCell>{fmt(c.paid)}</TableCell><TableCell className="text-destructive">{fmt(c.total - c.paid)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>المنتج</TableHead><TableHead>الكمية المباعة</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
              <TableBody>
                {Object.values(productSummary || {}).sort((a, b) => b.total - a.total).map((p) => (
                  <TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell>{p.quantity}</TableCell><TableCell>{fmt(p.total)}</TableCell></TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
