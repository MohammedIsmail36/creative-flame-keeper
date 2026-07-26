import bwipjs from "bwip-js/browser";

export interface LabelSize {
  widthMm: number;
  heightMm: number;
}

export interface LabelOptions {
  size: LabelSize;
  showName: boolean;
  showPrice: boolean;
  showCode: boolean;
  currency: string;
}

export interface LabelProduct {
  id: string;
  code: string;
  name: string;
  barcode_label?: string | null;
  barcode?: string | null;
  barcode_price?: number | null;
  selling_price?: number | null;
  model_number?: string | null;
}

export const PRESET_SIZES: Record<string, LabelSize> = {
  "40x30": { widthMm: 40, heightMm: 30 },
  "50x30": { widthMm: 50, heightMm: 30 },
  "50x25": { widthMm: 50, heightMm: 25 },
  "58x40": { widthMm: 58, heightMm: 40 },
  "80x50": { widthMm: 80, heightMm: 50 },
};

export const DEFAULT_SIZE_KEY = "40x30";

/**
 * Generate a scannable barcode as inline SVG.
 * Prefers UPC-A (11/12 digits) then EAN-13 (12/13 digits) then Code128.
 * Uses bwip-js which draws the standard guard-digit layout under the bars.
 */
function generateBarcodeSvg(value: string): string {
  const cleaned = (value || "").trim();
  if (!cleaned) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><text x="50" y="20" text-anchor="middle" font-size="8" fill="#c0392b">no barcode</text></svg>`;
  }
  const digits = cleaned.replace(/\D/g, "");

  const render = (bcid: string, text: string) =>
    bwipjs.toSVG({
      bcid,
      text,
      scale: 3,
      height: 18,
      includetext: true,
      textxalign: bcid === "code128" ? "center" : undefined,
      textfont: "OCR-B",
      textsize: 11,
      textyoffset: 2,
      guardwhitespace: bcid === "upca" || bcid === "ean13",
      backgroundcolor: "FFFFFF",
      paddingwidth: 0,
      paddingheight: 0,
    } as any);

  try {
    if (digits.length === 11 || digits.length === 12) {
      try { return render("upca", digits); } catch { /* fall through */ }
    }
    if (digits.length === 12 || digits.length === 13) {
      try { return render("ean13", digits); } catch { /* fall through */ }
    }
    return render("code128", cleaned);
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><text x="50" y="20" text-anchor="middle" font-size="8" fill="#c0392b">invalid</text></svg>`;
  }
}

function displayName(p: LabelProduct): string {
  return (p.barcode_label && p.barcode_label.trim()) || p.name;
}

function displayPrice(p: LabelProduct): number {
  return p.barcode_price != null ? Number(p.barcode_price) : Number(p.selling_price || 0);
}

function formatPrice(n: number): string {
  return Number(n || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render a single label — layout inspired by the reference template:
 *   [ title (single line, ellipsis) ]
 *   [    barcode (flex, centered)  ]
 *   [ code (LTR)     price + curr  ]
 */
export function renderLabelHtml(p: LabelProduct, opts: LabelOptions): string {
  const { widthMm, heightMm } = opts.size;
  const name = displayName(p);
  const price = displayPrice(p);
  const barcodeValue = (p.barcode && p.barcode.trim()) || p.code || "";
  const svg = generateBarcodeSvg(barcodeValue);

  // Font sizes proportional to label height (mm), matching the reference template
  const titleFs = Math.max(2.2, heightMm * 0.11);      // ~3.2mm on 30mm label
  const codeFs = Math.max(1.8, heightMm * 0.08);       // ~2.4mm
  const priceFs = Math.max(2.6, heightMm * 0.12);      // ~3.6mm
  const currencyFs = Math.max(1.5, heightMm * 0.067);  // ~2mm

  return `
    <div class="lbl" style="--w:${widthMm}mm;--h:${heightMm}mm;">
      ${opts.showName
        ? `<div class="lbl-title" style="font-size:${titleFs}mm;">${escapeHtml(name)}</div>`
        : ""}
      <div class="lbl-barcode">${svg}</div>
      <div class="lbl-bottom">
        <div class="lbl-code" style="font-size:${codeFs}mm;">${opts.showCode ? escapeHtml(p.code || "") : ""}</div>
        ${opts.showPrice
          ? `<div class="lbl-price">
               <span class="lbl-value" style="font-size:${priceFs}mm;">${formatPrice(price)}</span>
               <span class="lbl-currency" style="font-size:${currencyFs}mm;">${escapeHtml(opts.currency)}</span>
             </div>`
          : `<div></div>`}
      </div>
    </div>
  `;
}

/**
 * Full printable document — each label = one page sized exactly to the roll.
 */
export function buildPrintHtml(
  items: Array<{ product: LabelProduct; copies: number }>,
  opts: LabelOptions,
): string {
  const { widthMm, heightMm } = opts.size;
  const labels: string[] = [];
  for (const it of items) {
    const n = Math.max(1, Math.floor(it.copies));
    for (let i = 0; i < n; i++) labels.push(renderLabelHtml(it.product, opts));
  }

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>طباعة الباركود</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap" rel="stylesheet" />
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { background: #fff; font-family: 'Tajawal', system-ui, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl {
    width: var(--w);
    height: var(--h);
    background: #fff;
    padding: 1.6mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    page-break-after: always;
    page-break-inside: avoid;
  }
  .lbl:last-child { page-break-after: auto; }
  .lbl-title {
    text-align: center;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-bottom: 1mm;
    flex-shrink: 0;
    direction: rtl;
  }
  .lbl-barcode {
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    min-height: 0;
  }
  .lbl-barcode svg {
    width: 92%;
    height: 100%;
    max-height: 100%;
    display: block;
  }
  .lbl-bottom {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-top: 0.8mm;
    flex-shrink: 0;
  }
  .lbl-code {
    direction: ltr;
    color: #000;
    font-weight: 500;
  }
  .lbl-price {
    display: flex;
    align-items: baseline;
    gap: 0.6mm;
    line-height: 1;
  }
  .lbl-value {
    direction: ltr;
    font-weight: 800;
  }
  .lbl-currency {
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    font-weight: 700;
    letter-spacing: 0.2mm;
  }
  @media screen {
    body { background: #d8d8d8; padding: 20px; display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; }
    .lbl { box-shadow: 0 0 6px rgba(0,0,0,0.25); }
  }
</style>
</head>
<body>
${labels.join("\n")}
<script>
  window.addEventListener('load', function () {
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(function () { window.print(); }, 200); });
    } else {
      setTimeout(function () { window.print(); }, 500);
    }
  });
</script>
</body>
</html>`;
}

export function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "width=700,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
