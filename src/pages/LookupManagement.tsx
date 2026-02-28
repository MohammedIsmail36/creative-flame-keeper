import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowRight, X, Upload } from "lucide-react";
import { LookupImportDialog } from "@/components/LookupImportDialog";

interface LookupConfig {
  table: string;
  fkColumn: string;
  title: string;
  singularTitle: string;
  extraFields?: { key: string; label: string; placeholder: string }[];
}

const configs: Record<string, LookupConfig> = {
  categories: {
    table: "product_categories",
    fkColumn: "category_id",
    title: "التصنيفات",
    singularTitle: "تصنيف",
    extraFields: [{ key: "description", label: "الوصف", placeholder: "وصف التصنيف (اختياري)" }],
  },
  units: {
    table: "product_units",
    fkColumn: "unit_id",
    title: "وحدات القياس",
    singularTitle: "وحدة قياس",
    extraFields: [{ key: "symbol", label: "الرمز", placeholder: "مثل: كجم، م، قطعة" }],
  },
  brands: {
    table: "product_brands",
    fkColumn: "brand_id",
    title: "الماركات / المصنعين",
    singularTitle: "ماركة",
    extraFields: [{ key: "country", label: "بلد المنشأ", placeholder: "مثل: مصر، الصين" }],
  },
};

export default function LookupManagement() {
  const { type } = useParams<{ type: string }>();
  const navigate = useNavigate();
  const config = configs[type || ""];

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [formName, setFormName] = useState("");
  const [formExtras, setFormExtras] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    if (config) fetchItems();
  }, [type]);

  if (!config) return <div className="p-12 text-center text-muted-foreground" dir="rtl">صفحة غير موجودة</div>;

  async function fetchItems() {
    setLoading(true);
    const { data } = await (supabase.from(config.table as any) as any).select("*").order("name");
    setItems(data || []);
    setLoading(false);
  }

  function openAdd() {
    setEditItem(null);
    setFormName("");
    setFormExtras({});
    setDialogOpen(true);
  }

  function openEdit(item: any) {
    setEditItem(item);
    setFormName(item.name);
    const extras: Record<string, string> = {};
    config.extraFields?.forEach(f => { extras[f.key] = item[f.key] || ""; });
    setFormExtras(extras);
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال الاسم", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = { name: formName.trim() };
    config.extraFields?.forEach(f => { payload[f.key] = formExtras[f.key]?.trim() || null; });

    try {
      if (editItem) {
        const { error } = await (supabase.from(config.table as any) as any).update(payload).eq("id", editItem.id);
        if (error) throw error;
        toast({ title: "تم التحديث", description: `تم تعديل ${config.singularTitle} بنجاح` });
      } else {
        const { error } = await (supabase.from(config.table as any) as any).insert(payload);
        if (error) throw error;
        toast({ title: "تمت الإضافة", description: `تم إضافة ${config.singularTitle} بنجاح` });
      }
      setDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      const msg = error.message?.includes("duplicate") ? "الاسم موجود مسبقاً" : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { count } = await (supabase.from("products") as any).select("id", { count: "exact", head: true }).eq(config.fkColumn, deleteTarget.id);
      if (count && count > 0) {
        toast({ title: "لا يمكن الحذف", description: `هذا ${config.singularTitle} مرتبط بـ ${count} منتج. قم بتعطيله بدلاً من حذفه.`, variant: "destructive" });
        setDeleteDialogOpen(false);
        return;
      }
      const { error } = await (supabase.from(config.table as any) as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف", description: `تم حذف ${config.singularTitle} نهائياً` });
      setDeleteDialogOpen(false);
      fetchItems();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function toggleActive(item: any) {
    await (supabase.from(config.table as any) as any).update({ is_active: !item.is_active }).eq("id", item.id);
    fetchItems();
  }

  const filteredItems = useMemo(() => {
    if (statusFilter === "all") return items;
    return items.filter(i => statusFilter === "active" ? i.is_active : !i.is_active);
  }, [items, statusFilter]);

  const hasFilters = statusFilter !== "all";
  const clearFilters = () => setStatusFilter("all");

  const columns: ColumnDef<any, any>[] = [
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الاسم" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    ...(config.extraFields?.map(f => ({
      accessorKey: f.key,
      header: f.label,
      cell: ({ row }: any) => <span className="text-muted-foreground">{row.original[f.key] || "—"}</span>,
    })) || []) as ColumnDef<any, any>[],
    {
      id: "status",
      header: "الحالة",
      cell: ({ row }) => (
        <div onClick={e => e.stopPropagation()}>
          <Switch checked={row.original.is_active} onCheckedChange={() => toggleActive(row.original)} />
        </div>
      ),
    },
    {
      id: "actions",
      header: "إجراءات",
      enableHiding: false,
      cell: ({ row }) => (
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row.original)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => { setDeleteTarget(row.original); setDeleteDialogOpen(true); }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
            <ArrowRight className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
          <Badge variant="secondary">{items.length} عنصر</Badge>
        </div>
        <div className="flex gap-2">
          {(type === "categories" || type === "brands") && (
            <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4" />استيراد Excel
            </Button>
          )}
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" />إضافة {config.singularTitle}</Button>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={filteredItems}
        searchPlaceholder={`بحث في ${config.title}...`}
        isLoading={loading}
        emptyMessage="لا توجد بيانات"
        toolbarContent={
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-32 h-9 text-sm">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل ({items.length})</SelectItem>
                <SelectItem value="active">نشط ({items.filter(i => i.is_active).length})</SelectItem>
                <SelectItem value="inactive">معطل ({items.filter(i => !i.is_active).length})</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
          </div>
        }
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editItem ? `تعديل ${config.singularTitle}` : `إضافة ${config.singularTitle}`}</DialogTitle>
            <DialogDescription>أدخل البيانات ثم اضغط حفظ</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الاسم *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="الاسم" onKeyDown={e => e.key === "Enter" && handleSave()} />
            </div>
            {config.extraFields?.map(f => (
              <div key={f.key} className="space-y-2">
                <Label>{f.label}</Label>
                <Input value={formExtras[f.key] || ""} onChange={e => setFormExtras(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              </div>
            ))}
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>تأكيد الحذف النهائي</DialogTitle>
            <DialogDescription>سيتم حذف "{deleteTarget?.name}" نهائياً ولا يمكن التراجع. هل تريد المتابعة؟</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button variant="destructive" onClick={handleDelete}>حذف نهائي</Button>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>تراجع</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      {(type === "categories" || type === "brands") && (
        <LookupImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          type={type as "categories" | "brands"}
          onImportComplete={fetchItems}
        />
      )}
    </div>
  );
}
