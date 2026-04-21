import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  RotateCcw,
  Eye,
  X,
  Clock,
  CheckCircle,
  Ban,
  DollarSign,
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useSettings } from "@/contexts/SettingsContext";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import { toast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { usePagedQuery, useDebouncedValue } from "@/hooks/use-paged-query";

interface Return {
  id: string;
  return_number: number;
  posted_number: number | null;
  supplier_id: string | null;
  supplier_name?: string;
  return_date: string;
  status: string;
  total: number;
}

const PAGE_SIZE = 20;
const fmtNum = (n: number) => Number(n || 0).toLocaleString("en-US");

export default function PurchaseReturns() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const { settings, formatCurrency } = useSettings();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const canEdit = role === "admin" || role === "accountant";

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: PAGE_SIZE,
  });

  const { data: stats } = useQuery({
    queryKey: ["purchase-returns-summary", dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase.from("purchase_returns") as any).select(
        "status, total",
      );
      if (dateFrom) q = q.gte("return_date", dateFrom);
      if (dateTo) q = q.lte("return_date", dateTo);
      const { data, error } = await q;
      if (error) throw error;
      const s = {
        total: (data || []).length,
        draft: 0,
        posted: 0,
        cancelled: 0,
        totalAmount: 0,
      };
      (data || []).forEach((r: any) => {
        if (r.status === "draft") s.draft++;
        else if (r.status === "posted") {
          s.posted++;
          s.totalAmount += Number(r.total);
        } else if (r.status === "cancelled") s.cancelled++;
      });
      return s;
    },
    staleTime: 30_000,
  });

  const { data: pagedData, isLoading } = usePagedQuery<Return>(
    [
      "purchase-returns-list",
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

      let q = (supabase.from("purchase_returns") as any)
        .select("*, suppliers:supplier_id(name)", { count: "exact" })
        .order("return_number", { ascending: false })
        .range(from, to);

      if (statusFilter !== "all") q = q.eq("status", statusFilter);
      if (dateFrom) q = q.gte("return_date", dateFrom);
      if (dateTo) q = q.lte("return_date", dateTo);
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim();
        const asNum = Number(s);
        if (!isNaN(asNum)) {
          q = q.or(`return_number.eq.${asNum},posted_number.eq.${asNum}`);
        }
      }

      const { data, error, count } = await q;
      if (error) {
        toast({
          title: "خطأ",
          description: "فشل في تحميل مرتجعات المشتريات",
          variant: "destructive",
        });
        throw error;
      }
      return {
        rows: (data || []).map((r: any) => ({
          ...r,
          supplier_name: r.suppliers?.name,
        })),
        totalCount: count ?? 0,
      };
    },
  );

  const returns = pagedData?.rows ?? [];
  const totalCount = pagedData?.totalCount ?? 0;
  const pageCount = Math.max(1, Math.ceil(totalCount / pagination.pageSize));

  React.useEffect(() => {
    setPagination((p) => ({ ...p, pageIndex: 0 }));
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);

  const fetchAllForExport = async (
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<Return[]> => {
    const { fetchAllPaged } = await import("@/lib/paged-fetch");
    const rows = await fetchAllPaged<any>(
      () => {
        let q = (supabase.from("purchase_returns") as any)
          .select("*, suppliers:supplier_id(name)", { count: "exact" })
          .order("return_number", { ascending: false });
        if (statusFilter !== "all") q = q.eq("status", statusFilter);
        if (dateFrom) q = q.gte("return_date", dateFrom);
        if (dateTo) q = q.lte("return_date", dateTo);
        return q;
      },
      { batchSize: 500, maxRows: 50000, onProgress },
    );
    return rows.map((r: any) => ({ ...r, supplier_name: r.suppliers?.name }));
  };

  const [exportRows, setExportRows] = useState<any[][]>([]);
  React.useEffect(() => {
    setExportRows([]);
  }, [statusFilter, dateFrom, dateTo, debouncedSearch]);
  const handlePrepareExport = async (
    onProgress?: (loaded: number, total: number) => void,
  ) => {
    const all = await fetchAllForExport(onProgress);
    setExportRows(
      all.map((r) => [
        formatDisplayNumber(prefix, r.posted_number, r.return_number, r.status),
        r.supplier_name || "—",
        r.return_date,
        formatCurrency(r.total),
        INVOICE_STATUS_LABELS[r.status] || r.status,
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
  };

  const prefix = settings?.purchase_return_prefix || "PRN-";

  const exportConfig = useMemo(
    () => ({
      filenamePrefix: "مرتجعات-المشتريات",
      sheetName: "مرتجعات المشتريات",
      pdfTitle: "مرتجعات المشتريات",
      headers: ["رقم المرتجع", "المورد", "التاريخ", "الإجمالي", "الحالة"],
      rows: exportRows,
      settings,
    }),
    [exportRows, settings],
  );

  const columns: ColumnDef<Return, any>[] = [
    {
      accessorKey: "return_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="رقم المرتجع" />
      ),
      cell: ({ row }) => (
        <span className="font-mono">
          {formatDisplayNumber(
            prefix,
            row.original.posted_number,
            row.original.return_number,
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
        <span className="font-medium">{row.original.supplier_name || "—"}</span>
      ),
    },
    {
      accessorKey: "return_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="التاريخ" />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.return_date}
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
          {row.original.total.toLocaleString("en-US", {
            minimumFractionDigits: 2,
          })}
        </span>
      ),
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
          aria-label="عرض المرتجع"
          onClick={(e) => {
            e.stopPropagation();
            navigate(`/purchase-returns/${row.original.id}`);
          }}
        >
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={RotateCcw}
        title="مرتجعات المشتريات"
        description={`${fmtNum(stats?.total ?? 0)} مرتجع`}
        actions={
          <>
            <ExportMenu
              config={exportConfig}
              disabled={isLoading}
              onOpen={handlePrepareExport}
            />
            {canEdit && (
              <Button
                onClick={() => navigate("/purchase-returns/new")}
                className="gap-2 shadow-md shadow-primary/20 font-bold"
              >
                <Plus className="h-4 w-4" />
                مرتجع جديد
              </Button>
            )}
          </>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          {
            label: "إجمالي المرتجعات",
            value: fmtNum(stats?.total ?? 0),
            icon: RotateCcw,
            color: "bg-primary/10 text-primary",
            filter: "all",
          },
          {
            label: "مسودات",
            value: fmtNum(stats?.draft ?? 0),
            icon: Clock,
            color: "bg-amber-500/10 text-amber-600",
            filter: "draft",
          },
          {
            label: "مُرحّلة",
            value: fmtNum(stats?.posted ?? 0),
            icon: CheckCircle,
            color: "bg-emerald-500/10 text-emerald-600",
            filter: "posted",
          },
          {
            label: "ملغاة",
            value: fmtNum(stats?.cancelled ?? 0),
            icon: Ban,
            color: "bg-destructive/10 text-destructive",
            filter: "cancelled",
          },
          {
            label: "إجمالي المبالغ",
            value: formatCurrency(stats?.totalAmount ?? 0),
            icon: DollarSign,
            color: "bg-blue-500/10 text-blue-600",
            filter: "",
          },
        ].map(({ label, value, icon: Icon, color, filter }) => (
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
        data={returns}
        searchPlaceholder="بحث..."
        isLoading={isLoading}
        emptyMessage="لا توجد مرتجعات"
        onRowClick={(r) => navigate(`/purchase-returns/${r.id}`)}
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
