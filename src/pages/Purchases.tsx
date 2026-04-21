import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/DatePickerInput";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef, PaginationState } from "@tanstack/react-table";
import {
  Plus,
  ShoppingCart,
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
import { ExportMenu } from "@/components/ExportMenu";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { usePagedQuery, useDebouncedValue } from "@/hooks/use-paged-query";
import { StatusChips } from "@/components/StatusChips";

interface Invoice {
  id: string;
  invoice_number: number;
  posted_number: number | null;
  supplier_id: string | null;
  supplier_name?: string;
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

const PAGE_SIZE = 20;
const fmtNum = (n: number) => Number(n || 0).toLocaleString("en-US");

export default function Purchases() {
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const prefix = settings?.purchase_invoice_prefix || "PUR-";
  const navigate = useNavigate();
  const canEdit = role === "admin" || role === "accountant";

  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const { data: summary } = useQuery({
    queryKey: ["purchases-summary", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_purchases_summary" as any,
        {
          p_date_from: dateFrom || null,
          p_date_to: dateTo || null,
        },
      );
      if (error) throw error;
      return data as any;
    },
    staleTime: 30_000,
  });

  const { data: pagedData, isLoading } = usePagedQuery<Invoice>(
    [
      "purchases-list",
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

      let q = (supabase.from("purchase_invoices") as any)
        .select(
          "id, invoice_number, posted_number, supplier_id, invoice_date, due_date, status, subtotal, discount, tax, total, paid_amount, reference, notes, suppliers:supplier_id(name)",
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
          q = q.ilike("suppliers.name", `%${s}%`);
        }
      }

      const { data, error, count } = await q;
      if (error) {
        toast({
          title: "خطأ",
          description: "فشل في تحميل فواتير الشراء",
          variant: "destructive",
        });
        throw error;
      }
      return {
        rows: (data || []).map((inv: any) => ({
          ...inv,
          supplier_name: inv.suppliers?.name,
        })),
        totalCount: count ?? 0,
      };
    },
  );

  const invoices = pagedData?.rows ?? [];
  const totalCount = pagedData?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));

  const fetchAllForExport = async (
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Invoice[]> => {
    const { fetchAllPaged } = await import("@/lib/paged-fetch");
    const rows = await fetchAllPaged<any>(
      () => {
        let q = (supabase.from("purchase_invoices") as any)
          .select(
            "id, invoice_number, posted_number, supplier_id, invoice_date, due_date, status, subtotal, discount, tax, total, paid_amount, reference, notes, suppliers:supplier_id(name)",
            { count: "exact" },
          )
          .order("invoice_number", { ascending: false });
        if (statusFilter !== "all") q = q.eq("status", statusFilter);
        if (dateFrom) q = q.gte("invoice_date", dateFrom);
        if (dateTo) q = q.lte("invoice_date", dateTo);
        return q;
      },
      { batchSize: 500, maxRows: 50000, onProgress },
    );
    return rows.map((inv: any) => ({
      ...inv,
      supplier_name: inv.suppliers?.name,
    }));
  };

  const [exportRows, setExportRows] = useState<any[][]>([]);
  React.useEffect(() => {
    setExportRows([]);
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);
  const handlePrepareExport = async (
    onProgress?: (loaded: number, total: number) => void,
  ) => {
    const all = await fetchAllForExport(onProgress);
    const rows = all.map((i) => [
      formatDisplayNumber(prefix, i.posted_number, i.invoice_number, i.status),
      i.supplier_name || "—",
      i.invoice_date,
      formatCurrency(i.total),
      i.status === "posted" ? formatCurrency(i.paid_amount) : "—",
      i.status === "posted" ? formatCurrency(i.total - i.paid_amount) : "—",
      i.due_date || "—",
      INVOICE_STATUS_LABELS[i.status] || i.status,
    ]);
    setExportRows(rows);
    return { rows };
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
        accessorKey: "supplier_name",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title="المورد" />
        ),
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.supplier_name || "—"}
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
          if (row.original.status === "draft")
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
        cell: ({ row }) => {
          if (row.original.status === "draft")
            return <span className="text-muted-foreground">—</span>;
          const rem = row.original.total - row.original.paid_amount;
          return (
            <span
              className={`font-mono font-bold ${
                rem > 0 ? "text-destructive" : "text-emerald-600"
              }`}
            >
              {formatCurrency(rem)}
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
          const d = row.original.due_date;
          if (!d) return <span className="text-muted-foreground">—</span>;
          const overdue =
            new Date(d) < new Date() &&
            row.original.status === "posted" &&
            row.original.total - row.original.paid_amount > 0;
          return (
            <span className="flex items-center gap-1">
              <span className="font-mono">{d}</span>
              {overdue && (
                <Badge variant="destructive" className="text-[10px] px-1 py-0">
                  متأخرة
                </Badge>
              )}
            </span>
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
              navigate(`/purchases/${row.original.id}`);
            }}
          >
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [prefix, formatCurrency, navigate],
  );

  const totalPurchases = summary?.total_purchases ?? 0;
  const totalReturns = summary?.total_returns ?? 0;
  const netPurchases = totalPurchases - totalReturns;
  const totalPaid = summary?.total_paid ?? 0;
  const totalOutstanding = summary?.total_outstanding ?? 0;

  const kpiCards = [
    {
      label: "إجمالي المشتريات",
      value: formatCurrency(totalPurchases),
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
      label: "صافي المشتريات",
      value: formatCurrency(netPurchases),
      icon: ShoppingCart,
      color: "bg-indigo-500/10 text-indigo-600",
    },
    {
      label: "المدفوع",
      value: formatCurrency(totalPaid),
      icon: CreditCard,
      color: "bg-teal-500/10 text-teal-600",
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
      icon: ShoppingCart,
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
        icon={ShoppingCart}
        title="فواتير الشراء"
        description={`${fmtNum(summary?.total_count ?? 0)} فاتورة`}
        actions={
          <>
            <ExportMenu
              config={{
                filenamePrefix: "فواتير-الشراء",
                sheetName: "فواتير الشراء",
                pdfTitle: "فواتير الشراء",
                headers: [
                  "رقم الفاتورة",
                  "المورد",
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
            {canEdit && (
              <Button
                onClick={() => navigate("/purchases/new")}
                className="gap-2 shadow-md shadow-primary/20 font-bold"
              >
                <Plus className="h-4 w-4" />
                فاتورة جديدة
              </Button>
            )}
          </>
        }
      />

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

      <StatusChips
        chips={statusChips}
        active={statusFilter}
        onSelect={setStatusFilter}
      />

      <DataTable
        columns={columns}
        data={invoices}
        searchPlaceholder="بحث برقم الفاتورة أو اسم المورد..."
        isLoading={isLoading}
        emptyMessage="لا توجد فواتير"
        onRowClick={(inv) => navigate(`/purchases/${inv.id}`)}
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
