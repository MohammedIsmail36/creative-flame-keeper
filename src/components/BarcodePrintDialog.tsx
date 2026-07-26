import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Printer, Settings, Eye, Info } from "lucide-react";
import {
  PRESET_SIZES,
  DEFAULT_SIZE_KEY,
  buildPrintHtml,
  openPrintWindow,
  renderLabelHtml,
  type LabelProduct,
  type LabelSize,
} from "@/lib/barcode-label";
import { useSettings } from "@/contexts/SettingsContext";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: LabelProduct[];
}

export function BarcodePrintDialog({ open, onOpenChange, products }: Props) {
  const { settings } = useSettings();
  const [sizeKey, setSizeKey] = useState<string>(DEFAULT_SIZE_KEY);
  const [customW, setCustomW] = useState<number>(40);
  const [customH, setCustomH] = useState<number>(30);
  const [showName, setShowName] = useState<boolean>(true);
  const [showPrice, setShowPrice] = useState<boolean>(true);
  const [showCode, setShowCode] = useState<boolean>(true);
  const [copies, setCopies] = useState<number>(1);

  // حساب مقاس الملصق الحالي
  const size: LabelSize = useMemo(() => {
    if (sizeKey === "custom") {
      return {
        widthMm: Math.max(15, Math.min(200, Number(customW) || 40)),
        heightMm: Math.max(10, Math.min(200, Number(customH) || 30)),
      };
    }
    return PRESET_SIZES[sizeKey] || PRESET_SIZES[DEFAULT_SIZE_KEY];
  }, [sizeKey, customW, customH]);

  const currency = settings?.default_currency || "EGP";
  const opts = useMemo(() => ({ size, showName, showPrice, showCode, currency }), [size, showName, showPrice, showCode, currency]);

  // توليد كود HTML للمعاينة الحية للمنتج الأول
  const previewProduct = products[0];
  const previewHtml = useMemo(() => {
    if (!previewProduct) return "";
    return renderLabelHtml(previewProduct, opts);
  }, [previewProduct, opts]);

  const handlePrint = () => {
    if (products.length === 0) return;
    const items = products.map((p) => ({ product: p, copies }));
    const html = buildPrintHtml(items, opts);
    openPrintWindow(html);
  };

  const totalLabels = products.length * Math.max(1, copies);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl gap-0 p-0 overflow-hidden font-sans border-none shadow-2xl rounded-xl">
        {/* الهيدر المطور */}
        <DialogHeader className="p-6 bg-gradient-to-r from-slate-900 to-slate-800 text-white dark:from-slate-950 dark:to-slate-900">
          <DialogTitle className="flex items-center gap-3 text-xl font-bold tracking-wide">
            <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm">
              <Printer className="h-5 w-5 text-emerald-400" />
            </div>
            طباعة ملصقات الباركود
          </DialogTitle>
        </DialogHeader>

        {/* جسم النافذة المقسم */}
        <div className="grid grid-cols-1 md:grid-cols-12 divide-y md:divide-y-0 md:divide-x md:divide-x-reverse bg-background">
          
          {/* قسم الإعدادات (7 أجزاء من 12 لتوفير مساحة مريحة للمدخلات) */}
          <div className="md:col-span-7 p-6 space-y-5 max-h-[70vh] overflow-y-auto">
            <div className="flex items-center gap-2 pb-2 border-b text-sm font-semibold text-muted-foreground">
              <Settings className="w-4 h-4" />
              <span>تخصيص أبعاد وعناصر الملصق</span>
            </div>

            {/* اختيار المقاس */}
            <div className="space-y-2">
              <Label className="font-medium">مقاس الملصق (العرض × الارتفاع)</Label>
              <Select value={sizeKey} onValueChange={setSizeKey}>
                <SelectTrigger className="h-10 transition-all focus:ring-2 focus:ring-emerald-500">
                  <SelectValue placeholder="اختر مقاس الملصق" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="40x30">40 × 30 مم (رول افتراضي)</SelectItem>
                  <SelectItem value="50x30">50 × 30 مم (رول)</SelectItem>
                  <SelectItem value="50x25">50 × 25 مم (رول)</SelectItem>
                  <SelectItem value="58x40">58 × 40 مم (رول)</SelectItem>
                  <SelectItem value="80x50">80 × 50 مم (رول)</SelectItem>
                  <SelectItem value="custom" className="text-emerald-600 font-medium">مقاس مخصص…</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* الحقول المخصصة مع تأثير ظهور سلس */}
            {sizeKey === "custom" && (
              <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border border-dashed animate-in fade-in slide-in-from-top-1 duration-200">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">العرض (مم)</Label>
                  <Input
                    type="number"
                    min={15}
                    max={200}
                    value={customW}
                    className="h-9 focus-visible:ring-emerald-500"
                    onChange={(e) => setCustomW(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">الارتفاع (مم)</Label>
                  <Input
                    type="number"
                    min={10}
                    max={200}
                    value={customH}
                    className="h-9 focus-visible:ring-emerald-500"
                    onChange={(e) => setCustomH(Number(e.target.value))}
                  />
                </div>
              </div>
            )}

            {/* عدد النسخ */}
            <div className="space-y-2">
              <Label className="font-medium">عدد النسخ لكل منتج</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={copies}
                className="h-10 focus-visible:ring-emerald-500"
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            {/* التحكم في العناصر المرئية */}
            <div className="space-y-2">
              <Label className="font-medium">عناصر الملصق المرئية</Label>
              <div className="grid grid-cols-3 gap-2 rounded-xl border bg-muted/20 p-3">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer p-2 hover:bg-background rounded-lg transition-colors select-none">
                  <Checkbox checked={showName} onCheckedChange={(v) => setShowName(!!v)} className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500" />
                  الاسم
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer p-2 hover:bg-background rounded-lg transition-colors select-none">
                  <Checkbox checked={showPrice} onCheckedChange={(v) => setShowPrice(!!v)} className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500" />
                  السعر
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer p-2 hover:bg-background rounded-lg transition-colors select-none">
                  <Checkbox checked={showCode} onCheckedChange={(v) => setShowCode(!!v)} className="data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500" />
                  الكود
                </label>
              </div>
            </div>

            {/* بطاقة ملخص البيانات */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-900 border p-4 text-xs text-muted-foreground grid grid-cols-3 gap-2 shadow-inner">
              <div className="space-y-0.5 text-center border-l last:border-0">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">المنتجات المختارة</span>
                <span className="text-base font-bold text-foreground">{products.length}</span>
              </div>
              <div className="space-y-0.5 text-center border-l last:border-0">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">إجمالي الباركودات</span>
                <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">{totalLabels}</span>
              </div>
              <div className="space-y-0.5 text-center last:border-0">
                <span className="block text-[10px] uppercase tracking-wider text-muted-foreground/70">أبعاد الطباعة</span>
                <span className="text-sm font-bold text-foreground">{size.widthMm}×{size.heightMm} مم</span>
              </div>
            </div>
          </div>

          {/* قسم المعاينة الحية المستوحى من القالب الجديد (5 أجزاء من 12) */}
          <div className="md:col-span-5 p-6 bg-slate-50 dark:bg-slate-900/40 flex flex-col justify-between">
            <div className="space-y-3 h-full flex flex-col">
              <Label className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                <Eye className="w-4 h-4" />
                <span>شاشة المعاينة الحية</span>
              </Label>
              
              <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-200/50 dark:bg-slate-950 p-6 flex items-center justify-center min-h-[260px] relative overflow-hidden shadow-inner group">
                {previewProduct ? (
                  <div
                    className="bg-white shadow-md rounded-sm overflow-hidden"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                  />
                ) : (
                  <div className="text-xs text-muted-foreground">لا توجد منتجات للطباعة</div>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground text-center flex items-center justify-center gap-1">
                <Info className="w-3 h-3" />
                معاينة بالحجم الطبيعي: {size.widthMm}×{size.heightMm} مم
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2 p-4 border-t bg-background">
          <Button onClick={handlePrint} className="gap-2" disabled={products.length === 0}>
            <Printer className="h-4 w-4" />
            طباعة {totalLabels} ملصق
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

