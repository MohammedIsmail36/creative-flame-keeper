import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, FileText, Eye, X, Clock, CheckCircle, DollarSign } from "lucide-react";
import { formatDisplayNumber } from "@/lib/posted-number-utils";
import { ExportMenu } from "@/components/ExportMenu";

interface Invoice {
  id: string; invoice_number: number; posted_number: number | null; customer_id: string | null; customer_name?: string;
  invoice_date: string; status: string; subtotal: number; discount: number; tax: number; total: number; paid_amount: number; notes: string | null;
}

const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function Sales() {
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const prefix = settings?.sales_invoice_prefix || "INV-";
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("sales_invoices" as any) as any)
      .select("*, customers:customer_id(name)").order("invoice_number", { ascending: false });
    setInvoices((data || []).map((inv: any) => ({ ...inv, customer_name: inv.customers?.name })));
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return invoices.filter(i => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (dateFrom && i.invoice_date < dateFrom) return false;
      if (dateTo && i.invoice_date > dateTo) return false;
      return true;
    });
  }, [invoices, statusFilter, dateFrom, dateTo]);

  const hasFilters = statusFilter !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); };

  const columns: ColumnDef<Invoice, any>[] = [
    {
      accessorKey: "invoice_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم الفاتورة" />,
      cell: ({ row }) => <span className="font-mono">{formatDisplayNumber(prefix, row.original.posted_number, row.original.invoice_number, row.original.status)}</span>,
    },
    {
      accessorKey: "customer_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="العميل" />,
      cell: ({ row }) => <span className="font-medium">{row.original.customer_name || "—"}</span>,
    },
    {
      accessorKey: "invoice_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.invoice_date}</span>,
    },
    {
      accessorKey: "total",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الإجمالي" />,
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.total)}</span>,
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
        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/sales/${row.original.id}`); }}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-foreground">فواتير البيع</h1>
            <p className="text-sm text-muted-foreground">{invoices.length} فاتورة</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu config={{
            filenamePrefix: "فواتير-البيع",
            sheetName: "فواتير البيع",
            pdfTitle: "فواتير البيع",
            headers: ["رقم الفاتورة", "العميل", "التاريخ", "الإجمالي", "الحالة"],
            rows: filtered.map(i => [formatDisplayNumber(prefix, i.posted_number, i.invoice_number, i.status), i.customer_name || "—", i.invoice_date, formatCurrency(i.total), statusLabels[i.status] || i.status]),
            settings: null,
            pdfOrientation: "landscape",
          }} disabled={loading} />
          <Button onClick={() => navigate("/sales/new")} className="gap-2 shadow-md shadow-primary/20 font-bold"><Plus className="h-4 w-4" />فاتورة جديدة</Button>
        </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "الكل", value: invoices.length, filter: "all", icon: FileText, color: "bg-primary/10 text-primary" },
          { label: "مسودة", value: invoices.filter(i => i.status === "draft").length, filter: "draft", icon: Clock, color: "bg-amber-500/10 text-amber-600" },
          { label: "مُرحّل", value: invoices.filter(i => i.status === "posted").length, filter: "posted", icon: CheckCircle, color: "bg-emerald-500/10 text-emerald-600" },
          { label: "إجمالي المبيعات", value: formatCurrency(invoices.filter(i => i.status === "posted").reduce((s, i) => s + i.total, 0)), filter: "", icon: DollarSign, color: "bg-blue-500/10 text-blue-600" },
        ].map(({ label, value, filter, icon: Icon, color }) => (
          <button key={label} onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-4 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-center justify-between mb-2">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-2xl font-black text-foreground font-mono">{value}</span>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="بحث برقم الفاتورة أو اسم العميل..."
        isLoading={loading}
        emptyMessage="لا توجد فواتير"
        onRowClick={(inv) => navigate(`/sales/${inv.id}`)}
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
          </div>
        }
      />
    </div>
  );
}
