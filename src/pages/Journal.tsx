import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePickerInput } from "@/components/DatePickerInput";
import { DataTable, DataTableColumnHeader } from "@/components/ui/data-table";
import { ColumnDef } from "@tanstack/react-table";
import { toast } from "@/hooks/use-toast";
import { FileText, Plus, Eye, CheckCircle, Clock, BookOpen, X, Ban } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";
import { formatDisplayNumber } from "@/lib/posted-number-utils";

interface JournalEntry {
  id: string;
  entry_number: number;
  posted_number: number | null;
  entry_date: string;
  description: string;
  status: string;
  total_debit: number;
  total_credit: number;
  created_at: string;
}

export default function Journal() {
  const { role } = useAuth();
  const { settings, currency, formatCurrency: fmtCurrency } = useSettings();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const canEdit = role === "admin" || role === "accountant";
  const prefix = (settings as any)?.journal_entry_prefix || "JV-";

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await (supabase.from("journal_entries") as any).select("*").order("entry_number", { ascending: false });
    if (error) {
      toast({ title: "خطأ", description: "فشل في جلب القيود", variant: "destructive" });
    } else {
      setEntries(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const statusCounts = useMemo(() => {
    const counts = { all: entries.length, draft: 0, posted: 0, cancelled: 0 };
    entries.forEach(e => {
      if (e.status === "draft") counts.draft++;
      else if (e.status === "cancelled") counts.cancelled++;
      else counts.posted++;
    });
    return counts;
  }, [entries]);

  const totalDebit = useMemo(() => entries.reduce((s, e) => s + Number(e.total_debit), 0), [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter(e => {
      if (statusFilter !== "all" && e.status !== statusFilter) return false;
      if (dateFrom && e.entry_date < dateFrom) return false;
      if (dateTo && e.entry_date > dateTo) return false;
      return true;
    });
  }, [entries, statusFilter, dateFrom, dateTo]);

  const formatNum = (val: number) => Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatCurrency = (val: number) => fmtCurrency(Number(val));

  const journalExportConfig = useMemo(() => ({
    filenamePrefix: "القيود-المحاسبية",
    sheetName: "القيود المحاسبية",
    pdfTitle: "القيود المحاسبية",
    headers: ["#", "التاريخ", "الوصف", "الحالة", `مدين (${currency})`, `دائن (${currency})`],
    rows: filteredEntries.map(e => [
      formatDisplayNumber(prefix, e.posted_number, e.entry_number, e.status),
      e.entry_date, e.description,
      e.status === "posted" ? "معتمد" : e.status === "cancelled" ? "ملغي" : "مسودة",
      formatNum(Number(e.total_debit)), formatNum(Number(e.total_credit)),
    ]),
    settings,
    pdfOrientation: "landscape" as const,
  }), [filteredEntries, settings, currency, prefix]);

  const hasFilters = statusFilter !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setStatusFilter("all"); setDateFrom(""); setDateTo(""); };

  const columns: ColumnDef<JournalEntry, any>[] = [
    {
      accessorKey: "entry_number",
      header: ({ column }) => <DataTableColumnHeader column={column} title="رقم القيد" />,
      cell: ({ row }) => (
        <span className="font-mono font-medium">
          {formatDisplayNumber(prefix, row.original.posted_number, row.original.entry_number, row.original.status)}
        </span>
      ),
    },
    {
      accessorKey: "entry_date",
      header: ({ column }) => <DataTableColumnHeader column={column} title="التاريخ" />,
      cell: ({ row }) => <span className="text-muted-foreground">{row.original.entry_date}</span>,
    },
    {
      accessorKey: "description",
      header: ({ column }) => <DataTableColumnHeader column={column} title="الوصف" />,
      cell: ({ row }) => <span className="font-medium max-w-[200px] truncate block">{row.original.description}</span>,
    },
    {
      accessorKey: "status",
      header: "الحالة",
      cell: ({ row }) => {
        const s = row.original.status;
        const statusConfig: Record<string, { label: string; className: string }> = {
          posted: { label: "معتمد", className: "bg-green-500/10 text-green-600 border-green-500/20" },
          draft: { label: "مسودة", className: "bg-amber-500/10 text-amber-600 border-amber-500/20" },
          cancelled: { label: "ملغي", className: "bg-destructive/10 text-destructive border-destructive/20" },
        };
        const cfg = statusConfig[s] || statusConfig.draft;
        return <Badge variant="secondary" className={cfg.className}>{cfg.label}</Badge>;
      },
    },
    {
      accessorKey: "total_debit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="مدين" />,
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.total_debit)}</span>,
    },
    {
      accessorKey: "total_credit",
      header: ({ column }) => <DataTableColumnHeader column={column} title="دائن" />,
      cell: ({ row }) => <span className="font-mono">{formatCurrency(row.original.total_credit)}</span>,
    },
    {
      id: "actions",
      header: "عرض",
      enableHiding: false,
      cell: ({ row }) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); navigate(`/journal/${row.original.id}`); }}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">القيود المحاسبية</h1>
            <p className="text-sm text-muted-foreground">{entries.length} قيد في اليومية</p>
          </div>
        </div>
        {canEdit && (
          <Button className="gap-2" onClick={() => navigate("/journal/new")}>
            <Plus className="h-4 w-4" />
            قيد جديد
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "إجمالي القيود", value: entries.length, icon: BookOpen, color: "bg-foreground/5 text-foreground", filter: "all" },
          { label: "مسودات", value: statusCounts.draft, icon: Clock, color: "bg-amber-500/10 text-amber-600", filter: "draft" },
          { label: "معتمدة", value: statusCounts.posted, icon: CheckCircle, color: "bg-green-500/10 text-green-600", filter: "posted" },
          { label: "ملغاة", value: statusCounts.cancelled, icon: Ban, color: "bg-destructive/10 text-destructive", filter: "cancelled" },
          { label: "إجمالي المبالغ", value: formatCurrency(totalDebit), icon: FileText, color: "bg-blue-500/10 text-blue-600", filter: "" },
        ].map(({ label, value, icon: Icon, color, filter }) => (
          <button key={label} onClick={() => filter && setStatusFilter(filter)}
            className={`rounded-xl border p-3 text-right bg-card transition-all hover:shadow-md ${statusFilter === filter ? "ring-2 ring-primary" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="text-xl font-bold text-foreground">{value}</span>
            </div>
            <p className="text-xs text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      <DataTable
        columns={columns}
        data={filteredEntries}
        searchPlaceholder="البحث في القيود..."
        isLoading={loading}
        emptyMessage="لا توجد قيود محاسبية"
        onRowClick={(entry) => navigate(`/journal/${entry.id}`)}
        toolbarContent={
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36 h-9 text-sm">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الحالات ({statusCounts.all})</SelectItem>
                <SelectItem value="draft">مسودة ({statusCounts.draft})</SelectItem>
                <SelectItem value="posted">معتمد ({statusCounts.posted})</SelectItem>
                <SelectItem value="cancelled">ملغي ({statusCounts.cancelled})</SelectItem>
              </SelectContent>
            </Select>
            <DatePickerInput value={dateFrom} onChange={setDateFrom} placeholder="من تاريخ" className="w-[150px] h-9 text-sm" />
            <DatePickerInput value={dateTo} onChange={setDateTo} placeholder="إلى تاريخ" className="w-[150px] h-9 text-sm" />
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
                مسح الفلاتر
              </Button>
            )}
            <ExportMenu config={journalExportConfig} disabled={loading} />
          </div>
        }
      />
    </div>
  );
}
