import { useState, useMemo } from "react";
import { formatProductDisplay } from "@/lib/product-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ExportMenu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ColumnDef } from "@tanstack/react-table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { useSettings } from "@/contexts/SettingsContext";
import { Package, DollarSign, AlertTriangle, TrendingUp, Layers, Tag } from "lucide-react";

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function InventoryReport() {
  const { settings } = useSettings();
  const [groupBy, setGroupBy] = useState<"product" | "category" | "brand">("product");
  const [stockFilter, setStockFilter] = useState<"all" | "low" | "zero" | "active">("all");

  // ── Query: Products with brand & category ──
  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["inventory-report-products-v2"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("products") as any)
        .select("id, code, name, quantity_on_hand, min_stock_level, purchase_price, selling_price, is_active, model_number, brand_id, category_id, product_brands(name), product_categories(name)")
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Fetch inventory movements to calculate weighted average cost
  const { data: movements = [], isLoading: loadingMovements } = useQuery({
    queryKey: ["inventory-report-movements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, quantity, total_cost")
        .in("movement_type", ["purchase", "opening_balance"]);
      if (error) throw error;
      return data as any[];
    },
  });

  const isLoading = loadingProducts || loadingMovements;

  // Build avg cost map from movements
  const avgCostMap = useMemo(() => {
    const map = new Map<string, number>();
    const agg = new Map<string, { qty: number; cost: number }>();
    movements.forEach((m: any) => {
      const c = agg.get(m.product_id) || { qty: 0, cost: 0 };
      c.qty += Number(m.quantity);
      c.cost += Number(m.total_cost);
      agg.set(m.product_id, c);
    });
    agg.forEach((v, pid) => {
      map.set(pid, v.qty > 0 ? v.cost / v.qty : 0);
    });
    return map;
  }, [movements]);

  // ── Filtered products ──
  const filtered = useMemo(() => {
    let list = products;
    if (stockFilter === "low") list = list.filter(p => p.is_active && Number(p.quantity_on_hand) > 0 && Number(p.quantity_on_hand) <= Number(p.min_stock_level));
    else if (stockFilter === "zero") list = list.filter(p => Number(p.quantity_on_hand) === 0);
    else if (stockFilter === "active") list = list.filter(p => p.is_active);
    return list;
  }, [products, stockFilter]);

  // ── KPI (always from all active products, using weighted avg cost) ──
  const kpi = useMemo(() => {
    const active = products.filter(p => p.is_active);
    const totalItems = active.length;
    const totalQty = active.reduce((s, p) => s + Number(p.quantity_on_hand), 0);
    const purchaseValue = active.reduce((s, p) => {
      const avgCost = avgCostMap.get(p.id) ?? Number(p.purchase_price);
      return s + Number(p.quantity_on_hand) * avgCost;
    }, 0);
    const sellingValue = active.reduce((s, p) => s + Number(p.quantity_on_hand) * Number(p.selling_price), 0);
    const expectedProfit = sellingValue - purchaseValue;
    const lowStock = active.filter(p => Number(p.quantity_on_hand) <= Number(p.min_stock_level) && Number(p.quantity_on_hand) > 0).length;
    const zeroStock = active.filter(p => Number(p.quantity_on_hand) === 0).length;
    return { totalItems, totalQty, purchaseValue, sellingValue, expectedProfit, lowStock, zeroStock };
  }, [products, avgCostMap]);

  // ═══ GROUPING: By Product (default) ═══
  const productColumns = useMemo<ColumnDef<any, any>[]>(() => [
    { accessorKey: "code", header: "الكود", footer: () => <span className="font-bold">الإجمالي</span> },
    {
      id: "name",
      header: "المنتج",
      accessorFn: (r: any) => formatProductDisplay(r.name, r.product_brands?.name, r.model_number),
    },
    {
      id: "category",
      header: "التصنيف",
      accessorFn: (r: any) => r.product_categories?.name || "بدون تصنيف",
    },
    {
      id: "qty",
      header: "الكمية",
      accessorFn: (r: any) => Number(r.quantity_on_hand),
      cell: ({ getValue, row }) => {
        const qty = getValue() as number;
        const min = Number(row.original.min_stock_level);
        const isLow = qty <= min && qty > 0;
        const isZero = qty === 0;
        return <span className={isZero ? "text-destructive font-bold" : isLow ? "text-amber-600 font-medium" : ""}>{qty}</span>;
      },
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((s, r) => s + Number(r.original.quantity_on_hand), 0);
        return <span className="font-bold">{total}</span>;
      },
    },
    {
      id: "min_stock",
      header: "الحد الأدنى",
      accessorFn: (r: any) => Number(r.min_stock_level),
    },
    {
      id: "purchase_price",
      header: "متوسط سعر الشراء",
      accessorFn: (r: any) => avgCostMap.get(r.id) ?? Number(r.purchase_price),
      cell: ({ getValue }) => fmt(getValue() as number),
    },
    {
      id: "selling_price",
      header: "سعر البيع",
      accessorFn: (r: any) => Number(r.selling_price),
      cell: ({ getValue }) => fmt(getValue() as number),
    },
    {
      id: "stock_value",
      header: "قيمة المخزون",
      accessorFn: (r: any) => Number(r.quantity_on_hand) * (avgCostMap.get(r.id) ?? Number(r.purchase_price)),
      cell: ({ getValue }) => <span className="font-mono">{fmt(getValue() as number)}</span>,
      footer: ({ table }) => {
        const total = table.getFilteredRowModel().rows.reduce((s, r) => {
          const cost = avgCostMap.get(r.original.id) ?? Number(r.original.purchase_price);
          return s + Number(r.original.quantity_on_hand) * cost;
        }, 0);
        return <span className="font-bold font-mono">{fmt(total)}</span>;
      },
    },
    {
      id: "status",
      header: "الحالة",
      cell: ({ row }) => {
        const qty = Number(row.original.quantity_on_hand);
        const min = Number(row.original.min_stock_level);
        if (qty === 0) return <Badge variant="destructive">نفد</Badge>;
        if (qty <= min) return <Badge variant="outline" className="border-amber-500 text-amber-600">منخفض</Badge>;
        return <Badge variant="secondary">طبيعي</Badge>;
      },
    },
  ], [avgCostMap]);

  // ═══ GROUPING: By Category ═══
  const categoryData = useMemo(() => {
    const map: Record<string, { name: string; count: number; qty: number; purchaseValue: number; sellingValue: number; lowCount: number }> = {};
    filtered.forEach(p => {
      const cat = p.product_categories?.name || "بدون تصنيف";
      if (!map[cat]) map[cat] = { name: cat, count: 0, qty: 0, purchaseValue: 0, sellingValue: 0, lowCount: 0 };
      map[cat].count++;
      map[cat].qty += Number(p.quantity_on_hand);
      map[cat].purchaseValue += Number(p.quantity_on_hand) * (avgCostMap.get(p.id) ?? Number(p.purchase_price));
      map[cat].sellingValue += Number(p.quantity_on_hand) * Number(p.selling_price);
      if (Number(p.quantity_on_hand) <= Number(p.min_stock_level) && p.is_active) map[cat].lowCount++;
    });
    return Object.values(map).sort((a, b) => b.purchaseValue - a.purchaseValue);
  }, [filtered]);

  const categoryColumns = useMemo<ColumnDef<any, any>[]>(() => [
    { accessorKey: "name", header: "التصنيف", footer: () => <span className="font-bold">الإجمالي</span> },
    {
      accessorKey: "count", header: "عدد الأصناف",
      footer: ({ table }) => <span className="font-bold">{table.getFilteredRowModel().rows.reduce((s, r) => s + r.original.count, 0)}</span>,
    },
    {
      accessorKey: "qty", header: "إجمالي الكمية",
      footer: ({ table }) => <span className="font-bold">{table.getFilteredRowModel().rows.reduce((s, r) => s + r.original.qty, 0)}</span>,
    },
    {
      accessorKey: "purchaseValue", header: "قيمة المخزون (شراء)",
      cell: ({ getValue }) => fmt(getValue() as number),
      footer: ({ table }) => <span className="font-bold font-mono">{fmt(table.getFilteredRowModel().rows.reduce((s, r) => s + r.original.purchaseValue, 0))}</span>,
    },
    {
      accessorKey: "sellingValue", header: "قيمة المخزون (بيع)",
      cell: ({ getValue }) => fmt(getValue() as number),
      footer: ({ table }) => <span className="font-bold font-mono">{fmt(table.getFilteredRowModel().rows.reduce((s, r) => s + r.original.sellingValue, 0))}</span>,
    },
    {
      id: "profit", header: "الربح المتوقع",
      accessorFn: (r: any) => r.sellingValue - r.purchaseValue,
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return <span className={v >= 0 ? "text-emerald-600" : "text-destructive"}>{fmt(v)}</span>;
      },
      footer: ({ table }) => {
        const t = table.getFilteredRowModel().rows.reduce((s, r) => s + r.original.sellingValue - r.original.purchaseValue, 0);
        return <span className={`font-bold font-mono ${t >= 0 ? "text-emerald-600" : "text-destructive"}`}>{fmt(t)}</span>;
      },
    },
    {
      accessorKey: "lowCount", header: "أصناف منخفضة",
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return v > 0 ? <span className="text-destructive font-medium">{v}</span> : <span>0</span>;
      },
      footer: ({ table }) => {
        const t = table.getFilteredRowModel().rows.reduce((s, r) => s + r.original.lowCount, 0);
        return <span className="text-destructive font-bold">{t}</span>;
      },
    },
  ], []);

  // ═══ GROUPING: By Brand ═══
  const brandData = useMemo(() => {
    const map: Record<string, { name: string; count: number; qty: number; purchaseValue: number; sellingValue: number; lowCount: number }> = {};
    filtered.forEach(p => {
      const brand = p.product_brands?.name || "بدون ماركة";
      if (!map[brand]) map[brand] = { name: brand, count: 0, qty: 0, purchaseValue: 0, sellingValue: 0, lowCount: 0 };
      map[brand].count++;
      map[brand].qty += Number(p.quantity_on_hand);
      map[brand].purchaseValue += Number(p.quantity_on_hand) * Number(p.purchase_price);
      map[brand].sellingValue += Number(p.quantity_on_hand) * Number(p.selling_price);
      if (Number(p.quantity_on_hand) <= Number(p.min_stock_level) && p.is_active) map[brand].lowCount++;
    });
    return Object.values(map).sort((a, b) => b.purchaseValue - a.purchaseValue);
  }, [filtered]);

  // Brand uses same columns as category
  const brandColumns = categoryColumns;

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (groupBy === "product") {
      return [...filtered]
        .sort((a, b) => (Number(b.quantity_on_hand) * Number(b.purchase_price)) - (Number(a.quantity_on_hand) * Number(a.purchase_price)))
        .slice(0, 10)
        .map(p => ({
          name: p.name.length > 14 ? p.name.substring(0, 14) + "…" : p.name,
          "قيمة المخزون": Number(p.quantity_on_hand) * Number(p.purchase_price),
        }));
    }
    const data = groupBy === "category" ? categoryData : brandData;
    return data.slice(0, 10).map(d => ({
      name: d.name.length > 14 ? d.name.substring(0, 14) + "…" : d.name,
      "قيمة المخزون": d.purchaseValue,
    }));
  }, [groupBy, filtered, categoryData, brandData]);

  // ── Export config ──
  const exportConfig = useMemo(() => {
    const summaryCards = [
      { label: "عدد الأصناف", value: String(kpi.totalItems) },
      { label: "قيمة المخزون (شراء)", value: fmt(kpi.purchaseValue) },
      { label: "قيمة المخزون (بيع)", value: fmt(kpi.sellingValue) },
      { label: "أصناف منخفضة", value: String(kpi.lowStock) },
    ];

    if (groupBy === "product") {
      return {
        filenamePrefix: "تقرير-المخزون",
        sheetName: "المخزون",
        pdfTitle: "تقرير المخزون",
        headers: ["الكود", "المنتج", "التصنيف", "الكمية", "الحد الأدنى", "سعر الشراء", "سعر البيع", "قيمة المخزون", "الحالة"],
        rows: filtered.map((p: any) => {
          const qty = Number(p.quantity_on_hand);
          const min = Number(p.min_stock_level);
          return [
            p.code,
            formatProductDisplay(p.name, p.product_brands?.name, p.model_number),
            p.product_categories?.name || "بدون تصنيف",
            qty, min,
            Number(p.purchase_price), Number(p.selling_price),
            qty * Number(p.purchase_price),
            qty === 0 ? "نفد" : qty <= min ? "منخفض" : "طبيعي",
          ];
        }),
        summaryCards,
        settings,
        pdfOrientation: "landscape" as const,
      };
    }
    const data = groupBy === "category" ? categoryData : brandData;
    const label = groupBy === "category" ? "التصنيف" : "الماركة";
    return {
      filenamePrefix: `تقرير-المخزون-حسب-${label}`,
      sheetName: label,
      pdfTitle: `تقرير المخزون حسب ${label}`,
      headers: [label, "عدد الأصناف", "إجمالي الكمية", "قيمة (شراء)", "قيمة (بيع)", "الربح المتوقع", "أصناف منخفضة"],
      rows: data.map(d => [d.name, d.count, d.qty, d.purchaseValue, d.sellingValue, d.sellingValue - d.purchaseValue, d.lowCount]),
      summaryCards,
      settings,
      pdfOrientation: "landscape" as const,
    };
  }, [groupBy, filtered, categoryData, brandData, kpi, settings]);

  return (
    <div className="space-y-5 p-1">
      {/* ── Filters ── */}
      <Card className="border shadow-sm">
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-center justify-between gap-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              {/* Stock Filter */}
              <Select value={stockFilter} onValueChange={(v: any) => setStockFilter(v)}>
                <SelectTrigger className="w-[140px] font-medium h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">جميع الأصناف</SelectItem>
                  <SelectItem value="active">النشطة فقط</SelectItem>
                  <SelectItem value="low">المنخفضة</SelectItem>
                  <SelectItem value="zero">النافدة</SelectItem>
                </SelectContent>
              </Select>

              <div className="h-7 w-px bg-border/60 hidden md:block" />

              {/* Group By */}
              <Select value={groupBy} onValueChange={(v: any) => setGroupBy(v)}>
                <SelectTrigger className="w-[140px] font-medium h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">حسب المنتج</SelectItem>
                  <SelectItem value="category">حسب التصنيف</SelectItem>
                  <SelectItem value="brand">حسب الماركة</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="shrink-0">
              <ExportMenu config={exportConfig} disabled={isLoading} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {/* عدد الأصناف */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0 shadow-inner">
                <Package className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">عدد الأصناف النشطة</p>
                {isLoading ? <Skeleton className="h-7 w-12" /> : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums">{kpi.totalItems}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* قيمة المخزون (شراء) */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 via-transparent to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-blue-500/10 flex items-center justify-center shrink-0 shadow-inner">
                <DollarSign className="w-5 h-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">قيمة المخزون (شراء)</p>
                {isLoading ? <Skeleton className="h-7 w-20" /> : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums truncate">{fmt(kpi.purchaseValue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* قيمة المخزون (بيع) */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 via-transparent to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/10 flex items-center justify-center shrink-0 shadow-inner">
                <TrendingUp className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">قيمة المخزون (بيع)</p>
                {isLoading ? <Skeleton className="h-7 w-20" /> : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums truncate">{fmt(kpi.sellingValue)}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* الربح المتوقع */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 pointer-events-none" style={{
            background: kpi.expectedProfit >= 0
              ? "linear-gradient(135deg, hsl(152 60% 42% / 0.06) 0%, transparent 60%)"
              : "linear-gradient(135deg, hsl(0 72% 51% / 0.06) 0%, transparent 60%)",
          }} />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner" style={{
                background: kpi.expectedProfit >= 0 ? "hsl(152 60% 42% / 0.12)" : "hsl(0 72% 51% / 0.12)",
              }}>
                <TrendingUp className="w-5 h-5" style={{ color: kpi.expectedProfit >= 0 ? "hsl(152, 60%, 42%)" : "hsl(0, 72%, 51%)" }} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">الربح المتوقع</p>
                {isLoading ? <Skeleton className="h-7 w-20" /> : (
                  <p className={`text-2xl font-extrabold tracking-tight tabular-nums truncate ${kpi.expectedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                    {fmt(kpi.expectedProfit)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* أصناف منخفضة */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 via-transparent to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 shadow-inner">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">أصناف منخفضة</p>
                {isLoading ? <Skeleton className="h-7 w-12" /> : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums text-amber-600">{kpi.lowStock}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* أصناف نافدة */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-2xl bg-destructive/10 flex items-center justify-center shrink-0 shadow-inner">
                <Package className="w-5 h-5 text-destructive" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">أصناف نافدة</p>
                {isLoading ? <Skeleton className="h-7 w-12" /> : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums text-destructive">{kpi.zeroStock}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Chart ── */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal />
                <XAxis type="number" fontSize={11} axisLine={false} tickLine={false} />
                <YAxis dataKey="name" type="category" fontSize={11} axisLine={false} tickLine={false} width={110} />
                <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid hsl(var(--border))", fontSize: "12px" }} />
                <Bar dataKey="قيمة المخزون" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Data Table ── */}
      <Card>
        <CardContent className="pt-4">
          {groupBy === "product" ? (
            <DataTable
              columns={productColumns}
              data={filtered}
              isLoading={isLoading}
              pageSize={20}
              showPagination
              showSearch
              searchPlaceholder="بحث بالاسم أو الكود..."
              emptyMessage="لا توجد أصناف"
            />
          ) : groupBy === "category" ? (
            <DataTable
              columns={categoryColumns}
              data={categoryData}
              isLoading={isLoading}
              pageSize={20}
              showPagination
              showSearch
              searchPlaceholder="بحث بالتصنيف..."
              emptyMessage="لا توجد بيانات"
            />
          ) : (
            <DataTable
              columns={brandColumns}
              data={brandData}
              isLoading={isLoading}
              pageSize={20}
              showPagination
              showSearch
              searchPlaceholder="بحث بالماركة..."
              emptyMessage="لا توجد بيانات"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
