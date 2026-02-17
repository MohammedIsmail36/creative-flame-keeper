import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, FileText, Eye } from "lucide-react";

interface Invoice {
  id: string; invoice_number: number; customer_id: string | null; customer_name?: string;
  invoice_date: string; status: string; subtotal: number; discount: number; tax: number; total: number; paid_amount: number; notes: string | null;
}

const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function Sales() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("sales_invoices" as any) as any)
      .select("*, customers:customer_id(name)").order("invoice_number", { ascending: false });
    setInvoices((data || []).map((inv: any) => ({ ...inv, customer_name: inv.customers?.name })));
    setLoading(false);
  }

  const filtered = statusFilter === "all" ? invoices : invoices.filter(i => i.status === statusFilter);

  const columns: ColumnDef<Invoice, any>[] = [
    {
      accessorKey: "invoice_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم الفاتورة" />,
      cell: ({ row }) => <span className="font-mono">#{row.original.invoice_number}</span>,
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
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">فواتير البيع</h1>
            <p className="text-sm text-muted-foreground">{invoices.length} فاتورة</p>
          </div>
        </div>
        <Button onClick={() => navigate("/sales/new")} className="gap-2"><Plus className="h-4 w-4" />فاتورة جديدة</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "الكل", value: invoices.length, filter: "all" },
          { label: "مسودة", value: invoices.filter(i => i.status === "draft").length, filter: "draft" },
          { label: "مُرحّل", value: invoices.filter(i => i.status === "posted").length, filter: "posted" },
          { label: "إجمالي المبيعات", value: invoices.filter(i => i.status === "posted").reduce((s, i) => s + i.total, 0).toLocaleString("en-US", { minimumFractionDigits: 2 }) + " EGP", filter: "" },
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
        searchPlaceholder="بحث برقم الفاتورة أو اسم العميل..."
        isLoading={loading}
        emptyMessage="لا توجد فواتير"
        onRowClick={(inv) => navigate(`/sales/${inv.id}`)}
      />
    </div>
  );
}
