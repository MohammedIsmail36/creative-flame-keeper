import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ArrowRight, Search } from "lucide-react";

interface LookupConfig {
  table: string;
  fkColumn: string; // foreign key column in products table
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
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [formName, setFormName] = useState("");
  const [formExtras, setFormExtras] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

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
      // Check if linked to any product
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

  const filtered = items.filter(i => i.name?.includes(search));

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/products")}>
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold text-foreground">{config.title}</h1>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-4">
          <CardTitle className="text-base">قائمة {config.title}</CardTitle>
          <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" />إضافة {config.singularTitle}</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث..." value={search} onChange={e => setSearch(e.target.value)} className="pr-9" />
          </div>

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الاسم</TableHead>
                    {config.extraFields?.map(f => (
                      <TableHead key={f.key} className="text-right">{f.label}</TableHead>
                    ))}
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right w-[120px]">إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={3 + (config.extraFields?.length || 0)} className="text-center py-8 text-muted-foreground">لا توجد بيانات</TableCell></TableRow>
                  ) : filtered.map(item => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.name}</TableCell>
                      {config.extraFields?.map(f => (
                        <TableCell key={f.key} className="text-muted-foreground">{item[f.key] || "—"}</TableCell>
                      ))}
                      <TableCell>
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={() => toggleActive(item)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => { setDeleteTarget(item); setDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
                <Input
                  value={formExtras[f.key] || ""}
                  onChange={e => setFormExtras(prev => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                />
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
    </div>
  );
}
