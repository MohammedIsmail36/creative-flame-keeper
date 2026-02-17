import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { LookupCombobox } from "@/components/LookupCombobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Plus, CreditCard, X, Trash2, CheckCircle, XCircle } from "lucide-react";

interface Supplier { id: string; code: string; name: string; balance?: number; }
interface Payment {
  id: string; payment_number: number; supplier_id: string; supplier_name?: string;
  payment_date: string; amount: number; payment_method: string; reference: string | null;
  notes: string | null; status: string; journal_entry_id: string | null;
}

const ACCOUNT_CODES = { SUPPLIERS: "2101", CASH: "1101", BANK: "1102" };
const methodLabels: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي", check: "شيك" };
const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مرحّل", cancelled: "ملغي" };
const statusVariants: Record<string, string> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function SupplierPayments() {
  const { role } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [supplierId, setSupplierId] = useState("");
  const [amount, setAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split("T")[0]);
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Payment | null>(null);
  const [postTarget, setPostTarget] = useState<Payment | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Payment | null>(null);

  const canEdit = role === "admin" || role === "accountant";

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [supRes, payRes] = await Promise.all([
      (supabase.from("suppliers" as any) as any).select("id, code, name, balance").eq("is_active", true).order("name"),
      (supabase.from("supplier_payments" as any) as any).select("*, suppliers:supplier_id(name)").order("payment_number", { ascending: false }),
    ]);
    setSuppliers(supRes.data || []);
    setPayments((payRes.data || []).map((p: any) => ({ ...p, supplier_name: p.suppliers?.name })));
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return payments.filter(p => {
      if (methodFilter !== "all" && p.payment_method !== methodFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (dateFrom && p.payment_date < dateFrom) return false;
      if (dateTo && p.payment_date > dateTo) return false;
      return true;
    });
  }, [payments, methodFilter, statusFilter, dateFrom, dateTo]);

  const hasFilters = methodFilter !== "all" || statusFilter !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setMethodFilter("all"); setStatusFilter("all"); setDateFrom(""); setDateTo(""); };

  async function handleSaveDraft() {
    if (!supplierId || amount <= 0) {
      toast({ title: "تنبيه", description: "يرجى اختيار المورد وإدخال المبلغ", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await (supabase.from("supplier_payments" as any) as any).insert({
        supplier_id: supplierId, payment_date: paymentDate, amount,
        payment_method: paymentMethod, reference: reference.trim() || null,
        notes: notes.trim() || null, status: "draft",
      });
      toast({ title: "تم الحفظ", description: "تم حفظ الدفعة كمسودة" });
      setDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleSubmitPosted() {
    if (!supplierId || amount <= 0) {
      toast({ title: "تنبيه", description: "يرجى اختيار المورد وإدخال المبلغ", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await postPaymentLogic(supplierId, paymentDate, amount, paymentMethod, reference.trim() || null, notes.trim() || null);
      toast({ title: "تم التسجيل", description: "تم تسجيل السداد بنجاح" });
      setDialogOpen(false);
      resetForm();
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function postPaymentLogic(supId: string, date: string, amt: number, method: string, ref: string | null, note: string | null, existingPaymentId?: string) {
    const accountCode = method === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
    const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [ACCOUNT_CODES.SUPPLIERS, accountCode]);
    const suppliersAcc = accounts?.find(a => a.code === ACCOUNT_CODES.SUPPLIERS);
    const cashBankAcc = accounts?.find(a => a.code === accountCode);
    if (!suppliersAcc || !cashBankAcc) throw new Error("تأكد من وجود حسابات الموردين والصندوق/البنك");

    const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
      description: `سداد لمورد`, entry_date: date,
      total_debit: amt, total_credit: amt, status: "posted",
    } as any).select("id").single();
    if (jeError) throw jeError;

    await supabase.from("journal_entry_lines").insert([
      { journal_entry_id: je.id, account_id: suppliersAcc.id, debit: amt, credit: 0, description: `سداد ذمم موردين` },
      { journal_entry_id: je.id, account_id: cashBankAcc.id, debit: 0, credit: amt, description: `سداد من الصندوق/البنك` },
    ] as any);

    if (existingPaymentId) {
      await (supabase.from("supplier_payments" as any) as any)
        .update({ status: "posted", journal_entry_id: je.id })
        .eq("id", existingPaymentId);
    } else {
      await (supabase.from("supplier_payments" as any) as any).insert({
        supplier_id: supId, payment_date: date, amount: amt,
        payment_method: method, reference: ref, notes: note,
        journal_entry_id: je.id, status: "posted",
      });
    }

    const sup = suppliers.find(s => s.id === supId);
    if (sup) {
      await (supabase.from("suppliers" as any) as any).update({ balance: (sup.balance || 0) - amt }).eq("id", supId);
    }
  }

  async function handlePostDraft() {
    if (!postTarget) return;
    setSaving(true);
    try {
      await postPaymentLogic(
        postTarget.supplier_id, postTarget.payment_date, postTarget.amount,
        postTarget.payment_method, postTarget.reference, postTarget.notes,
        postTarget.id
      );
      toast({ title: "تم الترحيل", description: `تم ترحيل الدفعة #${postTarget.payment_number}` });
      setPostTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await (supabase.from("supplier_payments" as any) as any).delete().eq("id", deleteTarget.id);
      toast({ title: "تم الحذف", description: `تم حذف الدفعة #${deleteTarget.payment_number}` });
      setDeleteTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  async function handleCancel() {
    if (!cancelTarget) return;
    setSaving(true);
    try {
      if (cancelTarget.journal_entry_id) {
        await supabase.from("journal_entries").update({ status: "cancelled" } as any).eq("id", cancelTarget.journal_entry_id);
      }

      const { data: sup } = await (supabase.from("suppliers" as any) as any).select("balance").eq("id", cancelTarget.supplier_id).single();
      if (sup) {
        await (supabase.from("suppliers" as any) as any).update({ balance: (sup.balance || 0) + cancelTarget.amount }).eq("id", cancelTarget.supplier_id);
      }

      await (supabase.from("supplier_payments" as any) as any).update({ status: "cancelled" }).eq("id", cancelTarget.id);

      toast({ title: "تم الإلغاء", description: `تم إلغاء الدفعة #${cancelTarget.payment_number} وعكس القيد المحاسبي` });
      setCancelTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  function resetForm() {
    setSupplierId(""); setAmount(0); setPaymentDate(new Date().toISOString().split("T")[0]);
    setPaymentMethod("cash"); setReference(""); setNotes("");
  }

  const columns: ColumnDef<Payment, any>[] = [
    {
      accessorKey: "payment_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="#" />,
      cell: ({ row }) => <span className="font-mono">#{row.original.payment_number}</span>,
    },
    {
      accessorKey: "supplier_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المورد" />,
      cell: ({ row }) => <span className="font-medium">{row.original.supplier_name || "—"}</span>,
    },
    {
      accessorKey: "payment_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.payment_date}</span>,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المبلغ" />,
      cell: ({ row }) => <span className="font-mono font-semibold">{row.original.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>,
    },
    {
      accessorKey: "payment_method",
      header: "طريقة الدفع",
      cell: ({ row }) => <Badge variant="outline">{methodLabels[row.original.payment_method] || row.original.payment_method}</Badge>,
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => <Badge variant={statusVariants[row.original.status] as any}>{statusLabels[row.original.status] || row.original.status}</Badge>,
    },
    {
      accessorKey: "reference",
      header: "المرجع",
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.reference || "—"}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const p = row.original;
        if (!canEdit) return null;
        return (
          <div className="flex items-center gap-1">
            {p.status === "draft" && (
              <>
                <Button variant="ghost" size="sm" onClick={() => setPostTarget(p)} className="gap-1 text-xs h-7 px-2">
                  <CheckCircle className="h-3.5 w-3.5" />ترحيل
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(p)} className="gap-1 text-xs h-7 px-2 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />حذف
                </Button>
              </>
            )}
            {p.status === "posted" && role === "admin" && (
              <Button variant="ghost" size="sm" onClick={() => setCancelTarget(p)} className="gap-1 text-xs h-7 px-2 text-destructive hover:text-destructive">
                <XCircle className="h-3.5 w-3.5" />إلغاء
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <CreditCard className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">مدفوعات الموردين</h1>
            <p className="text-sm text-muted-foreground">{payments.length} عملية</p>
          </div>
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" />تسجيل سداد</Button>
            </DialogTrigger>
            <DialogContent className="max-w-md" dir="rtl">
              <DialogHeader><DialogTitle>تسجيل سداد مورد</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>المورد *</Label>
                  <LookupCombobox items={suppliers} value={supplierId} onValueChange={setSupplierId} placeholder="اختر المورد" />
                  {supplierId && <p className="text-xs text-muted-foreground">الرصيد: {suppliers.find(s => s.id === supplierId)?.balance?.toLocaleString("en-US", { minimumFractionDigits: 2 })} EGP</p>}
                </div>
                <div className="space-y-2">
                  <Label>المبلغ *</Label>
                  <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(+e.target.value)} className="font-mono" />
                </div>
                <div className="space-y-2">
                  <Label>التاريخ</Label>
                  <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>طريقة الدفع</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">نقدي</SelectItem>
                      <SelectItem value="bank">تحويل بنكي</SelectItem>
                      <SelectItem value="check">شيك</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>مرجع</Label>
                  <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="رقم إيصال أو شيك" />
                </div>
                <div className="space-y-2">
                  <Label>ملاحظات</Label>
                  <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSaveDraft} disabled={saving} variant="outline" className="flex-1">{saving ? "جاري الحفظ..." : "حفظ كمسودة"}</Button>
                  <Button onClick={handleSubmitPosted} disabled={saving} className="flex-1">{saving ? "جاري الحفظ..." : "حفظ وترحيل"}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="بحث..."
        isLoading={loading}
        emptyMessage="لا توجد مدفوعات"
        toolbarContent={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="طريقة الدفع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الطرق</SelectItem>
                <SelectItem value="cash">نقدي</SelectItem>
                <SelectItem value="bank">تحويل بنكي</SelectItem>
                <SelectItem value="check">شيك</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات</SelectItem>
                <SelectItem value="draft">مسودة</SelectItem>
                <SelectItem value="posted">مرحّل</SelectItem>
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
          </div>
        }
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف الدفعة #{deleteTarget?.payment_number}</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذه الدفعة؟ لا يمكن التراجع عن هذا الإجراء.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Post confirmation */}
      <AlertDialog open={!!postTarget} onOpenChange={() => setPostTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ترحيل الدفعة #{postTarget?.payment_number}</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء قيد محاسبي وتحديث رصيد المورد بمبلغ {postTarget?.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handlePostDraft}>ترحيل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel confirmation */}
      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الدفعة #{cancelTarget?.payment_number}</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إلغاء القيد المحاسبي وإعادة رصيد المورد بمبلغ {cancelTarget?.amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-row-reverse gap-2">
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">تأكيد الإلغاء</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
