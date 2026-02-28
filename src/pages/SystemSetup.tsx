import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Settings2, Play, CheckCircle2, AlertCircle, Loader2, Database, UserCog, Building2, Download, Upload, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SystemSetup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [backupLoading, setBackupLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResults, setResetResults] = useState<string[]>([]);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);

  const handleSeedSystem = async () => {
    setLoading(true);
    setResults([]);
    setStatus("idle");
    try {
      const { data, error } = await supabase.functions.invoke("seed-system", { method: "POST" });
      if (error) throw error;
      setResults(data.results || []);
      setStatus("success");
      toast({ title: "تمت التهيئة بنجاح", description: "تم تطبيق الإعدادات الافتراضية للنظام" });
    } catch (error: any) {
      setStatus("error");
      toast({ title: "خطأ في التهيئة", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleBackup = async () => {
    setBackupLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("database-backup", {
        body: { action: "backup" },
      });
      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      toast({ title: "تم التصدير", description: "تم تحميل النسخة الاحتياطية بنجاح" });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setRestoreLoading(true);
    try {
      const text = await file.text();
      const backupData = JSON.parse(text);

      if (!backupData.backup || !backupData.version) {
        throw new Error("ملف النسخة الاحتياطية غير صالح");
      }

      toast({
        title: "ملاحظة",
        description: "استعادة النسخة الاحتياطية تتطلب تصفير قاعدة البيانات أولاً ثم إعادة إدخال البيانات. يرجى التواصل مع مدير النظام لتنفيذ هذه العملية على مستوى الخادم.",
      });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setRestoreLoading(false);
      if (restoreRef.current) restoreRef.current.value = "";
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    setResetResults([]);
    try {
      const { data, error } = await supabase.functions.invoke("database-backup", {
        body: { action: "reset" },
      });
      if (error) throw error;
      setResetResults(data.results || []);
      toast({ title: "تم التصفير", description: "تم تصفير قاعدة البيانات مع الاحتفاظ بالحسابات والمستخدمين" });
    } catch (error: any) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="w-6 h-6" />
          إعداد النظام
        </h1>
        <p className="text-muted-foreground mt-1">تهيئة البيانات الأساسية والنسخ الاحتياطي</p>
      </div>

      {/* System Initialization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تهيئة البيانات الأساسية</CardTitle>
          <CardDescription>إنشاء البيانات الافتراضية إذا لم تكن موجودة (آمن ولن يؤثر على البيانات الحالية)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <UserCog className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">حساب المدير الافتراضي</p>
                <p className="text-sm text-muted-foreground">
                  إنشاء حساب أدمن (<code className="text-xs bg-muted px-1 rounded">admin@system.com</code>)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <Database className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <p className="font-medium">شجرة الحسابات الافتراضية (29 حساب)</p>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <p className="font-medium">إعدادات الشركة الافتراضية</p>
            </div>
          </div>

          <Button onClick={handleSeedSystem} disabled={loading} size="lg" className="w-full">
            {loading ? <><Loader2 className="w-5 h-5 ml-2 animate-spin" />جارٍ التهيئة...</> : <><Play className="w-5 h-5 ml-2" />تهيئة النظام</>}
          </Button>

          {results.length > 0 && (
            <div className="space-y-2">
              <Badge variant={status === "success" ? "default" : "destructive"} className="gap-1">
                {status === "success" ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {status === "success" ? "اكتملت التهيئة" : "حدث خطأ"}
              </Badge>
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Backup & Restore */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="w-5 h-5" />
            النسخ الاحتياطي والاستعادة
          </CardTitle>
          <CardDescription>تصدير واستعادة بيانات النظام كملف JSON</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button variant="outline" className="w-full gap-2" onClick={handleBackup} disabled={backupLoading}>
            {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            إنشاء نسخة احتياطية (تحميل JSON)
          </Button>

          <div className="relative">
            <input
              ref={restoreRef}
              type="file"
              accept=".json"
              onChange={handleRestore}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={restoreLoading}
            />
            <Button variant="outline" className="w-full gap-2" disabled={restoreLoading}>
              {restoreLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              استعادة نسخة احتياطية (رفع JSON)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Database Reset */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2 text-destructive">
            <Trash2 className="w-5 h-5" />
            تصفير قاعدة البيانات
          </CardTitle>
          <CardDescription>
            حذف جميع البيانات مع الاحتفاظ بشجرة الحسابات وإعدادات الشركة والمستخدمين. هذا الإجراء لا يمكن التراجع عنه!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive mb-1">⚠️ تحذير هام</p>
            <p className="text-muted-foreground">سيتم حذف: المنتجات، العملاء، الموردين، الفواتير، المدفوعات، حركات المخزون، القيود المحاسبية، التصنيفات، الماركات، والوحدات.</p>
            <p className="text-muted-foreground mt-1">سيتم الاحتفاظ بـ: شجرة الحسابات، إعدادات الشركة، حسابات المستخدمين.</p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" className="w-full gap-2" disabled={resetLoading}>
                {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                تصفير قاعدة البيانات
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>⚠️ تأكيد تصفير قاعدة البيانات</AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من تصفير قاعدة البيانات بالكامل؟ سيتم حذف جميع البيانات التشغيلية ولا يمكن التراجع عن هذا الإجراء. يُنصح بأخذ نسخة احتياطية أولاً.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogAction onClick={handleReset} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  نعم، صفّر قاعدة البيانات
                </AlertDialogAction>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {resetResults.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
              {resetResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  <span>{r}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
