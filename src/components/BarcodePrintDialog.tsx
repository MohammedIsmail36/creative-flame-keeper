import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer, Ruler, Type as TypeIcon, Hash } from "lucide-react";
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

/** يمنع تجاوز الحدود المسموح بها للمقاس المخصص (مم). */
function clampSize(w: number, h: number): LabelSize {
  return {
    widthMm: Math.max(15, Math.min(200, Number(w) || 40)),
    heightMm: Math.max(10, Math.min(200, Number(h) || 30)),
  };
}

/** Hook بسيط لتأجيل تحديث قيمة لحين توقف المستخدم عن الكتابة. */
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

export function BarcodePrintDialog({ open, onOpenChange, products }: Props) {
  const { settings } = useSettings();

  const [sizeKey, setSizeKey] = useState<string>(DEFAULT_SIZE_KEY);
  const [customW, setCustomW] = useState<number>(40);
  const [customH, setCustomH] = useState<number>(30);

  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showCode, setShowCode] = useState(true);

  // نسخ افتراضية لكل المنتجات + خريطة تجاوزات لكل منتج على حدة
  const [defaultCopies, setDefaultCopies] = useState<number>(1);
  const [copiesByProduct, setCopiesByProduct] = useState<Record<string, number>>({});

  // تأجيل تحديث المقاس المخصص لتفادي إعادة الحساب مع كل ضغطة كيبورد
  const debouncedCustomW = useDebouncedValue(customW, 250);
  const debouncedCustomH = useDebouncedValue(customH, 250);

  // إعادة تعيين التجاوزات عند تغيير قائمة المنتجات (تفتح الدialog من جديد لمجموعة مختلفة)
  useEffect(() => {
    setCopiesByProduct({});
  }, [products]);

  const size: LabelSize = useMemo(() => {
    if (sizeKey === "custom") {
      return clampSize(debouncedCustomW, debouncedCustomH);
    }
    return PRESET_SIZES[sizeKey] || PRESET_SIZES[DEFAULT_SIZE_KEY];
  }, [sizeKey, debouncedCustomW, debouncedCustomH]);

  const currency = (settings as any)?.default_currency || "EGP";
  const opts = { size, showName, showPrice, showCode, currency };

  const previewProduct = products[0];
  const previewHtml = useMemo(() => {
    if (!previewProduct) return "";
    return renderLabelHtml(previewProduct, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewProduct, sizeKey, debouncedCustomW, debouncedCustomH, showName, showPrice, showCode, currency]);

  const getCopiesFor = (p: LabelProduct, index: number) => {
    const key = (p as any).id ?? String(index);
    return copiesByProduct[key] ?? defaultCopies;
  };

  const setCopiesFor = (p: LabelProduct, index: number, value: number) => {
    const key = (p as any).id ?? String(index);
    setCopiesByProduct((prev) => ({ ...prev, [key]: Math.max(1, value || 1) }));
  };

  const applyDefaultToAll = (value: number) => {
    setDefaultCopies(value);
    setCopiesByProduct({});
  };

  const handlePrint = () => {
    const items = products.map((p, i) => ({ product: p, copies: getCopiesFor(p, i) }));
    const html = buildPrintHtml(items, opts);
    openPrintWindow(html);
  };

  const totalLabels = useMemo(
    () => products.reduce((sum, p, i) => sum + Math.max(1, getCopiesFor(p, i)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [products, copiesByProduct, defaultCopies],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            طباعة ملصقات الباركود
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* الإعدادات */}
          <div className="space-y-4">
            <Tabs defaultValue="size" dir="rtl">
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="size" className="gap-1">
                  <Ruler className="h-4 w-4" /> المقاس
                </TabsTrigger>
                <TabsTrigger value="content" className="gap-1">
                  <TypeIcon className="h-4 w-4" /> المحتوى
                </TabsTrigger>
                <TabsTrigger value="copies" className="gap-1">
                  <Hash className="h-4 w-4" /> النسخ
                </TabsTrigger>
              </TabsList>

              {/* تبويب المقاس */}
              <TabsContent value="size" className="space-y-3 pt-3">
                <div className="space-y-2">
                  <Label>مقاس الملصق</Label>
                  <Select value={sizeKey} onValueChange={setSizeKey}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="40x30">40 × 30 مم (رول)</SelectItem>
                      <SelectItem value="50x30">50 × 30 مم (رول)</SelectItem>
                      <SelectItem value="50x25">50 × 25 مم (رول)</SelectItem>
                      <SelectItem value="58x40">58 × 40 مم (رول)</SelectItem>
                      <SelectItem value="80x50">80 × 50 مم (رول)</SelectItem>
                      <SelectItem value="custom">مقاس مخصص...</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {sizeKey === "custom" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">العرض (مم)</Label>
                      <Input
                        type="number"
                        min={15}
                        max={200}
                        value={customW}
                        onChange={(e) => setCustomW(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">الارتفاع (مم)</Label>
                      <Input
                        type="number"
                        min={10}
                        max={200}
                        value={customH}
                        onChange={(e) => setCustomH(Number(e.target.value))}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              {/* تبويب المحتوى */}
              <TabsContent value="content" className="pt-3">
                <div className="flex flex-col gap-2 rounded-md border p-3">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={showName} onCheckedChange={(v) => setShowName(!!v)} />
                    إظهار الاسم
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={showPrice} onCheckedChange={(v) => setShowPrice(!!v)} />
                    إظهار السعر
                  </label>
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={showCode} onCheckedChange={(v) => setShowCode(!!v)} />
                    إظهار الكود
                  </label>
                </div>
              </TabsContent>

              {/* تبويب النسخ لكل منتج */}
              <TabsContent value="copies" className="space-y-2 pt-3">
                <div className="flex items-center gap-2">
                  <Label className="text-xs whitespace-nowrap">نسخ افتراضية للكل</Label>
                  <Input
                    type="number"
                    min={1}
                    max={999}
                    value={defaultCopies}
                    onChange={(e) => applyDefaultToAll(Number(e.target.value))}
                    className="h-8 w-24"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {products.length === 0 && <div className="p-3 text-xs text-muted-foreground">لا توجد منتجات</div>}
                  {products.map((p, i) => (
                    <div key={(p as any).id ?? i} className="flex items-center justify-between gap-2 p-2 text-sm">
                      <span className="truncate">{(p as any).name ?? `منتج ${i + 1}`}</span>
                      <Input
                        type="number"
                        min={1}
                        max={999}
                        value={getCopiesFor(p, i)}
                        onChange={(e) => setCopiesFor(p, i, Number(e.target.value))}
                        className="h-8 w-20 shrink-0"
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <div>
                عدد المنتجات: <span className="font-bold text-foreground">{products.length}</span>
              </div>
              <div>
                إجمالي الملصقات: <span className="font-bold text-foreground">{totalLabels}</span>
              </div>
              <div>
                المقاس:{" "}
                <span className="font-bold text-foreground">
                  {size.widthMm} × {size.heightMm} مم
                </span>
              </div>
            </div>
          </div>

          {/* المعاينة */}
          <div className="space-y-2">
            <Label>معاينة</Label>
            <div className="rounded-lg border bg-slate-100 dark:bg-slate-900 p-4 flex items-center justify-center min-h-[240px]">
              {previewProduct ? (
                <LabelPreviewFrame html={previewHtml} size={size} />
              ) : (
                <div className="text-xs text-muted-foreground">لا توجد منتجات للطباعة</div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground text-center">
              معاينة بالحجم الطبيعي: {size.widthMm}×{size.heightMm} مم.
            </p>
          </div>
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
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

/**
 * يعرض HTML الملصق داخل iframe معزول بدل dangerouslySetInnerHTML،
 * لمنع تسرب أنماط/سكريبتات الملصق إلى باقي الصفحة، ولضمان تطابق
 * المعاينة تماماً مع ما سيُطبع فعلياً.
 */
function LabelPreviewFrame({ html, size }: { html: string; size: LabelSize }) {
  const ref = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const iframe = ref.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
  }, [html]);

  // نحول المقاس من مم إلى بكسل تقريبياً لعرض واقعي (96dpi، 1mm ≈ 3.78px)
  const pxWidth = Math.round(size.widthMm * 3.78);
  const pxHeight = Math.round(size.heightMm * 3.78);

  return (
    <iframe
      ref={ref}
      title="معاينة الملصق"
      className="border-0 bg-white shadow-md rounded-sm"
      style={{ width: pxWidth, height: pxHeight }}
      sandbox=""
    />
  );
}
