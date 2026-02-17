import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Search, Download, Filter } from "lucide-react";
import { format } from "date-fns";

const movementTypeLabels: Record<string, string> = {
  opening_balance: "رصيد افتتاحي",
  purchase: "شراء",
  purchase_return: "مرتجع شراء",
  sale: "بيع",
  sale_return: "مرتجع بيع",
  adjustment: "تسوية",
};

const movementTypeColors: Record<string, string> = {
  opening_balance: "bg-blue-100 text-blue-800",
  purchase: "bg-green-100 text-green-800",
  purchase_return: "bg-orange-100 text-orange-800",
  sale: "bg-red-100 text-red-800",
  sale_return: "bg-purple-100 text-purple-800",
  adjustment: "bg-gray-100 text-gray-800",
};

// Types that increase stock
const inTypes = ["opening_balance", "purchase", "sale_return"];

export default function InventoryMovements() {
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["products-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, code, name").order("code");
      if (error) throw error;
      return data;
    },
  });

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["inventory-movements", selectedProduct, selectedType, dateFrom, dateTo],
    queryFn: async () => {
      let query = (supabase.from("inventory_movements" as any) as any)
        .select("*, products(code, name)")
        .order("movement_date", { ascending: true })
        .order("created_at", { ascending: true });

      if (selectedProduct !== "all") {
        query = query.eq("product_id", selectedProduct);
      }
      if (selectedType !== "all") {
        query = query.eq("movement_type", selectedType);
      }
      if (dateFrom) {
        query = query.gte("movement_date", dateFrom);
      }
      if (dateTo) {
        query = query.lte("movement_date", dateTo);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  // Calculate cumulative balances per product
  const movementsWithBalance = useMemo(() => {
    const balances: Record<string, number> = {};
    return movements.map((m: any) => {
      const pid = m.product_id;
      if (!(pid in balances)) balances[pid] = 0;
      const isIn = inTypes.includes(m.movement_type);
      balances[pid] += isIn ? Number(m.quantity) : -Number(m.quantity);
      return { ...m, cumulativeBalance: balances[pid] };
    });
  }, [movements]);

  const filtered = useMemo(() => {
    if (!search) return movementsWithBalance;
    const s = search.toLowerCase();
    return movementsWithBalance.filter(
      (m: any) =>
        m.products?.name?.toLowerCase().includes(s) ||
        m.products?.code?.toLowerCase().includes(s) ||
        m.notes?.toLowerCase().includes(s)
    );
  }, [movementsWithBalance, search]);

  // Summary stats
  const totalIn = filtered.filter((m: any) => inTypes.includes(m.movement_type)).reduce((s: number, m: any) => s + Number(m.quantity), 0);
  const totalOut = filtered.filter((m: any) => !inTypes.includes(m.movement_type)).reduce((s: number, m: any) => s + Number(m.quantity), 0);

  const handleExportCSV = () => {
    const headers = ["التاريخ", "المنتج", "الكود", "نوع الحركة", "الكمية", "سعر الوحدة", "الإجمالي", "الرصيد التراكمي", "ملاحظات"];
    const rows = filtered.map((m: any) => [
      m.movement_date,
      m.products?.name || "",
      m.products?.code || "",
      movementTypeLabels[m.movement_type] || m.movement_type,
      m.quantity,
      m.unit_cost,
      m.total_cost,
      m.cumulativeBalance,
      m.notes || "",
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-movements-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تقرير حركة المخزون</h1>
          <p className="text-muted-foreground text-sm mt-1">عرض جميع حركات المخزون مع الأرصدة التراكمية</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={filtered.length === 0}>
          <Download className="w-4 h-4 ml-2" />
          تصدير CSV
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الوارد</p>
              <p className="text-lg font-bold text-green-700">{totalIn.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-red-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي الصادر</p>
              <p className="text-lg font-bold text-red-700">{totalOut.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <Package className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">عدد الحركات</p>
              <p className="text-lg font-bold text-blue-700">{filtered.length.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="w-4 h-4" />
            الفلاتر
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="بحث..." value={search} onChange={(e) => setSearch(e.target.value)} className="pr-9" />
            </div>
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger>
                <SelectValue placeholder="جميع المنتجات" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع المنتجات</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.code} - {p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger>
                <SelectValue placeholder="جميع الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {Object.entries(movementTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} placeholder="من تاريخ" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} placeholder="إلى تاريخ" />
          </div>
        </CardContent>
      </Card>

      {/* Movements Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">التاريخ</TableHead>
                <TableHead className="text-right">المنتج</TableHead>
                <TableHead className="text-right">نوع الحركة</TableHead>
                <TableHead className="text-right">وارد</TableHead>
                <TableHead className="text-right">صادر</TableHead>
                <TableHead className="text-right">سعر الوحدة</TableHead>
                <TableHead className="text-right">الإجمالي</TableHead>
                <TableHead className="text-right">الرصيد التراكمي</TableHead>
                <TableHead className="text-right">ملاحظات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">جاري التحميل...</TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">لا توجد حركات مخزون</TableCell>
                </TableRow>
              ) : (
                filtered.map((m: any) => {
                  const isIn = inTypes.includes(m.movement_type);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="text-right">{m.movement_date}</TableCell>
                      <TableCell className="text-right">
                        <div className="font-medium">{m.products?.name}</div>
                        <div className="text-xs text-muted-foreground">{m.products?.code}</div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="secondary" className={movementTypeColors[m.movement_type] || ""}>
                          {movementTypeLabels[m.movement_type] || m.movement_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-green-700 font-medium">
                        {isIn ? Number(m.quantity).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right text-red-700 font-medium">
                        {!isIn ? Number(m.quantity).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-right">{Number(m.unit_cost).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(m.total_cost).toLocaleString()}</TableCell>
                      <TableCell className="text-right font-bold">{m.cumulativeBalance.toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{m.notes || "-"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
