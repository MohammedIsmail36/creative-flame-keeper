import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Package, Download } from "lucide-react";
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

const inTypes = ["opening_balance", "purchase", "sale_return"];

interface MovementRow {
  id: string;
  product_id: string;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  movement_date: string;
  notes: string | null;
  products: { code: string; name: string } | null;
  cumulativeBalance: number;
}

export default function InventoryMovements() {
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

      if (selectedProduct !== "all") query = query.eq("product_id", selectedProduct);
      if (selectedType !== "all") query = query.eq("movement_type", selectedType);
      if (dateFrom) query = query.gte("movement_date", dateFrom);
      if (dateTo) query = query.lte("movement_date", dateTo);

      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });

  const movementsWithBalance: MovementRow[] = useMemo(() => {
    const balances: Record<string, number> = {};
    return movements.map((m: any) => {
      const pid = m.product_id;
      if (!(pid in balances)) balances[pid] = 0;
      const isIn = inTypes.includes(m.movement_type);
      balances[pid] += isIn ? Number(m.quantity) : -Number(m.quantity);
      return { ...m, cumulativeBalance: balances[pid] };
    });
  }, [movements]);

  const totalIn = movementsWithBalance.filter(m => inTypes.includes(m.movement_type)).reduce((s, m) => s + Number(m.quantity), 0);
  const totalOut = movementsWithBalance.filter(m => !inTypes.includes(m.movement_type)).reduce((s, m) => s + Number(m.quantity), 0);

  const handleExportCSV = () => {
    const headers = ["التاريخ", "المنتج", "الكود", "نوع الحركة", "الكمية", "سعر الوحدة", "الإجمالي", "الرصيد التراكمي", "ملاحظات"];
    const rows = movementsWithBalance.map(m => [
      m.movement_date, m.products?.name || "", m.products?.code || "",
      movementTypeLabels[m.movement_type] || m.movement_type,
      m.quantity, m.unit_cost, m.total_cost, m.cumulativeBalance, m.notes || "",
    ]);
    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inventory-movements-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnDef<MovementRow, any>[] = [
    {
      accessorKey: "movement_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span>{row.original.movement_date}</span>,
    },
    {
      id: "product",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المنتج" />,
      accessorFn: (row) => row.products?.name || "",
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.products?.name}</div>
          <div className="text-xs text-muted-foreground">{row.original.products?.code}</div>
        </div>
      ),
    },
    {
      accessorKey: "movement_type",
      header: "نوع الحركة",
      cell: ({ row }) => (
        <Badge variant="secondary" className={movementTypeColors[row.original.movement_type] || ""}>
          {movementTypeLabels[row.original.movement_type] || row.original.movement_type}
        </Badge>
      ),
    },
    {
      id: "in_qty",
      header: "وارد",
      cell: ({ row }) => {
        const isIn = inTypes.includes(row.original.movement_type);
        return <span className="text-green-700 font-medium">{isIn ? Number(row.original.quantity).toLocaleString() : "-"}</span>;
      },
    },
    {
      id: "out_qty",
      header: "صادر",
      cell: ({ row }) => {
        const isIn = inTypes.includes(row.original.movement_type);
        return <span className="text-red-700 font-medium">{!isIn ? Number(row.original.quantity).toLocaleString() : "-"}</span>;
      },
    },
    {
      accessorKey: "unit_cost",
      header: ({ column }) => <DataTableColumnHeader column={column} title="سعر الوحدة" />,
      cell: ({ row }) => <span>{Number(row.original.unit_cost).toLocaleString()}</span>,
    },
    {
      accessorKey: "total_cost",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الإجمالي" />,
      cell: ({ row }) => <span>{Number(row.original.total_cost).toLocaleString()}</span>,
    },
    {
      id: "balance",
      header: "الرصيد التراكمي",
      cell: ({ row }) => <span className="font-bold">{row.original.cumulativeBalance.toLocaleString()}</span>,
    },
    {
      accessorKey: "notes",
      header: "ملاحظات",
      cell: ({ row }) => <span className="text-xs text-muted-foreground">{row.original.notes || "-"}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تقرير حركة المخزون</h1>
          <p className="text-muted-foreground text-sm mt-1">عرض جميع حركات المخزون مع الأرصدة التراكمية</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={movementsWithBalance.length === 0}>
          <Download className="w-4 h-4 ml-2" />
          تصدير CSV
        </Button>
      </div>

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
              <p className="text-lg font-bold text-blue-700">{movementsWithBalance.length.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={movementsWithBalance}
        searchKey="global"
        searchPlaceholder="بحث..."
        isLoading={isLoading}
        emptyMessage="لا توجد حركات مخزون"
        toolbarContent={
          <div className="flex gap-2 flex-wrap">
            <Select value={selectedProduct} onValueChange={setSelectedProduct}>
              <SelectTrigger className="w-48">
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
              <SelectTrigger className="w-40">
                <SelectValue placeholder="جميع الأنواع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">جميع الأنواع</SelectItem>
                {Object.entries(movementTypeLabels).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" />
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" />
          </div>
        }
      />
    </div>
  );
}
