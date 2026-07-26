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
import { Printer } from "lucide-react";
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
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [showCode, setShowCode] = useState(true);
  const [copies, setCopies] = useState<number>(1);

  const size: LabelSize = useMemo(() => {
    if (sizeKey === "custom") {
      return {
        widthMm: Math.max(15, Math.min(200, Number(customW) || 40)),
        heightMm: Math.max(10, Math.min(200, Number(customH) || 30)),
      };
    }
    return PRESET_SIZES[sizeKey] || PRESET_SIZES[DEFAULT_SIZE_KEY];
  }, [sizeKey, customW, customH]);

  const currency = (settings as any)?.default_currency || "EGP";

  const opts = { size, showName, showPrice, showCode, currency };

  const previewProduct = products[0];
  const previewHtml = useMemo(() => {
    if (!previewProduct) return "";
    return renderLabelHtml(previewProduct, opts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewProduct, sizeKey, customW, customH, showName, showPrice, showCode, currency]);

  const handlePrint = () => {
    const items = products.map((p) => ({ product: p, copies }));
    const html = buildPrintHtml(items, opts);
    openPrintWindow(html);
  };

  const totalLabels = products.length * Math.max(1, copies);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            طباعة ملصقات الباركود
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Settings */}
          <div className="space-y-4">
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
                  <SelectItem value="custom">مقاس مخصص…</SelectItem>
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

            <div className="space-y-2">
              <Label>عدد النسخ لكل منتج</Label>
              <Input
                type="number"
                min={1}
                max={999}
                value={copies}
                onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>

            <div className="space-y-2">
              <Label>عناصر الملصق</Label>
              <div className="flex flex-col gap-2 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={showName}
                    onCheckedChange={(v) => setShowName(!!v)}
                  />
                  إظهار الاسم
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={showPrice}
                    onCheckedChange={(v) => setShowPrice(!!v)}
                  />
                  إظهار السعر
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={showCode}
                    onCheckedChange={(v) => setShowCode(!!v)}
                  />
                  إظهار الكود
                </label>
              </div>
            </div>

            <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
              <div>عدد المنتجات: <span className="font-bold text-foreground">{products.length}</span></div>
              <div>إجمالي الملصقات: <span className="font-bold text-foreground">{totalLabels}</span></div>
              <div>المقاس: <span className="font-bold text-foreground">{size.widthMm} × {size.heightMm} مم</span></div>
            </div>
          </div>

          {/* Preview */}
          <div className="space-y-2">
            <Label>معاينة</Label>
            <div className="rounded-lg border bg-slate-100 dark:bg-slate-900 p-4 flex items-center justify-center min-h-[240px]">
              {previewProduct ? (
                <div
                  className="bg-white shadow-md rounded-sm overflow-hidden"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
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
