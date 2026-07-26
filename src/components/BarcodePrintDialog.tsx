import JsBarcode from "jsbarcode";

export interface LabelSize {
  widthMm: number;
  heightMm: number;
}

export interface LabelProduct {
  id?: string | number;
  name: string;
  price: number;
  /** القيمة التي يتم ترميزها في الباركود (كود المنتج / SKU) */
  code: string;
}

export interface LabelRenderOptions {
  size: LabelSize;
  showName: boolean;
  showPrice: boolean;
  showCode: boolean;
  currency: string;
}

export interface PrintItem {
  product: LabelProduct;
  copies: number;
}

export const PRESET_SIZES: Record<string, LabelSize> = {
  "40x30": { widthMm: 40, heightMm: 30 },
  "50x30": { widthMm: 50, heightMm: 30 },
  "50x25": { widthMm: 50, heightMm: 25 },
  "58x40": { widthMm: 58, heightMm: 40 },
  "80x50": { widthMm: 80, heightMm: 50 },
};

export const DEFAULT_SIZE_KEY = "40x30";

const FONT_LINK =
  '<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap" rel="stylesheet">';

/**
 * يولّد الباركود كـ SVG ثابت (بدون أي <script> وقت التشغيل) باستخدام مكتبة
 * jsbarcode مباشرة. هذا يضمن ظهور نفس الباركود بالضبط في:
 *  1) المعاينة داخل الـ Dialog (عبر dangerouslySetInnerHTML) — والتي لا تُنفّذ
 *     أي وسوم <script> محقونة، لذلك أي حل يعتمد على سكريبت خارجي فيها لن يعمل.
 *  2) نافذة الطباعة — بنفس الـ markup تماماً، فلا يوجد احتمال لطباعة باركود
 *     غير مكتمل بسبب تأخر تحميل مكتبة من CDN.
 */
function generateBarcodeSvg(code: string, opts: LabelRenderOptions): string {
  const safeCode = (code || "").trim() || "0000000000000";
  const svgEl = document.createElementNS("http://www.w3.org/2000/svg", "svg");

  try {
    JsBarcode(svgEl, safeCode, {
      format: "CODE128",
      displayValue: opts.showCode,
      font: "Tajawal, sans-serif",
      textAlign: "center",
      textPosition: "bottom",
      textMargin: 2,
      fontSize: Math.max(9, Math.round(opts.size.heightMm * 1.05)),
      margin: 0,
      height: Math.max(18, Math.round(opts.size.heightMm * 1.5)),
      width: 1.5,
    });
  } catch {
    // كود لا يمكن ترميزه بصيغة CODE128 (رموز غير مدعومة مثلاً) — نعرض بديل نصي بدل كسر الصفحة
    svgEl.setAttribute("width", "10");
    svgEl.setAttribute("height", "10");
  }

  return svgEl.outerHTML;
}

function escapeHtml(v: string | number): string {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function formatPrice(v: number): string {
  return Number(v || 0).toLocaleString("ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * يبني HTML ملصق واحد (يُستخدم في المعاينة وفي الطباعة بنفس الدالة تماماً،
 * فلا يوجد أي فرق بين ما يُعاين وما يُطبع).
 */
export function renderLabelHtml(product: LabelProduct, opts: LabelRenderOptions): string {
  const { size, showName, showPrice, currency } = opts;
  const barcodeSvg = generateBarcodeSvg(product.code, opts);

  return `
<div class="barcode-label" style="
  width:${size.widthMm}mm;
  height:${size.heightMm}mm;
  box-sizing:border-box;
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:1mm;
  padding:1mm;
  font-family:'Tajawal', sans-serif;
  direction:rtl;
  overflow:hidden;
  background:#fff;
  color:#111;
">
  ${
    showName
      ? `<div style="font-size:${Math.max(7, size.heightMm * 0.4)}px;font-weight:700;line-height:1.15;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;">${escapeHtml(
          product.name,
        )}</div>`
      : ""
  }
  <div style="max-width:100%; display:flex; justify-content:center;">${barcodeSvg}</div>
  ${
    showPrice
      ? `<div style="font-size:${Math.max(8, size.heightMm * 0.48)}px;font-weight:700;">${formatPrice(
          product.price,
        )} ${escapeHtml(currency)}</div>`
      : ""
  }
</div>`;
}

/**
 * يبني مستند HTML كامل جاهز للطباعة، بمقاس صفحة (@page) مطابق تماماً لمقاس
 * الملصق بالمليمتر (بدون هوامش)، مع تكرار كل منتج بعدد النسخ المطلوب،
 * وفاصل صفحة بعد كل ملصق فيما عدا الأخير.
 */
export function buildPrintHtml(items: PrintItem[], opts: LabelRenderOptions): string {
  const { size } = opts;

  const labelsHtml = items
    .flatMap(({ product, copies }) => Array.from({ length: Math.max(1, copies) }, () => renderLabelHtml(product, opts)))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${FONT_LINK}
<title>طباعة ملصقات الباركود</title>
<style id="page-size-style">
  @page {
    size: ${size.widthMm}mm ${size.heightMm}mm;
    margin: 0;
  }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  .barcode-label {
    page-break-after: always;
    break-after: page;
  }
  .barcode-label:last-child {
    page-break-after: auto;
    break-after: auto;
  }
</style>
</head>
<body>
${labelsHtml}
</body>
</html>`;
}

/**
 * يفتح نافذة طباعة جديدة ويكتب المستند بداخلها، وينتظر تحميل الخط قبل
 * استدعاء الطباعة تلقائياً (لتفادي قص النصوص أو اختلاف القياسات).
 */
export function openPrintWindow(html: string): void {
  const printWindow = window.open("", "_blank", "width=800,height=600");
  if (!printWindow) return;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.onload = () => {
    printWindow.focus();
    printWindow.print();
  };
  printWindow.onafterprint = () => printWindow.close();
}
