import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/DatePickerInput";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  Plus,
  FileText,
  Eye,
  X,
  Clock,
  CheckCircle,
  DollarSign,
  Undo2,
  AlertTriangle,
  CreditCard,
  Ban,
} from "lucide-react";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import { ExportMenu } from "@/components/ExportMenu";
import { useQuery } from "@tanstack/react-query";
import { usePagedQuery, useDebouncedValue } from "@/hooks/use-paged-query";
import { StatusChips } from "@/components/StatusChips";

interface Invoice {
  id: string;
  invoice_number: number;
  posted_number: number | null;
  customer_id: string | null;
  customer_name?: string;
  invoice_date: string;
  due_date: string | null;
  status: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paid_amount: number;
  reference: string | null;
  notes: string | null;
}

const PAGE_SIZE = 50;
const fmtNum = (n: number) => Number(n || 0).toLocaleString("en-US");

export default function Sales() {
  const { settings, formatCurrency } = useSettings();
  const prefix = settings?.sales_invoice_prefix || "INV-";
  const navigate = useNavigate();

  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  // KPIs
  const { data: summary } = useQuery({
    queryKey: ["sales-summary", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_summary" as any, {
        p_date_from: dateFrom || null,
        p_date_to: dateTo || null,
      });
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
  });

  // Paged invoices
  const { data: pagedData, isLoading } = usePagedQuery<Invoice>(
    [
      "sales-list",
      pagination.pageIndex,
      pagination.pageSize,
      statusFilter,
      dateFrom,
      dateTo,
      debouncedSearch,
    ] as const,
    async () => {
      const from = pagination.pageIndex * pagination.pageSize;
      const to = from + pagination.pageSize - 1;

      let q = (supabase.from("sales_invoices") as any)
        .select(
          "id, invoice_number, posted_number, customer_id, invoice_date, due_date, status, subtotal, discount, tax, total, paid_amount, reference, notes, customers:customer_id(name)",
          { count: "exact" },
        )
        .order("invoice_number", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (dateFrom) q = q.gte("invoice_date", dateFrom);
      if (dateTo) q = q.lte("invoice_date", dateTo);
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        const asNum = Number(s);
        if (!isNaN(asNum)) {
          q = q.or(`invoice_number.eq.${asNum},posted_number.eq.${asNum}`);
        } else {
          q = q.ilike("customers.name", `%${s}%`);
        }
      }

      const { data, error, count } = await q;
      if (error) {
        toast({
          title: "خطأ",
          description: "فشل في تحميل الفواتير",
          variant: "destructive",
        });
        throw error;
      }
      return {
        rows: (data || []).map((inv: any) => ({
          ...inv,
          customer_name: inv.customers?.name,
        })),
        totalCount: count ?? 0,
      };
    },
  );

  const invoices = pagedData?.rows ?? [];
  const totalCount = pagedData?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));

  const fetchAllForExport = async (): Promise<Invoice[]> => {
    let q = (supabase.from("sales_invoices") as any)
      .select(
        "id, invoice_number, posted_number, customer_id, invoice_date, due_date, status, subtotal, discount, tax, total, paid_amount, reference, notes, customers:customer_id(name)",
      )
      .order("invoice_number", { ascending: false });

    if (statusFilter !== "all") q = q.eq("status", statusFilter);
    if (dateFrom) q = q.gte("invoice_date", dateFrom);
    if (dateTo) q = q.lte("invoice_date", dateTo);

    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((inv: any) => ({
      ...inv,
      customer_name: inv.customers?.name,
    }));
  };

  const [exportRows, setExportRows] = useState<any[][]>([]);
  const handlePrepareExport = async () => {
    const all = await fetchAllForExport();
    setExportRows(
      all.map((i) => [
        formatDisplayNumber(prefix, i.posted_number, i.invoice_number, i.status),
        i.customer_name || "—",
        i.invoice_date,
        formatCurrency(i.total),
        i.status === "posted" ? formatCurrency(i.paid_amount) : "—",
        i.status === "posted" ? formatCurrency(i.total - i.paid_amount) : "—",
        i.due_date || "—",
        INVOICE_STATUS_LABELS[i.status] || i.status,
      ]),
    );
  };

  const hasFilters =
    statusFilter !== "all" || dateFrom || dateTo || search.trim();
  const clearFilters = () => {
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  };

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);

  const columns: ColumnDef<Invoice, any>[] = useMemo(
    () => [
      {
        accessorKey: "invoice_number",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="رقم الفاتورة" />
        ),
        cell: ({ row }) => (
          <span className="font-mono">
            {formatDisplayNumber(
              prefix,
              row.original.posted_number,
              row.original.invoice_number,
              row.original.status,
            )}
          </span>
        ),
      },
      {
        accessorKey: "customer_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="العميل" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.customer_name || "—"}
          </span>
        ),
      },
      {
        accessorKey: "invoice_date",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="التاريخ" />
        ),
        cell: ({ row }) => (
          <span className="text-muted-foreground font-mono">
            {row.original.invoice_date}
          </span>
        ),
      },
      {
        accessorKey: "total",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="الإجمالي" />
        ),
        cell: ({ row }) => (
          <span className="font-mono">{formatCurrency(row.original.total)}</span>
        ),
      },
      {
        accessorKey: "paid_amount",
        meta: { hideOnMobile: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="المدفوع" />
        ),
        cell: ({ row }) => {
          if (row.original.status !== "posted")
            return <span className="text-muted-foreground">—</span>;
          return (
            <span className="font-mono">
              {formatCurrency(row.original.paid_amount)}
            </span>
          );
        },
      },
      {
        id: "remaining",
        meta: { hideOnMobile: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="المتبقي" />
        ),
        accessorFn: (row) =>
          row.status === "posted" ? row.total - row.paid_amount : null,
        cell: ({ row }) => {
          if (row.original.status !== "posted")
            return <span className="text-muted-foreground">—</span>;
          const remaining = row.original.total - row.original.paid_amount;
          return (
            <span
              className={`font-mono font-semibold ${
                remaining > 0 ? "text-destructive" : "text-emerald-600"
              }`}
            >
              {formatCurrency(remaining)}
            </span>
          );
        },
      },
      {
        accessorKey: "due_date",
        meta: { hideOnMobile: true },
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="الاستحقاق" />
        ),
        cell: ({ row }) => {
          const { due_date, status, total, paid_amount } = row.original;
          if (!due_date)
            return <span className="text-muted-foreground">—</span>;
          const isOverdue =
            status === "posted" &&
            total - paid_amount > 0 &&
            due_date < new Date().toISOString().slice(0, 10);
          return (
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground text-sm font-mono">
                {due_date}
              </span>
              {isOverdue && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0"
                >
                  متأخرة
                </Badge>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: "status",
        header: "الحالة",
        cell: ({ row }) => (
          <Badge variant={INVOICE_STATUS_COLORS[row.original.status] as any}>
            {INVOICE_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: "actions",
        header: "عرض",
        enableHiding: false,
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label="عرض الفاتورة"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/sales/${row.original.id}`);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [prefix, formatCurrency, navigate],
  );

  const totalSales = summary?.total_sales ?? 0;
  const totalPaid = summary?.total_paid ?? 0;
  const totalOutstanding = summary?.total_outstanding ?? 0;
  const totalReturns = summary?.total_returns ?? 0;
  const netSales = totalSales - totalReturns;

  // Top KPI cards (financial — bigger)
  const kpiCards = [
    {
      label: "إجمالي المبيعات",
      value: formatCurrency(totalSales),
      icon: DollarSign,
      color: "bg-blue-500/10 text-blue-600",
    },
    {
      label: "المرتجعات",
      value: formatCurrency(totalReturns),
      icon: Undo2,
      color: "bg-orange-500/10 text-orange-600",
    },
    {
      label: "صافي المبيعات",
      value: formatCurrency(netSales),
      icon: DollarSign,
      color: "bg-teal-500/10 text-teal-600",
    },
    {
      label: "المحصّل",
      value: formatCurrency(totalPaid),
      icon: CreditCard,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "المتبقي",
      value: formatCurrency(totalOutstanding),
      icon: AlertTriangle,
      color:
        totalOutstanding > 0
          ? "bg-destructive/10 text-destructive"
          : "bg-emerald-500/10 text-emerald-600",
    },
  ];

  const statusChips = [
    {
      label: "الكل",
      value: fmtNum(summary?.total_count ?? 0),
      filter: "all",
      icon: FileText,
      color: "bg-primary/10 text-primary",
    },
    {
      label: "مسودة",
      value: fmtNum(summary?.draft_count ?? 0),
      filter: "draft",
      icon: Clock,
      color: "bg-amber-500/10 text-amber-600",
    },
    {
      label: "مُرحّل",
      value: fmtNum(summary?.posted_count ?? 0),
      filter: "posted",
      icon: CheckCircle,
      color: "bg-emerald-500/10 text-emerald-600",
    },
    {
      label: "ملغي",
      value: fmtNum(summary?.cancelled_count ?? 0),
      filter: "cancelled",
      icon: Ban,
      color: "bg-destructive/10 text-destructive",
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={FileText}
        title="فواتير البيع"
        description={`${fmtNum(summary?.total_count ?? 0)} فاتورة`}
        actions={
          <>
            <ExportMenu
              config={{
                filenamePrefix: "فواتير-البيع",
                sheetName: "فواتير البيع",
                pdfTitle: "فواتير البيع",
                headers: [
                  "رقم الفاتورة",
                  "العميل",
                  "التاريخ",
                  "الإجمالي",
                  "المدفوع",
                  "المتبقي",
                  "الاستحقاق",
                  "الحالة",
                ],
                rows: exportRows,
                settings: null,
                pdfOrientation: "landscape",
              }}
              disabled={isLoading}
              onOpen={handlePrepareExport}
            />
            <Button
              onClick={() => navigate("/sales/new")}
              className="gap-2 shadow-md shadow-primary/20 font-bold"
            >
              <Plus className="h-4 w-4" />
              فاتورة جديدة
            </Button>
          </>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpiCards.map(({ label, value, icon: Icon, color }) => (
          <div
            key={label}
            className="rounded-xl border p-4 bg-card transition-all hover:shadow-md"
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xl font-black text-foreground font-mono">
                {value}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Status chips */}
      <StatusChips
        chips={statusChips}
        active={statusFilter}
        onSelect={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={invoices}
        isLoading={isLoading}
        emptyMessage="لا توجد فواتير"
        onRowClick={(inv) => navigate(`/sales/${inv.id}`)}
        searchPlaceholder="بحث برقم الفاتورة أو اسم العميل..."
        globalFilter={search}
        onGlobalFilterChange={setSearch}
        manualPagination
        pageCount={pageCount}
        totalRows={totalCount}
        pagination={pagination}
        onPaginationChange={setPagination}
        pageSize={PAGE_SIZE}
        toolbarContent={
          <div className="flex items-center gap-2 flex-wrap">
            <DatePickerInput
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="من تاريخ"
              className="w-[150px] h-9 text-sm"
            />
            <DatePickerInput
              value={dateTo}
              onChange={setDateTo}
              placeholder="إلى تاريخ"
              className="w-[150px] h-9 text-sm"
            />
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
