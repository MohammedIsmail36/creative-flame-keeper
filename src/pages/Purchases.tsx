import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ShoppingCart, Eye, X } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";

interface Invoice {
  id: string; invoice_number: number; supplier_id: string | null; supplier_name?: string;
  invoice_date: string; status: string; subtotal: number; discount: number; tax: number; total: number; paid_amount: number; notes: string | null;
}

const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function Purchases() {
  const { role } = useAuth();
  const { formatCurrency } = useSettings();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("purchase_invoices" as any) as any)
      .select("*, suppliers:supplier_id(name)").order("invoice_number", { ascending: false });
    setInvoices((data || []).map((inv: any) => ({ ...inv, supplier_name: inv.suppliers?.name })));
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
      cell: ({ row }) => <span className="font-mono">#{row.original.invoice_number}</span>,
    },
    {
      accessorKey: "supplier_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المورد" />,
      cell: ({ row }) => <span className="font-medium">{row.original.supplier_name || "—"}</span>,
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
        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/purchases/${row.original.id}`); }}>
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
            <ShoppingCart className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">فواتير الشراء</h1>
            <p className="text-sm text-muted-foreground">{invoices.length} فاتورة</p>
          </div>
        </div>
        {canEdit && <Button onClick={() => navigate("/purchases/new")} className="gap-2"><Plus className="h-4 w-4" />فاتورة جديدة</Button>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "الكل", value: invoices.length, filter: "all" },
          { label: "مسودة", value: invoices.filter(i => i.status === "draft").length, filter: "draft" },
          { label: "مُرحّل", value: invoices.filter(i => i.status === "posted").length, filter: "posted" },
          { label: "إجمالي المشتريات", value: formatCurrency(invoices.filter(i => i.status === "posted").reduce((s, i) => s + i.total, 0)), filter: "" },
        ].map(({ label, value, filter }) => (
          <button key={label} onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-3 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-lg font-bold text-foreground mt-1">{value}</p>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="بحث برقم الفاتورة أو اسم المورد..."
        isLoading={loading}
        emptyMessage="لا توجد فواتير"
        onRowClick={(inv) => navigate(`/purchases/${inv.id}`)}
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
            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-9 text-sm" />
            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-9 text-sm" />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
            <ExportMenu config={{
              filenamePrefix: "فواتير-الشراء",
              sheetName: "فواتير الشراء",
              pdfTitle: "فواتير الشراء",
              headers: ["رقم الفاتورة", "المورد", "التاريخ", "الإجمالي", "الحالة"],
              rows: filtered.map(i => [`#${i.invoice_number}`, i.supplier_name || "—", i.invoice_date, formatCurrency(i.total), statusLabels[i.status] || i.status]),
              settings: null,
              pdfOrientation: "landscape",
            }} disabled={loading} />
          </div>
        }
      />
    </div>
  );
}
