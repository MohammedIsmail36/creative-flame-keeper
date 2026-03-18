import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AccountCombobox } from "@/components/AccountCombobox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Receipt } from "lucide-react";

interface Account { id: string; code: string; name: string; account_type: string; }
interface ExpenseType {
  id: string; name: string; account_id: string; is_active: boolean; created_at: string;
  account_name?: string; account_code?: string;
}

export default function ExpenseTypes() {
  const [types, setTypes] = useState<ExpenseType[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ExpenseType | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExpenseType | null>(null);

  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [typesRes, accRes] = await Promise.all([
      supabase.from("expense_types" as any).select("*, accounts:account_id(code, name)").order("created_at", { ascending: false }),
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code"),
    ]);
    const mapped = ((typesRes.data as any) || []).map((t: any) => ({
      ...t,
      account_name: t.accounts?.name,
      account_code: t.accounts?.code,
    }));
    setTypes(mapped);
    setAccounts(accRes.data || []);
    setLoading(false);
  }

  function resetForm() {
    setName(""); setAccountId(""); setIsActive(true); setEditTarget(null);
  }

  function openEdit(t: ExpenseType) {
    setEditTarget(t);
    setName(t.name);
    setAccountId(t.account_id);
    setIsActive(t.is_active);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!name.trim() || !accountId) {
      toast({ title: "تنبيه", description: "يرجى إدخال اسم النوع واختيار الحساب", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = { name: name.trim(), account_id: accountId, is_active: isActive };
      if (editTarget) {
        const { error } = await (supabase.from("expense_types" as any) as any).update(payload).eq("id", editTarget.id);
        if (error) throw error;
        toast({ title: "تم التحديث", description: "تم تحديث نوع المصروف بنجاح" });
      } else {
        const { error } = await (supabase.from("expense_types" as any) as any).insert(payload);
        if (error) throw error;
        toast({ title: "تم الحفظ", description: "تم إضافة نوع المصروف بنجاح" });
      }
      setDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      // Check if type is used
      const { count } = await (supabase.from("expenses" as any) as any)
        .select("id", { count: "exact", head: true })
        .eq("expense_type_id", deleteTarget.id);
      if (count && count > 0) {
        toast({ title: "لا يمكن الحذف", description: "يوجد مصروفات مرتبطة بهذا النوع", variant: "destructive" });
        setDeleteTarget(null);
        return;
      }
      const { error } = await (supabase.from("expense_types" as any) as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف", description: "تم حذف نوع المصروف" });
      setDeleteTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  const columns: ColumnDef<ExpenseType>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="نوع المصروف" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "account_code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الحساب المرتبط" />,
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {row.original.account_code} - {row.original.account_name}
        </span>
      ),
    },
    {
      accessorKey: "is_active",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الحالة" />,
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? "default" : "secondary"}>
          {row.original.is_active ? "نشط" : "غير نشط"}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "إجراءات",
      cell: ({ row }) => (
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(row.original)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const activeCount = types.filter(t => t.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">أنواع المصروفات</h1>
            <p className="text-sm text-muted-foreground">إدارة أنواع المصروفات وربطها بالحسابات</p>
          </div>
        </div>
        <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 ml-2" /> إضافة نوع
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">إجمالي الأنواع</p>
          <p className="text-2xl font-bold">{types.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">أنواع نشطة</p>
          <p className="text-2xl font-bold text-green-600">{activeCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">أنواع غير نشطة</p>
          <p className="text-2xl font-bold text-muted-foreground">{types.length - activeCount}</p>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm">
        <DataTable columns={columns} data={types} searchKey="name" searchPlaceholder="بحث بنوع المصروف..." />
      </div>

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editTarget ? "تعديل نوع المصروف" : "إضافة نوع مصروف"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>اسم النوع *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="مثال: إيجار" className="mt-1" />
            </div>
            <div>
              <Label>الحساب المرتبط *</Label>
              <div className="mt-1">
                <AccountCombobox accounts={accounts} value={accountId} onValueChange={setAccountId} placeholder="اختر الحساب..." />
              </div>
              <p className="text-xs text-muted-foreground mt-1">إذا لم يكن الحساب موجوداً، أنشئه من شجرة الحسابات أولاً</p>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>نشط</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف نوع المصروف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف "{deleteTarget?.name}"؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
