import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ClipboardCheck, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

interface AdjustmentRow {
  id: string;
  adjustment_number: number;
  adjustment_date: string;
  description: string | null;
  status: string;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  draft: "مسودة",
  approved: "معتمد",
};
const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
};

export default function InventoryAdjustments() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const queryClient = useQueryClient();

  const { data: adjustments = [], isLoading } = useQuery({
    queryKey: ["inventory-adjustments"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("inventory_adjustments" as any) as any)
        .select("*")
        .order("adjustment_number", { ascending: false });
      if (error) throw error;
      return data as AdjustmentRow[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from("inventory_adjustment_items" as any) as any).delete().eq("adjustment_id", id);
      if (error) throw error;
      const { error: err2 } = await (supabase.from("inventory_adjustments" as any) as any).delete().eq("id", id);
      if (err2) throw err2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      toast({ title: "تم حذف التسوية بنجاح" });
    },
    onError: () => toast({ title: "خطأ في الحذف", variant: "destructive" }),
  });

  const columns: ColumnDef<AdjustmentRow, any>[] = [
    {
      accessorKey: "adjustment_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم التسوية" />,
      cell: ({ row }) => <span className="font-medium">ADJ-{row.original.adjustment_number}</span>,
    },
    {
      accessorKey: "adjustment_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
    },
    {
      accessorKey: "description",
      header: "الوصف",
      cell: ({ row }) => <span>{row.original.description || "-"}</span>,
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => (
        <Badge variant="secondary" className={statusColors[row.original.status] || ""}>
          {statusLabels[row.original.status] || row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => navigate(`/inventory-adjustments/${row.original.id}`)}>
            عرض
          </Button>
          {row.original.status === "draft" && role === "admin" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost" className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف التسوية</AlertDialogTitle>
                  <AlertDialogDescription>هل أنت متأكد من حذف هذه التسوية؟</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteMutation.mutate(row.original.id)}>حذف</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">تسوية المخزون</h1>
          <p className="text-muted-foreground text-sm mt-1">إدارة عمليات الجرد وتسوية الفروقات</p>
        </div>
        <Button onClick={() => navigate("/inventory-adjustments/new")}>
          <Plus className="w-4 h-4 ml-2" />
          تسوية جديدة
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-blue-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي التسويات</p>
              <p className="text-lg font-bold">{adjustments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">تسويات معتمدة</p>
              <p className="text-lg font-bold text-green-700">{adjustments.filter(a => a.status === "approved").length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <DataTable
        columns={columns}
        data={adjustments}
        searchPlaceholder="بحث في التسويات..."
        isLoading={isLoading}
        emptyMessage="لا توجد تسويات"
      />
    </div>
  );
}
