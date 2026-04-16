import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, Users, X, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ExportMenu } from "@/components/ExportMenu";
import { useSettings } from "@/contexts/SettingsContext";
import { getNextPostedNumber } from "@/lib/posted-number-utils";
import { generateEntityCode } from "@/lib/code-generation";
import { ACCOUNT_CODES } from "@/lib/constants";
import { round2 } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Customer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_number: string | null;
  contact_person: string | null;
  notes: string | null;
  balance: number;
  is_active: boolean;
}

export default function Customers() {
  const { role } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    phone: "",
    email: "",
    address: "",
    tax_number: "",
    contact_person: "",
    notes: "",
    opening_balance: "",
  });
  const [balanceFilter, setBalanceFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);

  const canEdit = role === "admin" || role === "accountant" || role === "sales";

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function fetchCustomers() {
    setLoading(true);
    const { data } = await (supabase.from("customers" as any) as any)
      .select("*")
      .eq("is_active", true)
      .order("code");
    setCustomers(data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    if (balanceFilter === "all") return customers;
    if (balanceFilter === "has_balance")
      return customers.filter((c) => c.balance > 0);
    if (balanceFilter === "no_balance")
      return customers.filter((c) => c.balance <= 0);
    return customers;
  }, [customers, balanceFilter]);

  const hasFilters = balanceFilter !== "all";
  const clearFilters = () => setBalanceFilter("all");

  async function openAdd() {
    setEditItem(null);
    const nextCode = await generateEntityCode("customers", "CUST-");
    setForm({
      code: nextCode,
      name: "",
      phone: "",
      email: "",
      address: "",
      tax_number: "",
      contact_person: "",
      notes: "",
      opening_balance: "",
    });
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditItem(c);
    setForm({
      code: c.code,
      name: c.name,
      phone: c.phone || "",
      email: c.email || "",
      address: c.address || "",
      tax_number: c.tax_number || "",
      contact_person: c.contact_person || "",
      notes: c.notes || "",
      opening_balance: "",
    });
    setDialogOpen(true);
  }

  async function createOpeningBalanceJournalEntry(
    entityId: string,
    entityName: string,
    amount: number,
  ) {
    const { data: accounts } = await supabase
      .from("accounts")
      .select("id, code")
      .in("code", [ACCOUNT_CODES.CUSTOMERS, ACCOUNT_CODES.EQUITY]);
    const customersAcc = accounts?.find(
      (a) => a.code === ACCOUNT_CODES.CUSTOMERS,
    );
    const equityAcc = accounts?.find((a) => a.code === ACCOUNT_CODES.EQUITY);
    if (!customersAcc || !equityAcc)
      throw new Error("تأكد من وجود حسابات العملاء ورأس المال");

    const roundedAmount = round2(amount);
    const jePostedNum = await getNextPostedNumber("journal_entries");
    const { data: je, error: jeError } = await supabase
      .from("journal_entries")
      .insert({
        description: `رصيد افتتاحي - عميل: ${entityName}`,
        entry_date: new Date().toISOString().split("T")[0],
        total_debit: roundedAmount,
        total_credit: roundedAmount,
        status: "posted",
        posted_number: jePostedNum,
      } as any)
      .select("id")
      .single();
    if (jeError) throw jeError;

    await supabase.from("journal_entry_lines").insert([
      {
        journal_entry_id: je.id,
        account_id: customersAcc.id,
        debit: roundedAmount,
        credit: 0,
        description: `رصيد افتتاحي - عميل: ${entityName}`,
      },
      {
        journal_entry_id: je.id,
        account_id: equityAcc.id,
        debit: 0,
        credit: roundedAmount,
        description: `رصيد افتتاحي - عميل: ${entityName}`,
      },
    ] as any);

    // Update customer balance
    await (supabase.from("customers" as any) as any)
      .update({ balance: roundedAmount })
      .eq("id", entityId);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.name.trim()) {
      toast({
        title: "تنبيه",
        description: "يرجى إدخال الكود والاسم",
        variant: "destructive",
      });
      return;
    }
    setSaving(true);
    const payload: any = {
      code: form.code.trim(),
      name: form.name.trim(),
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      tax_number: form.tax_number.trim() || null,
      contact_person: form.contact_person.trim() || null,
      notes: form.notes.trim() || null,
    };
    const openingBalance = parseFloat(form.opening_balance) || 0;
    try {
      if (editItem) {
        const { error } = await (supabase.from("customers" as any) as any)
          .update(payload)
          .eq("id", editItem.id);
        if (error) throw error;
        toast({ title: "تم التحديث", description: "تم تعديل بيانات العميل" });
      } else {
        const { data: newCustomer, error } = await (
          supabase.from("customers" as any) as any
        )
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        if (openingBalance > 0) {
          await createOpeningBalanceJournalEntry(
            newCustomer.id,
            form.name.trim(),
            openingBalance,
          );
        }
        toast({ title: "تمت الإضافة", description: "تم إضافة العميل بنجاح" });
      }
      setDialogOpen(false);
      fetchCustomers();
    } catch (error: any) {
      const msg = error.message?.includes("duplicate")
        ? "كود العميل موجود مسبقاً"
        : error.message;
      toast({ title: "خطأ", description: msg, variant: "destructive" });
    }
    setSaving(false);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const { count } = await (supabase.from("sales_invoices" as any) as any)
      .select("id", { count: "exact", head: true })
      .eq("customer_id", deleteTarget.id);
    if (count && count > 0) {
      toast({
        title: "لا يمكن الحذف",
        description: `العميل مرتبط بـ ${count} فاتورة بيع`,
        variant: "destructive",
      });
      setDeleteTarget(null);
      return;
    }
    const { error } = await (supabase.from("customers" as any) as any)
      .delete()
      .eq("id", deleteTarget.id);
    if (error) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
      setDeleteTarget(null);
      return;
    }
    toast({ title: "تم الحذف", description: "تم حذف العميل" });
    setDeleteTarget(null);
    fetchCustomers();
  }

  const columns: ColumnDef<Customer, any>[] = [
    {
      accessorKey: "code",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="الكود" />
      ),
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.code}</span>
      ),
    },
    {
      accessorKey: "name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="الاسم" />
      ),
      cell: ({ row }) => (
        <span className="font-medium">{row.original.name}</span>
      ),
    },
    {
      accessorKey: "phone",
      meta: { hideOnMobile: true },
      header: "الهاتف",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.phone || "—"}
        </span>
      ),
    },
    {
      accessorKey: "email",
      meta: { hideOnMobile: true },
      header: "البريد",
      cell: ({ row }) => (
        <span className="text-muted-foreground">
          {row.original.email || "—"}
        </span>
      ),
    },
    {
      accessorKey: "balance",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="الرصيد" />
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.balance > 0 ? "destructive" : "secondary"}>
          {round2(row.original.balance).toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </Badge>
      ),
    },
    ...(canEdit
      ? [
          {
            id: "actions" as const,
            header: "إجراءات" as const,
            enableHiding: false,
            cell: ({ row }: any) => (
              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="كشف حساب"
                  onClick={() =>
                    navigate(`/customer-statement/${row.original.id}`)
                  }
                >
                  <FileText className="h-4 w-4 text-primary" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="تعديل العميل"
                  onClick={() => openEdit(row.original)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف العميل"
                  onClick={() => setDeleteTarget(row.original)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ),
          } as ColumnDef<Customer, any>,
        ]
      : []),
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={Users}
        title="العملاء"
        description={`${customers.length} عميل`}
        actions={
          canEdit ? (
            <Button onClick={openAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              إضافة عميل
            </Button>
          ) : undefined
        }
      />

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
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-9 gap-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
            <ExportMenu
              config={{
                filenamePrefix: "العملاء",
                sheetName: "العملاء",
                pdfTitle: "قائمة العملاء",
                headers: ["الكود", "الاسم", "الهاتف", "البريد", "الرصيد"],
                rows: filtered.map((c) => [
                  c.code,
                  c.name,
                  c.phone || "",
                  c.email || "",
                  round2(Number(c.balance)).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  }),
                ]),
                settings,
              }}
              disabled={loading}
            />
          </div>
        }
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editItem ? "تعديل عميل" : "إضافة عميل جديد"}
            </DialogTitle>
            <DialogDescription>أدخل بيانات العميل</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الكود *</Label>
                <Input
                  value={form.code}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, code: e.target.value }))
                  }
                  placeholder="CUST-001"
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>الاسم *</Label>
                <Input
                  value={form.name}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="اسم العميل"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الهاتف</Label>
                <Input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                  placeholder="رقم الهاتف"
                />
              </div>
              <div className="space-y-2">
                <Label>البريد الإلكتروني</Label>
                <Input
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                  placeholder="email@example.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الرقم الضريبي</Label>
                <Input
                  value={form.tax_number}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, tax_number: e.target.value }))
                  }
                  placeholder="الرقم الضريبي"
                />
              </div>
              <div className="space-y-2">
                <Label>جهة الاتصال</Label>
                <Input
                  value={form.contact_person}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, contact_person: e.target.value }))
                  }
                  placeholder="اسم المسؤول"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>العنوان</Label>
              <Input
                value={form.address}
                onChange={(e) =>
                  setForm((p) => ({ ...p, address: e.target.value }))
                }
                placeholder="العنوان"
              />
            </div>
            {!editItem && (
              <div className="space-y-2">
                <Label>الرصيد الافتتاحي</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.opening_balance}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, opening_balance: e.target.value }))
                  }
                  placeholder="0.00"
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  سيتم إنشاء قيد افتتاحي تلقائياً إذا كان المبلغ أكبر من صفر
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={form.notes}
                onChange={(e) =>
                  setForm((p) => ({ ...p, notes: e.target.value }))
                }
                placeholder="ملاحظات (اختياري)"
                rows={2}
              />
            </div>
          </div>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "جاري الحفظ..." : "حفظ"}
            </Button>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف العميل</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف العميل "{deleteTarget?.name}"؟ لا يمكن التراجع
              عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
