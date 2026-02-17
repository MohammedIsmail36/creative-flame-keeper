import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { FileSpreadsheet, FileText, AlertTriangle } from "lucide-react";
import { exportToExcel } from "@/lib/excel-export";
import { exportReportPdf } from "@/lib/report-pdf";
import { useSettings } from "@/contexts/SettingsContext";

const movementTypeLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  purchase: "شراء",
  purchase_return: "مرتجع شراء",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  adjustment: "تسوية",
};

export default function InventoryReport() {
  const { settings } = useSettings();
  const [search, setSearch] = useState("");

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["inventory-report-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, code, name, quantity_on_hand, min_stock_level, purchase_price, selling_price, is_active")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = products?.filter((p) => p.name.includes(search) || p.code.includes(search)) || [];
  const lowStock = filtered.filter((p) => p.quantity_on_hand <= p.min_stock_level && p.is_active);
  const totalValue = filtered.reduce((sum, p) => sum + Number(p.quantity_on_hand) * Number(p.purchase_price), 0);
  const totalSellingValue = filtered.reduce((sum, p) => sum + Number(p.quantity_on_hand) * Number(p.selling_price), 0);

  const fmt = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const handleExport = () => {
    exportToExcel({
      filename: "تقرير-المخزون",
      sheetName: "المخزون",
      headers: ["الكود", "المنتج", "الكمية", "الحد الأدنى", "سعر الشراء", "سعر البيع", "قيمة المخزون", "الحالة"],
      rows: filtered.map((p) => [
        p.code, p.name, Number(p.quantity_on_hand), Number(p.min_stock_level), Number(p.purchase_price), Number(p.selling_price),
        Number(p.quantity_on_hand) * Number(p.purchase_price),
        Number(p.quantity_on_hand) <= Number(p.min_stock_level) ? "منخفض" : "طبيعي",
      ]),
    });
  };

  const handlePdfExport = () => {
    const fmtN = (n: number) => n.toLocaleString("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    exportReportPdf({
      title: "تقرير المخزون",
      settings,
      headers: ["الكود", "المنتج", "الكمية", "الحد الأدنى", "سعر الشراء", "سعر البيع", "قيمة المخزون", "الحالة"],
      rows: filtered.map((p) => [p.code, p.name, Number(p.quantity_on_hand), Number(p.min_stock_level), fmtN(Number(p.purchase_price)), fmtN(Number(p.selling_price)), fmtN(Number(p.quantity_on_hand) * Number(p.purchase_price)), Number(p.quantity_on_hand) <= Number(p.min_stock_level) ? "منخفض" : "طبيعي"]),
      summaryCards: [
        { label: "عدد الأصناف", value: String(filtered.length) },
        { label: "قيمة المخزون (شراء)", value: fmtN(totalValue) },
        { label: "قيمة المخزون (بيع)", value: fmtN(totalSellingValue) },
        { label: "أصناف منخفضة", value: String(lowStock.length) },
      ],
      filename: "تقرير-المخزون",
      orientation: "landscape",
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1 flex-1 min-w-[200px]"><Label>بحث</Label><Input placeholder="بحث بالاسم أو الكود..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Button variant="outline" onClick={handleExport} disabled={loadingProducts}><FileSpreadsheet className="w-4 h-4 ml-2" />Excel</Button>
            <Button variant="outline" onClick={handlePdfExport} disabled={loadingProducts}><FileText className="w-4 h-4 ml-2" />PDF</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">عدد الأصناف</p><p className="text-xl font-bold">{filtered.length}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">قيمة المخزون (شراء)</p><p className="text-xl font-bold text-primary">{fmt(totalValue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground">قيمة المخزون (بيع)</p><p className="text-xl font-bold text-success">{fmt(totalSellingValue)}</p></CardContent></Card>
        <Card><CardContent className="pt-4 text-center"><p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><AlertTriangle className="w-3 h-3" />أصناف منخفضة</p><p className="text-xl font-bold text-destructive">{lowStock.length}</p></CardContent></Card>
      </div>

      <Card>
        <CardContent className="pt-4">
          {loadingProducts ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div> : (
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader><TableRow><TableHead>الكود</TableHead><TableHead>المنتج</TableHead><TableHead>الكمية</TableHead><TableHead>الحد الأدنى</TableHead><TableHead>سعر الشراء</TableHead><TableHead>سعر البيع</TableHead><TableHead>قيمة المخزون</TableHead><TableHead>الحالة</TableHead></TableRow></TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const isLow = Number(p.quantity_on_hand) <= Number(p.min_stock_level);
                    return (
                      <TableRow key={p.id} className={isLow ? "bg-destructive/5" : ""}>
                        <TableCell>{p.code}</TableCell><TableCell>{p.name}</TableCell><TableCell>{Number(p.quantity_on_hand)}</TableCell><TableCell>{Number(p.min_stock_level)}</TableCell><TableCell>{fmt(Number(p.purchase_price))}</TableCell><TableCell>{fmt(Number(p.selling_price))}</TableCell><TableCell>{fmt(Number(p.quantity_on_hand) * Number(p.purchase_price))}</TableCell>
                        <TableCell>{isLow ? <Badge variant="destructive">منخفض</Badge> : <Badge variant="secondary">طبيعي</Badge>}</TableCell>
                      </TableRow>
                    );
                  })}
                  {!filtered.length && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">لا توجد بيانات</TableCell></TableRow>}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
