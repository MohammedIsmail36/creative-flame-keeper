import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { FileSpreadsheet } from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";

export default function PurchasesReport() {
  const [dateFrom, setDateFrom] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [dateTo, setDateTo] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
  const [groupBy, setGroupBy] = useState<"invoice" | "supplier" | "product">("invoice");

  const { data: invoices, isLoading } = useQuery({
    queryKey: ["purchases-report", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("*, supplier:suppliers(name), items:purchase_invoice_items(*, product:products(name))")
        .gte("invoice_date", dateFrom)
        .lte("invoice_date", dateTo)
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const summary = invoices?.reduce(
    (acc, inv) => ({ count: acc.count + 1, total: acc.total + Number(inv.total), paid: acc.paid + Number(inv.paid_amount) }),
    { count: 0, total: 0, paid: 0 }
  ) ?? { count: 0, total: 0, paid: 0 };

  const supplierSummary = invoices?.reduce((acc, inv) => {
    const name = inv.supplier?.name || "بدون مورد";
    if (!acc[name]) acc[name] = { name, count: 0, total: 0, paid: 0 };
    acc[name].count++;
    acc[name].total += Number(inv.total);
    acc[name].paid += Number(inv.paid_amount);
    return acc;
  }, {} as Record<string, any>);

  const productSummary = invoices?.reduce((acc, inv) => {
    inv.items?.forEach((item: any) => {
      const name = item.product?.name || item.description || "منتج محذوف";
      if (!acc[name]) acc[name] = { name, quantity: 0, total: 0 };
      acc[name].quantity += Number(item.quantity);
      acc[name].total += Number(item.total);
    });
    return acc;
  }, {} as Record<string, any>);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = () => {
    if (groupBy === "invoice") {
      exportToExcel({ filename: `تقرير-المشتريات-${dateFrom}-${dateTo}`, sheetName: "المشتريات", headers: ["رقم", "التاريخ", "المورد", "الحالة", "الإجمالي", "المدفوع", "المتبقي"], rows: (invoices || []).map((inv) => [inv.invoice_number, inv.invoice_date, inv.supplier?.name || "-", inv.status, Number(inv.total), Number(inv.paid_amount), Number(inv.total) - Number(inv.paid_amount)]) });
    } else if (groupBy === "supplier") {
      exportToExcel({ filename: `تقرير-مشتريات-بالمورد`, sheetName: "بالمورد", headers: ["المورد", "عدد الفواتير", "الإجمالي", "المدفوع", "المتبقي"], rows: Object.values(supplierSummary || {}).map((s: any) => [s.name, s.count, s.total, s.paid, s.total - s.paid]) });
    } else {
      exportToExcel({ filename: `تقرير-مشتريات-بالمنتج`, sheetName: "بالمنتج", headers: ["المنتج", "الكمية", "الإجمالي"], rows: Object.values(productSummary || {}).map((p: any) => [p.name, p.quantity, p.total]) });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1"><Label>من تاريخ</Label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" /></div>
            <div className="space-y-1"><Label>إلى تاريخ</Label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" /></div>
            <div className="space-y-1">
              <Label>تجميع حسب</Label>
              <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="invoice">الفاتورة</SelectItem><SelectItem value="supplier">المورد</SelectItem><SelectItem value="product">المنتج</SelectItem></SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={isLoading}><FileSpreadsheet className="w-4 h-4 ml-2" />تصدير Excel</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">عدد الفواتير</p><p className="text-xl font-bold">{summary.count}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي المشتريات</p><p className="text-xl font-bold text-primary">{fmt(summary.total)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">المدفوع</p><p className="text-xl font-bold text-success">{fmt(summary.paid)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">المتبقي</p><p className="text-xl font-bold text-destructive">{fmt(summary.total - summary.paid)}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : groupBy === "invoice" ? (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>رقم</TableHead><TableHead>التاريخ</TableHead><TableHead>المورد</TableHead><TableHead>الحالة</TableHead><TableHead>الإجمالي</TableHead><TableHead>المدفوع</TableHead><TableHead>المتبقي</TableHead></TableRow></TableHeader>
                <TableBody>
                  {invoices?.map((inv) => (
                    <TableRow key={inv.id}><TableCell>{inv.invoice_number}</TableCell><TableCell>{inv.invoice_date}</TableCell><TableCell>{inv.supplier?.name || "-"}</TableCell><TableCell><Badge variant={inv.status === "approved" ? "default" : "secondary"}>{inv.status === "approved" ? "معتمد" : inv.status === "cancelled" ? "ملغي" : "مسودة"}</Badge></TableCell><TableCell>{fmt(Number(inv.total))}</TableCell><TableCell>{fmt(Number(inv.paid_amount))}</TableCell><TableCell className="text-destructive">{fmt(Number(inv.total) - Number(inv.paid_amount))}</TableCell></TableRow>
                  ))}
                  {!invoices?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          ) : groupBy === "supplier" ? (
            <Table>
              <TableHeader><TableRow><TableHead>المورد</TableHead><TableHead>عدد الفواتير</TableHead><TableHead>الإجمالي</TableHead><TableHead>المدفوع</TableHead><TableHead>المتبقي</TableHead></TableRow></TableHeader>
              <TableBody>{Object.values(supplierSummary || {}).sort((a: any, b: any) => b.total - a.total).map((s: any) => (<TableRow key={s.name}><TableCell>{s.name}</TableCell><TableCell>{s.count}</TableCell><TableCell>{fmt(s.total)}</TableCell><TableCell>{fmt(s.paid)}</TableCell><TableCell className="text-destructive">{fmt(s.total - s.paid)}</TableCell></TableRow>))}</TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>المنتج</TableHead><TableHead>الكمية</TableHead><TableHead>الإجمالي</TableHead></TableRow></TableHeader>
              <TableBody>{Object.values(productSummary || {}).sort((a: any, b: any) => b.total - a.total).map((p: any) => (<TableRow key={p.name}><TableCell>{p.name}</TableCell><TableCell>{p.quantity}</TableCell><TableCell>{fmt(p.total)}</TableCell></TableRow>))}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
