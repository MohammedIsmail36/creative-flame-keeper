import React, { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AccountCombobox } from "@/components/AccountCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { FileText, Plus, Pencil, Trash2, Search, Download, Filter, Eye, CheckCircle, Clock, BookOpen, X, CalendarIcon } from "lucide-react";

interface Account {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

interface JournalEntryLine {
  id?: string;
  account_id: string;
  debit: number;
  credit: number;
  description: string;
}

interface JournalEntry {
  id: string;
  entry_number: number;
  entry_date: string;
  description: string;
  status: string;
  total_debit: number;
  total_credit: number;
  created_at: string;
  lines?: JournalEntryLine[];
}

export default function Journal() {
  const { role, user } = useAuth();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "posted">("all");
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<JournalEntry | null>(null);
  const [formDate, setFormDate] = useState(new Date().toISOString().split("T")[0]);
  const [formDescription, setFormDescription] = useState("");
  const [formLines, setFormLines] = useState<JournalEntryLine[]>([
    { account_id: "", debit: 0, credit: 0, description: "" },
    { account_id: "", debit: 0, credit: 0, description: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  const canEdit = role === "admin" || role === "accountant";
  const canDelete = role === "admin";

  const fetchData = async () => {
    setLoading(true);
    const [entriesRes, accountsRes] = await Promise.all([
      supabase.from("journal_entries").select("*").order("entry_number", { ascending: false }),
      supabase.from("accounts").select("id, code, name, account_type").eq("is_active", true).eq("is_parent", false).order("code"),
    ]);

    if (entriesRes.error) {
      toast({ title: "خطأ", description: "فشل في جلب القيود", variant: "destructive" });
    } else {
      setEntries(entriesRes.data as JournalEntry[]);
    }

    if (accountsRes.data) {
      setAccounts(accountsRes.data as Account[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const statusCounts = useMemo(() => {
    const counts = { all: entries.length, draft: 0, posted: 0 };
    entries.forEach((e) => {
      if (e.status === "draft") counts.draft++;
      else counts.posted++;
    });
    return counts;
  }, [entries]);

  const totalDebit = useMemo(() => entries.reduce((s, e) => s + Number(e.total_debit), 0), [entries]);
  const totalCredit = useMemo(() => entries.reduce((s, e) => s + Number(e.total_credit), 0), [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      const matchesSearch = !searchQuery || e.description.includes(searchQuery) || String(e.entry_number).includes(searchQuery);
      const matchesStatus = statusFilter === "all" || e.status === statusFilter;
      const matchesDateFrom = !dateFrom || e.entry_date >= format(dateFrom, "yyyy-MM-dd");
      const matchesDateTo = !dateTo || e.entry_date <= format(dateTo, "yyyy-MM-dd");
      return matchesSearch && matchesStatus && matchesDateFrom && matchesDateTo;
    });
  }, [entries, searchQuery, statusFilter, dateFrom, dateTo]);

  const accountMap = useMemo(() => {
    const map = new Map<string, Account>();
    accounts.forEach((a) => map.set(a.id, a));
    return map;
  }, [accounts]);

  // Form helpers
  const formTotalDebit = formLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const formTotalCredit = formLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const isBalanced = formTotalDebit > 0 && formTotalDebit === formTotalCredit;

  const openAddDialog = () => {
    setEditingEntry(null);
    setFormDate(new Date().toISOString().split("T")[0]);
    setFormDescription("");
    setFormLines([
      { account_id: "", debit: 0, credit: 0, description: "" },
      { account_id: "", debit: 0, credit: 0, description: "" },
    ]);
    setDialogOpen(true);
  };

  const openEditDialog = async (entry: JournalEntry) => {
    setEditingEntry(entry);
    setFormDate(entry.entry_date);
    setFormDescription(entry.description);

    const { data } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", entry.id).order("created_at");
    if (data && data.length > 0) {
      setFormLines(data.map((l: any) => ({
        id: l.id,
        account_id: l.account_id,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description || "",
      })));
    } else {
      setFormLines([
        { account_id: "", debit: 0, credit: 0, description: "" },
        { account_id: "", debit: 0, credit: 0, description: "" },
      ]);
    }
    setDialogOpen(true);
  };

  const openViewDialog = async (entry: JournalEntry) => {
    const { data } = await supabase.from("journal_entry_lines").select("*").eq("journal_entry_id", entry.id).order("created_at");
    setViewingEntry({
      ...entry,
      lines: (data || []).map((l: any) => ({
        id: l.id,
        account_id: l.account_id,
        debit: Number(l.debit),
        credit: Number(l.credit),
        description: l.description || "",
      })),
    });
    setViewDialogOpen(true);
  };

  const addLine = () => {
    setFormLines([...formLines, { account_id: "", debit: 0, credit: 0, description: "" }]);
  };

  const removeLine = (index: number) => {
    if (formLines.length <= 2) return;
    setFormLines(formLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: keyof JournalEntryLine, value: any) => {
    const updated = [...formLines];
    (updated[index] as any)[field] = value;
    // Auto-clear the opposite field
    if (field === "debit" && Number(value) > 0) {
      updated[index].credit = 0;
    } else if (field === "credit" && Number(value) > 0) {
      updated[index].debit = 0;
    }
    setFormLines(updated);
  };

  const handleSave = async (asPosted: boolean = false) => {
    if (!formDescription.trim()) {
      toast({ title: "تنبيه", description: "يرجى إدخال وصف القيد", variant: "destructive" });
      return;
    }

    const validLines = formLines.filter((l) => l.account_id && (l.debit > 0 || l.credit > 0));
    if (validLines.length < 2) {
      toast({ title: "تنبيه", description: "يجب إضافة سطرين على الأقل", variant: "destructive" });
      return;
    }

    if (!isBalanced) {
      toast({ title: "تنبيه", description: "القيد غير متوازن - مجموع المدين يجب أن يساوي مجموع الدائن", variant: "destructive" });
      return;
    }

    setSaving(true);

    const entryPayload = {
      entry_date: formDate,
      description: formDescription.trim(),
      status: asPosted ? "posted" : "draft",
      total_debit: formTotalDebit,
      total_credit: formTotalCredit,
      created_by: user?.id || null,
    };

    try {
      if (editingEntry) {
        const { error } = await supabase.from("journal_entries").update(entryPayload).eq("id", editingEntry.id);
        if (error) throw error;

        // Delete old lines and insert new ones
        await supabase.from("journal_entry_lines").delete().eq("journal_entry_id", editingEntry.id);
        const linesPayload = validLines.map((l) => ({
          journal_entry_id: editingEntry.id,
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          description: l.description || null,
        }));
        const { error: linesError } = await supabase.from("journal_entry_lines").insert(linesPayload);
        if (linesError) throw linesError;

        toast({ title: "تم التحديث", description: "تم تعديل القيد بنجاح" });
      } else {
        const { data, error } = await supabase.from("journal_entries").insert(entryPayload).select("id").single();
        if (error) throw error;

        const linesPayload = validLines.map((l) => ({
          journal_entry_id: data.id,
          account_id: l.account_id,
          debit: l.debit,
          credit: l.credit,
          description: l.description || null,
        }));
        const { error: linesError } = await supabase.from("journal_entry_lines").insert(linesPayload);
        if (linesError) throw linesError;

        toast({ title: "تمت الإضافة", description: "تم إنشاء القيد بنجاح" });
      }

      setDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message || "حدث خطأ", variant: "destructive" });
    }
    setSaving(false);
  };

  const handleDelete = async (entry: JournalEntry) => {
    const { error } = await supabase.from("journal_entries").delete().eq("id", entry.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل في حذف القيد", variant: "destructive" });
    } else {
      toast({ title: "تم الحذف", description: "تم حذف القيد بنجاح" });
      fetchData();
    }
  };

  const handlePost = async (entry: JournalEntry) => {
    const { error } = await supabase.from("journal_entries").update({ status: "posted" }).eq("id", entry.id);
    if (error) {
      toast({ title: "خطأ", description: "فشل في اعتماد القيد", variant: "destructive" });
    } else {
      toast({ title: "تم الاعتماد", description: "تم اعتماد القيد بنجاح" });
      fetchData();
    }
  };

  const formatNum = (val: number) => Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });

  const handleExportExcel = async () => {
    const XLSX = await import("xlsx");
    const data = filteredEntries.map((e) => ({
      "Entry #": e.entry_number,
      "Date": e.entry_date,
      "Description": e.description,
      "Status": e.status === "posted" ? "Posted" : "Draft",
      "Debit (EGP)": Number(e.total_debit),
      "Credit (EGP)": Number(e.total_credit),
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Journal Entries");
    XLSX.writeFile(wb, "Journal_Entries.xlsx");
    toast({ title: "تم التصدير", description: "تم تصدير القيود بصيغة Excel" });
    setExportMenuOpen(false);
  };

  const handleExportPDF = async () => {
    const { createArabicPDF } = await import("@/lib/pdf-arabic");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = await createArabicPDF("landscape");

    doc.setFontSize(16);
    doc.text("القيود المحاسبية", 148, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`التاريخ: ${new Date().toLocaleDateString("en-US")} | العملة: EGP`, 148, 22, { align: "center" });

    const tableData = filteredEntries.map((e) => [
      e.entry_number,
      formatDate(e.entry_date),
      e.description,
      e.status === "posted" ? "معتمد" : "مسودة",
      formatNum(Number(e.total_debit)),
      formatNum(Number(e.total_credit)),
    ]);

    autoTable(doc, {
      head: [["#", "التاريخ", "الوصف", "الحالة", "مدين (EGP)", "دائن (EGP)"]],
      body: tableData,
      startY: 28,
      styles: { fontSize: 9, cellPadding: 3, font: "Amiri", halign: "right" },
      headStyles: { fillColor: [59, 130, 246], textColor: 255 },
      foot: [["", "", "", "الإجمالي", formatNum(totalDebit), formatNum(totalCredit)]],
      footStyles: { fillColor: [241, 245, 249], textColor: [30, 41, 59], fontStyle: "bold" },
    });

    doc.save("Journal_Entries.pdf");
    toast({ title: "تم التصدير", description: "تم تصدير القيود بصيغة PDF" });
    setExportMenuOpen(false);
  };

  const handleExportCSV = () => {
    const headers = ["Entry #", "Date", "Description", "Status", "Debit (EGP)", "Credit (EGP)"];
    const rows = filteredEntries.map((e) => [
      e.entry_number,
      e.entry_date,
      e.description,
      e.status === "posted" ? "Posted" : "Draft",
      e.total_debit,
      e.total_credit,
    ]);
    const csvContent = "\uFEFF" + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "Journal_Entries.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "تم التصدير", description: "تم تصدير القيود بصيغة CSV" });
    setExportMenuOpen(false);
  };

  const formatCurrency = (val: number) => `${formatNum(Number(val))} EGP`;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
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
          <Button className="gap-2" onClick={openAddDialog}>
            <Plus className="h-4 w-4" />
            قيد جديد
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي القيود", value: entries.length, icon: BookOpen, color: "bg-foreground/5 text-foreground" },
          { label: "مسودات", value: statusCounts.draft, icon: Clock, color: "bg-amber-500/10 text-amber-600" },
          { label: "معتمدة", value: statusCounts.posted, icon: CheckCircle, color: "bg-green-500/10 text-green-600" },
          { label: "إجمالي المبالغ", value: formatCurrency(totalDebit), icon: FileText, color: "bg-blue-500/10 text-blue-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="border">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-1">
                <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${color}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <span className="text-xl font-bold text-foreground">{value}</span>
              </div>
              <p className="text-xs text-muted-foreground">{label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search & Actions */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="البحث في القيود..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-10"
                />
              </div>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger className="w-36 gap-2">
                    <Filter className="h-4 w-4" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">الكل ({statusCounts.all})</SelectItem>
                    <SelectItem value="draft">مسودة ({statusCounts.draft})</SelectItem>
                    <SelectItem value="posted">معتمد ({statusCounts.posted})</SelectItem>
                  </SelectContent>
                </Select>
                <div className="relative">
                  <Button variant="outline" className="gap-2" onClick={() => setExportMenuOpen(!exportMenuOpen)}>
                    <Download className="h-4 w-4" />
                    تصدير
                  </Button>
                  {exportMenuOpen && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-popover border rounded-lg shadow-lg p-1 min-w-[140px]">
                      <button onClick={handleExportPDF} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                        PDF تصدير
                      </button>
                      <button onClick={handleExportExcel} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                        Excel تصدير
                      </button>
                      <button onClick={handleExportCSV} className="w-full text-right px-3 py-2 text-sm rounded hover:bg-muted transition-colors">
                        CSV تصدير
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Date Range Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">الفترة:</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-[160px] justify-start text-left font-normal", !dateFrom && "text-muted-foreground")}
                  >
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {dateFrom ? format(dateFrom, "yyyy-MM-dd") : "من تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={setDateFrom}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-sm text-muted-foreground">إلى</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn("w-[160px] justify-start text-left font-normal", !dateTo && "text-muted-foreground")}
                  >
                    <CalendarIcon className="ml-2 h-4 w-4" />
                    {dateTo ? format(dateTo, "yyyy-MM-dd") : "إلى تاريخ"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={setDateTo}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              {(dateFrom || dateTo) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  onClick={() => { setDateFrom(undefined); setDateTo(undefined); }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Entries Table */}
      <Card className="overflow-hidden">
        <CardHeader className="border-b bg-muted/30 py-4">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="h-4 w-4" />
            سجل القيود
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">جاري التحميل...</div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>لا توجد قيود محاسبية</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="text-right">رقم القيد</TableHead>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">الوصف</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">مدين</TableHead>
                  <TableHead className="text-right">دائن</TableHead>
                  <TableHead className="text-center">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEntries.map((entry) => (
                  <TableRow key={entry.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="font-mono font-medium">{entry.entry_number}</TableCell>
                    <TableCell className="text-muted-foreground">{entry.entry_date}</TableCell>
                    <TableCell className="font-medium max-w-[200px] truncate">{entry.description}</TableCell>
                    <TableCell>
                      <Badge variant={entry.status === "posted" ? "default" : "secondary"} className={entry.status === "posted" ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-amber-500/10 text-amber-600 border-amber-500/20"}>
                        {entry.status === "posted" ? "معتمد" : "مسودة"}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono">{formatCurrency(entry.total_debit)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(entry.total_credit)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openViewDialog(entry)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && entry.status === "draft" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => openEditDialog(entry)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-green-600 hover:bg-green-500/10" onClick={() => handlePost(entry)} title="اعتماد القيد">
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                        {canDelete && entry.status === "draft" && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent dir="rtl">
                              <AlertDialogHeader>
                                <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
                                <AlertDialogDescription>
                                  هل أنت متأكد من حذف القيد رقم {entry.entry_number}؟
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter className="flex-row-reverse gap-2">
                                <AlertDialogAction onClick={() => handleDelete(entry)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">حذف</AlertDialogAction>
                                <AlertDialogCancel>إلغاء</AlertDialogCancel>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle>تفاصيل القيد رقم {viewingEntry?.entry_number}</DialogTitle>
            <DialogDescription>{viewingEntry?.description}</DialogDescription>
          </DialogHeader>
          {viewingEntry && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <span className="text-muted-foreground">التاريخ: <strong className="text-foreground">{viewingEntry.entry_date}</strong></span>
                <Badge variant={viewingEntry.status === "posted" ? "default" : "secondary"}>
                  {viewingEntry.status === "posted" ? "معتمد" : "مسودة"}
                </Badge>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الحساب</TableHead>
                    <TableHead className="text-right">البيان</TableHead>
                    <TableHead className="text-right">مدين</TableHead>
                    <TableHead className="text-right">دائن</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {viewingEntry.lines?.map((line, i) => {
                    const acc = accountMap.get(line.account_id);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{acc ? `${acc.code} - ${acc.name}` : line.account_id}</TableCell>
                        <TableCell className="text-muted-foreground">{line.description || "—"}</TableCell>
                        <TableCell className="font-mono">{line.debit > 0 ? formatCurrency(line.debit) : "—"}</TableCell>
                        <TableCell className="font-mono">{line.credit > 0 ? formatCurrency(line.credit) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                  <TableRow className="bg-muted/30 font-bold">
                    <TableCell colSpan={2} className="text-left">الإجمالي</TableCell>
                    <TableCell className="font-mono">{formatCurrency(viewingEntry.total_debit)}</TableCell>
                    <TableCell className="font-mono">{formatCurrency(viewingEntry.total_credit)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editingEntry ? `تعديل القيد رقم ${editingEntry.entry_number}` : "قيد محاسبي جديد"}</DialogTitle>
            <DialogDescription>{editingEntry ? "قم بتعديل بيانات القيد" : "أدخل بيانات القيد المحاسبي الجديد"}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>التاريخ</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !formDate && "text-muted-foreground")}
                    >
                      <CalendarIcon className="ml-2 h-4 w-4" />
                      {formDate || "اختر التاريخ"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={formDate ? new Date(formDate + "T00:00:00") : undefined}
                      onSelect={(date) => date && setFormDate(format(date, "yyyy-MM-dd"))}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>وصف القيد</Label>
                <Input value={formDescription} onChange={(e) => setFormDescription(e.target.value)} placeholder="مثال: تسجيل فاتورة مبيعات" />
              </div>
            </div>

            {/* Lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">بنود القيد</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="gap-1">
                  <Plus className="h-3 w-3" />
                  سطر جديد
                </Button>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-right min-w-[200px]">الحساب</TableHead>
                      <TableHead className="text-right">البيان</TableHead>
                      <TableHead className="text-right w-[120px]">مدين</TableHead>
                      <TableHead className="text-right w-[120px]">دائن</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {formLines.map((line, index) => (
                      <TableRow key={index}>
                        <TableCell className="p-2">
                          <AccountCombobox
                            accounts={accounts}
                            value={line.account_id}
                            onValueChange={(v) => updateLine(index, "account_id", v)}
                          />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input className="h-9" value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} placeholder="بيان" />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input className="h-9 font-mono" type="number" min="0" step="0.01" value={line.debit || ""} onChange={(e) => updateLine(index, "debit", parseFloat(e.target.value) || 0)} placeholder="0.00" />
                        </TableCell>
                        <TableCell className="p-2">
                          <Input className="h-9 font-mono" type="number" min="0" step="0.01" value={line.credit || ""} onChange={(e) => updateLine(index, "credit", parseFloat(e.target.value) || 0)} placeholder="0.00" />
                        </TableCell>
                        <TableCell className="p-2">
                          {formLines.length > 2 && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => removeLine(index)}>
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/20 font-bold">
                      <TableCell colSpan={2} className="text-left p-2">الإجمالي</TableCell>
                      <TableCell className={`p-2 font-mono ${isBalanced ? "text-green-600" : "text-destructive"}`}>{formatCurrency(formTotalDebit)}</TableCell>
                      <TableCell className={`p-2 font-mono ${isBalanced ? "text-green-600" : "text-destructive"}`}>{formatCurrency(formTotalCredit)}</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              {!isBalanced && formTotalDebit > 0 && (
                <p className="text-sm text-destructive flex items-center gap-1">
                  ⚠️ القيد غير متوازن - الفرق: {formatCurrency(Math.abs(formTotalDebit - formTotalCredit))}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="flex-row-reverse gap-2 pt-4">
            <Button onClick={() => handleSave(false)} disabled={saving || !isBalanced} variant="outline">
              {saving ? "جاري الحفظ..." : "حفظ كمسودة"}
            </Button>
            <Button onClick={() => handleSave(true)} disabled={saving || !isBalanced}>
              {saving ? "جاري الحفظ..." : "حفظ واعتماد"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
