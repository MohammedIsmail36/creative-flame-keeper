import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { Plus, ClipboardCheck, ClipboardList, Trash2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSettings } from "@/contexts/SettingsContext";
import { useAuth } from "@/contexts/AuthContext";
import { ExportMenu } from "@/components/ExportMenu";
import { toast } from "@/hooks/use-toast";
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_COLORS } from "@/lib/constants";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface AdjustmentRow {
  id: string;
  adjustment_number: number;
  adjustment_date: string;
  description: string | null;
  status: string;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  ...INVOICE_STATUS_LABELS,
  approved: "معتمد",
};
const statusVariants: Record<string, "secondary" | "default" | "destructive"> =
  { draft: "secondary", approved: "default", cancelled: "destructive" };

export default function InventoryAdjustments() {
  const navigate = useNavigate();
  const { role } = useAuth();
  const { settings } = useSettings();
  const queryClient = useQueryClient();

  const {
    data: adjustments = [],
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["inventory-adjustments"],
    queryFn: async () => {
      const { data, error } = await (
        supabase.from("inventory_adjustments" as any) as any
      )
        .select("*")
        .order("adjustment_number", { ascending: false });
      if (error) throw error;
      return data as AdjustmentRow[];
    },
  });

  useEffect(() => {
    if (isError) {
      toast({
        title: "خطأ",
        description: "فشل في جلب بيانات التسويات",
        variant: "destructive",
      });
    }
  }, [isError]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (
        supabase.from("inventory_adjustment_items" as any) as any
      )
        .delete()
        .eq("adjustment_id", id);
      if (error) throw error;
      const { error: err2 } = await (
        supabase.from("inventory_adjustments" as any) as any
      )
        .delete()
        .eq("id", id);
      if (err2) throw err2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-adjustments"] });
      toast({ title: "تم حذف التسوية بنجاح" });
    },
    onError: () => toast({ title: "خطأ في الحذف", variant: "destructive" }),
  });

  const approvedCount = adjustments.filter(
    (a) => a.status === "approved",
  ).length;
  const draftCount = adjustments.filter((a) => a.status === "draft").length;

  const columns: ColumnDef<AdjustmentRow, any>[] = [
    {
      accessorKey: "adjustment_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="رقم التسوية" />
      ),
      cell: ({ row }) => (
        <span className="font-mono font-semibold tabular-nums text-primary">
          ADJ-{row.original.adjustment_number}
        </span>
      ),
    },
    {
      accessorKey: "adjustment_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="التاريخ" />
      ),
      cell: ({ row }) => (
        <span className="font-mono tabular-nums text-sm">
          {row.original.adjustment_date}
        </span>
      ),
    },
    {
      accessorKey: "description",
      header: "الوصف",
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate block max-w-[250px]">
          {row.original.description || "—"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => (
        <Badge
          variant={statusVariants[row.original.status] || "secondary"}
          className="text-xs px-3 py-1"
        >
          {statusLabels[row.original.status] || row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex gap-1 justify-end">
          {row.original.status === "draft" && role === "admin" && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0"
                  aria-label="حذف التسوية"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader>
                  <AlertDialogTitle>حذف التسوية</AlertDialogTitle>
                  <AlertDialogDescription>
                    هل أنت متأكد من حذف هذه التسوية؟ لا يمكن التراجع عن هذا
                    الإجراء.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-row-reverse gap-2">
                  <AlertDialogCancel>إلغاء</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate(row.original.id)}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    حذف
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={ClipboardCheck}
        title="تسوية المخزون"
        description="إدارة عمليات الجرد وتسوية الفروقات"
        actions={
          <>
            <ExportMenu
              config={{
                filenamePrefix: "inventory-adjustments",
                sheetName: "تسويات المخزون",
                pdfTitle: "تقرير تسويات المخزون",
                headers: ["رقم التسوية", "التاريخ", "الوصف", "الحالة"],
                rows: adjustments.map((a) => [
                  `ADJ-${a.adjustment_number}`,
                  a.adjustment_date,
                  a.description || "—",
                  statusLabels[a.status] || a.status,
                ]),
                settings,
              }}
              disabled={adjustments.length === 0}
            />
            <Button
              onClick={() => navigate("/inventory-adjustments/new")}
              className="shadow-md shadow-primary/20 gap-2"
            >
              <Plus className="w-4 h-4" />
              تسوية جديدة
            </Button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">إجمالي التسويات</p>
              <p className="text-xl font-black tabular-nums">
                {adjustments.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-950/40 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-green-700 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">معتمدة</p>
              <p className="text-xl font-black tabular-nums text-green-700 dark:text-green-400">
                {approvedCount}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border shadow-sm">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 dark:bg-yellow-950/40 flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-yellow-700 dark:text-yellow-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">مسودات</p>
              <p className="text-xl font-black tabular-nums text-yellow-700 dark:text-yellow-400">
                {draftCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Table */}
      <DataTable
        columns={columns}
        data={adjustments}
        searchPlaceholder="بحث في التسويات..."
        isLoading={isLoading}
        emptyMessage="لا توجد تسويات"
        onRowClick={(row) => navigate(`/inventory-adjustments/${row.id}`)}
      />
    </div>
  );
}
