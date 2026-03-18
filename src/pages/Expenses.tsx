import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { getNextPostedNumber, formatDisplayNumber } from "@/lib/posted-number-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/DatePickerInput";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { Plus, Receipt, CheckCircle, XCircle, Trash2, Pencil, Filter, X } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useNavigate } from "react-router-dom";

interface Expense {
  id: string; expense_number: number; posted_number: number | null;
  expense_type_id: string; expense_type_name?: string; account_id?: string;
  amount: number; payment_method: string; expense_date: string;
  description: string | null; status: string; journal_entry_id: string | null;
}

const ACCOUNT_CODES = { CASH: "1101", BANK: "1102" };
const methodLabels: Record<string, string> = { cash: "نقدي", bank: "تحويل بنكي" };
const statusLabels: Record<string, string> = { draft: "مسودة", posted: "مرحّل", cancelled: "ملغي" };
const statusVariants: Record<string, "secondary" | "default" | "destructive"> = { draft: "secondary", posted: "default", cancelled: "destructive" };

export default function Expenses() {
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<{ id: string; name: string; account_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [postTarget, setPostTarget] = useState<Expense | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  async function fetchAll() {
    setLoading(true);
    const [expRes, typesRes] = await Promise.all([
      (supabase.from("expenses" as any) as any).select("*, expense_types:expense_type_id(name, account_id)").order("expense_number", { ascending: false }),
      (supabase.from("expense_types" as any) as any).select("id, name, account_id").eq("is_active", true),
    ]);
    const mapped = ((expRes.data as any) || []).map((e: any) => ({
      ...e,
      expense_type_name: e.expense_types?.name,
      account_id: e.expense_types?.account_id,
    }));
    setExpenses(mapped);
    setExpenseTypes(typesRes.data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.expense_type_id !== typeFilter) return false;
      if (dateFrom && e.expense_date < dateFrom) return false;
      if (dateTo && e.expense_date > dateTo) return false;
      return true;
    });
  }, [expenses, statusFilter, typeFilter, dateFrom, dateTo]);

  const clearFilters = () => { setStatusFilter("all"); setTypeFilter("all"); setDateFrom(""); setDateTo(""); };

  // Post expense - create journal entry
  async function handlePost() {
    if (!postTarget) return;
    setSaving(true);
    try {
      const expType = expenseTypes.find(t => t.id === postTarget.expense_type_id);
      if (!expType) throw new Error("نوع المصروف غير موجود");

      const accountCode = postTarget.payment_method === "cash" ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
      const { data: accounts } = await supabase.from("accounts").select("id, code").in("code", [accountCode]);
      const cashBankAcc = accounts?.find(a => a.code === accountCode);
      if (!cashBankAcc) throw new Error("تأكد من وجود حساب الصندوق/البنك في شجرة الحسابات");

      const expPostedNum = await getNextPostedNumber("expenses" as any);
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const prefix = (settings as any)?.expense_prefix || "EXP-";
      const displayNum = `${prefix}${String(expPostedNum).padStart(4, "0")}`;
      const desc = `مصروف ${postTarget.expense_type_name} - ${displayNum}${postTarget.description ? ` - ${postTarget.description}` : ""}`;

      // Create journal entry
      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: desc, entry_date: postTarget.expense_date,
        total_debit: postTarget.amount, total_credit: postTarget.amount,
        status: "posted", posted_number: jePostedNum,
      } as any).select("id").single();
      if (jeError) throw jeError;

      // Debit: expense account, Credit: cash/bank
      await supabase.from("journal_entry_lines").insert([
        { journal_entry_id: je.id, account_id: expType.account_id, debit: postTarget.amount, credit: 0, description: desc },
        { journal_entry_id: je.id, account_id: cashBankAcc.id, debit: 0, credit: postTarget.amount, description: desc },
      ] as any);

      // Update expense
      await (supabase.from("expenses" as any) as any)
        .update({ status: "posted", journal_entry_id: je.id, posted_number: expPostedNum })
        .eq("id", postTarget.id);

      toast({ title: "تم الترحيل", description: `تم ترحيل المصروف ${displayNum}` });
      setPostTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  // Cancel posted expense - reverse journal
  async function handleCancel() {
    if (!cancelTarget || !cancelTarget.journal_entry_id) return;
    setSaving(true);
    try {
      // Get original journal lines
      const { data: lines } = await supabase.from("journal_entry_lines")
        .select("account_id, debit, credit, description")
        .eq("journal_entry_id", cancelTarget.journal_entry_id);

      // Create reverse journal entry
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const prefix = (settings as any)?.expense_prefix || "EXP-";
      const displayNum = formatDisplayNumber(prefix, cancelTarget.posted_number, cancelTarget.expense_number, cancelTarget.status);
      const desc = `عكس مصروف ${displayNum}`;

      const { data: je, error: jeError } = await supabase.from("journal_entries").insert({
        description: desc, entry_date: cancelTarget.expense_date,
        total_debit: cancelTarget.amount, total_credit: cancelTarget.amount,
        status: "posted", posted_number: jePostedNum,
      } as any).select("id").single();
      if (jeError) throw jeError;

      // Reverse lines
      if (lines) {
        const reversed = lines.map(l => ({
          journal_entry_id: je.id, account_id: l.account_id,
          debit: l.credit, credit: l.debit, description: desc,
        }));
        await supabase.from("journal_entry_lines").insert(reversed as any);
      }

      // Update original journal entry
      await supabase.from("journal_entries").update({ status: "cancelled" } as any).eq("id", cancelTarget.journal_entry_id);

      // Update expense
      await (supabase.from("expenses" as any) as any)
        .update({ status: "cancelled" })
        .eq("id", cancelTarget.id);

      toast({ title: "تم الإلغاء", description: `تم إلغاء المصروف وعكس القيد المحاسبي` });
      setCancelTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { error } = await (supabase.from("expenses" as any) as any).delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف", description: "تم حذف المصروف" });
      setDeleteTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    }
  }

  const prefix = (settings as any)?.expense_prefix || "EXP-";

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "expense_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الرقم" />,
      cell: ({ row }) => {
        const e = row.original;
        return <span className="font-mono text-sm">{formatDisplayNumber(prefix, e.posted_number, e.expense_number, e.status)}</span>;
      },
    },
    {
      accessorKey: "expense_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
    },
    {
      accessorKey: "expense_type_name",
      header: ({ column }) => <DataTableColumnHeader column={column} title="نوع المصروف" />,
      cell: ({ row }) => <span className="font-medium">{row.original.expense_type_name}</span>,
    },
    {
      accessorKey: "amount",
      header: ({ column }) => <DataTableColumnHeader column={column} title="المبلغ" />,
      cell: ({ row }) => <span className="font-semibold">{formatCurrency(row.original.amount)}</span>,
    },
    {
      accessorKey: "payment_method",
      header: ({ column }) => <DataTableColumnHeader column={column} title="طريقة الدفع" />,
      cell: ({ row }) => methodLabels[row.original.payment_method] || row.original.payment_method,
    },
    {
      accessorKey: "description",
      header: ({ column }) => <DataTableColumnHeader column={column} title="البيان" />,
      cell: ({ row }) => <span className="text-muted-foreground text-sm truncate max-w-[200px] inline-block">{row.original.description || "-"}</span>,
    },
    {
      accessorKey: "status",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الحالة" />,
      cell: ({ row }) => (
        <Badge variant={statusVariants[row.original.status] || "secondary"}>
          {statusLabels[row.original.status] || row.original.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "إجراءات",
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="flex gap-1">
            {e.status === "draft" && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(`/expenses/${e.id}`)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={() => setPostTarget(e)}>
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(e)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            {e.status === "posted" && (
              <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-600" onClick={() => setCancelTarget(e)}>
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const totalPosted = filtered.filter(e => e.status === "posted").reduce((s, e) => s + e.amount, 0);

  const exportHeaders = ["الرقم", "التاريخ", "نوع المصروف", "المبلغ", "طريقة الدفع", "البيان", "الحالة"];
  const exportRows = filtered.map(e => [
    formatDisplayNumber(prefix, e.posted_number, e.expense_number, e.status),
    e.expense_date,
    e.expense_type_name || "",
    e.amount,
    methodLabels[e.payment_method] || e.payment_method,
    e.description || "",
    statusLabels[e.status] || e.status,
  ]);

  const exportConfig = {
    filenamePrefix: "expenses",
    sheetName: "المصروفات",
    pdfTitle: "المصروفات",
    headers: exportHeaders,
    rows: exportRows,
    settings,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Receipt className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">المصروفات</h1>
            <p className="text-sm text-muted-foreground">إدارة وتسجيل المصروفات اليومية</p>
          </div>
        </div>
        <div className="flex gap-2">
          <ExportMenu config={exportConfig} />
          <Button onClick={() => navigate("/expenses/new")}>
            <Plus className="h-4 w-4 ml-2" /> مصروف جديد
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">إجمالي المصروفات</p>
          <p className="text-2xl font-bold">{filtered.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">المرحّلة</p>
          <p className="text-2xl font-bold text-green-600">{filtered.filter(e => e.status === "posted").length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">المسودات</p>
          <p className="text-2xl font-bold text-muted-foreground">{filtered.filter(e => e.status === "draft").length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-sm text-muted-foreground">إجمالي المرحّل</p>
          <p className="text-2xl font-bold">{formatCurrency(totalPosted)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-40">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="الحالة" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="draft">مسودة</SelectItem>
              <SelectItem value="posted">مرحّل</SelectItem>
              <SelectItem value="cancelled">ملغي</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-48">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="نوع المصروف" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              {expenseTypes.map(t => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" />
        <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" />
        {(statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo) && (
          <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 ml-1" /> مسح</Button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card shadow-sm">
        <DataTable columns={columns} data={filtered} showSearch searchPlaceholder="بحث..." />
      </div>

      {/* Post Alert */}
      <AlertDialog open={!!postTarget} onOpenChange={() => setPostTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ترحيل المصروف</AlertDialogTitle>
            <AlertDialogDescription>سيتم إنشاء قيد محاسبي تلقائي. هل تريد المتابعة؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handlePost} disabled={saving}>ترحيل</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Alert */}
      <AlertDialog open={!!cancelTarget} onOpenChange={() => setCancelTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء المصروف</AlertDialogTitle>
            <AlertDialogDescription>سيتم عكس القيد المحاسبي. هل أنت متأكد؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} disabled={saving} className="bg-destructive text-destructive-foreground">إلغاء المصروف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Alert */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد من حذف هذا المصروف؟</AlertDialogDescription>
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
