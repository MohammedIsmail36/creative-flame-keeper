import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatProductDisplay } from "@/lib/product-utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ExportMenu";
import { DatePickerInput } from "@/components/DatePickerInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColumnDef } from "@tanstack/react-table";
import {
  format,
  startOfMonth,
  endOfMonth,
  subDays,
  subMonths,
  startOfQuarter,
  startOfYear,
} from "date-fns";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Line,
  ComposedChart,
  Legend,
} from "recharts";
import { useSettings } from "@/contexts/SettingsContext";
import {
  Package,
  DollarSign,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Layers,
  Tag,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  BarChart3,
  PieChart as PieChartIcon,
} from "lucide-react";

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const CHART_COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f97316",
  "#ec4899",
  "#a855f7",
  "#eab308",
];

export default function InventoryReport() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [groupBy, setGroupBy] = useState<"product" | "category" | "brand">(
    "product",
  );
  const [stockFilter, setStockFilter] = useState<
    "all" | "low" | "zero" | "active"
  >("all");
  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [timeMode, setTimeMode] = useState<"daily" | "monthly">("daily");

  // ── Quick date presets ──
  const quickRanges = useMemo(() => {
    const now = new Date();
    return [
      {
        label: "هذا الشهر",
        from: format(startOfMonth(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      },
      {
        label: "الشهر السابق",
        from: format(startOfMonth(subMonths(now, 1)), "yyyy-MM-dd"),
        to: format(endOfMonth(subMonths(now, 1)), "yyyy-MM-dd"),
      },
      {
        label: "هذا الربع",
        from: format(startOfQuarter(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      },
      {
        label: "من بداية السنة",
        from: format(startOfYear(now), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      },
      {
        label: "آخر 12 شهر",
        from: format(startOfMonth(subMonths(now, 11)), "yyyy-MM-dd"),
        to: format(endOfMonth(now), "yyyy-MM-dd"),
      },
    ];
  }, []);

  // ── Previous period calculation ──
  const prevPeriod = useMemo(() => {
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    const rangeDays =
      Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    const prevTo = subDays(from, 1);
    const prevFrom = subDays(from, rangeDays);
    return {
      from: format(prevFrom, "yyyy-MM-dd"),
      to: format(prevTo, "yyyy-MM-dd"),
    };
  }, [dateFrom, dateTo]);

  const calcGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  // ── Query: Products with brand & category ──
  const { data: products = [], isLoading } = useQuery({
    queryKey: ["inventory-report-products-v2"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("products") as any)
        .select(
          "id, code, name, quantity_on_hand, min_stock_level, purchase_price, selling_price, is_active, model_number, brand_id, category_id, product_brands(name), product_categories(name)",
        )
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // ── Query: Inventory movements for current + previous period ──
  const {
    data: allMovements = { current: [] as any[], previous: [] as any[] },
  } = useQuery({
    queryKey: [
      "inv-report-movements",
      dateFrom,
      dateTo,
      prevPeriod.from,
      prevPeriod.to,
    ],
    queryFn: async () => {
      const [curr, prev] = await Promise.all([
        supabase
          .from("inventory_movements")
          .select(
            "product_id, movement_type, quantity, total_cost, movement_date",
          )
          .gte("movement_date", dateFrom)
          .lte("movement_date", dateTo),
        supabase
          .from("inventory_movements")
          .select("product_id, movement_type, quantity, total_cost")
          .gte("movement_date", prevPeriod.from)
          .lte("movement_date", prevPeriod.to),
      ]);
      if (curr.error) throw curr.error;
      if (prev.error) throw prev.error;
      return { current: curr.data as any[], previous: prev.data as any[] };
    },
  });
  const movements = allMovements.current;
  const prevMovements = allMovements.previous;

  // ── Query: WAC per product (from ALL inventory movements)
  // مصدر الحقيقة لقيمة المخزون = نفس مصدر حساب GL (1104)
  const { data: wacMap = {} } = useQuery({
    queryKey: ["inventory-report-wac"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, movement_type, quantity, total_cost")
        .in("movement_type", ["purchase", "opening_balance", "purchase_return"]);
      if (error) throw error;
      const agg: Record<string, { qty: number; cost: number }> = {};
      (data ?? []).forEach((m: any) => {
        const pid = m.product_id;
        if (!agg[pid]) agg[pid] = { qty: 0, cost: 0 };
        const q = Number(m.quantity);
        const c = Number(m.total_cost);
        if (m.movement_type === "purchase_return") {
          agg[pid].qty -= q;
          agg[pid].cost -= c;
        } else {
          agg[pid].qty += q;
          agg[pid].cost += c;
        }
      });
      const result: Record<string, number> = {};
      Object.entries(agg).forEach(([pid, { qty, cost }]) => {
        result[pid] = qty > 0 ? cost / qty : 0;
      });
      return result;
    },
  });

  // helper: WAC للمنتج (بديل آمن: سعر الشراء الأخير لو لا توجد حركات)
  const getWac = (p: any) => {
    const w = wacMap[p.id];
    return typeof w === "number" && w > 0 ? w : Number(p.purchase_price ?? 0);
  };

  // ── Movement KPIs ──
  const movementKpi = useMemo(() => {
    const inTypes = [
      "purchase",
      "sale_return",
      "opening_balance",
      "adjustment",
    ];
    const outTypes = ["sale", "purchase_return"];
    const inMov = movements.filter(
      (m) => inTypes.includes(m.movement_type) && Number(m.quantity) > 0,
    );
    const outMov = movements.filter(
      (m) =>
        outTypes.includes(m.movement_type) ||
        (m.movement_type === "adjustment" && Number(m.quantity) < 0),
    );
    const inQty = inMov.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);
    const inValue = inMov.reduce(
      (s, m) => s + Math.abs(Number(m.total_cost)),
      0,
    );
    const outQty = outMov.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0);
    const outValue = outMov.reduce(
      (s, m) => s + Math.abs(Number(m.total_cost)),
      0,
    );
    return {
      count: movements.length,
      inQty,
      inValue,
      outQty,
      outValue,
      netQty: inQty - outQty,
      netValue: inValue - outValue,
    };
  }, [movements]);

  const prevMovementKpi = useMemo(() => {
    const inTypes = [
      "purchase",
      "sale_return",
      "opening_balance",
      "adjustment",
    ];
    const outTypes = ["sale", "purchase_return"];
    const inMov = prevMovements.filter(
      (m) => inTypes.includes(m.movement_type) && Number(m.quantity) > 0,
    );
    const outMov = prevMovements.filter(
      (m) =>
        outTypes.includes(m.movement_type) ||
        (m.movement_type === "adjustment" && Number(m.quantity) < 0),
    );
    return {
      count: prevMovements.length,
      inQty: inMov.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
      inValue: inMov.reduce((s, m) => s + Math.abs(Number(m.total_cost)), 0),
      outQty: outMov.reduce((s, m) => s + Math.abs(Number(m.quantity)), 0),
      outValue: outMov.reduce((s, m) => s + Math.abs(Number(m.total_cost)), 0),
    };
  }, [prevMovements]);

  const GrowthBadge = ({
    current,
    previous,
    invert,
  }: {
    current: number;
    previous: number;
    invert?: boolean;
  }) => {
    if (isLoading) return null;
    const g = calcGrowth(current, previous);
    if (previous === 0 && current === 0) return null;
    const positive = invert ? g <= 0 : g >= 0;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${positive ? "text-emerald-600" : "text-amber-600"}`}
      >
        {g >= 0 ? (
          <TrendingUp className="w-3 h-3" />
        ) : (
          <TrendingDown className="w-3 h-3" />
        )}
        {g >= 0 ? "+" : ""}
        {g.toFixed(1)}%
      </span>
    );
  };

  // ── Movement time series ──
  const movementTimeData = useMemo(() => {
    const map: Record<
      string,
      { key: string; label: string; وارد: number; صادر: number }
    > = {};
    movements.forEach((m) => {
      const key =
        timeMode === "daily"
          ? m.movement_date
          : m.movement_date?.substring(0, 7);
      if (!key) return;
      const label =
        timeMode === "daily"
          ? key
          : (() => {
              const [y, mo] = key.split("-");
              const months = [
                "يناير",
                "فبراير",
                "مارس",
                "أبريل",
                "مايو",
                "يونيو",
                "يوليو",
                "أغسطس",
                "سبتمبر",
                "أكتوبر",
                "نوفمبر",
                "ديسمبر",
              ];
              return `${months[parseInt(mo) - 1]} ${y}`;
            })();
      if (!map[key]) map[key] = { key, label, وارد: 0, صادر: 0 };
      const qty = Math.abs(Number(m.quantity));
      const inTypes = ["purchase", "sale_return", "opening_balance"];
      const outTypes = ["sale", "purchase_return"];
      if (
        inTypes.includes(m.movement_type) ||
        (m.movement_type === "adjustment" && Number(m.quantity) > 0)
      ) {
        map[key].وارد += qty;
      } else if (
        outTypes.includes(m.movement_type) ||
        (m.movement_type === "adjustment" && Number(m.quantity) < 0)
      ) {
        map[key].صادر += qty;
      }
    });
    return Object.values(map)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({ ...d, صافي: d.وارد - d.صادر }));
  }, [movements, timeMode]);

  // ── Pie data for category stock distribution (WAC-based) ──
  const categoryPieData = useMemo(() => {
    const map: Record<string, number> = {};
    products
      .filter((p) => p.is_active)
      .forEach((p) => {
        const cat = p.product_categories?.name || "بدون تصنيف";
        map[cat] =
          (map[cat] || 0) + Number(p.quantity_on_hand) * getWac(p);
      });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const top5 = sorted.slice(0, 5).map(([name, value]) => ({ name, value }));
    const restValue = sorted.slice(5).reduce((s, [, v]) => s + v, 0);
    if (restValue > 0) top5.push({ name: "أخرى", value: restValue });
    return top5;
  }, [products, wacMap]);

  // ── Filtered products ──
  const filtered = useMemo(() => {
    let list = products;
    if (stockFilter === "low")
      list = list.filter(
        (p) =>
          p.is_active &&
          Number(p.quantity_on_hand) > 0 &&
          Number(p.quantity_on_hand) <= Number(p.min_stock_level),
      );
    else if (stockFilter === "zero")
      list = list.filter((p) => Number(p.quantity_on_hand) === 0);
    else if (stockFilter === "active") list = list.filter((p) => p.is_active);
    return list;
  }, [products, stockFilter]);

  // ── KPI (always from all active products) ──
  const kpi = useMemo(() => {
    const active = products.filter((p) => p.is_active);
    const totalItems = active.length;
    const totalQty = active.reduce((s, p) => s + Number(p.quantity_on_hand), 0);
    const purchaseValue = active.reduce(
      (s, p) => s + Number(p.quantity_on_hand) * getWac(p),
      0,
    );
    const sellingValue = active.reduce(
      (s, p) => s + Number(p.quantity_on_hand) * Number(p.selling_price ?? 0),
      0,
    );
    const expectedProfit = sellingValue - purchaseValue;
    const lowStock = active.filter(
      (p) =>
        Number(p.quantity_on_hand) <= Number(p.min_stock_level) &&
        Number(p.quantity_on_hand) > 0,
    ).length;
    const zeroStock = active.filter(
      (p) => Number(p.quantity_on_hand) === 0,
    ).length;
    return {
      totalItems,
      totalQty,
      purchaseValue,
      sellingValue,
      expectedProfit,
      lowStock,
      zeroStock,
    };
  }, [products, wacMap]);

  // ═══ GROUPING: By Product (default) ═══
  const productColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "code",
        header: "الكود",
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      {
        id: "name",
        header: "المنتج",
        accessorFn: (r: any) =>
          formatProductDisplay(r.name, r.product_brands?.name, r.model_number),
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
          return (
            <span
              className={
                isZero
                  ? "text-destructive font-bold"
                  : isLow
                    ? "text-amber-600 font-medium"
                    : ""
              }
            >
              {qty}
            </span>
          );
        },
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + Number(r.original.quantity_on_hand), 0);
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
        header: "سعر الشراء",
        accessorFn: (r: any) => Number(r.purchase_price),
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
        accessorFn: (r: any) => Number(r.quantity_on_hand) * getWac(r),
        cell: ({ getValue }) => (
          <span className="font-mono">{fmt(getValue() as number)}</span>
        ),
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce(
              (s, r) =>
                s + Number(r.original.quantity_on_hand) * getWac(r.original),
              0,
            );
          return <span className="font-bold font-mono">{fmt(total)}</span>;
        },
      },
      {
        id: "margin",
        header: "الهامش%",
        accessorFn: (r: any) => {
          const sell = Number(r.selling_price);
          const buy = Number(r.purchase_price);
          return sell > 0 ? ((sell - buy) / sell) * 100 : 0;
        },
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span
              className={`font-mono ${v >= 20 ? "text-emerald-600" : v >= 0 ? "text-amber-600" : "text-destructive"}`}
            >
              {v.toFixed(1)}%
            </span>
          );
        },
      },
      {
        id: "status",
        header: "الحالة",
        cell: ({ row }) => {
          const qty = Number(row.original.quantity_on_hand);
          const min = Number(row.original.min_stock_level);
          if (qty === 0) return <Badge variant="destructive">نفد</Badge>;
          if (qty <= min)
            return (
              <Badge
                variant="outline"
                className="border-amber-500 text-amber-600"
              >
                منخفض
              </Badge>
            );
          return <Badge variant="secondary">طبيعي</Badge>;
        },
      },
    ],
    [],
  );

  // ═══ GROUPING: By Category ═══
  const categoryData = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        count: number;
        qty: number;
        purchaseValue: number;
        sellingValue: number;
        lowCount: number;
      }
    > = {};
    filtered.forEach((p) => {
      const cat = p.product_categories?.name || "بدون تصنيف";
      if (!map[cat])
        map[cat] = {
          name: cat,
          count: 0,
          qty: 0,
          purchaseValue: 0,
          sellingValue: 0,
          lowCount: 0,
        };
      map[cat].count++;
      map[cat].qty += Number(p.quantity_on_hand);
      map[cat].purchaseValue +=
        Number(p.quantity_on_hand) * getWac(p);
      map[cat].sellingValue +=
        Number(p.quantity_on_hand) * Number(p.selling_price ?? 0);
      if (
        Number(p.quantity_on_hand) <= Number(p.min_stock_level) &&
        p.is_active
      )
        map[cat].lowCount++;
    });
    return Object.values(map).sort((a, b) => b.purchaseValue - a.purchaseValue);
  }, [filtered, wacMap]);

  const categoryColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "التصنيف",
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      {
        accessorKey: "count",
        header: "عدد الأصناف",
        footer: ({ table }) => (
          <span className="font-bold">
            {table
              .getFilteredRowModel()
              .rows.reduce((s, r) => s + r.original.count, 0)}
          </span>
        ),
      },
      {
        accessorKey: "qty",
        header: "إجمالي الكمية",
        footer: ({ table }) => (
          <span className="font-bold">
            {table
              .getFilteredRowModel()
              .rows.reduce((s, r) => s + r.original.qty, 0)}
          </span>
        ),
      },
      {
        accessorKey: "purchaseValue",
        header: "قيمة المخزون (شراء)",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.purchaseValue, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "sellingValue",
        header: "قيمة المخزون (بيع)",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.sellingValue, 0),
            )}
          </span>
        ),
      },
      {
        id: "profit",
        header: "الربح المتوقع",
        accessorFn: (r: any) => r.sellingValue - r.purchaseValue,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className={v >= 0 ? "text-emerald-600" : "text-destructive"}>
              {fmt(v)}
            </span>
          );
        },
        footer: ({ table }) => {
          const t = table
            .getFilteredRowModel()
            .rows.reduce(
              (s, r) => s + r.original.sellingValue - r.original.purchaseValue,
              0,
            );
          return (
            <span
              className={`font-bold font-mono ${t >= 0 ? "text-emerald-600" : "text-destructive"}`}
            >
              {fmt(t)}
            </span>
          );
        },
      },
      {
        accessorKey: "lowCount",
        header: "أصناف منخفضة",
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return v > 0 ? (
            <span className="text-destructive font-medium">{v}</span>
          ) : (
            <span>0</span>
          );
        },
        footer: ({ table }) => {
          const t = table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.lowCount, 0);
          return <span className="text-destructive font-bold">{t}</span>;
        },
      },
    ],
    [],
  );

  // ═══ GROUPING: By Brand ═══
  const brandData = useMemo(() => {
    const map: Record<
      string,
      {
        name: string;
        count: number;
        qty: number;
        purchaseValue: number;
        sellingValue: number;
        lowCount: number;
      }
    > = {};
    filtered.forEach((p) => {
      const brand = p.product_brands?.name || "بدون ماركة";
      if (!map[brand])
        map[brand] = {
          name: brand,
          count: 0,
          qty: 0,
          purchaseValue: 0,
          sellingValue: 0,
          lowCount: 0,
        };
      map[brand].count++;
      map[brand].qty += Number(p.quantity_on_hand);
      map[brand].purchaseValue +=
        Number(p.quantity_on_hand) * getWac(p);
      map[brand].sellingValue +=
        Number(p.quantity_on_hand) * Number(p.selling_price ?? 0);
      if (
        Number(p.quantity_on_hand) <= Number(p.min_stock_level) &&
        p.is_active
      )
        map[brand].lowCount++;
    });
    return Object.values(map).sort((a, b) => b.purchaseValue - a.purchaseValue);
  }, [filtered, wacMap]);

  // Brand uses same columns as category
  const brandColumns = categoryColumns;

  // ── Chart data ──
  const chartData = useMemo(() => {
    if (groupBy === "product") {
      return [...filtered]
        .sort(
          (a, b) =>
            Number(b.quantity_on_hand) * getWac(b) -
            Number(a.quantity_on_hand) * getWac(a),
        )
        .slice(0, 10)
        .map((p) => ({
          name: p.name.length > 14 ? p.name.substring(0, 14) + "…" : p.name,
          "قيمة المخزون": Number(p.quantity_on_hand) * getWac(p),
        }));
    }
    const data = groupBy === "category" ? categoryData : brandData;
    return data.slice(0, 10).map((d) => ({
      name: d.name.length > 14 ? d.name.substring(0, 14) + "…" : d.name,
      "قيمة المخزون": d.purchaseValue,
    }));
  }, [groupBy, filtered, categoryData, brandData, wacMap]);

  // ── Extra KPIs ──
  const extraKpi = useMemo(() => {
    const active = products.filter((p) => p.is_active);
    const margins = active.map((p) => {
      const sell = Number(p.selling_price);
      const buy = Number(p.purchase_price);
      return sell > 0 ? ((sell - buy) / sell) * 100 : 0;
    });
    const avgMargin =
      margins.length > 0
        ? margins.reduce((s, m) => s + m, 0) / margins.length
        : 0;
    const normal = active.filter(
      (p) => Number(p.quantity_on_hand) > Number(p.min_stock_level),
    ).length;
    const healthRatio = active.length > 0 ? (normal / active.length) * 100 : 0;
    return { avgMargin, healthRatio };
  }, [products]);

  // ── Export config ──
  const exportConfig = useMemo(() => {
    const summaryCards = [
      { label: "عدد الأصناف", value: String(kpi.totalItems) },
      { label: "قيمة المخزون (شراء)", value: fmt(kpi.purchaseValue) },
      { label: "قيمة المخزون (بيع)", value: fmt(kpi.sellingValue) },
      { label: "أصناف منخفضة", value: String(kpi.lowStock) },
      { label: "أصناف نافدة", value: String(kpi.zeroStock) },
      { label: "متوسط الهامش%", value: extraKpi.avgMargin.toFixed(1) + "%" },
      {
        label: `الوارد (${dateFrom} - ${dateTo})`,
        value: fmt(movementKpi.inValue),
      },
      {
        label: `الصادر (${dateFrom} - ${dateTo})`,
        value: fmt(movementKpi.outValue),
      },
    ];

    if (groupBy === "product") {
      return {
        filenamePrefix: "تقرير-المخزون",
        sheetName: "المخزون",
        pdfTitle: "تقرير المخزون",
        headers: [
          "الكود",
          "المنتج",
          "التصنيف",
          "الكمية",
          "الحد الأدنى",
          "سعر الشراء",
          "سعر البيع",
          "قيمة المخزون",
          "الهامش%",
          "الحالة",
        ],
        rows: filtered.map((p: any) => {
          const qty = Number(p.quantity_on_hand);
          const min = Number(p.min_stock_level);
          const sell = Number(p.selling_price);
          const buy = Number(p.purchase_price);
          const wac = getWac(p);
          const margin =
            sell > 0 ? (((sell - buy) / sell) * 100).toFixed(1) + "%" : "0%";
          return [
            p.code,
            formatProductDisplay(
              p.name,
              p.product_brands?.name,
              p.model_number,
            ),
            p.product_categories?.name || "بدون تصنيف",
            qty,
            min,
            buy,
            sell,
            qty * wac,
            margin,
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
      headers: [
        label,
        "عدد الأصناف",
        "إجمالي الكمية",
        "قيمة (شراء)",
        "قيمة (بيع)",
        "الربح المتوقع",
        "أصناف منخفضة",
      ],
      rows: data.map((d) => [
        d.name,
        d.count,
        d.qty,
        d.purchaseValue,
        d.sellingValue,
        d.sellingValue - d.purchaseValue,
        d.lowCount,
      ]),
      summaryCards,
      settings,
      pdfOrientation: "landscape" as const,
    };
  }, [
    groupBy,
    filtered,
    categoryData,
    brandData,
    kpi,
    settings,
    extraKpi,
    dateFrom,
    dateTo,
    movementKpi,
  ]);

  return (
    <div className="space-y-5 p-1">
      {/* ── Filters ── */}
      <Card className="border shadow-sm">
        <CardContent className="py-3 px-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <div className="flex items-center gap-2">
                <DatePickerInput
                  value={dateFrom}
                  onChange={setDateFrom}
                  placeholder="من تاريخ"
                  className="w-[140px]"
                />
                <span className="text-muted-foreground/30">—</span>
                <DatePickerInput
                  value={dateTo}
                  onChange={setDateTo}
                  placeholder="إلى تاريخ"
                  className="w-[140px]"
                />
              </div>

              <div className="h-7 w-px bg-border/60 hidden md:block" />

              {/* Stock Filter */}
              <Select
                value={stockFilter}
                onValueChange={(v: any) => setStockFilter(v)}
              >
                <SelectTrigger className="w-[140px] font-medium h-9">
                  <SelectValue />
                </SelectTrigger>
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
                <SelectTrigger className="w-[140px] font-medium h-9">
                  <SelectValue />
                </SelectTrigger>
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
          {/* Quick date presets */}
          <div className="flex flex-wrap gap-1.5">
            {quickRanges.map((r) => (
              <Button
                key={r.label}
                variant={
                  dateFrom === r.from && dateTo === r.to ? "default" : "outline"
                }
                size="sm"
                className="h-7 text-xs px-2.5"
                onClick={() => {
                  setDateFrom(r.from);
                  setDateTo(r.to);
                }}
              >
                {r.label}
              </Button>
            ))}
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  عدد الأصناف النشطة
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums">
                    {kpi.totalItems}
                  </p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  قيمة المخزون (شراء)
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums truncate">
                    {fmt(kpi.purchaseValue)}
                  </p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  قيمة المخزون (بيع)
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums truncate">
                    {fmt(kpi.sellingValue)}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* الربح المتوقع */}
        <Card className="relative overflow-hidden border shadow-sm hover:shadow-md transition-shadow">
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                kpi.expectedProfit >= 0
                  ? "linear-gradient(135deg, hsl(152 60% 42% / 0.06) 0%, transparent 60%)"
                  : "linear-gradient(135deg, hsl(0 72% 51% / 0.06) 0%, transparent 60%)",
            }}
          />
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 shadow-inner"
                style={{
                  background:
                    kpi.expectedProfit >= 0
                      ? "hsl(152 60% 42% / 0.12)"
                      : "hsl(0 72% 51% / 0.12)",
                }}
              >
                <TrendingUp
                  className="w-5 h-5"
                  style={{
                    color:
                      kpi.expectedProfit >= 0
                        ? "hsl(152, 60%, 42%)"
                        : "hsl(0, 72%, 51%)",
                  }}
                />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  الربح المتوقع
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p
                    className={`text-2xl font-extrabold tracking-tight tabular-nums truncate ${kpi.expectedProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                  >
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  أصناف منخفضة
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums text-amber-600">
                    {kpi.lowStock}
                  </p>
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
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  أصناف نافدة
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-12" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums text-destructive">
                    {kpi.zeroStock}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Movement KPI Row ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowDown className="w-4 h-4 text-emerald-600" />
              <p className="text-xs font-medium text-muted-foreground">
                إجمالي الوارد
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <p className="text-lg font-bold tabular-nums">
                  {fmt(movementKpi.inValue)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {movementKpi.inQty} وحدة
                </p>
                <GrowthBadge
                  current={movementKpi.inValue}
                  previous={prevMovementKpi.inValue}
                />
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUp className="w-4 h-4 text-blue-500" />
              <p className="text-xs font-medium text-muted-foreground">
                إجمالي الصادر
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <p className="text-lg font-bold tabular-nums">
                  {fmt(movementKpi.outValue)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {movementKpi.outQty} وحدة
                </p>
                <GrowthBadge
                  current={movementKpi.outValue}
                  previous={prevMovementKpi.outValue}
                />
              </>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <ArrowUpDown className="w-4 h-4 text-violet-500" />
              <p className="text-xs font-medium text-muted-foreground">
                صافي الحركة
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p
                className={`text-lg font-bold tabular-nums ${movementKpi.netValue >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {fmt(movementKpi.netValue)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-4 h-4 text-primary" />
              <p className="text-xs font-medium text-muted-foreground">
                عدد الحركات
              </p>
            </div>
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <>
                <p className="text-lg font-bold tabular-nums">
                  {movementKpi.count}
                </p>
                <GrowthBadge
                  current={movementKpi.count}
                  previous={prevMovementKpi.count}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Secondary KPI strip ── */}
      <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              متوسط الهامش%
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p
                className={`text-lg font-bold tabular-nums ${extraKpi.avgMargin >= 20 ? "text-emerald-600" : extraKpi.avgMargin >= 0 ? "text-amber-600" : "text-destructive"}`}
              >
                {extraKpi.avgMargin.toFixed(1)}%
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="pt-4 pb-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              نسبة المخزون السليم
            </p>
            {isLoading ? (
              <Skeleton className="h-6 w-16" />
            ) : (
              <p
                className={`text-lg font-bold tabular-nums ${extraKpi.healthRatio >= 70 ? "text-emerald-600" : "text-amber-600"}`}
              >
                {extraKpi.healthRatio.toFixed(1)}%
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Quick Links to Related Reports ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card
          className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => navigate("/reports/inventory-turnover")}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                    تقرير دوران المخزون
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ABC تصنيف • معدل الدوران • أيام التغطية • توصيات الإجراء
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </CardContent>
        </Card>
        <Card
          className="border shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          onClick={() => navigate("/reports/product-analytics")}
        >
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                  <PieChartIcon className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold group-hover:text-primary transition-colors">
                    تحليل المنتجات
                  </p>
                  <p className="text-xs text-muted-foreground">
                    الربحية • الأكثر مبيعاً • تحليل المرتجعات • المنتجات الراكدة
                  </p>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Movement Activity Chart ── */}
      {movementTimeData.length > 0 && (
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">حركة المخزون خلال الفترة</p>
              <ToggleGroup
                type="single"
                value={timeMode}
                onValueChange={(v) => v && setTimeMode(v as any)}
                size="sm"
              >
                <ToggleGroupItem value="daily" className="text-xs px-2.5 h-7">
                  يومي
                </ToggleGroupItem>
                <ToggleGroupItem value="monthly" className="text-xs px-2.5 h-7">
                  شهري
                </ToggleGroupItem>
              </ToggleGroup>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={movementTimeData}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                />
                <XAxis
                  dataKey="label"
                  fontSize={11}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis fontSize={11} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar
                  dataKey="وارد"
                  fill="#22c55e"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
                <Bar
                  dataKey="صادر"
                  fill="#3b82f6"
                  radius={[4, 4, 0, 0]}
                  barSize={28}
                />
                <Line
                  type="monotone"
                  dataKey="صافي"
                  stroke="#a855f7"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ── Stock Value Chart ── */}
      {chartData.length > 0 && (
        <div
          className={
            groupBy === "category" && categoryPieData.length > 0
              ? "grid grid-cols-1 md:grid-cols-2 gap-4"
              : ""
          }
        >
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm font-semibold mb-2">
                أعلى 10 حسب قيمة المخزون
              </p>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} layout="vertical" barSize={20}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                    horizontal
                  />
                  <XAxis
                    type="number"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="name"
                    type="category"
                    fontSize={11}
                    axisLine={false}
                    tickLine={false}
                    width={110}
                  />
                  <Tooltip
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      fontSize: "12px",
                    }}
                  />
                  <Bar
                    dataKey="قيمة المخزون"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {groupBy === "category" && categoryPieData.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm font-semibold mb-2">
                  توزيع قيمة المخزون بالتصنيف
                </p>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                      fontSize={11}
                    >
                      {categoryPieData.map((_, i) => (
                        <Cell
                          key={i}
                          fill={CHART_COLORS[i % CHART_COLORS.length]}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        fontSize: "12px",
                      }}
                      formatter={(v: number) => fmt(v)}
                    />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
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
