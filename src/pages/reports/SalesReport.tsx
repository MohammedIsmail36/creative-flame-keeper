import { useCallback, useState, useMemo } from "react";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getQuickDateRanges, getPreviousPeriod } from "@/lib/report-period";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/DatePickerInput";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ColumnDef } from "@tanstack/react-table";
import {
  format,
  startOfMonth,
  endOfMonth,
  subMonths,
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
  TrendingUp,
  TrendingDown,
  Percent,
  AlertTriangle,
  Target,
  ChevronDown,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { formatProductDisplay } from "@/lib/product-utils";
import { fetchAllPaged } from "@/lib/paged-fetch";
import {
  computeSalesReportMetrics,
  getDocumentAmountExcludingTax,
  getSalesLineNetAmount,
} from "@/lib/sales-report-metrics";
import { groupSalesAndReturns } from "@/lib/sales-report-grouping";
import {
  computeInvoiceCoverage,
  type InvoicePaymentAllocation,
  type InvoiceReturnSettlement,
} from "@/lib/sales-report-collections";

// ── helpers ──
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
const FLAT_ACTION_CLASS =
  "h-9 gap-2 rounded-lg border-0 bg-muted/50 px-3 text-xs font-medium text-foreground shadow-none hover:bg-muted hover:text-foreground";
const FLAT_SEGMENT_CLASS =
  "h-8 rounded-md px-3 text-xs text-muted-foreground shadow-none hover:bg-primary/10 hover:text-primary data-[state=on]:!bg-primary/15 data-[state=on]:!text-primary";
const formatPeriodDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
};

export default function SalesReport() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const LS_KEY = "sales-report-prefs-v1";
  const savedPrefs = (() => {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  })();
  const [dateFrom, setDateFrom] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [statusFilter, setStatusFilter] = useState<
    "all" | "posted" | "draft" | "cancelled"
  >(savedPrefs.statusFilter ?? "posted");
  const [groupBy, setGroupBy] = useState<
    "invoice" | "return" | "customer" | "product" | "time" | "category"
  >(savedPrefs.groupBy ?? "invoice");
  const [timeMode, setTimeMode] = useState<"daily" | "monthly">(
    savedPrefs.timeMode ?? "daily",
  );
  // Secondary indicators start collapsed on every report visit to preserve focus.
  const [showExtras, setShowExtras] = useState(false);
  const [showCoverage, setShowCoverage] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [invoiceSort, setInvoiceSort] = useState<SortingState>([]);
  const [productSort, setProductSort] = useState<SortingState>([]);
  const [invoiceColumnVisibility, setInvoiceColumnVisibility] =
    useState<VisibilityState>({
      cashCollected: false,
      returnSettled: false,
      cogs: false,
      margin: false,
    });
  const [returnColumnVisibility, setReturnColumnVisibility] =
    useState<VisibilityState>({ itemsCount: false, documentType: false });
  const [customerColumnVisibility, setCustomerColumnVisibility] =
    useState<VisibilityState>({
      invoiceGrossTotal: false,
      cashCollected: false,
      returnSettled: false,
      remaining: false,
      collection: false,
    });
  const [productColumnVisibility, setProductColumnVisibility] =
    useState<VisibilityState>({
      qtySold: false,
      qtyReturned: false,
      cogs: false,
    });
  const [categoryColumnVisibility, setCategoryColumnVisibility] =
    useState<VisibilityState>({
      qtySold: false,
      qtyReturned: false,
      revenue: false,
      returns: false,
      returnRate: false,
    });
  const [timeColumnVisibility, setTimeColumnVisibility] =
    useState<VisibilityState>({
      aov: false,
      returnRate: false,
      margin: false,
    });

  // Quick sort toolbar (next to search) — sorts by profit or margin
  const QuickSortToolbar = ({
    sorting,
    setSorting,
  }: {
    sorting: SortingState;
    setSorting: (s: SortingState) => void;
  }) => {
    const active = sorting[0];
    const toggle = (id: "profit" | "margin") => {
      if (active?.id !== id) setSorting([{ id, desc: true }]);
      else if (active.desc) setSorting([{ id, desc: false }]);
      else setSorting([]);
    };
    const renderBtn = (id: "profit" | "margin", label: string) => {
      const isActive = active?.id === id;
      const Icon = isActive && !active.desc ? ArrowUp : ArrowDown;
      return (
        <Button
          key={id}
          variant={isActive ? "default" : "outline"}
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => toggle(id)}
        >
          <Icon className="h-3 w-3" />
          {label}
        </Button>
      );
    };
    return (
      <div className="flex items-center gap-1.5">
        {renderBtn("profit", "الربح")}
        {renderBtn("margin", "الهامش%")}
      </div>
    );
  };



  // Persist prefs
  useMemo(() => {
    try {
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ statusFilter, groupBy, timeMode }),
      );
    } catch {}
    return null;
  }, [statusFilter, groupBy, timeMode]);

  // ── Quick date presets (طبقة مشتركة) ──
  const quickRanges = useMemo(() => getQuickDateRanges(), []);

  // ── Previous period calculation (طبقة مشتركة) ──
  const prevPeriod = useMemo(
    () => getPreviousPeriod(dateFrom, dateTo),
    [dateFrom, dateTo],
  );

  const calcGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  };

  // ── Query 1: Invoices ──
  const invoicesQuery = useQuery({
    queryKey: ["sr-invoices", dateFrom, dateTo],
    queryFn: () =>
      fetchAllPaged<any>(
        () =>
          supabase
            .from("sales_invoices")
            .select(
              "id, invoice_number, posted_number, invoice_date, due_date, status, subtotal, discount, tax, total, customer_id, customer:customers(name), items:sales_invoice_items(description, quantity, total, net_total, product_id, product:products(name, model_number, category_id, category:product_categories(name), brand:product_brands(name)))",
              { count: "exact" },
            )
            .gte("invoice_date", dateFrom)
            .lte("invoice_date", dateTo)
            .order("invoice_date", { ascending: false })
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const invoices = invoicesQuery.data ?? [];

  // ── Query 2: Returns ──
  const returnsQuery = useQuery({
    queryKey: ["sr-returns", dateFrom, dateTo],
    queryFn: () =>
      fetchAllPaged<any>(
        () =>
          supabase
            .from("sales_returns")
            .select(
              "id, return_number, posted_number, reference, return_date, total, tax, status, customer_id, customer:customers(name), items:sales_return_items(description, quantity, total, net_total, product_id, product:products(name, model_number, category_id, category:product_categories(name), brand:product_brands(name)))",
              { count: "exact" },
            )
            .eq("status", "posted")
            .gte("return_date", dateFrom)
            .lte("return_date", dateTo)
            .order("return_date", { ascending: false })
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const returns = returnsQuery.data ?? [];

  // ── Query 3: COGS from inventory_movements ──
  const movementsQuery = useQuery({
    queryKey: ["sr-cogs", dateFrom, dateTo],
    queryFn: () =>
      fetchAllPaged<any>(
        () =>
          supabase
            .from("inventory_movements")
            .select(
              "id, product_id, movement_type, quantity, total_cost, movement_date, reference_id, reference_type",
              { count: "exact" },
            )
            .in("movement_type", ["sale", "sale_return"])
            .gte("movement_date", dateFrom)
            .lte("movement_date", dateTo)
            .order("movement_date", { ascending: false })
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const movements = movementsQuery.data ?? [];

  // ── Query 4: Cash allocations to invoices in the selected invoice period ──
  const paymentAllocationsQuery = useQuery({
    queryKey: ["sr-payment-allocations", dateFrom, dateTo],
    queryFn: () =>
      fetchAllPaged<InvoicePaymentAllocation>(
        () =>
          supabase
            .from("customer_payment_allocations")
            .select(
              "id, invoice_id, allocated_amount, payment:customer_payments!inner(status), invoice:sales_invoices!inner(status, invoice_date)",
              { count: "exact" },
            )
            .eq("payment.status", "posted")
            .eq("invoice.status", "posted")
            .gte("invoice.invoice_date", dateFrom)
            .lte("invoice.invoice_date", dateTo)
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const paymentAllocations = paymentAllocationsQuery.data ?? [];

  // ── Query 5: Return credits applied to the selected invoices ──
  const returnSettlementsQuery = useQuery({
    queryKey: ["sr-return-settlements", dateFrom, dateTo],
    queryFn: () =>
      fetchAllPaged<InvoiceReturnSettlement>(
        () =>
          supabase
            .from("sales_invoice_return_settlements")
            .select(
              "id, invoice_id, return_id, settled_amount, invoice:sales_invoices!inner(status, invoice_date), sales_return:sales_returns!inner(status)",
              { count: "exact" },
            )
            .eq("invoice.status", "posted")
            .eq("sales_return.status", "posted")
            .gte("invoice.invoice_date", dateFrom)
            .lte("invoice.invoice_date", dateTo)
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const returnSettlements = returnSettlementsQuery.data ?? [];

  // ── Query 6: Previous period (for comparison) ──
  const prevInvoicesQuery = useQuery({
    queryKey: ["sr-prev-invoices", prevPeriod.from, prevPeriod.to],
    queryFn: () =>
      fetchAllPaged<any>(
        () =>
          supabase
            .from("sales_invoices")
            .select("id, status, total, tax", { count: "exact" })
            .eq("status", "posted")
            .gte("invoice_date", prevPeriod.from)
            .lte("invoice_date", prevPeriod.to)
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const prevInvoices = prevInvoicesQuery.data ?? [];

  const prevReturnsQuery = useQuery({
    queryKey: ["sr-prev-returns", prevPeriod.from, prevPeriod.to],
    queryFn: () =>
      fetchAllPaged<any>(
        () =>
          supabase
            .from("sales_returns")
            .select("id, status, total, tax", { count: "exact" })
            .eq("status", "posted")
            .gte("return_date", prevPeriod.from)
            .lte("return_date", prevPeriod.to)
            .order("id", { ascending: true }),
        { batchSize: 500, maxRows: 250000 },
      ),
  });
  const prevReturns = prevReturnsQuery.data ?? [];

  // ── Filtered invoices ──
  const filtered = useMemo(() => {
    if (statusFilter === "all") return invoices;
    return invoices.filter((inv) => inv.status === statusFilter);
  }, [invoices, statusFilter]);

  const isPostedOnly = statusFilter === "posted";

  const invoiceCoverage = useMemo(
    () =>
      computeInvoiceCoverage(invoices, paymentAllocations, returnSettlements),
    [invoices, paymentAllocations, returnSettlements],
  );

  // ── Financial KPI summary (posted documents only) ──
  const kpi = useMemo(() => {
    const metrics = computeSalesReportMetrics({ invoices, returns, movements });

    return {
      count: metrics.invoiceCount,
      grossSales: metrics.salesRevenueExcludingTax,
      returnsTotal: metrics.returnRevenueExcludingTax,
      netSales: metrics.netSalesRevenue,
      grossProfit: metrics.grossProfit,
      grossMarginPercent: metrics.grossMarginPercent,
      invoiceGrossTotal: invoiceCoverage.invoiceGrossTotal,
      cashCollected: invoiceCoverage.cashCollected,
      returnSettled: invoiceCoverage.returnSettled,
      totalCovered: invoiceCoverage.totalCovered,
      cashCollectionRate: invoiceCoverage.cashCollectionRate,
      cogs: metrics.netCogs,
    };
  }, [invoices, returns, movements, invoiceCoverage]);

  // ── Previous period KPIs ──
  const prevKpi = useMemo(() => {
    const metrics = computeSalesReportMetrics({
      invoices: prevInvoices,
      returns: prevReturns,
      movements: [],
    });

    return {
      count: metrics.invoiceCount,
      grossSales: metrics.salesRevenueExcludingTax,
      netSales: metrics.netSalesRevenue,
    };
  }, [prevInvoices, prevReturns]);

  const GrowthBadge = ({
    current,
    previous,
  }: {
    current: number;
    previous: number;
  }) => {
    if (isLoading) return null;
    const g = calcGrowth(current, previous);
    if (previous === 0 && current === 0) return null;
    return (
      <span
        className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${g >= 0 ? "text-emerald-600" : "text-destructive"}`}
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

  // ── Sales target ──
  const targetInfo = useMemo(() => {
    const target = Number(settings?.monthly_sales_target) || 0;
    if (target <= 0) return null;
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const monthsInRange = Math.max(
      1,
      (toDate.getFullYear() - fromDate.getFullYear()) * 12 +
        toDate.getMonth() -
        fromDate.getMonth() +
        1,
    );
    const scaledTarget = target * monthsInRange;
    const pct = scaledTarget > 0 ? (kpi.netSales / scaledTarget) * 100 : 0;
    return { scaledTarget, pct, monthsInRange };
  }, [settings, dateFrom, dateTo, kpi.netSales]);

  // ── Overdue check ──
  const today = format(new Date(), "yyyy-MM-dd");
  const getCoverage = useCallback(
    (invoiceId: string) =>
      invoiceCoverage.byInvoice[invoiceId] ?? {
        cashCollected: 0,
        returnSettled: 0,
        totalCovered: 0,
      },
    [invoiceCoverage],
  );
  const isOverdue = useCallback(
    (inv: any) => {
      const remaining = Number(inv.total) - getCoverage(inv.id).totalCovered;
      return (
        inv.status === "posted" &&
        inv.due_date &&
        inv.due_date < today &&
        remaining > 0
      );
    },
    [getCoverage, today],
  );

  const overdueInfo = useMemo(() => {
    const posted = invoices.filter((i) => i.status === "posted");
    const ov = posted.filter(isOverdue);
    return {
      count: ov.length,
      total: ov.reduce(
        (s, i) => s + Number(i.total) - getCoverage(i.id).totalCovered,
        0,
      ),
    };
  }, [invoices, getCoverage, isOverdue]);

  const discountTaxInfo = useMemo(() => {
    const posted = invoices.filter((i) => i.status === "posted");
    return {
      discount: posted.reduce((s, i) => s + Number(i.discount || 0), 0),
      tax: posted.reduce((s, i) => s + Number(i.tax || 0), 0),
    };
  }, [invoices]);

  // ── COGS per invoice (for invoice grouping profit columns) ──
  const cogsByInvoice = useMemo(() => {
    const map: Record<string, number> = {};
    movements.forEach((m) => {
      if (m.reference_type !== "sales_invoice" || !m.reference_id) return;
      if (m.movement_type !== "sale") return;
      map[m.reference_id] = (map[m.reference_id] || 0) + Number(m.total_cost);
    });
    return map;
  }, [movements]);


  // ═══ GROUPING: By Invoice ═══
  const invoiceColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "invoice_number",
        header: "رقم الفاتورة",
        cell: ({ row }) => {
          const inv = row.original;
          const display = formatDisplayNumber(
            settings?.sales_invoice_prefix || "INV-",
            inv.posted_number,
            inv.invoice_number,
            inv.status,
          );
          return (
            <button
              className="text-primary hover:underline font-mono font-medium"
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/sales/${inv.id}`);
              }}
            >
              {display}
            </button>
          );
        },
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      { accessorKey: "invoice_date", header: "التاريخ" },
      {
        id: "customer",
        header: "العميل",
        accessorFn: (row: any) => row.customer?.name || "عميل نقدي",
      },
      {
        accessorKey: "status",
        header: "الحالة",
        cell: ({ row }) => {
          const s = row.original.status;
          return (
            <Badge
              variant={
                s === "posted"
                  ? "default"
                  : s === "cancelled"
                    ? "destructive"
                    : "secondary"
              }
            >
              {s === "posted" ? "مُرحّل" : s === "cancelled" ? "ملغي" : "مسودة"}
            </Badge>
          );
        },
      },
      {
        id: "total",
        header: "الإجمالي",
        accessorFn: (r: any) => Number(r.total),
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + Number(r.original.total), 0);
          return <span className="font-bold font-mono">{fmt(total)}</span>;
        },
      },
      {
        id: "cashCollected",
        header: "تحصيل نقدي/بنكي",
        accessorFn: (r: any) => getCoverage(r.id).cashCollected,
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce(
              (sum, row) => sum + getCoverage(row.original.id).cashCollected,
              0,
            );
          return <span className="font-mono">{fmt(total)}</span>;
        },
      },
      {
        id: "returnSettled",
        header: "تسوية بمرتجع",
        accessorFn: (r: any) => getCoverage(r.id).returnSettled,
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce(
                  (sum, row) => sum + getCoverage(row.original.id).returnSettled,
                  0,
                ),
            )}
          </span>
        ),
      },
      {
        id: "remaining",
        header: "المتبقي",
        accessorFn: (r: any) => Number(r.total) - getCoverage(r.id).totalCovered,
        cell: ({ getValue, row }) => {
          const v = getValue() as number;
          return (
            <div className="flex items-center gap-1.5">
              <span className={v > 0 ? "text-destructive font-medium" : ""}>
                {fmt(v)}
              </span>
              {isOverdue(row.original) && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  <AlertTriangle className="me-0.5 h-3 w-3" />
                  متأخر
                </Badge>
              )}
            </div>
          );
        },
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce(
              (s, r) =>
                s + Number(r.original.total) - getCoverage(r.original.id).totalCovered,
              0,
            );
          return (
            <span className="font-mono text-destructive">{fmt(total)}</span>
          );
        },
      },
      {
        id: "cogs",
        header: "تكلفة البضاعة",
        accessorFn: (r: any) => cogsByInvoice[r.id] || 0,
        cell: ({ getValue }) => (
          <span className="font-mono">{fmt(getValue() as number)}</span>
        ),
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + (cogsByInvoice[r.original.id] || 0), 0);
          return <span className="font-mono">{fmt(total)}</span>;
        },
      },
      {
        id: "profit",
        header: "الربح قبل المرتجعات المستقلة",
        accessorFn: (r: any) => {
          if (r.status !== "posted") return 0;
          return Number(r.total) - Number(r.tax || 0) - (cogsByInvoice[r.id] || 0);
        },
        cell: ({ row }) => {
          const r = row.original;
          if (r.status !== "posted")
            return <span className="text-muted-foreground">—</span>;
          const v = Number(r.total) - Number(r.tax || 0) - (cogsByInvoice[r.id] || 0);
          return (
            <span
              className={`font-mono ${v < 0 ? "text-destructive" : "text-emerald-600"}`}
            >
              {fmt(v)}
            </span>
          );
        },
        footer: ({ table }) => {
          const total = table
            .getFilteredRowModel()
            .rows.reduce((s, r) => {
              if (r.original.status !== "posted") return s;
              return (
                s +
                Number(r.original.total) -
                Number(r.original.tax || 0) -
                (cogsByInvoice[r.original.id] || 0)
              );
            }, 0);
          return (
            <span className="font-bold font-mono">{fmt(total)}</span>
          );
        },
      },
      {
        id: "margin",
        header: "الهامش%",
        accessorFn: (r: any) => {
          if (r.status !== "posted") return 0;
          const rev = Number(r.total) - Number(r.tax || 0);
          if (rev <= 0) return 0;
          return ((rev - (cogsByInvoice[r.id] || 0)) / rev) * 100;
        },
        cell: ({ row }) => {
          const r = row.original;
          if (r.status !== "posted")
            return <span className="text-muted-foreground">—</span>;
          const cogs = cogsByInvoice[r.id] || 0;
          const rev = Number(r.total) - Number(r.tax || 0);
          if (rev <= 0 || cogs <= 0)
            return (
              <span className="text-muted-foreground" title="لا توجد تكلفة مسجّلة لهذه الفاتورة">
                —
              </span>
            );
          const v = ((rev - cogs) / rev) * 100;
          return <span className="font-mono">{v.toFixed(1)}%</span>;
        },
      },
    ],
    [navigate, cogsByInvoice, getCoverage, isOverdue, settings?.sales_invoice_prefix],
  );

  // ═══ STANDALONE SALES RETURNS ═══
  const returnColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "return_number",
        header: "رقم المرتجع",
        cell: ({ row }) => {
          const ret = row.original;
          const display = formatDisplayNumber(
            settings?.sales_return_prefix || "SRN-",
            ret.posted_number,
            ret.return_number,
            ret.status,
          );
          return (
            <button
              className="text-primary hover:underline font-mono font-medium"
              onClick={(event) => {
                event.stopPropagation();
                navigate(`/sales-returns/${ret.id}`);
              }}
            >
              {display}
            </button>
          );
        },
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      { accessorKey: "return_date", header: "التاريخ" },
      {
        id: "customer",
        header: "العميل",
        accessorFn: (row: any) => row.customer?.name || "عميل نقدي",
      },
      {
        id: "itemsCount",
        header: "عدد البنود",
        accessorFn: (row: any) => (row.items || []).length,
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((sum, row) => sum + (row.original.items || []).length, 0),
      },
      {
        id: "amountExcludingTax",
        header: "المرتجع قبل الضريبة",
        accessorFn: (row: any) => getDocumentAmountExcludingTax(row),
        cell: ({ getValue }) => (
          <span className="font-mono text-destructive">
            {fmt(getValue() as number)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="font-bold font-mono text-destructive">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce(
                  (sum, row) =>
                    sum + getDocumentAmountExcludingTax(row.original),
                  0,
                ),
            )}
          </span>
        ),
      },
      {
        id: "documentType",
        header: "النوع",
        cell: () => (
          <Badge variant="outline" className="text-destructive border-destructive/30">
            مستند مستقل
          </Badge>
        ),
      },
    ],
    [navigate, settings?.sales_return_prefix],
  );

  // ═══ GROUPING: By Customer ═══
  const customerData = useMemo(() => {
    type CustomerGroup = {
      name: string;
      count: number;
      total: number;
      invoiceGrossTotal: number;
      cashCollected: number;
      returnSettled: number;
      returns: number;
      returnOnly: boolean;
    };
    const createGroup = (row: any): CustomerGroup => ({
      name: row.customer?.name || "عميل نقدي",
      count: 0,
      total: 0,
      invoiceGrossTotal: 0,
      cashCollected: 0,
      returnSettled: 0,
      returns: 0,
      returnOnly: false,
    });
    const groups = groupSalesAndReturns<any, any, CustomerGroup>(
      filtered,
      returns,
      {
        getSaleKey: (invoice) => invoice.customer_id || "__none__",
        getReturnKey: (salesReturn) => salesReturn.customer_id || "__none__",
        createFromSale: (_key, invoice) => createGroup(invoice),
        createFromReturn: (_key, salesReturn) => createGroup(salesReturn),
        addSale: (group, invoice) => {
          group.count += 1;
          group.total += getDocumentAmountExcludingTax(invoice);
          if (invoice.status === "posted") {
            group.invoiceGrossTotal += Number(invoice.total || 0);
            group.cashCollected += getCoverage(invoice.id).cashCollected;
            group.returnSettled += getCoverage(invoice.id).returnSettled;
          }
        },
        addReturn: (group, salesReturn) => {
          group.returns += getDocumentAmountExcludingTax(salesReturn);
        },
      },
    );

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        returnOnly: group.count === 0 && group.returns > 0,
      }))
      .sort((a, b) => b.total - b.returns - (a.total - a.returns));
  }, [filtered, returns, getCoverage]);

  const customerColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "العميل",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.name}</span>
            {row.original.returnOnly && (
              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                مرتجع فقط
              </Badge>
            )}
          </div>
        ),
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      {
        accessorKey: "count",
        header: "عدد الفواتير",
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.count, 0),
      },
      {
        accessorKey: "total",
        header: "المبيعات قبل الضريبة",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.total, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "returns",
        header: "المرتجعات",
        cell: ({ getValue }) => (
          <span className="text-destructive">{fmt(getValue() as number)}</span>
        ),
        footer: ({ table }) => (
          <span className="text-destructive font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.returns, 0),
            )}
          </span>
        ),
      },
      {
        id: "net",
        header: "الصافي",
        accessorFn: (r: any) => r.total - r.returns,
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce(
                  (s, r) => s + r.original.total - r.original.returns,
                  0,
                ),
            )}
          </span>
        ),
      },
      {
        accessorKey: "invoiceGrossTotal",
        header: "الفواتير شامل الضريبة",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.invoiceGrossTotal, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "cashCollected",
        header: "تحصيل نقدي/بنكي",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.cashCollected, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "returnSettled",
        header: "تسوية بمرتجع",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.returnSettled, 0),
            )}
          </span>
        ),
      },
      {
        id: "remaining",
        header: "المتبقي",
        accessorFn: (r: any) =>
          r.invoiceGrossTotal - r.cashCollected - r.returnSettled,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className={v > 0 ? "text-destructive" : ""}>{fmt(v)}</span>
          );
        },
        footer: ({ table }) => {
          const t = table
            .getFilteredRowModel()
            .rows.reduce(
              (s, r) =>
                s +
                r.original.invoiceGrossTotal -
                r.original.cashCollected -
                r.original.returnSettled,
              0,
            );
          return <span className="text-destructive font-mono">{fmt(t)}</span>;
        },
      },
      {
        id: "collection",
        header: "التحصيل النقدي%",
        accessorFn: (r: any) => {
          return r.invoiceGrossTotal > 0
            ? (r.cashCollected / r.invoiceGrossTotal) * 100
            : null;
        },
        cell: ({ getValue }) => {
          const value = getValue() as number | null;
          return (
            <span className="font-mono">
              {value === null ? "—" : `${value.toFixed(1)}%`}
            </span>
          );
        },
      },
    ],
    [],
  );

  // ═══ GROUPING: By Product ═══
  const productData = useMemo(() => {
    const cogsByProduct: Record<string, number> = {};
    movements.forEach((m) => {
      const pid = m.product_id;
      if (!pid) return;
      if (!cogsByProduct[pid]) cogsByProduct[pid] = 0;
      if (m.movement_type === "sale")
        cogsByProduct[pid] += Number(m.total_cost);
      else if (m.movement_type === "sale_return")
        cogsByProduct[pid] -= Number(m.total_cost);
    });
    type ProductGroup = {
      id: string;
      name: string;
      qtySold: number;
      qtyReturned: number;
      grossRevenue: number;
      returnsRevenue: number;
      revenue: number;
      cogs: number;
      returnOnly: boolean;
    };
    const salesItems = filtered.flatMap((invoice) => invoice.items || []);
    const returnItems = returns.flatMap((salesReturn) => salesReturn.items || []);
    const itemKey = (item: any) =>
      item.product_id || `__desc__${item.description || "unknown"}`;
    const createGroup = (key: string, item: any): ProductGroup => ({
      id: key,
      name: item.product
        ? formatProductDisplay(
            item.product.name,
            item.product.brand?.name,
            item.product.model_number,
          )
        : item.description || "منتج محذوف",
      qtySold: 0,
      qtyReturned: 0,
      grossRevenue: 0,
      returnsRevenue: 0,
      revenue: 0,
      cogs: 0,
      returnOnly: false,
    });
    const groups = groupSalesAndReturns<any, any, ProductGroup>(
      salesItems,
      returnItems,
      {
        getSaleKey: itemKey,
        getReturnKey: itemKey,
        createFromSale: createGroup,
        createFromReturn: createGroup,
        addSale: (group, item) => {
          group.qtySold += Number(item.quantity || 0);
          group.grossRevenue += getSalesLineNetAmount(item);
        },
        addReturn: (group, item) => {
          group.qtyReturned += Number(item.quantity || 0);
          group.returnsRevenue += getSalesLineNetAmount(item);
        },
      },
    );

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        revenue: group.grossRevenue - group.returnsRevenue,
        cogs: cogsByProduct[group.id] || 0,
        returnOnly: group.grossRevenue === 0 && group.returnsRevenue > 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [filtered, returns, movements]);



  const productColumns = useMemo<ColumnDef<any, any>[]>(
    () => [
      {
        accessorKey: "name",
        header: "المنتج",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.name}</span>
            {row.original.returnOnly && (
              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                مرتجع فقط
              </Badge>
            )}
          </div>
        ),
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      {
        accessorKey: "qtySold",
        header: "الكمية المباعة",
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.qtySold, 0),
      },
      {
        accessorKey: "qtyReturned",
        header: "المرتجع",
        cell: ({ getValue }) => (
          <span className="text-destructive">{getValue() as number}</span>
        ),
        footer: ({ table }) => (
          <span className="text-destructive">
            {table
              .getFilteredRowModel()
              .rows.reduce((s, r) => s + r.original.qtyReturned, 0)}
          </span>
        ),
      },
      {
        id: "netQty",
        header: "صافي الكمية",
        accessorFn: (r: any) => r.qtySold - r.qtyReturned,
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce(
              (s, r) => s + r.original.qtySold - r.original.qtyReturned,
              0,
            ),
      },
      {
        accessorKey: "revenue",
        header: "الإيرادات الصافية",
        cell: ({ row }) => {
          const r = row.original;
          const v = r.revenue;
          return (
            <span
              className="font-mono"
              title={
                r.returnsRevenue > 0
                  ? `الإجمالي: ${fmt(r.grossRevenue)} − المرتجعات: ${fmt(r.returnsRevenue)}`
                  : undefined
              }
            >
              {fmt(v)}
            </span>
          );
        },
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.revenue, 0),
            )}
          </span>
        ),
      },

      {
        accessorKey: "cogs",
        header: "التكلفة",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.cogs, 0),
            )}
          </span>
        ),
      },
      {
        id: "profit",
        header: "الربح",
        accessorFn: (r: any) => r.revenue - r.cogs,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span className={v < 0 ? "text-destructive" : "text-emerald-600"}>
              {fmt(v)}
            </span>
          );
        },
        footer: ({ table }) => {
          const t = table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.revenue - r.original.cogs, 0);
          return <span className="font-bold font-mono">{fmt(t)}</span>;
        },
      },
      {
        id: "margin",
        header: "الهامش%",
        accessorFn: (r: any) =>
          r.revenue > 0 && r.cogs > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : 0,
        cell: ({ row }) => {
          const r = row.original;
          if (!(r.revenue > 0) || !(r.cogs > 0))
            return (
              <span className="text-muted-foreground" title="لا توجد تكلفة مسجّلة لهذا المنتج">
                —
              </span>
            );
          const v = ((r.revenue - r.cogs) / r.revenue) * 100;
          return <span className="font-mono">{v.toFixed(1)}%</span>;
        },
      },

    ],
    [],
  );

  // ── Product → Category map (union of sales and standalone returns) ──
  const productCategoryMap = useMemo(() => {
    const m: Record<string, { id: string; name: string }> = {};
    const documents = [...filtered, ...returns];
    documents.forEach((document) => {
      (document.items || []).forEach((item: any) => {
        if (item.product_id && item.product) {
          m[item.product_id] = {
            id: item.product.category_id || "__none__",
            name: item.product.category?.name || "بدون تصنيف",
          };
        }
      });
    });
    return m;
  }, [filtered, returns]);

  // ── COGS aggregations from movements ──
  const cogsAggregates = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byPeriod: Record<string, number> = {};
    movements.forEach((m) => {
      const sign = m.movement_type === "sale" ? 1 : -1;
      const amt = sign * Number(m.total_cost || 0);
      const cat = productCategoryMap[m.product_id]?.id || "__none__";
      byCategory[cat] = (byCategory[cat] || 0) + amt;
      const key =
        timeMode === "daily"
          ? m.movement_date
          : (m.movement_date || "").substring(0, 7);
      if (key) byPeriod[key] = (byPeriod[key] || 0) + amt;
    });
    return { byCategory, byPeriod };
  }, [movements, productCategoryMap, timeMode]);

  // ═══ GROUPING: By Time ═══
  const timeData = useMemo(() => {
    type TimeGroup = {
      key: string;
      label: string;
      count: number;
      total: number;
      returns: number;
    };
    const periodKey = (date: string | null | undefined) =>
      timeMode === "daily" ? date || "" : date?.substring(0, 7) || "";
    const createGroup = (key: string): TimeGroup => {
      const label =
        timeMode === "daily"
          ? key
          : (() => {
              const [y, m] = key.split("-");
              const months = [
                "يناير","فبراير","مارس","أبريل","مايو","يونيو",
                "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
              ];
              return `${months[parseInt(m) - 1]} ${y}`;
            })();
      return { key, label, count: 0, total: 0, returns: 0 };
    };
    const salesRows = filtered.filter((invoice) => periodKey(invoice.invoice_date));
    const returnRows = returns.filter((salesReturn) => periodKey(salesReturn.return_date));
    const groups = groupSalesAndReturns<any, any, TimeGroup>(
      salesRows,
      returnRows,
      {
        getSaleKey: (invoice) => periodKey(invoice.invoice_date),
        getReturnKey: (salesReturn) => periodKey(salesReturn.return_date),
        createFromSale: (key) => createGroup(key),
        createFromReturn: (key) => createGroup(key),
        addSale: (group, invoice) => {
          group.count += 1;
          group.total += getDocumentAmountExcludingTax(invoice);
        },
        addReturn: (group, salesReturn) => {
          group.returns += getDocumentAmountExcludingTax(salesReturn);
        },
      },
    );
    const sorted = Array.from(groups.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
    // Enrich with derived metrics + period-over-period growth
    return sorted.map((d, i) => {
      const net = d.total - d.returns;
      const cogs = isPostedOnly ? cogsAggregates.byPeriod[d.key] || 0 : 0;
      const profit = isPostedOnly ? net - cogs : 0;
      const margin = isPostedOnly && net > 0 ? (profit / net) * 100 : null;
      const returnRate = d.total > 0 ? (d.returns / d.total) * 100 : null;
      const aov = d.count > 0 ? net / d.count : 0;
      const prevNet = i > 0 ? sorted[i - 1].total - sorted[i - 1].returns : 0;
      const growth =
        i > 0 && prevNet > 0 ? ((net - prevNet) / prevNet) * 100 : null;
      return {
        ...d,
        net,
        cogs,
        profit,
        margin,
        returnRate,
        aov,
        growth,
        returnOnly: d.count === 0 && d.returns > 0,
      };
    });
  }, [filtered, returns, timeMode, cogsAggregates, isPostedOnly]);

  const timeColumns = useMemo<ColumnDef<any, any>[]>(() => {
    const cols: ColumnDef<any, any>[] = [
      {
        accessorKey: "label",
        header: timeMode === "daily" ? "التاريخ" : "الشهر",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.label}</span>
            {row.original.returnOnly && (
              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                مرتجع فقط
              </Badge>
            )}
          </div>
        ),
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      {
        accessorKey: "count",
        header: "عدد الفواتير",
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.count, 0),
      },
      {
        accessorKey: "total",
        header: "المبيعات قبل الضريبة",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((sum, row) => sum + row.original.total, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "returns",
        header: "المرتجعات قبل الضريبة",
        cell: ({ getValue }) => (
          <span className="text-destructive font-mono">
            {fmt(getValue() as number)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="text-destructive font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((sum, row) => sum + row.original.returns, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "net",
        header: "صافي المبيعات",
        cell: ({ getValue }) => (
          <span className="font-bold font-mono">
            {fmt(getValue() as number)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.net, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "aov",
        header: "متوسط الفاتورة",
        cell: ({ getValue }) => (
          <span className="font-mono text-muted-foreground">
            {fmt(getValue() as number)}
          </span>
        ),
      },
      {
        accessorKey: "returnRate",
        header: "% المرتجعات",
        cell: ({ getValue, row }) => {
          const v = getValue() as number | null;
          const ret = row.original.returns;
          if (ret <= 0)
            return <span className="text-muted-foreground">—</span>;
          if (v === null)
            return (
              <span className="text-destructive" title="مرتجعات بلا مبيعات في الفترة">
                مرتجع فقط
              </span>
            );
          const tone =
            v >= 10
              ? "text-destructive"
              : v >= 5
                ? "text-amber-600"
                : "text-muted-foreground";
          return (
            <span className={`font-mono ${tone}`}>{v.toFixed(1)}%</span>
          );
        },
      },
    ];
    if (isPostedOnly) {
      cols.push(
        {
          accessorKey: "profit",
          header: "الربح",
          cell: ({ getValue, row }) => {
            if (row.original.cogs === 0)
              return <span className="text-muted-foreground">—</span>;
            const v = getValue() as number;
            return (
              <span
                className={`font-mono font-semibold ${v >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {fmt(v)}
              </span>
            );
          },
          footer: ({ table }) => {
            const v = table
              .getFilteredRowModel()
              .rows.reduce(
                (s, r) =>
                  s + (r.original.cogs !== 0 ? r.original.profit : 0),
                0,
              );
            return (
              <span className="font-bold font-mono">{fmt(v)}</span>
            );
          },
        },
        {
          accessorKey: "margin",
          header: "الهامش %",
          cell: ({ getValue }) => {
            const v = getValue() as number | null;
            if (v === null)
              return <span className="text-muted-foreground">—</span>;
            const tone =
              v >= 25
                ? "text-emerald-600"
                : v >= 10
                  ? "text-amber-600"
                  : "text-destructive";
            return (
              <span className={`font-mono ${tone}`}>{v.toFixed(1)}%</span>
            );
          },
        },
      );
    }
    cols.push({
      accessorKey: "growth",
      header: "النمو vs السابق",
      cell: ({ getValue }) => {
        const v = getValue() as number | null;
        if (v === null)
          return <span className="text-muted-foreground">—</span>;
        const tone = v >= 0 ? "text-emerald-600" : "text-destructive";
        const arrow = v >= 0 ? "▲" : "▼";
        return (
          <span className={`font-mono ${tone}`}>
            {arrow} {Math.abs(v).toFixed(1)}%
          </span>
        );
      },
    });
    return cols;
  }, [timeMode, isPostedOnly]);

  // ═══ GROUPING: By Category ═══
  const categoryData = useMemo(() => {
    type CategoryGroup = {
      id: string;
      name: string;
      products: Set<string>;
      qtySold: number;
      qtyReturned: number;
      revenue: number;
      returns: number;
    };
    const salesItems = filtered.flatMap((invoice) => invoice.items || []);
    const returnItems = returns.flatMap((salesReturn) => salesReturn.items || []);
    const categoryKey = (item: any) => item.product?.category_id || "__none__";
    const createGroup = (key: string, item: any): CategoryGroup => ({
      id: key,
      name: item.product?.category?.name || "بدون تصنيف",
      products: new Set(),
      qtySold: 0,
      qtyReturned: 0,
      revenue: 0,
      returns: 0,
    });
    const groups = groupSalesAndReturns<any, any, CategoryGroup>(
      salesItems,
      returnItems,
      {
        getSaleKey: categoryKey,
        getReturnKey: categoryKey,
        createFromSale: createGroup,
        createFromReturn: createGroup,
        addSale: (group, item) => {
          if (item.product_id) group.products.add(item.product_id);
          group.qtySold += Number(item.quantity || 0);
          group.revenue += getSalesLineNetAmount(item);
        },
        addReturn: (group, item) => {
          if (item.product_id) group.products.add(item.product_id);
          group.qtyReturned += Number(item.quantity || 0);
          group.returns += getSalesLineNetAmount(item);
        },
      },
    );
    const groupedValues = Array.from(groups.values());
    const totalNet = groupedValues.reduce(
      (s, c) => s + (c.revenue - c.returns),
      0,
    );
    return groupedValues
      .map((c) => {
        const net = c.revenue - c.returns;
        const cogs = isPostedOnly ? cogsAggregates.byCategory[c.id] || 0 : 0;
        const profit = isPostedOnly ? net - cogs : 0;
        const margin = isPostedOnly && net > 0 ? (profit / net) * 100 : null;
        const returnRate = c.revenue > 0 ? (c.returns / c.revenue) * 100 : null;
        return {
          name: c.name,
          productCount: c.products.size,
          qtySold: c.qtySold,
          qtyReturned: c.qtyReturned,
          revenue: c.revenue,
          returns: c.returns,
          net,
          cogs,
          profit,
          margin,
          returnRate,
          pctOfTotal: totalNet > 0 ? (net / totalNet) * 100 : 0,
          returnOnly: c.revenue === 0 && c.returns > 0,
        };
      })
      .sort((a, b) => b.net - a.net);
  }, [filtered, returns, cogsAggregates, isPostedOnly]);

  const categoryColumns = useMemo<ColumnDef<any, any>[]>(() => {
    const cols: ColumnDef<any, any>[] = [
      {
        accessorKey: "name",
        header: "التصنيف",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span>{row.original.name}</span>
            {row.original.returnOnly && (
              <Badge variant="outline" className="text-[10px] text-destructive border-destructive/30">
                مرتجع فقط
              </Badge>
            )}
          </div>
        ),
        footer: () => <span className="font-bold">الإجمالي</span>,
      },
      {
        accessorKey: "productCount",
        header: "منتجات",
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.productCount, 0),
      },
      {
        accessorKey: "qtySold",
        header: "الكمية المباعة",
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.qtySold, 0),
      },
      {
        accessorKey: "qtyReturned",
        header: "الكمية المرتجعة",
        cell: ({ getValue }) => (
          <span className="text-destructive">{getValue() as number}</span>
        ),
        footer: ({ table }) =>
          table
            .getFilteredRowModel()
            .rows.reduce((s, r) => s + r.original.qtyReturned, 0),
      },
      {
        accessorKey: "revenue",
        header: "المبيعات",
        cell: ({ getValue }) => fmt(getValue() as number),
        footer: ({ table }) => (
          <span className="font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((sum, row) => sum + row.original.revenue, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "returns",
        header: "المرتجعات",
        cell: ({ getValue }) => (
          <span className="text-destructive font-mono">
            {fmt(getValue() as number)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="text-destructive font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((sum, row) => sum + row.original.returns, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "net",
        header: "صافي الإيرادات",
        cell: ({ getValue }) => (
          <span className="font-bold font-mono">
            {fmt(getValue() as number)}
          </span>
        ),
        footer: ({ table }) => (
          <span className="font-bold font-mono">
            {fmt(
              table
                .getFilteredRowModel()
                .rows.reduce((s, r) => s + r.original.net, 0),
            )}
          </span>
        ),
      },
      {
        accessorKey: "returnRate",
        header: "% المرتجعات",
        cell: ({ getValue, row }) => {
          const v = getValue() as number | null;
          if (row.original.returns <= 0)
            return <span className="text-muted-foreground">—</span>;
          if (v === null)
            return (
              <span className="text-destructive" title="مرتجعات بلا مبيعات في التصنيف">
                مرتجع فقط
              </span>
            );
          const tone =
            v >= 10
              ? "text-destructive"
              : v >= 5
                ? "text-amber-600"
                : "text-muted-foreground";
          return (
            <span className={`font-mono ${tone}`}>{v.toFixed(1)}%</span>
          );
        },
      },
    ];
    if (isPostedOnly) {
      cols.push(
        {
          accessorKey: "profit",
          header: "الربح",
          cell: ({ getValue, row }) => {
            if (row.original.cogs === 0)
              return <span className="text-muted-foreground">—</span>;
            const v = getValue() as number;
            return (
              <span
                className={`font-mono font-semibold ${v >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {fmt(v)}
              </span>
            );
          },
          footer: ({ table }) => {
            const v = table
              .getFilteredRowModel()
              .rows.reduce(
                (s, r) =>
                  s + (r.original.cogs !== 0 ? r.original.profit : 0),
                0,
              );
            return (
              <span className="font-bold font-mono">{fmt(v)}</span>
            );
          },
        },
        {
          accessorKey: "margin",
          header: "الهامش %",
          cell: ({ getValue }) => {
            const v = getValue() as number | null;
            if (v === null)
              return <span className="text-muted-foreground">—</span>;
            const tone =
              v >= 25
                ? "text-emerald-600"
                : v >= 10
                  ? "text-amber-600"
                  : "text-destructive";
            return (
              <span className={`font-mono ${tone}`}>{v.toFixed(1)}%</span>
            );
          },
        },
      );
    }
    cols.push({
      accessorKey: "pctOfTotal",
      header: "% المساهمة",
      cell: ({ getValue }) => {
        const v = getValue() as number;
        return (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-muted rounded overflow-hidden min-w-[40px]">
              <div
                className="h-full bg-primary"
                style={{ width: `${Math.max(0, Math.min(v, 100))}%` }}
              />
            </div>
            <span className="font-mono text-xs w-12 text-left">
              {v.toFixed(1)}%
            </span>
          </div>
        );
      },
    });
    return cols;
  }, [isPostedOnly]);

  // ── Chart data for time and customer/product ──
  const chartData = useMemo(() => {
    if (groupBy === "time") {
      return timeData.map((d) => ({
        name: d.label,
        مبيعات: d.total,
        مرتجعات: d.returns,
        صافي: d.total - d.returns,
      }));
    }
    if (groupBy === "customer") {
      return customerData.slice(0, 10).map((c) => ({
        name: c.name.length > 12 ? c.name.substring(0, 12) + "…" : c.name,
        المبيعات: c.total,
      }));
    }
    if (groupBy === "product") {
      return productData.slice(0, 10).map((p) => ({
        name: p.name.length > 12 ? p.name.substring(0, 12) + "…" : p.name,
        الإيرادات: p.revenue,
      }));
    }
    if (groupBy === "category") {
      return categoryData.slice(0, 10).map((c) => ({
        name: c.name.length > 12 ? c.name.substring(0, 12) + "…" : c.name,
        الإيرادات: c.revenue,
      }));
    }
    return [];
  }, [groupBy, timeData, customerData, productData, categoryData]);

  // ── Pie data for customer mode ──
  const pieData = useMemo(() => {
    if (groupBy !== "customer") return [];
    const top5 = customerData.slice(0, 5);
    const rest = customerData.slice(5);
    const restTotal = rest.reduce((s, c) => s + c.total, 0);
    const result = top5.map((c) => ({ name: c.name, value: c.total }));
    if (restTotal > 0) result.push({ name: "أخرى", value: restTotal });
    return result;
  }, [groupBy, customerData]);

  // ── Export config ──
  const exportConfig = useMemo(() => {
    const fmtN = (n: number) =>
      n.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    const summaryCards = [
      { label: "عدد الفواتير", value: String(kpi.count) },
      { label: "إجمالي المبيعات قبل الضريبة", value: fmtN(kpi.grossSales) },
      { label: "المرتجعات قبل الضريبة", value: fmtN(kpi.returnsTotal) },
      { label: "صافي المبيعات قبل الضريبة", value: fmtN(kpi.netSales) },
      { label: "صافي تكلفة البضاعة", value: fmtN(kpi.cogs) },
      { label: "إجمالي الربح", value: fmtN(kpi.grossProfit) },
      {
        label: "التحصيل النقدي/البنكي المخصص للفواتير",
        value: fmtN(kpi.cashCollected),
      },
      {
        label: "نسبة التحصيل النقدي من الفواتير شامل الضريبة",
        value:
          kpi.cashCollectionRate === null
            ? "—"
            : `${kpi.cashCollectionRate.toFixed(1)}%`,
      },
      { label: "تسويات أرصدة المرتجعات", value: fmtN(kpi.returnSettled) },
      { label: "إجمالي تغطية الفواتير", value: fmtN(kpi.totalCovered) },
      {
        label: "متوسط الفاتورة قبل الضريبة",
        value: fmtN(kpi.count > 0 ? kpi.grossSales / kpi.count : 0),
      },
      {
        label: "المتأخرات",
        value: `${fmtN(overdueInfo.total)} (${overdueInfo.count} فاتورة)`,
      },
      { label: "إجمالي الخصم", value: fmtN(discountTaxInfo.discount) },
      { label: "إجمالي الضريبة", value: fmtN(discountTaxInfo.tax) },
      ...(targetInfo
        ? [{ label: "تحقيق الهدف", value: `${targetInfo.pct.toFixed(1)}%` }]
        : []),
    ];

    if (groupBy === "invoice") {
      return {
        filenamePrefix: `تقرير-المبيعات-${dateFrom}-${dateTo}`,
        sheetName: "المبيعات",
        pdfTitle: `تقرير المبيعات (${dateFrom} - ${dateTo})`,
        headers: [
          "رقم",
          "التاريخ",
          "العميل",
          "الحالة",
          "الإجمالي",
          "التحصيل النقدي/البنكي",
          "تسوية بمرتجع",
          "المتبقي",
          "تكلفة البضاعة",
          "الربح قبل المرتجعات المستقلة",
          "الهامش%",
          "متأخر",
        ],
        rows: filtered.map((inv) => {
          const cogs = cogsByInvoice[inv.id] || 0;
          const rev = Number(inv.total) - Number(inv.tax || 0);
          const isPosted = inv.status === "posted";
          const profit = isPosted ? rev - cogs : 0;
          const margin = isPosted && rev > 0 ? ((rev - cogs) / rev) * 100 : 0;
          return [
            formatDisplayNumber(
              settings?.sales_invoice_prefix || "INV-",
              inv.posted_number,
              inv.invoice_number,
              inv.status,
            ),
            inv.invoice_date,
            inv.customer?.name || "-",
            inv.status === "posted"
              ? "مُرحّل"
              : inv.status === "cancelled"
                ? "ملغي"
                : "مسودة",
            Number(inv.total),
            getCoverage(inv.id).cashCollected,
            getCoverage(inv.id).returnSettled,
            Number(inv.total) - getCoverage(inv.id).totalCovered,
            cogs,
            isPosted ? profit : "—",
            isPosted ? margin.toFixed(1) + "%" : "—",
            isOverdue(inv) ? "نعم" : "",
          ];
        }),
        summaryCards,
        settings,
        pdfOrientation: "landscape" as const,
      };
    }
    if (groupBy === "return") {
      return {
        filenamePrefix: `تقرير-مرتجعات-المبيعات-${dateFrom}-${dateTo}`,
        sheetName: "المرتجعات المستقلة",
        pdfTitle: `مستندات مرتجعات المبيعات المستقلة (${dateFrom} - ${dateTo})`,
        headers: [
          "رقم المرتجع",
          "التاريخ",
          "العميل",
          "عدد البنود",
          "المرتجع قبل الضريبة",
          "النوع",
        ],
        rows: returns.map((salesReturn) => [
          formatDisplayNumber(
            settings?.sales_return_prefix || "SRN-",
            salesReturn.posted_number,
            salesReturn.return_number,
            salesReturn.status,
          ),
          salesReturn.return_date,
          salesReturn.customer?.name || "عميل نقدي",
          (salesReturn.items || []).length,
          getDocumentAmountExcludingTax(salesReturn),
          "مستند مستقل",
        ]),
        summaryCards,
        settings,
      };
    }
    if (groupBy === "customer") {
      return {
        filenamePrefix: `تقرير-مبيعات-بالعميل-${dateFrom}-${dateTo}`,
        sheetName: "بالعميل",
        pdfTitle: `تقرير المبيعات بالعميل (${dateFrom} - ${dateTo})`,
        headers: [
          "العميل",
          "عدد الفواتير",
          "الإجمالي",
          "المرتجعات",
          "الصافي",
          "الفواتير شامل الضريبة",
          "التحصيل النقدي/البنكي",
          "تسوية بمرتجع",
          "المتبقي",
          "التحصيل النقدي%",
        ],
        rows: customerData.map((c) => [
          c.name,
          c.count,
          c.total,
          c.returns,
          c.total - c.returns,
          c.invoiceGrossTotal,
          c.cashCollected,
          c.returnSettled,
          c.invoiceGrossTotal - c.cashCollected - c.returnSettled,
          c.invoiceGrossTotal > 0
            ? `${((c.cashCollected / c.invoiceGrossTotal) * 100).toFixed(1)}%`
            : "—",
        ]),
        summaryCards,
        settings,
        pdfOrientation: "landscape" as const,
      };
    }
    if (groupBy === "product") {
      return {
        filenamePrefix: `تقرير-مبيعات-بالمنتج-${dateFrom}-${dateTo}`,
        sheetName: "بالمنتج",
        pdfTitle: `تقرير المبيعات بالمنتج (${dateFrom} - ${dateTo})`,
        headers: [
          "المنتج",
          "الكمية المباعة",
          "المرتجع",
          "صافي الكمية",
          "الإيرادات",
          "التكلفة",
          "الربح",
          "الهامش%",
        ],
        rows: productData.map((p) => [
          p.name,
          p.qtySold,
          p.qtyReturned,
          p.qtySold - p.qtyReturned,
          p.revenue,
          p.cogs,
          p.revenue - p.cogs,
          p.revenue > 0
            ? (((p.revenue - p.cogs) / p.revenue) * 100).toFixed(1) + "%"
            : "0%",
        ]),
        summaryCards,
        settings,
      };
    }
    if (groupBy === "category") {
      return {
        filenamePrefix: `تقرير-مبيعات-بالتصنيف-${dateFrom}-${dateTo}`,
        sheetName: "بالتصنيف",
        pdfTitle: `تقرير المبيعات بالتصنيف (${dateFrom} - ${dateTo})`,
        headers: [
          "التصنيف",
          "منتجات",
          "الكمية المباعة",
          "الكمية المرتجعة",
          "المبيعات",
          "المرتجعات",
          "صافي الإيرادات",
          "% المرتجعات",
          ...(isPostedOnly ? ["الربح", "الهامش %"] : []),
          "% المساهمة",
        ],
        rows: categoryData.map((c) => [
          c.name,
          c.productCount,
          c.qtySold,
          c.qtyReturned,
          c.revenue,
          c.returns,
          c.net,
          c.returns > 0 && c.returnRate !== null
            ? c.returnRate.toFixed(1) + "%"
            : c.returns > 0
              ? "مرتجع فقط"
              : "—",
          ...(isPostedOnly
            ? [
                c.cogs !== 0 ? c.profit : "—",
                c.margin !== null ? c.margin.toFixed(1) + "%" : "—",
              ]
            : []),
          c.pctOfTotal.toFixed(1) + "%",
        ]),
        summaryCards,
        settings,
      };
    }
    // time
    return {
      filenamePrefix: `تقرير-مبيعات-${timeMode === "daily" ? "يومي" : "شهري"}-${dateFrom}-${dateTo}`,
      sheetName: timeMode === "daily" ? "يومي" : "شهري",
      pdfTitle: `تقرير المبيعات ${timeMode === "daily" ? "اليومي" : "الشهري"} (${dateFrom} - ${dateTo})`,
      headers: [
        timeMode === "daily" ? "التاريخ" : "الشهر",
        "عدد الفواتير",
        "المبيعات قبل الضريبة",
        "المرتجعات قبل الضريبة",
        "صافي المبيعات",
        "متوسط الفاتورة",
        "% المرتجعات",
        ...(isPostedOnly ? ["الربح", "الهامش %"] : []),
        "النمو vs السابق",
      ],
      rows: timeData.map((d) => [
        d.label,
        d.count,
        d.total,
        d.returns,
        d.net,
        d.aov,
        d.returns > 0 && d.returnRate !== null
          ? d.returnRate.toFixed(1) + "%"
          : d.returns > 0
            ? "مرتجع فقط"
            : "—",
        ...(isPostedOnly
          ? [
              d.cogs !== 0 ? d.profit : "—",
              d.margin !== null ? d.margin.toFixed(1) + "%" : "—",
            ]
          : []),
        d.growth !== null
          ? (d.growth >= 0 ? "+" : "") + d.growth.toFixed(1) + "%"
          : "—",
      ]),
      summaryCards,
      settings,
    };
  }, [
    groupBy,
    filtered,
    returns,
    customerData,
    productData,
    categoryData,
    timeData,
    kpi,
    dateFrom,
    dateTo,
    settings,
    timeMode,
    isPostedOnly,
    overdueInfo,
    discountTaxInfo,
    targetInfo,
    cogsByInvoice,
    getCoverage,
    isOverdue,
  ]);

  const reportQueries = [
    invoicesQuery,
    returnsQuery,
    movementsQuery,
    paymentAllocationsQuery,
    returnSettlementsQuery,
    prevInvoicesQuery,
    prevReturnsQuery,
  ];
  const isLoading = reportQueries.some((query) => query.isLoading);
  const queryError = reportQueries.find((query) => query.error)?.error;
  const isRetrying = reportQueries.some((query) => query.isFetching);

  if (queryError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="py-10 flex flex-col items-center gap-3 text-center">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <div>
            <p className="font-medium text-destructive">
              تعذر تحميل تقرير المبيعات كاملاً
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              لم نعرض نتائج جزئية حتى لا تكون المؤشرات المالية مضللة.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={isRetrying}
            onClick={() => {
              void Promise.all(reportQueries.map((query) => query.refetch()));
            }}
          >
            {isRetrying ? "جارٍ إعادة المحاولة..." : "إعادة المحاولة"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5 p-1">
      {/* ── Unified report controls ── */}
      <Card className="overflow-hidden border shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-2.5 p-3">
            <div className="me-1 min-w-[185px]">
              <p className="text-sm font-semibold">نطاق التقرير</p>
              <p className="mt-0.5 whitespace-nowrap text-[11px] text-muted-foreground">
                {formatPeriodDate(dateFrom)} — {formatPeriodDate(dateTo)}
              </p>
            </div>

            <div className="grid min-w-0 flex-1 basis-[310px] grid-cols-[minmax(130px,1fr)_auto_minmax(130px,1fr)] items-center gap-2 sm:max-w-[370px]">
              <DatePickerInput
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="من تاريخ"
                className="h-9 min-w-0 border-0 bg-muted/50 px-2.5 shadow-none hover:bg-muted sm:px-3"
              />
              <span className="text-muted-foreground/40">—</span>
              <DatePickerInput
                value={dateTo}
                onChange={setDateTo}
                placeholder="إلى تاريخ"
                className="h-9 min-w-0 border-0 bg-muted/50 px-2.5 shadow-none hover:bg-muted sm:px-3"
              />
            </div>

            <div className="hidden h-7 w-px bg-border lg:block" />

            <div className="flex items-center gap-2">
              <span className="whitespace-nowrap text-[11px] font-medium text-muted-foreground">حالة التفاصيل</span>
              <Select
                value={statusFilter}
                onValueChange={(v: any) => setStatusFilter(v)}
              >
                <SelectTrigger className="h-9 w-[120px] border-0 bg-muted/50 font-medium shadow-none hover:bg-muted">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="posted">مُرحّل</SelectItem>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="ms-auto shrink-0">
              <ExportMenu
                config={exportConfig}
                disabled={isLoading}
                buttonClassName="h-9 border-0 bg-primary/10 text-primary shadow-none hover:bg-primary/15 hover:text-primary"
              />
            </div>
          </div>

          <div className="border-t bg-muted/10 px-3 py-2">
            <div className="overflow-x-auto">
              <div className="flex w-max min-w-full items-center gap-4">
                <div className="flex items-center gap-2 rounded-lg bg-background/70 p-1">
                  <span className="shrink-0 px-2 text-xs font-semibold text-foreground">فترة سريعة</span>
                  <div className="flex w-max items-center gap-1 rounded-lg bg-muted/50 p-1">
                    {quickRanges.map((p) => (
                      <Button
                        key={p.label}
                        variant="ghost"
                        size="sm"
                        className={`h-7 rounded-md px-2.5 text-xs text-muted-foreground shadow-none hover:bg-primary/10 hover:text-primary ${
                          dateFrom === p.from && dateTo === p.to
                            ? "!bg-primary/15 !text-primary"
                            : ""
                        }`}
                        onClick={() => {
                          setDateFrom(p.from);
                          setDateTo(p.to);
                        }}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div className="mx-1 h-8 w-px shrink-0 bg-border" />

                <div className="flex items-center gap-2 rounded-lg bg-background/70 p-1">
                  <span className="shrink-0 px-2 text-xs font-semibold text-foreground">عرض التقرير</span>
                  <ToggleGroup
                    type="single"
                    value={groupBy}
                    onValueChange={(v) => v && setGroupBy(v as any)}
                    className="rounded-lg bg-muted/50 p-1"
                  >
                    <ToggleGroupItem value="invoice" className={FLAT_SEGMENT_CLASS}>الفواتير</ToggleGroupItem>
                    <ToggleGroupItem value="return" className={FLAT_SEGMENT_CLASS}>المرتجعات</ToggleGroupItem>
                    <ToggleGroupItem value="customer" className={FLAT_SEGMENT_CLASS}>العملاء</ToggleGroupItem>
                    <ToggleGroupItem value="product" className={FLAT_SEGMENT_CLASS}>المنتجات</ToggleGroupItem>
                    <ToggleGroupItem value="category" className={FLAT_SEGMENT_CLASS}>التصنيفات</ToggleGroupItem>
                    <ToggleGroupItem value="time" className={FLAT_SEGMENT_CLASS}>زمني</ToggleGroupItem>
                  </ToggleGroup>
                  {groupBy === "time" && (
                    <ToggleGroup
                      type="single"
                      value={timeMode}
                      onValueChange={(v) => v && setTimeMode(v as any)}
                      className="rounded-lg bg-muted/50 p-1"
                    >
                      <ToggleGroupItem value="daily" className={FLAT_SEGMENT_CLASS}>يومي</ToggleGroupItem>
                      <ToggleGroupItem value="monthly" className={FLAT_SEGMENT_CLASS}>شهري</ToggleGroupItem>
                    </ToggleGroup>
                  )}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Unified period summary ── */}
      <Card className="overflow-hidden border shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/15 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">ملخص الفترة</span>
            <Badge variant="outline" className="h-5 bg-background text-[10px]">
              المستندات المُرحّلة فقط
            </Badge>
          </div>
        </div>
        <CardContent className="p-0">
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
        {/* صافي المبيعات (الرقم الأهم) */}
        <Card className="relative overflow-hidden rounded-none border-0 bg-card shadow-none">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  صافي المبيعات قبل الضريبة
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums truncate">
                    {fmt(kpi.netSales)}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-0.5">
                  <GrowthBadge
                    current={kpi.netSales}
                    previous={prevKpi.netSales}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    من {kpi.count} فاتورة
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* إجمالي الربح */}
        <Card className="relative overflow-hidden rounded-none border-0 bg-card shadow-none">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1 mb-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    إجمالي الربح
                  </p>
                </div>
                {isLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <p
                    className={`text-2xl font-extrabold tracking-tight tabular-nums truncate ${kpi.grossProfit >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
                  >
                    {fmt(kpi.grossProfit)}
                  </p>
                )}
                {kpi.grossMarginPercent !== null && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    هامش {kpi.grossMarginPercent.toFixed(1)}%
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* المرتجعات */}
        <Card className="relative overflow-hidden rounded-none border-0 bg-card shadow-none">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  المرتجعات قبل الضريبة
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums text-destructive">
                    {fmt(kpi.returnsTotal)}
                  </p>
                )}
                {kpi.grossSales > 0 && kpi.returnsTotal > 0 && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {((kpi.returnsTotal / kpi.grossSales) * 100).toFixed(1)}% من
                    المبيعات
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* التحصيل النقدي */}
        <Card className="relative overflow-hidden rounded-none border-0 bg-card shadow-none">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-start gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  التحصيل النقدي/البنكي
                </p>
                {isLoading ? (
                  <Skeleton className="h-7 w-16" />
                ) : (
                  <p className="text-2xl font-extrabold tracking-tight tabular-nums">
                    {kpi.cashCollectionRate === null
                      ? "—"
                      : `${kpi.cashCollectionRate.toFixed(1)}%`}
                  </p>
                )}
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {fmt(kpi.cashCollected)} محصّل
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
          </div>
        </CardContent>
      </Card>

      {/* ── Actionable overdue alert only when needed ── */}
      {!isLoading && overdueInfo.count > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">{overdueInfo.count} فاتورة متأخرة</span>
          </div>
          <span className="font-mono font-semibold text-destructive">
            {fmt(overdueInfo.total)}
          </span>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-2">
      {/* ── Invoice coverage — on demand ── */}
      <Collapsible
        open={showCoverage}
        onOpenChange={setShowCoverage}
        className="contents"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`${FLAT_ACTION_CLASS} ${showCoverage ? "!bg-primary/15 !text-primary" : ""}`}
          >
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform ${showCoverage ? "rotate-180" : ""}`}
            />
            تفاصيل تغطية الفواتير
            <span className="font-mono font-bold">
              {invoiceCoverage.totalCoverageRate === null
                ? "—"
                : `${invoiceCoverage.totalCoverageRate.toFixed(1)}%`}
            </span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="order-last basis-full pt-2">
      <Card className="border shadow-sm">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold">تغطية فواتير الفترة</span>
              <Badge variant="outline" className="h-5 text-[10px]">
                شامل الضريبة
              </Badge>
            </div>
            <span className="text-xs text-muted-foreground">
              إجمالي الفواتير {fmt(kpi.invoiceGrossTotal)}
            </span>
          </div>
          <div className="grid grid-cols-1 divide-y sm:grid-cols-3 sm:divide-x sm:divide-x-reverse sm:divide-y-0">
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">تحصيل نقدي/بنكي</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums">
                  {isLoading ? "—" : fmt(kpi.cashCollected)}
                </span>
                <Badge variant="secondary" className="font-mono">
                  {kpi.cashCollectionRate === null
                    ? "—"
                    : `${kpi.cashCollectionRate.toFixed(1)}%`}
                </Badge>
              </div>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">تسويات أرصدة المرتجعات</p>
              <p className="mt-1 text-lg font-bold tabular-nums text-violet-600 dark:text-violet-400">
                {isLoading ? "—" : fmt(kpi.returnSettled)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground">إجمالي التغطية والمتبقي</p>
              <div className="mt-1 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums">
                  {isLoading ? "—" : fmt(kpi.totalCovered)}
                </span>
                <span
                  className={`text-xs font-medium ${invoiceCoverage.outstanding > 0 ? "text-destructive" : "text-emerald-600"}`}
                >
                  المتبقي {isLoading ? "—" : fmt(invoiceCoverage.outstanding)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* ── Collapsible: Extra KPIs ── */}
      <Collapsible
        open={showExtras}
        onOpenChange={setShowExtras}
        className="contents"
      >
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`${FLAT_ACTION_CLASS} ${showExtras ? "!bg-primary/15 !text-primary" : ""}`}
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform ${showExtras ? "rotate-180" : ""}`}
            />
            مؤشرات إضافية
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="order-last basis-full pt-2">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {/* إجمالي المبيعات (قبل المرتجعات) */}
            <Card className="border shadow-sm">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  إجمالي المبيعات قبل الضريبة
                </p>
                {isLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  <p className="text-lg font-bold tabular-nums">
                    {fmt(kpi.grossSales)}
                  </p>
                )}
                <GrowthBadge
                  current={kpi.grossSales}
                  previous={prevKpi.grossSales}
                />
              </CardContent>
            </Card>

            {/* عدد الفواتير */}
            <Card className="border shadow-sm">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  عدد الفواتير
                </p>
                {isLoading ? (
                  <Skeleton className="h-6 w-12" />
                ) : (
                  <p className="text-lg font-bold tabular-nums">{kpi.count}</p>
                )}
                <GrowthBadge current={kpi.count} previous={prevKpi.count} />
              </CardContent>
            </Card>

            {/* متوسط الفاتورة */}
            <Card className="border shadow-sm">
              <CardContent className="pt-4 pb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  متوسط الفاتورة قبل الضريبة
                </p>
                {isLoading ? (
                  <Skeleton className="h-6 w-16" />
                ) : (
                  <p className="text-lg font-bold tabular-nums">
                    {fmt(kpi.count > 0 ? kpi.grossSales / kpi.count : 0)}
                  </p>
                )}
                <GrowthBadge
                  current={kpi.count > 0 ? kpi.grossSales / kpi.count : 0}
                  previous={
                    prevKpi.count > 0 ? prevKpi.grossSales / prevKpi.count : 0
                  }
                />
              </CardContent>
            </Card>

            {/* الخصم (يظهر فقط إذا > 0) */}
            {discountTaxInfo.discount > 0 && (
              <Card className="border shadow-sm">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    إجمالي الخصم
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-6 w-16" />
                  ) : (
                    <p className="text-lg font-bold tabular-nums">
                      {fmt(discountTaxInfo.discount)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* الضريبة (تظهر فقط إذا > 0) */}
            {discountTaxInfo.tax > 0 && (
              <Card className="border shadow-sm">
                <CardContent className="pt-4 pb-3">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    إجمالي الضريبة
                  </p>
                  {isLoading ? (
                    <Skeleton className="h-6 w-16" />
                  ) : (
                    <p className="text-lg font-bold tabular-nums">
                      {fmt(discountTaxInfo.tax)}
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {targetInfo && (
              <Card className="border shadow-sm md:col-span-2">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        تحقيق الهدف {targetInfo.monthsInRange > 1
                          ? `(${targetInfo.monthsInRange} أشهر)`
                          : "الشهري"}
                      </p>
                      <p className="text-lg font-bold tabular-nums">
                        {targetInfo.pct.toFixed(0)}%
                      </p>
                    </div>
                    <Target className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div
                      className={`h-1.5 rounded-full ${targetInfo.pct >= 100 ? "bg-emerald-500" : targetInfo.pct >= 80 ? "bg-primary" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(targetInfo.pct, 100)}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {fmt(kpi.netSales)} / {fmt(targetInfo.scaledTarget)}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {groupBy !== "invoice" && chartData.length > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className={`${FLAT_ACTION_CLASS} ${showChart ? "!bg-primary/15 !text-primary" : ""}`}
          onClick={() => setShowChart((current) => !current)}
        >
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${showChart ? "rotate-180" : ""}`}
          />
          {showChart ? "إخفاء الرسم" : "عرض الرسم البياني"}
        </Button>
      )}
      </div>

      {/* ── Chart (for time/customer/product modes) ── */}
      {showChart && groupBy !== "invoice" && chartData.length > 0 && (
        <div
          className={
            groupBy === "customer"
              ? "grid grid-cols-1 md:grid-cols-2 gap-4"
              : ""
          }
        >
          <Card>
            <CardContent className="pt-4">
              <ResponsiveContainer width="100%" height={260}>
                {groupBy === "time" ? (
                  <ComposedChart data={chartData}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="hsl(var(--border))"
                    />
                    <XAxis
                      dataKey="name"
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
                      dataKey="مبيعات"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      barSize={28}
                    />
                    <Bar
                      dataKey="مرتجعات"
                      fill="hsl(var(--destructive))"
                      radius={[4, 4, 0, 0]}
                      barSize={28}
                    />
                    <Line
                      type="monotone"
                      dataKey="صافي"
                      stroke="hsl(152, 60%, 42%)"
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                    />
                  </ComposedChart>
                ) : (
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
                      width={100}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "8px",
                        border: "1px solid hsl(var(--border))",
                        fontSize: "12px",
                      }}
                    />
                    <Bar
                      dataKey={
                        groupBy === "customer" ? "المبيعات" : "الإيرادات"
                      }
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            </CardContent>
          </Card>
          {groupBy === "customer" && pieData.length > 0 && (
            <Card>
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-muted-foreground mb-2 text-center">
                  توزيع المبيعات بالعميل
                </p>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      labelLine={false}
                      fontSize={10}
                    >
                      {pieData.map((_, i) => (
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
                      formatter={(v: any) => fmt(v)}
                    />
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
          {groupBy === "invoice" ? (
            <DataTable
              columns={invoiceColumns}
              data={filtered}
              isLoading={isLoading}
              pageSize={20}
              showPagination
              showSearch
              searchPlaceholder="بحث في الفواتير..."
              emptyMessage="لا توجد فواتير في هذه الفترة"
              sorting={invoiceSort}
              onSortingChange={(updater) =>
                setInvoiceSort(
                  typeof updater === "function" ? updater(invoiceSort) : updater,
                )
              }
              toolbarContent={
                <QuickSortToolbar
                  sorting={invoiceSort}
                  setSorting={setInvoiceSort}
                />
              }
              columnVisibility={invoiceColumnVisibility}
              onColumnVisibilityChange={setInvoiceColumnVisibility}
              columnToggleLabel="أعمدة إضافية"
              compactRows
            />
          ) : groupBy === "return" ? (
            <>
              <DataTable
                columns={returnColumns}
                data={returns}
                isLoading={isLoading}
                pageSize={20}
                showPagination
                showSearch
                searchPlaceholder="بحث في مستندات المرتجعات..."
                emptyMessage="لا توجد مرتجعات مُرحّلة في هذه الفترة"
                columnVisibility={returnColumnVisibility}
                onColumnVisibilityChange={setReturnColumnVisibility}
                columnToggleLabel="أعمدة إضافية"
                compactRows
              />
              <p className="text-xs text-muted-foreground mt-2 text-center">
                كل مرتجع مستند مستقل ويؤثر في الفترة حسب تاريخ المرتجع، دون
                اشتراط ربطه بفاتورة مبيعات أصلية.
              </p>
            </>
          ) : groupBy === "customer" ? (
            <DataTable
              columns={customerColumns}
              data={customerData}
              isLoading={isLoading}
              pageSize={20}
              showPagination
              showSearch
              searchPlaceholder="بحث بالعميل..."
              emptyMessage="لا توجد بيانات"
              columnVisibility={customerColumnVisibility}
              onColumnVisibilityChange={setCustomerColumnVisibility}
              columnToggleLabel="أعمدة إضافية"
              compactRows
            />
          ) : groupBy === "product" ? (
            <>
              <DataTable
                columns={productColumns}
                data={productData}
                isLoading={isLoading}
                pageSize={20}
                showPagination
                showSearch
                searchPlaceholder="بحث بالمنتج..."
                emptyMessage="لا توجد بيانات"
                sorting={productSort}
                onSortingChange={(updater) =>
                  setProductSort(
                    typeof updater === "function"
                      ? updater(productSort)
                      : updater,
                  )
                }
                toolbarContent={
                  <QuickSortToolbar
                    sorting={productSort}
                    setSorting={setProductSort}
                  />
                }
                columnVisibility={productColumnVisibility}
                onColumnVisibilityChange={setProductColumnVisibility}
                columnToggleLabel="أعمدة إضافية"
                compactRows
              />

              <p className="text-xs text-muted-foreground mt-2 text-center">
                للتفاصيل الكاملة (التكلفة، الربح، الهوامش) راجع تقرير تحليل
                المنتجات
              </p>
            </>
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
              columnVisibility={categoryColumnVisibility}
              onColumnVisibilityChange={setCategoryColumnVisibility}
              columnToggleLabel="أعمدة إضافية"
              compactRows
            />
          ) : (
            <DataTable
              columns={timeColumns}
              data={timeData}
              isLoading={isLoading}
              pageSize={31}
              showPagination
              showSearch={false}
              emptyMessage="لا توجد بيانات"
              columnVisibility={timeColumnVisibility}
              onColumnVisibilityChange={setTimeColumnVisibility}
              columnToggleLabel="أعمدة إضافية"
              compactRows
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
