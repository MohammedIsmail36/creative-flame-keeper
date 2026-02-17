import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, X } from "lucide-react";

interface Customer {
  id: string; code: string; name: string; phone: string | null; email: string | null;
  address: string | null; tax_number: string | null; contact_person: string | null;
  notes: string | null; balance: number; is_active: boolean;
}

export default function Customers() {
  const { role } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", phone: "", email: "", address: "", tax_number: "", contact_person: "", notes: "" });
  const [balanceFilter, setBalanceFilter] = useState("all");

  const canEdit = role === "admin" || role === "accountant" || role === "sales";

  useEffect(() => { fetchCustomers(); }, []);

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await (supabase.from("customers" as any) as any).select("*").eq("is_active", true).order("code");
    setCustomers(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (balanceFilter === "all") return customers;
    if (balanceFilter === "has_balance") return customers.filter(c => c.balance > 0);
    if (balanceFilter === "no_balance") return customers.filter(c => c.balance <= 0);
    return customers;
  }, [customers, balanceFilter]);

  const hasFilters = balanceFilter !== "all";
  const clearFilters = () => setBalanceFilter("all");

  function openAdd() {
    setEditItem(null);
    setForm({ code: "", name: "", phone: "", email: "", address: "", tax_number: "", contact_person: "", notes: "" });
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditItem(c);
    setForm({ code: c.code, name: c.name, phone: c.phone || "", email: c.email || "", address: c.address || "", tax_number: c.tax_number || "", contact_person: c.contact_person || "", notes: c.notes || "" });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال الكود والاسم", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      code: form.code.trim(), name: form.name.trim(),
      phone: form.phone.trim() || null, email: form.email.trim() || null,
      address: form.address.trim() || null, tax_number: form.tax_number.trim() || null,
      contact_person: form.contact_person.trim() || null, notes: form.notes.trim() || null,
    };
    try {
      if (editItem) {
        const { error } = await (supabase.from("customers" as any) as any).update(payload).eq("id", editItem.id);
        if (error) throw error;
        toast({ title: "تم التحديث", description: "تم تعديل بيانات العميل" });
      } else {
        const { error } = await (supabase.from("customers" as any) as any).insert(payload);
        if (error) throw error;
        toast({ title: "تمت الإضافة", description: "تم إضافة العميل بنجاح" });
      }
      setDialogOpen(false);
      fetchCustomers();
    } catch (error: any) {
      const msg = error.message?.includes("duplicate") ? "كود العميل موجود مسبقاً" : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete(c: Customer) {
    const { count } = await (supabase.from("sales_invoices" as any) as any).select("id", { count: "exact", head: true }).eq("customer_id", c.id);
    if (count && count > 0) {
      toast({ title: "لا يمكن الحذف", description: `العميل مرتبط بـ ${count} فاتورة بيع`, variant: "destructive" });
      return;
    }
    const { error } = await (supabase.from("customers" as any) as any).delete().eq("id", c.id);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم الحذف", description: "تم حذف العميل" });
    fetchCustomers();
  }

  const columns: ColumnDef<Customer, any>[] = [
    {
      accessorKey: "code",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الكود" />,
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.code}</span>,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الاسم" />,
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: "phone",
      header: "الهاتف",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.phone || "—"}</span>,
    },
    {
      accessorKey: "email",
      header: "البريد",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.email || "—"}</span>,
    },
    {
      accessorKey: "balance",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الرصيد" />,
      cell: ({ row }) => (
        <Badge variant={row.original.balance > 0 ? "destructive" : "secondary"}>
          {row.original.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </Badge>
      ),
    },
    ...(canEdit ? [{
      id: "actions" as const,
      header: "إجراءات" as const,
      enableHiding: false,
      cell: ({ row }: any) => (
        <div className="flex gap-1" onClick={e => e.stopPropagation()}>
          <Button variant="ghost" size="icon" onClick={() => openEdit(row.original)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => handleDelete(row.original)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      ),
    } as ColumnDef<Customer, any>] : []),
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Users className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">العملاء</h1>
            <p className="text-sm text-muted-foreground">{customers.length} عميل</p>
          </div>
        </div>
        {canEdit && <Button onClick={openAdd} className="gap-2"><Plus className="h-4 w-4" />إضافة عميل</Button>}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="بحث بالاسم أو الكود أو الهاتف..."
        isLoading={loading}
        emptyMessage="لا يوجد عملاء"
        toolbarContent={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={balanceFilter} onValueChange={setBalanceFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="الرصيد" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل العملاء</SelectItem>
                <SelectItem value="has_balance">عليه رصيد</SelectItem>
                <SelectItem value="no_balance">بدون رصيد</SelectItem>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editItem ? "تعديل عميل" : "إضافة عميل جديد"}</DialogTitle>
            <DialogDescription>أدخل بيانات العميل</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الكود *</Label><Input value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))} placeholder="C001" className="font-mono" /></div>
              <div className="space-y-2"><Label>الاسم *</Label><Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="اسم العميل" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الهاتف</Label><Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="رقم الهاتف" /></div>
              <div className="space-y-2"><Label>البريد الإلكتروني</Label><Input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@example.com" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>الرقم الضريبي</Label><Input value={form.tax_number} onChange={e => setForm(p => ({ ...p, tax_number: e.target.value }))} placeholder="الرقم الضريبي" /></div>
              <div className="space-y-2"><Label>جهة الاتصال</Label><Input value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="اسم المسؤول" /></div>
            </div>
            <div className="space-y-2"><Label>العنوان</Label><Input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="العنوان" /></div>
            <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="ملاحظات (اختياري)" rows={2} /></div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={saving}>{saving ? "جاري الحفظ..." : "حفظ"}</Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
