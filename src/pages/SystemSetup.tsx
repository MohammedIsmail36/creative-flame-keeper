import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Settings2, Play, CheckCircle2, AlertCircle, Loader2, Database, UserCog, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function SystemSetup() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string[]>([]);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleSeedSystem = async () => {
    setLoading(true);
    setResults([]);
    setStatus("idle");

    try {
      const { data, error } = await supabase.functions.invoke("seed-system", {
        method: "POST",
      });

      if (error) throw error;

      setResults(data.results || []);
      setStatus("success");
      toast({
        title: "تمت التهيئة بنجاح",
        description: "تم تطبيق الإعدادات الافتراضية للنظام",
      });
    } catch (error: any) {
      setStatus("error");
      toast({
        title: "خطأ في التهيئة",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Settings2 className="w-6 h-6" />
          إعداد النظام
        </h1>
        <p className="text-muted-foreground mt-1">
          تهيئة البيانات الأساسية للنظام عند التثبيت لأول مرة
        </p>
      </div>

      {/* What will be created */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">ماذا سيتم إنشاؤه؟</CardTitle>
          <CardDescription>
            عند الضغط على زر التهيئة، سيتم إنشاء البيانات التالية إذا لم تكن موجودة
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <UserCog className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">حساب المدير الافتراضي</p>
              <p className="text-sm text-muted-foreground">
                إنشاء حساب أدمن (<code className="text-xs bg-muted px-1 rounded">admin@system.com</code>) بصلاحيات كاملة
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Database className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">شجرة الحسابات الافتراضية</p>
              <p className="text-sm text-muted-foreground">
                29 حساب أساسي تشمل الأصول والخصوم وحقوق الملكية والإيرادات والمصروفات
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
            <Building2 className="w-5 h-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">إعدادات الشركة</p>
              <p className="text-sm text-muted-foreground">
                إنشاء سجل إعدادات الشركة الافتراضي بالعملة المصرية
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">تشغيل التهيئة</CardTitle>
          <CardDescription>
            هذا الإجراء آمن ولن يؤثر على البيانات الموجودة مسبقاً
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* Results */}
          {results.length > 0 && (
            <div className="space-y-2 mt-4">
              <div className="flex items-center gap-2">
                {status === "success" ? (
                  <Badge variant="default" className="gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    اكتملت التهيئة
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    حدث خطأ
                  </Badge>
                )}
              </div>
              <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
                {results.map((result, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    <span>{result}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
