import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, type CompanySettings } from "@/contexts/SettingsContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Building2,
  DollarSign,
  FileText,
  Save,
  Loader2,
  Upload,
  X,
  Image,
} from "lucide-react";

const currencies = [
  { value: "EGP", label: "جنيه مصري (EGP)" },
  { value: "SAR", label: "ريال سعودي (SAR)" },
  { value: "AED", label: "درهم إماراتي (AED)" },
  { value: "KWD", label: "دينار كويتي (KWD)" },
  { value: "QAR", label: "ريال قطري (QAR)" },
  { value: "BHD", label: "دينار بحريني (BHD)" },
  { value: "OMR", label: "ريال عماني (OMR)" },
  { value: "JOD", label: "دينار أردني (JOD)" },
  { value: "IQD", label: "دينار عراقي (IQD)" },
  { value: "LBP", label: "ليرة لبنانية (LBP)" },
  { value: "USD", label: "دولار أمريكي (USD)" },
  { value: "EUR", label: "يورو (EUR)" },
];

const fiscalYearOptions = [
  { value: "01-01", label: "يناير (01/01)" },
  { value: "04-01", label: "أبريل (04/01)" },
  { value: "07-01", label: "يوليو (07/01)" },
  { value: "10-01", label: "أكتوبر (10/01)" },
];

export default function SettingsPage() {
  const { settings: globalSettings, refetch } = useSettings();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("company_settings")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error) {
      toast.error("خطأ في تحميل الإعدادات");
      console.error(error);
    } else if (data) {
      setSettings(data as unknown as CompanySettings);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);

    const { id, ...updateData } = settings;
    const { error } = await supabase
      .from("company_settings")
      .update(updateData as any)
      .eq("id", id);

    if (error) {
      toast.error("خطأ في حفظ الإعدادات");
      console.error(error);
    } else {
      toast.success("تم حفظ الإعدادات بنجاح");
      await refetch();
    }
    setSaving(false);
  };

  const updateField = <K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;

    if (!file.type.startsWith("image/")) {
      toast.error("يجب اختيار ملف صورة");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن لا يتجاوز 2 ميجابايت");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `company-logo-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from("product-images")
        .getPublicUrl(fileName);

      updateField("logo_url", urlData.publicUrl);
      toast.success("تم رفع الشعار بنجاح. اضغط حفظ لتأكيد التغييرات.");
    } catch (err: any) {
      toast.error("خطأ في رفع الشعار: " + err.message);
    }
    setUploading(false);
  };

  const removeLogo = () => {
    updateField("logo_url", "");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="text-center text-muted-foreground py-16">
        لم يتم العثور على إعدادات. تواصل مع مدير النظام.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">الإعدادات</h1>
          <p className="text-muted-foreground text-sm mt-1">إعدادات النظام والشركة</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ الإعدادات
        </Button>
      </div>

      <Tabs defaultValue="company" dir="rtl">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="company" className="gap-2">
            <Building2 className="h-4 w-4" />
            الشركة
          </TabsTrigger>
          <TabsTrigger value="financial" className="gap-2">
            <DollarSign className="h-4 w-4" />
            المالية
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            الفواتير
          </TabsTrigger>
        </TabsList>

        {/* ── Company Tab ── */}
        <TabsContent value="company" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">معلومات الشركة</CardTitle>
              <CardDescription>البيانات الأساسية للشركة التي تظهر في الفواتير والتقارير</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Logo */}
              <div className="space-y-2">
                <Label>شعار الشركة</Label>
                <div className="flex items-center gap-4">
                  {settings.logo_url ? (
                    <div className="relative">
                      <img
                        src={settings.logo_url}
                        alt="شعار الشركة"
                        className="w-20 h-20 rounded-lg object-contain border bg-muted/30 p-1"
                      />
                      <button
                        onClick={removeLogo}
                        className="absolute -top-2 -left-2 bg-destructive text-destructive-foreground rounded-full p-0.5 hover:bg-destructive/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-lg border-2 border-dashed border-muted-foreground/30 flex items-center justify-center bg-muted/10">
                      <Image className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div>
                    <Button variant="outline" size="sm" className="gap-2" disabled={uploading} asChild>
                      <label className="cursor-pointer">
                        {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        {uploading ? "جاري الرفع..." : "رفع شعار"}
                        <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                      </label>
                    </Button>
                    <p className="text-xs text-muted-foreground mt-1">PNG أو JPG, الحد الأقصى 2 ميجابايت</p>
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم الشركة (عربي)</Label>
                  <Input
                    value={settings.company_name}
                    onChange={(e) => updateField("company_name", e.target.value)}
                    placeholder="اسم الشركة بالعربية"
                  />
                </div>
                <div className="space-y-2">
                  <Label>اسم الشركة (إنجليزي)</Label>
                  <Input
                    value={settings.company_name_en || ""}
                    onChange={(e) => updateField("company_name_en", e.target.value)}
                    placeholder="Company Name"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>نشاط الشركة</Label>
                <Input
                  value={settings.business_activity || ""}
                  onChange={(e) => updateField("business_activity", e.target.value)}
                  placeholder="مثال: تجارة مواد البناء والتوريدات"
                />
              </div>

              <div className="space-y-2">
                <Label>العنوان</Label>
                <Textarea
                  value={settings.address || ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  placeholder="عنوان الشركة الكامل"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>رقم الهاتف</Label>
                  <Input
                    value={settings.phone || ""}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="+20 xxx xxx xxxx"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input
                    value={settings.email || ""}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="info@company.com"
                    dir="ltr"
                    type="email"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>الموقع الإلكتروني</Label>
                <Input
                  value={settings.website || ""}
                  onChange={(e) => updateField("website", e.target.value)}
                  placeholder="https://www.company.com"
                  dir="ltr"
                />
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>الرقم الضريبي</Label>
                  <Input
                    value={settings.tax_number || ""}
                    onChange={(e) => updateField("tax_number", e.target.value)}
                    placeholder="الرقم الضريبي للشركة"
                  />
                </div>
                <div className="space-y-2">
                  <Label>السجل التجاري</Label>
                  <Input
                    value={settings.commercial_register || ""}
                    onChange={(e) => updateField("commercial_register", e.target.value)}
                    placeholder="رقم السجل التجاري"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Financial Tab ── */}
        <TabsContent value="financial" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">الإعدادات المالية</CardTitle>
              <CardDescription>العملة والسنة المالية ونسبة الضريبة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>العملة الافتراضية</Label>
                  <Select
                    value={settings.default_currency}
                    onValueChange={(v) => updateField("default_currency", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {currencies.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>بداية السنة المالية</Label>
                  <Select
                    value={settings.fiscal_year_start}
                    onValueChange={(v) => updateField("fiscal_year_start", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {fiscalYearOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>نسبة الضريبة الافتراضية (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={settings.tax_rate}
                    onChange={(e) => updateField("tax_rate", Number(e.target.value))}
                    placeholder="0"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">بادئات الترقيم</CardTitle>
              <CardDescription>بادئة ترقيم الفواتير والمرتجعات والمدفوعات</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>فواتير المبيعات</Label>
                  <Input value={settings.sales_invoice_prefix} onChange={(e) => updateField("sales_invoice_prefix", e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>فواتير المشتريات</Label>
                  <Input value={settings.purchase_invoice_prefix} onChange={(e) => updateField("purchase_invoice_prefix", e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>مدة الدفع (أيام)</Label>
                  <Input type="number" min={0} value={settings.payment_terms_days} onChange={(e) => updateField("payment_terms_days", Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label>مرتجعات المبيعات</Label>
                  <Input value={settings.sales_return_prefix} onChange={(e) => updateField("sales_return_prefix", e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>مرتجعات المشتريات</Label>
                  <Input value={settings.purchase_return_prefix} onChange={(e) => updateField("purchase_return_prefix", e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>مدفوعات العملاء</Label>
                  <Input value={settings.customer_payment_prefix} onChange={(e) => updateField("customer_payment_prefix", e.target.value)} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>مدفوعات الموردين</Label>
                  <Input value={settings.supplier_payment_prefix} onChange={(e) => updateField("supplier_payment_prefix", e.target.value)} dir="ltr" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">خيارات العرض</CardTitle>
              <CardDescription>التحكم في محتوى الفواتير المطبوعة</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>إظهار الضريبة في الفاتورة</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">عرض تفاصيل الضريبة في الفواتير المطبوعة</p>
                </div>
                <Switch
                  checked={settings.show_tax_on_invoice}
                  onCheckedChange={(v) => updateField("show_tax_on_invoice", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>إظهار الخصم في الفاتورة</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">عرض تفاصيل الخصم في الفواتير المطبوعة</p>
                </div>
                <Switch
                  checked={settings.show_discount_on_invoice}
                  onCheckedChange={(v) => updateField("show_discount_on_invoice", v)}
                />
              </div>

              <Separator />

              <div className="space-y-2">
                <Label>ملاحظات الفاتورة الافتراضية</Label>
                <Textarea
                  value={settings.invoice_notes || ""}
                  onChange={(e) => updateField("invoice_notes", e.target.value)}
                  placeholder="ملاحظات تظهر في أسفل كل فاتورة..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>تذييل الفاتورة</Label>
                <Textarea
                  value={settings.invoice_footer || ""}
                  onChange={(e) => updateField("invoice_footer", e.target.value)}
                  placeholder="نص التذييل الذي يظهر في نهاية الفاتورة..."
                  rows={2}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
