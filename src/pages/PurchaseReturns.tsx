import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, RotateCcw, Eye } from "lucide-react";

interface Return {
  id: string; return_number: number; supplier_id: string | null; supplier_name?: string;
  return_date: string; status: string; total: number;
}

const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مُرحّل", cancelled: "ملغي" };
const statusColors: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function PurchaseReturns() {
  const { role } = useAuth();
  const navigate = useNavigate();
  const [returns, setReturns] = useState<Return[]>([]);
  const [loading, setLoading] = useState(true);
  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const { data } = await (supabase.from("purchase_returns" as any) as any)
      .select("*, suppliers:supplier_id(name)").order("return_number", { ascending: false });
    setReturns((data || []).map((r: any) => ({ ...r, supplier_name: r.suppliers?.name })));
    setLoading(false);
  }

  const columns: ColumnDef<Return, any>[] = [
    {
      accessorKey: "return_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم المرتجع" />,
      cell: ({ row }) => <span className="font-mono">#{row.original.return_number}</span>,
    },
    {
      accessorKey: "supplier_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المورد" />,
      cell: ({ row }) => <span className="font-medium">{row.original.supplier_name || "—"}</span>,
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
        <Button variant="ghost" size="icon" onClick={e => { e.stopPropagation(); navigate(`/purchase-returns/${row.original.id}`); }}>
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
            <h1 className="text-2xl font-bold text-foreground">مرتجعات المشتريات</h1>
            <p className="text-sm text-muted-foreground">{returns.length} مرتجع</p>
          </div>
        </div>
        {canEdit && <Button onClick={() => navigate("/purchase-returns/new")} className="gap-2"><Plus className="h-4 w-4" />مرتجع جديد</Button>}
      </div>

      <DataTable
        columns={columns}
        data={returns}
        searchPlaceholder="بحث..."
        isLoading={loading}
        emptyMessage="لا توجد مرتجعات"
        onRowClick={(r) => navigate(`/purchase-returns/${r.id}`)}
      />
    </div>
  );
}
