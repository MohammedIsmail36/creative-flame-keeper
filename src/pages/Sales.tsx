import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/DatePickerInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
} from "lucide-react";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import { ExportMenu } from "@/components/ExportMenu";
import { useQuery } from "@tanstack/react-query";
import { usePagedQuery, useDebouncedValue } from "@/hooks/use-paged-query";

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

export default function Sales() {
  const { settings, formatCurrency } = useSettings();
  const prefix = settings?.sales_invoice_prefix || "INV-";
  const navigate = useNavigate();

  // Filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  // Pagination
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const filterArgs = {
    date_from: dateFrom || null,
    date_to: dateTo || null,
  };

  // ── KPIs (RPC) ───────────────────────────────────────────
  const { data: summary } = useQuery({
    queryKey: ["sales-summary", filterArgs],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_sales_summary" as any, {
        p_date_from: filterArgs.date_from,
        p_date_to: filterArgs.date_to,
      });
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
  });

  // ── Paged invoices list ──────────────────────────────────
  const listKey = [
    "sales-list",
    pagination.pageIndex,
    pagination.pageSize,
    statusFilter,
    dateFrom,
    dateTo,
    debouncedSearch,
  ] as const;

  const { data: pagedData, isLoading } = usePagedQuery<Invoice>(
    listKey,
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
          // search by customer name via foreign filter
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

  // ── Lazy fetch all rows for export ───────────────────────
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

  // Reset to page 0 when filters change
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
          <span className="text-muted-foreground">
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
          <span className="font-mono">
            {formatCurrency(row.original.total)}
          </span>
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
              className={`font-mono font-semibold ${remaining > 0 ? "text-destructive" : "text-emerald-600"}`}
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
              <span className="text-muted-foreground text-sm">{due_date}</span>
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

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={FileText}
        title="فواتير البيع"
        description={`${(summary?.total_count ?? 0).toLocaleString("ar-EG")} فاتورة`}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "الكل",
            value: (summary?.total_count ?? 0).toLocaleString("ar-EG"),
            filter: "all",
            icon: FileText,
            color: "bg-primary/10 text-primary",
          },
          {
            label: "مسودة",
            value: (summary?.draft_count ?? 0).toLocaleString("ar-EG"),
            filter: "draft",
            icon: Clock,
            color: "bg-amber-500/10 text-amber-600",
          },
          {
            label: "مُرحّل",
            value: (summary?.posted_count ?? 0).toLocaleString("ar-EG"),
            filter: "posted",
            icon: CheckCircle,
            color: "bg-emerald-500/10 text-emerald-600",
          },
          {
            label: "إجمالي المبيعات",
            value: formatCurrency(totalSales),
            filter: "",
            icon: DollarSign,
            color: "bg-blue-500/10 text-blue-600",
          },
          {
            label: "المرتجعات",
            value: formatCurrency(totalReturns),
            filter: "",
            icon: Undo2,
            color: "bg-orange-500/10 text-orange-600",
          },
          {
            label: "صافي المبيعات",
            value: formatCurrency(netSales),
            filter: "",
            icon: DollarSign,
            color: "bg-teal-500/10 text-teal-600",
          },
          {
            label: "المحصّل",
            value: formatCurrency(totalPaid),
            filter: "",
            icon: CreditCard,
            color: "bg-emerald-500/10 text-emerald-600",
          },
          {
            label: "المتبقي",
            value: formatCurrency(totalOutstanding),
            filter: "",
            icon: AlertTriangle,
            color:
              totalOutstanding > 0
                ? "bg-destructive/10 text-destructive"
                : "bg-emerald-500/10 text-emerald-600",
          },
        ].map(({ label, value, filter, icon: Icon, color }) => (
          <button
            key={label}
            onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-4 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}
          >
            <div className="flex items-center justify-between mb-2">
              <div
                className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-2xl font-black text-foreground font-mono">
                {value}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

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
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="posted">مُرحّل</SelectItem>
                <SelectItem value="cancelled">ملغي</SelectItem>
              </SelectContent>
            </Select>
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
