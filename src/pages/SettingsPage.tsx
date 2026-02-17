import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
} from "lucide-react";

interface CompanySettings {
  id: string;
  company_name: string;
  company_name_en: string;
  logo_url: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  tax_number: string;
  commercial_register: string;
  default_currency: string;
  fiscal_year_start: string;
  tax_rate: number;
  sales_invoice_prefix: string;
  purchase_invoice_prefix: string;
  payment_terms_days: number;
  show_tax_on_invoice: boolean;
  show_discount_on_invoice: boolean;
  invoice_notes: string;
  invoice_footer: string;
}

const defaultSettings: Omit<CompanySettings, "id"> = {
  company_name: "",
  company_name_en: "",
  logo_url: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  tax_number: "",
  commercial_register: "",
  default_currency: "EGP",
  fiscal_year_start: "01-01",
  tax_rate: 0,
  sales_invoice_prefix: "INV-",
  purchase_invoice_prefix: "PUR-",
  payment_terms_days: 30,
  show_tax_on_invoice: true,
  show_discount_on_invoice: true,
  invoice_notes: "",
  invoice_footer: "",
};

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
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
      setSettings(data as CompanySettings);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);

    const { id, ...updateData } = settings;
    const { error } = await supabase
      .from("company_settings")
      .update(updateData)
      .eq("id", id);

    if (error) {
      toast.error("خطأ في حفظ الإعدادات");
      console.error(error);
    } else {
      toast.success("تم حفظ الإعدادات بنجاح");
    }
    setSaving(false);
  };

  const updateField = <K extends keyof CompanySettings>(field: K, value: CompanySettings[K]) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
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
              <CardTitle className="text-base">إعدادات الفواتير</CardTitle>
              <CardDescription>بادئة الترقيم وشروط الدفع وخيارات العرض</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>بادئة فواتير المبيعات</Label>
                  <Input
                    value={settings.sales_invoice_prefix}
                    onChange={(e) => updateField("sales_invoice_prefix", e.target.value)}
                    placeholder="INV-"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>بادئة فواتير المشتريات</Label>
                  <Input
                    value={settings.purchase_invoice_prefix}
                    onChange={(e) => updateField("purchase_invoice_prefix", e.target.value)}
                    placeholder="PUR-"
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>مدة الدفع (أيام)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={settings.payment_terms_days}
                    onChange={(e) => updateField("payment_terms_days", Number(e.target.value))}
                    placeholder="30"
                  />
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
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
