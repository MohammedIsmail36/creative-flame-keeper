import { useEffect, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
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
import { AccountCombobox } from "@/components/AccountCombobox";
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
  ShieldCheck,
  Percent,
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

const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
];
const MAX_IMAGE_SIZE = 2 * 1024 * 1024; // 2MB

function SectionCard({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
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

interface AccountOption {
  id: string;
  code: string;
  name: string;
  account_type: string;
}

export default function SettingsPage() {
  const { settings: globalSettings, refetch } = useSettings();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);

  useEffect(() => {
    fetchSettings();
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    const { data } = await supabase
      .from("accounts")
      .select("id, code, name, account_type")
      .eq("is_active", true)
      .eq("is_parent", false)
      .order("code");
    setAccounts((data as AccountOption[]) || []);
  };

  // حسابات الضريبة المرشحة (الأصول للمشتريات والخصوم للمبيعات)
  const purchaseTaxAccounts = accounts.filter(
    (a) => a.account_type === "asset",
  );
  const salesTaxAccounts = accounts.filter(
    (a) => a.account_type === "liability",
  );

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
    // التحقق من إعدادات الضريبة عند التفعيل
    if (settings.enable_tax) {
      if (!settings.tax_rate || settings.tax_rate <= 0) {
        toast.error("نسبة الضريبة يجب أن تكون أكبر من صفر عند تفعيل الضريبة");
        return;
      }
      if (!settings.sales_tax_account_id) {
        toast.error("يجب اختيار حساب ضريبة المبيعات");
        return;
      }
      if (!settings.purchase_tax_account_id) {
        toast.error("يجب اختيار حساب ضريبة المشتريات");
        return;
      }
    }
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

  const updateField = <K extends keyof CompanySettings>(
    field: K,
    value: CompanySettings[K],
  ) => {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !settings) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast.error("يُسمح فقط بصور من نوع PNG, JPG, GIF, WEBP");
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
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
      <PageHeader
        icon={Settings2}
        title="إعدادات الشركة"
        description="إدارة معلومات المنشأة وتفاصيل الاتصال الرسمية الخاصة بك"
        actions={
          <Button
            onClick={handleSave}
            disabled={saving}
            className="gap-2 rounded-xl px-6 shadow-lg shadow-primary/20"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            حفظ جميع التغييرات
          </Button>
        }
      />

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
            value="tax"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none bg-transparent px-0 pb-4 font-bold text-sm"
          >
            الضريبة
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
                      <img
                        src={settings.logo_url}
                        alt="شعار الشركة"
                        className="w-full h-full object-contain p-4"
                      />
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-primary/20 text-primary bg-primary/10 hover:bg-primary/20 rounded-lg font-bold"
                    disabled={uploading}
                    asChild
                  >
                    <label className="cursor-pointer">
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      {uploading ? "جاري الرفع..." : "رفع شعار جديد"}
                      <input
                        type="file"
                        accept=".png,.jpg,.jpeg,.gif,.webp"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </label>
                  </Button>
                  {settings.logo_url && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={removeLogo}
                      className="text-muted-foreground hover:text-destructive"
                    >
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
                <Label className="text-sm font-bold">
                  اسم المنشأة (بالعربية)
                </Label>
                <Input
                  value={settings.company_name}
                  onChange={(e) => updateField("company_name", e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">
                  اسم المنشأة (بالإنجليزية)
                </Label>
                <Input
                  value={settings.company_name_en || ""}
                  onChange={(e) =>
                    updateField("company_name_en", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">نشاط العمل</Label>
                <Input
                  value={settings.business_activity || ""}
                  onChange={(e) =>
                    updateField("business_activity", e.target.value)
                  }
                  placeholder="مثال: تجارة مواد البناء والتوريدات"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">الرقم الضريبي (VAT)</Label>
                <Input
                  value={settings.tax_number || ""}
                  onChange={(e) => updateField("tax_number", e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">رقم السجل التجاري</Label>
                <Input
                  value={settings.commercial_register || ""}
                  onChange={(e) =>
                    updateField("commercial_register", e.target.value)
                  }
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">الموقع الإلكتروني</Label>
                <Input
                  value={settings.website || ""}
                  onChange={(e) => updateField("website", e.target.value)}
                  dir="ltr"
                  type="url"
                  className="rounded-lg"
                />
              </div>
            </div>
          </SectionCard>

          {/* Contact Info */}
          <SectionCard icon={Phone} title="معلومات الاتصال والعنوان">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">رقم الهاتف</Label>
                <Input
                  value={settings.phone || ""}
                  onChange={(e) => updateField("phone", e.target.value)}
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">
                  البريد الإلكتروني الرسمي
                </Label>
                <Input
                  value={settings.email || ""}
                  onChange={(e) => updateField("email", e.target.value)}
                  dir="ltr"
                  type="email"
                  className="rounded-lg"
                />
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label className="text-sm font-bold">
                  العنوان الوطني / التفصيلي
                </Label>
                <Textarea
                  value={settings.address || ""}
                  onChange={(e) => updateField("address", e.target.value)}
                  rows={3}
                  className="rounded-lg"
                />
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
                <Select
                  value={settings.default_currency}
                  onValueChange={(v) => updateField("default_currency", v)}
                >
                  <SelectTrigger className="rounded-lg">
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
                <Label className="text-sm font-bold">بداية السنة المالية</Label>
                <Select
                  value={settings.fiscal_year_start}
                  onValueChange={(v) => updateField("fiscal_year_start", v)}
                >
                  <SelectTrigger className="rounded-lg">
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
              {/* تم نقل نسبة الضريبة الافتراضية إلى تبويب "الضريبة" */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold">
                    مدة الاسترجاع (أيام)
                  </Label>
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="enable_return_days_limit"
                      className="text-xs text-muted-foreground"
                    >
                      تفعيل التحقق
                    </Label>
                    <Switch
                      id="enable_return_days_limit"
                      checked={settings.enable_return_days_limit ?? true}
                      onCheckedChange={(v) =>
                        updateField("enable_return_days_limit" as any, v)
                      }
                    />
                  </div>
                </div>
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={settings.return_days_limit || 30}
                  onChange={(e) =>
                    updateField("return_days_limit", Number(e.target.value))
                  }
                  className="rounded-lg"
                  disabled={!(settings.enable_return_days_limit ?? true)}
                />
                {settings.enable_return_days_limit === false ? (
                  <p className="text-xs text-amber-600">
                    ⚠ التحقق من فترة الاسترجاع معطل — يمكن إرجاع أي صنف بدون
                    قيود زمنية
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    الحد الأقصى لعدد الأيام المسموح بها لإرجاع المبيعات
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">هدف المبيعات الشهري</Label>
                <Input
                  type="number"
                  min={0}
                  value={(settings as any).monthly_sales_target || 0}
                  onChange={(e) =>
                    updateField(
                      "monthly_sales_target" as any,
                      Number(e.target.value),
                    )
                  }
                  className="rounded-lg"
                />
                <p className="text-xs text-muted-foreground">
                  المبلغ المستهدف تحقيقه من المبيعات شهرياً — يظهر في لوحة
                  التحكم
                </p>
              </div>
            </div>

            <hr className="border-border my-2" />

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-bold">
                  تفعيل إقفال السنة المالية
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  يتيح إنشاء قيد إقفال تلقائي لتصفير حسابات الإيرادات والمصروفات
                  وترحيل صافي الربح/الخسارة إلى حساب الأرباح المحتجزة (3102)
                </p>
              </div>
              <Switch
                checked={settings.enable_fiscal_year_closing}
                onCheckedChange={(v) =>
                  updateField("enable_fiscal_year_closing", v)
                }
              />
            </div>
          </SectionCard>

          {/* ── Data Protection ── */}
          <SectionCard icon={ShieldCheck} title="حماية البيانات">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">
                    منع البيع بأكثر من المخزون
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    عند التفعيل، لن يتم ترحيل فاتورة بيع إذا كانت الكمية
                    المطلوبة أكبر من الكمية المتاحة في المخزون
                  </p>
                </div>
                <Switch
                  checked={settings.stock_enforcement_enabled ?? true}
                  onCheckedChange={(v) =>
                    updateField("stock_enforcement_enabled", v)
                  }
                />
              </div>

              <hr className="border-border" />

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-bold">
                    قفل الفترة المحاسبية حتى تاريخ
                  </Label>
                  {settings.locked_until_date && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                      onClick={() => updateField("locked_until_date", null)}
                    >
                      <X className="h-3 w-3 ml-1" />
                      إلغاء القفل
                    </Button>
                  )}
                </div>
                <Input
                  type="date"
                  value={settings.locked_until_date || ""}
                  onChange={(e) =>
                    updateField("locked_until_date", e.target.value || null)
                  }
                  className="rounded-lg max-w-xs"
                  dir="ltr"
                />
                <p className="text-xs text-muted-foreground">
                  عند تحديد تاريخ، لن يُسمح بإنشاء أو تعديل أي قيد محاسبي بتاريخ
                  يسبق هذا التاريخ أو يساويه
                </p>
              </div>
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── Invoices Tab ── */}
        <TabsContent value="invoices" className="space-y-6 mt-0">
          <SectionCard icon={Hash} title="بادئات الترقيم">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
              <div className="space-y-2">
                <Label className="text-sm font-bold">فواتير المبيعات</Label>
                <Input
                  value={settings.sales_invoice_prefix}
                  onChange={(e) =>
                    updateField("sales_invoice_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">فواتير المشتريات</Label>
                <Input
                  value={settings.purchase_invoice_prefix}
                  onChange={(e) =>
                    updateField("purchase_invoice_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدة الدفع (أيام)</Label>
                <Input
                  type="number"
                  min={0}
                  value={settings.payment_terms_days}
                  onChange={(e) =>
                    updateField("payment_terms_days", Number(e.target.value))
                  }
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مرتجعات المبيعات</Label>
                <Input
                  value={settings.sales_return_prefix}
                  onChange={(e) =>
                    updateField("sales_return_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مرتجعات المشتريات</Label>
                <Input
                  value={settings.purchase_return_prefix}
                  onChange={(e) =>
                    updateField("purchase_return_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">القيود المحاسبية</Label>
                <Input
                  value={settings.journal_entry_prefix || "JV-"}
                  onChange={(e) =>
                    updateField("journal_entry_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدفوعات العملاء</Label>
                <Input
                  value={settings.customer_payment_prefix}
                  onChange={(e) =>
                    updateField("customer_payment_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">مدفوعات الموردين</Label>
                <Input
                  value={settings.supplier_payment_prefix}
                  onChange={(e) =>
                    updateField("supplier_payment_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-bold">بادئة المنتجات</Label>
                <Input
                  value={settings.product_code_prefix || "PRD-"}
                  onChange={(e) =>
                    updateField("product_code_prefix", e.target.value)
                  }
                  dir="ltr"
                  className="rounded-lg"
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={Eye} title="خيارات العرض">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">
                    إظهار الضريبة في الفاتورة
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    عرض تفاصيل الضريبة في الفواتير المطبوعة
                  </p>
                </div>
                <Switch
                  checked={settings.show_tax_on_invoice}
                  onCheckedChange={(v) => updateField("show_tax_on_invoice", v)}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-bold">
                    إظهار الخصم في الفاتورة
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    عرض تفاصيل الخصم في الفواتير المطبوعة
                  </p>
                </div>
                <Switch
                  checked={settings.show_discount_on_invoice}
                  onCheckedChange={(v) =>
                    updateField("show_discount_on_invoice", v)
                  }
                />
              </div>

              <hr className="border-border" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                <div className="space-y-2">
                  <Label className="text-sm font-bold">
                    ملاحظات الفاتورة الافتراضية
                  </Label>
                  <Textarea
                    value={settings.invoice_notes || ""}
                    onChange={(e) =>
                      updateField("invoice_notes", e.target.value)
                    }
                    rows={3}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-bold">تذييل الفاتورة</Label>
                  <Textarea
                    value={settings.invoice_footer || ""}
                    onChange={(e) =>
                      updateField("invoice_footer", e.target.value)
                    }
                    rows={3}
                    className="rounded-lg"
                  />
                </div>
              </div>
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}
