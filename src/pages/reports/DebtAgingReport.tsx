import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, FileText } from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";
import { useSettings } from "@/contexts/SettingsContext";
import { differenceInDays } from "date-fns";

interface AgingBucket {
  name: string;
  current: number; // 0-30
  days30: number; // 31-60
  days60: number; // 61-90
  days90: number; // 90+
  total: number;
}

function calcAging(invoices: any[], getName: (inv: any) => string): AgingBucket[] {
  const today = new Date();
  const map: Record<string, AgingBucket> = {};

  invoices.forEach((inv) => {
    const remaining = Number(inv.total) - Number(inv.paid_amount);
    if (remaining <= 0) return;

    const name = getName(inv);
    if (!map[name]) map[name] = { name, current: 0, days30: 0, days60: 0, days90: 0, total: 0 };

    const dueDate = inv.due_date || inv.invoice_date;
    const days = differenceInDays(today, new Date(dueDate));

    if (days <= 30) map[name].current += remaining;
    else if (days <= 60) map[name].days30 += remaining;
    else if (days <= 90) map[name].days60 += remaining;
    else map[name].days90 += remaining;

    map[name].total += remaining;
  });

  return Object.values(map).sort((a, b) => b.total - a.total);
}

export default function DebtAgingReport() {
  const { settings } = useSettings();
  const { data: salesInvoices, isLoading: loadingSales } = useQuery({
    queryKey: ["debt-aging-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("*, customer:customers(name)")
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const { data: purchaseInvoices, isLoading: loadingPurchases } = useQuery({
    queryKey: ["debt-aging-purchases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoices")
        .select("*, supplier:suppliers(name)")
        .eq("status", "approved");
      if (error) throw error;
      return data;
    },
  });

  const customerAging = calcAging(salesInvoices || [], (inv) => inv.customer?.name || "بدون عميل");
  const supplierAging = calcAging(purchaseInvoices || [], (inv) => inv.supplier?.name || "بدون مورد");

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totalCustomerDebt = customerAging.reduce((s, c) => s + c.total, 0);
  const totalSupplierDebt = supplierAging.reduce((s, c) => s + c.total, 0);

  const exportAging = (data: AgingBucket[], filename: string) => {
    exportToExcel({
      filename,
      sheetName: "أعمار الديون",
      headers: ["الاسم", "جاري (0-30)", "31-60 يوم", "61-90 يوم", "أكثر من 90", "الإجمالي"],
      rows: data.map((d) => [d.name, d.current, d.days30, d.days60, d.days90, d.total]),
    });
  };

  const exportAgingPdf = (data: AgingBucket[], filename: string, label: string) => {
    const fmtN = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    exportReportPdf({
      title: `تقرير أعمار الديون - ${label}`,
      settings,
      headers: ["الاسم", "جاري (0-30)", "31-60 يوم", "61-90 يوم", "أكثر من 90", "الإجمالي"],
      rows: data.map((d) => [d.name, d.current > 0 ? fmtN(d.current) : "-", d.days30 > 0 ? fmtN(d.days30) : "-", d.days60 > 0 ? fmtN(d.days60) : "-", d.days90 > 0 ? fmtN(d.days90) : "-", fmtN(d.total)]),
      summaryCards: [
        { label: "إجمالي ديون العملاء", value: fmtN(totalCustomerDebt) },
        { label: "إجمالي ديون الموردين", value: fmtN(totalSupplierDebt) },
      ],
      filename,
    });
  };

  const AgingTable = ({ data, loading, label }: { data: AgingBucket[]; loading: boolean; label: string }) => (
    <Card>
      <CardContent className="pt-4">
        {loading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{label}</TableHead>
                  <TableHead className="text-center">جاري (0-30)</TableHead>
                  <TableHead className="text-center">31-60 يوم</TableHead>
                  <TableHead className="text-center">61-90 يوم</TableHead>
                  <TableHead className="text-center"><span className="text-destructive">أكثر من 90</span></TableHead>
                  <TableHead className="text-center">الإجمالي</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => (
                  <TableRow key={row.name}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="text-center">{row.current > 0 ? fmt(row.current) : "-"}</TableCell>
                    <TableCell className="text-center">{row.days30 > 0 ? <span className="text-warning">{fmt(row.days30)}</span> : "-"}</TableCell>
                    <TableCell className="text-center">{row.days60 > 0 ? <span className="text-warning">{fmt(row.days60)}</span> : "-"}</TableCell>
                    <TableCell className="text-center">{row.days90 > 0 ? <span className="text-destructive font-bold">{fmt(row.days90)}</span> : "-"}</TableCell>
                    <TableCell className="text-center font-bold">{fmt(row.total)}</TableCell>
                  </TableRow>
                ))}
                {!data.length && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">لا توجد ديون مستحقة</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي ديون العملاء</p><p className="text-xl font-bold text-destructive">{fmt(totalCustomerDebt)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">إجمالي ديون الموردين</p><p className="text-xl font-bold text-primary">{fmt(totalSupplierDebt)}</p></CardContent></Card>
      </div>

      <Tabs defaultValue="customers" dir="rtl">
        <div className="flex items-center justify-between">
          <TabsList><TabsTrigger value="customers">ديون العملاء</TabsTrigger><TabsTrigger value="suppliers">ديون الموردين</TabsTrigger></TabsList>
          <Button variant="outline" size="sm" onClick={() => exportAging(customerAging, "أعمار-ديون-العملاء")}><FileSpreadsheet className="w-4 h-4 ml-2" />Excel</Button>
          <Button variant="outline" size="sm" onClick={() => exportAgingPdf(customerAging, "أعمار-ديون-العملاء", "العملاء")}><FileText className="w-4 h-4 ml-2" />PDF</Button>
        </div>
        <TabsContent value="customers"><AgingTable data={customerAging} loading={loadingSales} label="العميل" /></TabsContent>
        <TabsContent value="suppliers"><AgingTable data={supplierAging} loading={loadingPurchases} label="المورد" /></TabsContent>
      </Tabs>
    </div>
  );
}
