import React, { useState, useEffect, useMemo } from "react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import {
  getNextPostedNumber,
  formatDisplayNumber,
} from "@/lib/posted-number-utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DatePickerInput } from "@/components/DatePickerInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import {
  Plus,
  Receipt,
  CheckCircle,
  XCircle,
  Trash2,
  Pencil,
  X,
  Clock,
  Ban,
  Wallet,
} from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { useNavigate } from "react-router-dom";
import { ACCOUNT_CODES, INVOICE_STATUS_LABELS } from "@/lib/constants";

interface Expense {
  id: string;
  expense_number: number;
  posted_number: number | null;
  expense_type_id: string;
  expense_type_name?: string;
  account_id?: string;
  amount: number;
  payment_method: string;
  expense_date: string;
  description: string | null;
  status: string;
  journal_entry_id: string | null;
}

const methodLabels: Record<string, string> = {
  cash: "نقدي",
  bank: "تحويل بنكي",
};

export default function Expenses() {
  const { role } = useAuth();
  const { settings, formatCurrency } = useSettings();
  const navigate = useNavigate();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseTypes, setExpenseTypes] = useState<
    { id: string; name: string; account_id: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [deleteTarget, setDeleteTarget] = useState<Expense | null>(null);
  const [postTarget, setPostTarget] = useState<Expense | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    const [expRes, typesRes] = await Promise.all([
      (supabase.from("expenses" as any) as any)
        .select("*")
        .order("expense_number", { ascending: false }),
      (supabase.from("expense_types" as any) as any)
        .select("id, name, account_id")
        .eq("is_active", true),
    ]);
    const typesMap = new Map(
      ((typesRes.data as any[]) || []).map((t: any) => [t.id, t]),
    );
    const mapped = ((expRes.data as any) || []).map((e: any) => ({
      ...e,
      expense_type_name: typesMap.get(e.expense_type_id)?.name,
      account_id: typesMap.get(e.expense_type_id)?.account_id,
    }));
    setExpenses(mapped);
    setExpenseTypes(typesRes.data || []);
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return expenses.filter((e) => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (typeFilter !== "all" && e.expense_type_id !== typeFilter)
        return false;
      if (dateFrom && e.expense_date < dateFrom) return false;
      if (dateTo && e.expense_date > dateTo) return false;
      return true;
    });
  }, [expenses, statusFilter, typeFilter, dateFrom, dateTo]);

  const clearFilters = () => {
    setStatusFilter("all");
    setTypeFilter("all");
    setDateFrom("");
    setDateTo("");
  };
  const hasFilters =
    statusFilter !== "all" || typeFilter !== "all" || dateFrom || dateTo;

  async function handlePost() {
    if (!postTarget) return;
    setSaving(true);
    try {
      const expType = expenseTypes.find(
        (t) => t.id === postTarget.expense_type_id,
      );
      if (!expType) throw new Error("نوع المصروف غير موجود");

      const accountCode =
        postTarget.payment_method === "cash"
          ? ACCOUNT_CODES.CASH
          : ACCOUNT_CODES.BANK;
      const { data: accounts } = await supabase
        .from("accounts")
        .select("id, code")
        .in("code", [accountCode]);
      const cashBankAcc = accounts?.find((a) => a.code === accountCode);
      if (!cashBankAcc)
        throw new Error("تأكد من وجود حساب الصندوق/البنك في شجرة الحسابات");

      const expPostedNum = await getNextPostedNumber("expenses" as any);
      const jePostedNum = await getNextPostedNumber("journal_entries");
      const expPrefix = (settings as any)?.expense_prefix || "EXP-";
      const displayNum = `${expPrefix}${String(expPostedNum).padStart(4, "0")}`;
      const desc = `سند مصروف رقم ${displayNum} - ${postTarget.expense_type_name}${postTarget.description ? ` - ${postTarget.description}` : ""}`;

      const { data: je, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          description: desc,
          entry_date: postTarget.expense_date,
          total_debit: postTarget.amount,
          total_credit: postTarget.amount,
          status: "posted",
          posted_number: jePostedNum,
        } as any)
        .select("id")
        .single();
      if (jeError) throw jeError;

      await supabase.from("journal_entry_lines").insert([
        {
          journal_entry_id: je.id,
          account_id: expType.account_id,
          debit: postTarget.amount,
          credit: 0,
          description: desc,
        },
        {
          journal_entry_id: je.id,
          account_id: cashBankAcc.id,
          debit: 0,
          credit: postTarget.amount,
          description: desc,
        },
      ] as any);

      await (supabase.from("expenses" as any) as any)
        .update({
          status: "posted",
          journal_entry_id: je.id,
          posted_number: expPostedNum,
        })
        .eq("id", postTarget.id);

      toast({
        title: "تم الترحيل",
        description: `تم ترحيل المصروف ${displayNum}`,
      });
      setPostTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  async function handleCancel() {
    if (!cancelTarget || !cancelTarget.journal_entry_id) return;
    setSaving(true);
    try {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit, credit, description")
        .eq("journal_entry_id", cancelTarget.journal_entry_id);

      const jePostedNum = await getNextPostedNumber("journal_entries");
      const expPrefix = (settings as any)?.expense_prefix || "EXP-";
      const displayNum = formatDisplayNumber(
        expPrefix,
        cancelTarget.posted_number,
        cancelTarget.expense_number,
        cancelTarget.status,
      );
      const desc = `عكس مصروف ${displayNum}`;

      const { data: je, error: jeError } = await supabase
        .from("journal_entries")
        .insert({
          description: desc,
          entry_date: cancelTarget.expense_date,
          total_debit: cancelTarget.amount,
          total_credit: cancelTarget.amount,
          status: "posted",
          posted_number: jePostedNum,
        } as any)
        .select("id")
        .single();
      if (jeError) throw jeError;

      if (lines) {
        const reversed = lines.map((l) => ({
          journal_entry_id: je.id,
          account_id: l.account_id,
          debit: l.credit,
          credit: l.debit,
          description: desc,
        }));
        await supabase.from("journal_entry_lines").insert(reversed as any);
      }

      await supabase
        .from("journal_entries")
        .update({ status: "cancelled" } as any)
        .eq("id", cancelTarget.journal_entry_id);

      await (supabase.from("expenses" as any) as any)
        .update({ status: "cancelled" })
        .eq("id", cancelTarget.id);

      toast({
        title: "تم الإلغاء",
        description: `تم إلغاء المصروف وعكس القيد المحاسبي`,
      });
      setCancelTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      const { error } = await (supabase.from("expenses" as any) as any)
        .delete()
        .eq("id", deleteTarget.id);
      if (error) throw error;
      toast({ title: "تم الحذف", description: "تم حذف المصروف" });
      setDeleteTarget(null);
      fetchAll();
    } catch (error: any) {
      toast({
        title: "خطأ",
        description: error.message,
        variant: "destructive",
      });
    }
  }

  const prefix = (settings as any)?.expense_prefix || "EXP-";

  const statusCounts = useMemo(() => {
    const counts = { all: expenses.length, draft: 0, posted: 0, cancelled: 0 };
    expenses.forEach((e) => {
      if (e.status === "draft") counts.draft++;
      else if (e.status === "cancelled") counts.cancelled++;
      else counts.posted++;
    });
    return counts;
  }, [expenses]);

  const totalPosted = useMemo(
    () =>
      expenses
        .filter((e) => e.status === "posted")
        .reduce((s, e) => s + e.amount, 0),
    [expenses],
  );

  const statCards = [
    {
      label: "إجمالي المصروفات",
      value: expenses.length,
      icon: Receipt,
      iconBg: "bg-blue-100 dark:bg-blue-500/20",
      iconColor: "text-blue-600 dark:text-blue-400",
      filter: "all",
    },
    {
      label: "مسودات",
      value: statusCounts.draft,
      icon: Clock,
      iconBg: "bg-amber-100 dark:bg-amber-500/20",
      iconColor: "text-amber-600 dark:text-amber-400",
      filter: "draft",
    },
    {
      label: "مرحّلة",
      value: statusCounts.posted,
      icon: CheckCircle,
      iconBg: "bg-green-100 dark:bg-green-500/20",
      iconColor: "text-green-600 dark:text-green-400",
      filter: "posted",
    },
    {
      label: "إجمالي المرحّل",
      value: formatCurrency(totalPosted),
      icon: Wallet,
      iconBg: "bg-purple-100 dark:bg-purple-500/20",
      iconColor: "text-purple-600 dark:text-purple-400",
      filter: "",
    },
  ];

  const columns: ColumnDef<Expense>[] = [
    {
      accessorKey: "expense_number",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="الرقم" />
      ),
      cell: ({ row }) => {
        const e = row.original;
        return (
          <span className="font-mono text-sm text-foreground">
            {formatDisplayNumber(
              prefix,
              e.posted_number,
              e.expense_number,
              e.status,
            )}
          </span>
        );
      },
    },
    {
      accessorKey: "expense_date",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="التاريخ" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.expense_date}
        </span>
      ),
    },
    {
      accessorKey: "expense_type_name",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="نوع المصروف" />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-bold text-foreground">
          {row.original.expense_type_name}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="المبلغ" />
      ),
      cell: ({ row }) => (
        <span className="text-sm font-bold text-foreground font-mono">
          {formatCurrency(row.original.amount)}
        </span>
      ),
    },
    {
      accessorKey: "payment_method",
      meta: { hideOnMobile: true },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="طريقة الدفع" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {methodLabels[row.original.payment_method] ||
            row.original.payment_method}
        </span>
      ),
    },
    {
      accessorKey: "description",
      meta: { hideOnMobile: true },
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="البيان" />
      ),
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground truncate max-w-[200px] block">
          {row.original.description || "-"}
        </span>
      ),
    },
    {
      accessorKey: "status",
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title="الحالة" />
      ),
      cell: ({ row }) => {
        const s = row.original.status;
        const statusConfig: Record<
          string,
          { label: string; className: string }
        > = {
          posted: {
            label: "مرحّل",
            className: "bg-green-500/10 text-green-600 border-green-500/20",
          },
          draft: {
            label: "مسودة",
            className: "bg-amber-500/10 text-amber-600 border-amber-500/20",
          },
          cancelled: {
            label: "ملغي",
            className:
              "bg-destructive/10 text-destructive border-destructive/20",
          },
        };
        const cfg = statusConfig[s] || statusConfig.draft;
        return (
          <Badge variant="secondary" className={cfg.className}>
            {cfg.label}
          </Badge>
        );
      },
    },
    {
      id: "actions",
      header: "إجراءات",
      enableHiding: false,
      cell: ({ row }) => {
        const e = row.original;
        return (
          <div className="flex gap-1">
            {e.status === "draft" && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="تعديل المصروف"
                  className="h-8 w-8"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    navigate(`/expenses/${e.id}`);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="ترحيل المصروف"
                  className="h-8 w-8 text-green-600"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setPostTarget(e);
                  }}
                >
                  <CheckCircle className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="حذف المصروف"
                  className="h-8 w-8 text-destructive"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    setDeleteTarget(e);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </>
            )}
            {e.status === "posted" && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="إلغاء المصروف"
                className="h-8 w-8 text-orange-600"
                onClick={(ev) => {
                  ev.stopPropagation();
                  setCancelTarget(e);
                }}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  const exportHeaders = [
    "الرقم",
    "التاريخ",
    "نوع المصروف",
    "المبلغ",
    "طريقة الدفع",
    "البيان",
    "الحالة",
  ];
  const exportRows = filtered.map((e) => [
    formatDisplayNumber(prefix, e.posted_number, e.expense_number, e.status),
    e.expense_date,
    e.expense_type_name || "",
    e.amount,
    methodLabels[e.payment_method] || e.payment_method,
    e.description || "",
    INVOICE_STATUS_LABELS[e.status] || e.status,
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
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={Receipt}
        title="المصروفات"
        description="إدارة وتسجيل المصروفات اليومية"
        actions={
          <>
            <ExportMenu config={exportConfig} disabled={loading} />
            <Button
              className="gap-2 shadow-md shadow-primary/20 font-bold"
              onClick={() => navigate("/expenses/new")}
            >
              <Plus className="h-4 w-4" />
              مصروف جديد
            </Button>
          </>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(
          ({ label, value, icon: Icon, iconBg, iconColor, filter }) => (
            <button
              key={label}
              onClick={() => filter && setStatusFilter(filter)}
              className={`bg-card p-4 rounded-xl border border-border shadow-sm flex items-center gap-4 text-right transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}
            >
              <div className={`p-3 rounded-full ${iconBg}`}>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-xl font-black text-foreground">
                  {typeof value === "number"
                    ? value.toLocaleString("en-US")
                    : value}
                </p>
              </div>
            </button>
          ),
        )}
      </div>

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="البحث في المصروفات..."
        isLoading={loading}
        emptyMessage="لا توجد مصروفات"
        toolbarContent={
          <div className="flex gap-3 flex-wrap items-center">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9 text-sm bg-card border-border">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  كل الحالات ({statusCounts.all})
                </SelectItem>
                <SelectItem value="draft">
                  مسودة ({statusCounts.draft})
                </SelectItem>
                <SelectItem value="posted">
                  مرحّل ({statusCounts.posted})
                </SelectItem>
                <SelectItem value="cancelled">
                  ملغي ({statusCounts.cancelled})
                </SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-48 h-9 text-sm bg-card border-border">
                <SelectValue placeholder="نوع المصروف" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الأنواع</SelectItem>
                {expenseTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DatePickerInput
              value={dateFrom}
              onChange={setDateFrom}
              placeholder="من تاريخ"
              className="w-[150px] h-9 text-sm"
            />
            <DatePickerInput
              value={dateTo}
              onChange={setDateTo}
              placeholder="إلى تاريخ"
              className="w-[150px] h-9 text-sm"
            />
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
          </div>
        }
      />

      {/* Post Alert */}
      <AlertDialog open={!!postTarget} onOpenChange={() => setPostTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ترحيل المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم إنشاء قيد محاسبي تلقائي. هل تريد المتابعة؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handlePost} disabled={saving}>
              ترحيل
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Alert */}
      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={() => setCancelTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم عكس القيد المحاسبي. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancel}
              disabled={saving}
              className="bg-destructive text-destructive-foreground"
            >
              إلغاء المصروف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Alert */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المصروف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا المصروف؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
