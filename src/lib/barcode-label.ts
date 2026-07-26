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
  "30x40": { widthMm: 40, heightMm: 30 },
  "40x30": { widthMm: 30, heightMm: 40 },
  "50x30": { widthMm: 30, heightMm: 50 },
  "50x40": { widthMm: 40, heightMm: 50 },
  "60x40": { widthMm: 40, heightMm: 60 },
  "100x50": { widthMm: 50, heightMm: 100 },
};

export const DEFAULT_SIZE_KEY = "30x40";

/**
 * Generate an EAN-13 barcode as an inline SVG string.
 * Falls back to Code128 if the value is not a valid 12/13-digit EAN.
 */
function generateBarcodeSvg(value: string, widthMm: number, heightMm: number): string {
  const cleaned = (value || "").trim();
  const isEan13 = /^\d{12,13}$/.test(cleaned);

  try {
    const svg = bwipjs.toSVG({
      bcid: isEan13 ? "ean13" : "code128",
      text: cleaned || "0000000000000",
      scale: 2,
      height: heightMm,
      width: widthMm,
      includetext: true,
      textxalign: "center",
      guardwhitespace: isEan13,
      textsize: 10,
      textyoffset: 1,
      backgroundcolor: "FFFFFF",
    });
    return svg;
  } catch {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 30"><text x="50" y="20" text-anchor="middle" font-size="10" fill="#999">no barcode</text></svg>`;
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

/**
 * Render a single label as an HTML block (fixed mm dimensions).
 * Uses CSS Grid layout so it scales cleanly across sizes.
 */
export function renderLabelHtml(p: LabelProduct, opts: LabelOptions): string {
  const { widthMm, heightMm } = opts.size;
  const name = displayName(p);
  const price = displayPrice(p);
  const barcodeValue = p.barcode || "";
  // Barcode occupies ~45% of height; give SVG a fraction of the label
  const barcodeH = Math.max(6, heightMm * 0.45);
  const barcodeW = widthMm - 4;
  const svg = barcodeValue
    ? generateBarcodeSvg(barcodeValue, barcodeW, barcodeH)
    : "";

  // Font sizes tuned for common roll sizes
  const nameFs = Math.max(2.2, Math.min(widthMm, heightMm) * 0.13);
  const priceFs = Math.max(2.5, Math.min(widthMm, heightMm) * 0.14);
  const smallFs = Math.max(1.8, Math.min(widthMm, heightMm) * 0.07);

  return `
    <div class="lbl" style="width:${widthMm}mm;height:${heightMm}mm;">
      <div class="lbl-inner">
        ${
          opts.showName
            ? `<div class="lbl-name" style="font-size:${nameFs}mm;">${escapeHtml(name)}</div>`
            : ""
        }
        <div class="lbl-barcode" style="height:${barcodeH}mm;">${svg}</div>
        <div class="lbl-footer" style="font-size:${smallFs}mm;">
          <span class="lbl-code">${opts.showCode ? escapeHtml(p.code || "") : ""}</span>
          ${
            opts.showPrice
              ? `<span class="lbl-price" style="font-size:${priceFs}mm;">
                   <span class="lbl-price-num">${formatPrice(price)}</span>
                   <span class="lbl-currency">${escapeHtml(opts.currency)}</span>
                 </span>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a full printable HTML document containing all labels.
 * Each label is a standalone page sized exactly to the roll dimensions.
 */
export function buildPrintHtml(
  items: Array<{ product: LabelProduct; copies: number }>,
  opts: LabelOptions,
): string {
  const { widthMm, heightMm } = opts.size;
  const labels: string[] = [];
  for (const it of items) {
    const n = Math.max(1, Math.floor(it.copies));
    for (let i = 0; i < n; i++) {
      labels.push(renderLabelHtml(it.product, opts));
    }
  }

  return `<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8" />
<title>طباعة الباركود</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;700;800;900&display=swap" rel="stylesheet" />
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; }
  body { font-family: 'Cairo', system-ui, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .lbl {
    page-break-after: always;
    page-break-inside: avoid;
    overflow: hidden;
    background: #fff;
    display: block;
  }
  .lbl:last-child { page-break-after: auto; }
  .lbl-inner {
    width: 100%;
    height: 100%;
    padding: 1mm 2mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: stretch;
    gap: 0.5mm;
  }
  .lbl-name {
    font-weight: 900;
    text-align: center;
    line-height: 1.05;
    max-height: 30%;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    direction: rtl;
  }
  .lbl-barcode {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .lbl-barcode svg { width: 100%; height: 100%; display: block; }
  .lbl-footer {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1mm;
    font-family: 'Cairo', system-ui, sans-serif;
  }
  .lbl-code {
    font-weight: 700;
    letter-spacing: 0.02em;
    direction: ltr;
  }
  .lbl-price {
    font-weight: 900;
    display: inline-flex;
    align-items: baseline;
    gap: 0.8mm;
    direction: ltr;
    line-height: 1;
  }
  .lbl-price-num { font-weight: 900; }
  .lbl-currency {
    font-size: 0.45em;
    font-weight: 700;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    letter-spacing: 0.05em;
  }
  /* Screen-only preview polish */
  @media screen {
    body { padding: 12px; background: #f1f5f9; display: flex; flex-wrap: wrap; gap: 10px; }
    .lbl { border: 1px solid #e2e8f0; border-radius: 6px; }
  }
</style>
</head>
<body>
${labels.join("\n")}
<script>
  window.addEventListener('load', function () {
    // Wait for fonts to load before opening the print dialog
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(function () { window.print(); }, 150); });
    } else {
      setTimeout(function () { window.print(); }, 400);
    }
  });
</script>
</body>
</html>`;
}

export function openPrintWindow(html: string) {
  const win = window.open("", "_blank", "width=600,height=800");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
