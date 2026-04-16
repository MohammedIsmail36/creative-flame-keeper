import { useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Settings2,
  Play,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Database,
  UserCog,
  Building2,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Edge function names ───
const FN_SEED_SYSTEM = "seed-system";
const FN_DATABASE_BACKUP = "database-backup";

export default function SystemSetup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetResults, setResetResults] = useState<string[]>([]);

  const handleSeedSystem = async () => {
    setLoading(true);
    setResults([]);
    setStatus("idle");
    try {
      const { data, error } = await supabase.functions.invoke(FN_SEED_SYSTEM);
      if (error) throw error;
      setResults(data.results || []);
      setStatus("success");
      toast({
        title: "تمت التهيئة بنجاح",
        description: "تم تطبيق الإعدادات الافتراضية للنظام",
      });
    } catch (error: any) {
      console.error("Seed system error:", error.message);
      setStatus("error");
      setResults(["خطأ: حدث خطأ أثناء تهيئة النظام. يرجى المحاولة مرة أخرى."]);
      toast({
        title: "خطأ في التهيئة",
        description: "حدث خطأ أثناء تهيئة النظام. يرجى المحاولة مرة أخرى.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setResetLoading(true);
    setResetResults([]);
    try {
      const { data, error } =
        await supabase.functions.invoke(FN_DATABASE_BACKUP);
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const results: string[] = data.results || [];
      setResetResults(results);

      const hasErrors = results.some((r) => r.includes("❌"));
      if (hasErrors) {
        toast({
          title: "اكتمل التصفير مع بعض الأخطاء",
          description: "راجع التفاصيل أدناه",
          variant: "destructive",
        });
      } else {
        toast({
          title: "✅ تم التصفير بنجاح",
          description: "تم إعادة بناء قاعدة البيانات من الصفر",
        });
      }
    } catch (error: any) {
      console.error("Database reset error:", error.message);
      const errMsg =
        "حدث خطأ أثناء تصفير قاعدة البيانات. يرجى المحاولة مرة أخرى أو التواصل مع الدعم الفني.";
      setResetResults([`❌ ${errMsg}`]);
      toast({
        title: "خطأ في التصفير",
        description: errMsg,
        variant: "destructive",
      });
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <PageHeader
        icon={Settings2}
        title="إعداد النظام"
        description="تهيئة البيانات الأساسية وصيانة قاعدة البيانات"
      />

      {/* System Initialization */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تهيئة البيانات الأساسية</CardTitle>
          <CardDescription>
            إنشاء البيانات الافتراضية إذا لم تكن موجودة (آمن ولن يؤثر على
            البيانات الحالية)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
              <UserCog className="w-5 h-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">حساب المدير الافتراضي</p>
                <p className="text-sm text-muted-foreground">
                  إنشاء حساب أدمن (
                  <code className="text-xs bg-muted px-1 rounded">
                    admin@system.com
                  </code>
                  )
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

          <Button
            onClick={handleSeedSystem}
            disabled={loading}
            size="lg"
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                جارٍ التهيئة...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 ml-2" />
                تهيئة النظام
              </>
            )}
          </Button>

          {results.length > 0 && (
            <div className="space-y-2">
              <Badge
                variant={status === "success" ? "default" : "destructive"}
                className="gap-1"
              >
                {status === "success" ? (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                ) : (
                  <AlertCircle className="w-3.5 h-3.5" />
                )}
                {status === "success" ? "اكتملت التهيئة" : "حدث خطأ"}
              </Badge>
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {r.includes("❌") ? (
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    )}
                    <span>{r}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
            حذف جميع البيانات بالكامل وإعادة بناء قاعدة البيانات من الصفر مع
            إنشاء شجرة الحسابات الافتراضية وحساب المدير وإعدادات الشركة. هذا
            الإجراء لا يمكن التراجع عنه!
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
            <p className="font-medium text-destructive mb-1">⚠️ تحذير هام</p>
            <p className="text-muted-foreground">
              سيتم حذف جميع البيانات بالكامل: المنتجات، العملاء، الموردين،
              الفواتير، المدفوعات، حركات المخزون، القيود، شجرة الحسابات،
              المستخدمين، وإعدادات الشركة.
            </p>
            <p className="text-muted-foreground mt-1">
              سيتم إعادة إنشاء: شجرة الحسابات الافتراضية (29 حساب) + حساب المدير
              (admin@system.com) + إعدادات الشركة.
            </p>
            <p className="text-amber-600 font-medium mt-2">
              ⚠️ بعد اكتمال التصفير ستحتاج لتسجيل الدخول مجدداً بـ
              admin@system.com
            </p>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="w-full gap-2"
                disabled={resetLoading}
              >
                {resetLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ التصفير...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    تصفير قاعدة البيانات
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent dir="rtl">
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ⚠️ تأكيد تصفير قاعدة البيانات
                </AlertDialogTitle>
                <AlertDialogDescription>
                  هل أنت متأكد من تصفير قاعدة البيانات بالكامل؟ سيتم حذف جميع
                  البيانات والمستخدمين وإعادة بناء القاعدة من الصفر. لا يمكن
                  التراجع عن هذا الإجراء.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className="flex-row-reverse gap-2">
                <AlertDialogAction
                  onClick={handleReset}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  نعم، صفّر قاعدة البيانات
                </AlertDialogAction>
                <AlertDialogCancel>إلغاء</AlertDialogCancel>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {resetResults.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5 max-h-64 overflow-y-auto">
              {resetResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {r.includes("❌") ? (
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                  ) : r.includes("━") ? (
                    <span className="w-4 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  )}
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
