import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSettings, type CompanySettings } from "@/contexts/SettingsContext";
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
  Info,
  Phone,
  Settings2,
  Hash,
  ReceiptText,
  Eye,
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

function SectionCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-card p-6 md:p-8 rounded-2xl border border-border shadow-sm">
      <h3 className="text-xl font-bold mb-6 flex items-center gap-2.5">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h3>
      {children}
    </div>
  );
}

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
    if (!file.type.startsWith("image/")) { toast.error("يجب اختيار ملف صورة"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("حجم الصورة يجب أن لا يتجاوز 2 ميجابايت"); return; }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `company-logo-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("product-images").upload(fileName, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(fileName);
      updateField("logo_url", urlData.publicUrl);
      toast.success("تم رفع الشعار بنجاح. اضغط حفظ لتأكيد التغييرات.");
    } catch (err: any) {
      toast.error("خطأ في رفع الشعار: " + err.message);
    }
    setUploading(false);
  };

  const removeLogo = () => updateField("logo_url", "");

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
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-bold text-foreground">إعدادات الشركة</h2>
          <p className="text-muted-foreground mt-1">إدارة معلومات المنشأة وتفاصيل الاتصال الرسمية الخاصة بك</p>
        </div>
        <Button onClick={handleSave} disabled={saving} className="gap-2 rounded-xl px-6 shadow-lg shadow-primary/20">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          حفظ جميع التغييرات
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="company" dir="rtl">
        <TabsList className="bg-transparent border-b border-border rounded-none h-auto p-0 gap-8 mb-8 w-full justify-start">
          <TabsTrigger
            value="company"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none bg-transparent px-0 pb-4 font-bold text-sm"
          >
            معلومات الشركة
          </TabsTrigger>
          <TabsTrigger
            value="financial"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none bg-transparent px-0 pb-4 font-bold text-sm"
          >
            الإعدادات المالية
          </TabsTrigger>
          <TabsTrigger
            value="invoices"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none bg-transparent px-0 pb-4 font-bold text-sm"
          >
            إدارة الفواتير
          </TabsTrigger>
        </TabsList>

        {/* ── Company Tab ── */}
        <TabsContent value="company" className="space-y-6 mt-0">
          {/* Logo Card */}
          <div className="bg-card p-6 rounded-2xl border border-border shadow-sm">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="relative group">
                <div className="w-32 h-32 rounded-2xl bg-muted/30 border-2 border-dashed border-border flex items-center justify-center overflow-hidden transition-all group-hover:border-primary">
                  {settings.logo_url ? (
                    <>
                      <img src={settings.logo_url} alt="شعار الشركة" className="w-full h-full object-contain p-4" />
                      <div className="absolute inset-0 bg-foreground/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                        <Upload className="h-6 w-6 text-white" />
                      </div>
                    </>
                  ) : (
                    <Image className="h-10 w-10 text-muted-foreground/40" />
                  )}
                </div>
              </div>
              <div className="flex-1 text-center sm:text-right">
                <h4 className="text-lg font-bold">شعار المنشأة</h4>
                <p className="text-muted-foreground text-sm mt-1">
                  يُنصح برفع صورة عالية الجودة بصيغة PNG أو SVG بخلفية شفافة
                </p>
                <div className="mt-4 flex flex-wrap justify-center sm:justify-start gap-2">
                  <Button variant="outline" size="sm" className="gap-2 border-primary/20 text-primary bg-primary/10 hover:bg-primary/20 rounded-lg font-bold" disabled={uploading} asChild>
                    <label className="cursor-pointer">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? "جاري الرفع..." : "رفع شعار جديد"}
                      <input type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                    </label>
                  </Button>
                  {settings.logo_url && (
                    <Button variant="ghost" size="sm" onClick={removeLogo} className="text-muted-foreground hover:text-destructive">
                      <X className="h-4 w-4 ml-1" />
                      حذف
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* General Info */}
          <SectionCard icon={Info} title="المعلومات العامة">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">اسم المنشأة (بالعربية)</Label>
                <Input value={settings.company_name} onChange={(e) => updateField("company_name", e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">اسم المنشأة (بالإنجليزية)</Label>
                <Input value={settings.company_name_en || ""} onChange={(e) => updateField("company_name_en", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">نشاط العمل</Label>
                <Input value={settings.business_activity || ""} onChange={(e) => updateField("business_activity", e.target.value)} placeholder="مثال: تجارة مواد البناء والتوريدات" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">الرقم الضريبي (VAT)</Label>
                <Input value={settings.tax_number || ""} onChange={(e) => updateField("tax_number", e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">رقم السجل التجاري</Label>
                <Input value={settings.commercial_register || ""} onChange={(e) => updateField("commercial_register", e.target.value)} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">الموقع الإلكتروني</Label>
                <Input value={settings.website || ""} onChange={(e) => updateField("website", e.target.value)} dir="ltr" type="url" className="rounded-lg" />
              </div>
            </div>
          </SectionCard>

          {/* Contact Info */}
          <SectionCard icon={Phone} title="معلومات الاتصال والعنوان">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">رقم الهاتف</Label>
                <Input value={settings.phone || ""} onChange={(e) => updateField("phone", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">البريد الإلكتروني الرسمي</Label>
                <Input value={settings.email || ""} onChange={(e) => updateField("email", e.target.value)} dir="ltr" type="email" className="rounded-lg" />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label className="text-sm font-bold">العنوان الوطني / التفصيلي</Label>
                <Textarea value={settings.address || ""} onChange={(e) => updateField("address", e.target.value)} rows={3} className="rounded-lg" />
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── Financial Tab ── */}
        <TabsContent value="financial" className="space-y-6 mt-0">
          <SectionCard icon={DollarSign} title="الإعدادات المالية">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">العملة الافتراضية</Label>
                <Select value={settings.default_currency} onValueChange={(v) => updateField("default_currency", v)}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {currencies.map((c) => (<SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">بداية السنة المالية</Label>
                <Select value={settings.fiscal_year_start} onValueChange={(v) => updateField("fiscal_year_start", v)}>
                  <SelectTrigger className="rounded-lg"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {fiscalYearOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">نسبة الضريبة الافتراضية (%)</Label>
                <Input type="number" min={0} max={100} value={settings.tax_rate} onChange={(e) => updateField("tax_rate", Number(e.target.value))} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدة الاسترجاع (أيام)</Label>
                <Input type="number" min={1} max={365} value={settings.return_days_limit || 30} onChange={(e) => updateField("return_days_limit", Number(e.target.value))} className="rounded-lg" />
                <p className="text-xs text-muted-foreground">الحد الأقصى لعدد الأيام المسموح بها لإرجاع المبيعات</p>
              </div>
            </div>

            <hr className="border-border my-2" />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-bold">تفعيل إقفال السنة المالية</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  يتيح إنشاء قيد إقفال تلقائي لتصفير حسابات الإيرادات والمصروفات وترحيل صافي الربح/الخسارة إلى حساب الأرباح المحتجزة (3102)
                </p>
              </div>
              <Switch checked={settings.enable_fiscal_year_closing} onCheckedChange={(v) => updateField("enable_fiscal_year_closing", v)} />
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="space-y-6 mt-0">
          <SectionCard icon={Hash} title="بادئات الترقيم">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">فواتير المبيعات</Label>
                <Input value={settings.sales_invoice_prefix} onChange={(e) => updateField("sales_invoice_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">فواتير المشتريات</Label>
                <Input value={settings.purchase_invoice_prefix} onChange={(e) => updateField("purchase_invoice_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدة الدفع (أيام)</Label>
                <Input type="number" min={0} value={settings.payment_terms_days} onChange={(e) => updateField("payment_terms_days", Number(e.target.value))} className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مرتجعات المبيعات</Label>
                <Input value={settings.sales_return_prefix} onChange={(e) => updateField("sales_return_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مرتجعات المشتريات</Label>
                <Input value={settings.purchase_return_prefix} onChange={(e) => updateField("purchase_return_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">القيود المحاسبية</Label>
                <Input value={settings.journal_entry_prefix || "JV-"} onChange={(e) => updateField("journal_entry_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدفوعات العملاء</Label>
                <Input value={settings.customer_payment_prefix} onChange={(e) => updateField("customer_payment_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدفوعات الموردين</Label>
                <Input value={settings.supplier_payment_prefix} onChange={(e) => updateField("supplier_payment_prefix", e.target.value)} dir="ltr" className="rounded-lg" />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Eye} title="خيارات العرض">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">إظهار الضريبة في الفاتورة</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">عرض تفاصيل الضريبة في الفواتير المطبوعة</p>
                </div>
                <Switch checked={settings.show_tax_on_invoice} onCheckedChange={(v) => updateField("show_tax_on_invoice", v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">إظهار الخصم في الفاتورة</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">عرض تفاصيل الخصم في الفواتير المطبوعة</p>
                </div>
                <Switch checked={settings.show_discount_on_invoice} onCheckedChange={(v) => updateField("show_discount_on_invoice", v)} />
              </div>

              <hr className="border-border" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold">ملاحظات الفاتورة الافتراضية</Label>
                  <Textarea value={settings.invoice_notes || ""} onChange={(e) => updateField("invoice_notes", e.target.value)} rows={3} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold">تذييل الفاتورة</Label>
                  <Textarea value={settings.invoice_footer || ""} onChange={(e) => updateField("invoice_footer", e.target.value)} rows={3} className="rounded-lg" />
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
