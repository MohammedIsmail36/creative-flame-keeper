import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, RotateCcw, Eye, X, Clock, CheckCircle, Ban, DollarSign } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useSettings } from "@/contexts/SettingsContext";

interface Return {
  id: string; return_number: number; posted_number: number | null; customer_id: string | null; customer_name?: string;
  return_date: string; status: string; total: number;
}

const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function SalesReturns() {
  const navigate = useNavigate();
  const { settings, formatCurrency } = useSettings();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("sales_returns" as any) as any)
      .select("*, customers:customer_id(name)").order("return_number", { ascending: false });
    setReturns((data || []).map((r: any) => ({ ...r, customer_name: r.customers?.name })));
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return returns.filter(r => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (dateFrom && r.return_date < dateFrom) return false;
      if (dateTo && r.return_date > dateTo) return false;
      return true;
    });
  }, [returns, statusFilter, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const s = { total: returns.length, draft: 0, posted: 0, cancelled: 0, totalAmount: 0 };
    returns.forEach(r => {
      if (r.status === "draft") s.draft++;
      else if (r.status === "posted") { s.posted++; s.totalAmount += Number(r.total); }
      else if (r.status === "cancelled") s.cancelled++;
    });
    return s;
  }, [returns]);

  const hasFilters = statusFilter !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); };

  const prefix = settings?.sales_return_prefix || "SRN-";

  const columns: ColumnDef<Return, any>[] = [
    {
      accessorKey: "return_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم المرتجع" />,
      cell: ({ row }) => <span className="font-mono">{formatDisplayNumber(prefix, row.original.posted_number, row.original.return_number, row.original.status)}</span>,
    },
    {
      accessorKey: "customer_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="العميل" />,
      cell: ({ row }) => <span className="font-medium">{row.original.customer_name || "—"}</span>,
    },
    {
      accessorKey: "return_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.return_date}</span>,
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الإجمالي" />,
      cell: ({ row }) => <span className="font-mono">{row.original.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>,
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => <Badge variant={statusColors[row.original.status] as any}>{statusLabels[row.original.status]}</Badge>,
    },
    {
      id: "actions",
      header: "عرض",
      enableHiding: false,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/sales-returns/${row.original.id}`); }}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <RotateCcw className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">مرتجعات المبيعات</h1>
            <p className="text-sm text-muted-foreground">{returns.length} مرتجع</p>
          </div>
        </div>
        <Button onClick={() => navigate("/sales-returns/new")} className="gap-2"><Plus className="h-4 w-4" />مرتجع جديد</Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "إجمالي المرتجعات", value: stats.total, icon: RotateCcw, color: "bg-foreground/5 text-foreground", filter: "all" },
          { label: "مسودات", value: stats.draft, icon: Clock, color: "bg-amber-500/10 text-amber-600", filter: "draft" },
          { label: "مُرحّلة", value: stats.posted, icon: CheckCircle, color: "bg-green-500/10 text-green-600", filter: "posted" },
          { label: "ملغاة", value: stats.cancelled, icon: Ban, color: "bg-destructive/10 text-destructive", filter: "cancelled" },
          { label: "إجمالي المبالغ", value: formatCurrency(stats.totalAmount), icon: DollarSign, color: "bg-blue-500/10 text-blue-600", filter: "" },
        ].map(({ label, value, icon: Icon, color, filter }) => (
          <button key={label} onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-3 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xl font-bold text-foreground">{value}</span>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="بحث..."
        isLoading={loading}
        emptyMessage="لا توجد مرتجعات"
        onRowClick={(r) => navigate(`/sales-returns/${r.id}`)}
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
            <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" className="w-[150px] h-9 text-sm" />
            <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" className="w-[150px] h-9 text-sm" />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
            <ExportMenu config={{
              filenamePrefix: "مرتجعات-المبيعات",
              sheetName: "مرتجعات المبيعات",
              pdfTitle: "مرتجعات المبيعات",
              headers: ["رقم المرتجع", "العميل", "التاريخ", "الإجمالي", "الحالة"],
              rows: filtered.map(r => [`#${r.return_number}`, r.customer_name || "—", r.return_date, formatCurrency(r.total), statusLabels[r.status] || r.status]),
              settings,
            }} disabled={loading} />
          </div>
        }
      />
    </div>
  );
}
