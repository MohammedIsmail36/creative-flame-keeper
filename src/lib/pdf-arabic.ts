import pdfMake from "pdfmake-rtl/build/pdfmake";
import "pdfmake-rtl/build/vfs_fonts";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

// ─── Modern Minimalist Palette (Odoo/Qoyod Inspired) ───
const C = {
  brand: "#714B67",       // Odoo purple-mauve
  brandDark: "#51364A",
  brandLight: "#8E6B82",
  navy: "#212529",
  charcoal: "#343A40",
  gray700: "#495057",
  gray600: "#6C757D",
  gray500: "#ADB5BD",
  gray300: "#DEE2E6",
  gray200: "#E9ECEF",
  gray100: "#F8F9FA",
  white: "#FFFFFF",
  green: "#28A745",
  greenBg: "#D4EDDA",
  red: "#DC3545",
  redBg: "#F8D7DA",
  orange: "#FD7E14",
  orangeBg: "#FFE8CC",
  blue: "#007BFF",
  blueBg: "#CCE5FF",
};

// ─── Formatting Helpers (All numbers/dates in English) ───
const fmtNum = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  if (!d) return "";
  const date = new Date(d);
  return date.toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const fmtDateFull = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

// ─── Shared Table Layouts ───

// Clean report table: header with brand bg, zebra rows, no vertical lines
const REPORT_TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0 || i === node.table.body.length) return 0;
    if (i === 1) return 1.5;
    return 0.4;
  },
  vLineWidth: () => 0,
  hLineColor: (i: number) => (i === 1 ? C.brand : C.gray300),
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
  fillColor: (i: number) => {
    if (i === 0) return C.brand;
    return i % 2 === 0 ? C.white : C.gray100;
  },
};

// Invoice items table: bordered, clean header
const INVOICE_TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0) return 1;
    if (i === 1) return 1.5;
    if (i === node.table.body.length) return 1;
    return 0.3;
  },
  vLineWidth: (i: number, node: any) =>
    i === 0 || i === node.table.widths.length ? 1 : 0.3,
  hLineColor: (i: number) => (i <= 1 ? C.brand : C.gray300),
  vLineColor: () => C.gray300,
  paddingLeft: () => 6,
  paddingRight: () => 6,
  paddingTop: () => 5,
  paddingBottom: () => 5,
  fillColor: (i: number) => {
    if (i === 0) return C.brand;
    return i % 2 === 0 ? C.white : C.gray100;
  },
};

// ═══════════════════════════════════════════
//  COMPANY HEADER — Clean Modern Style
// ═══════════════════════════════════════════

function buildHeader(settings: CompanySettings | null, pageWidth: number): Content[] {
  const s = settings;
  const parts: Content[] = [];

  // Thin brand accent line at very top
  parts.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: pageWidth, h: 3, color: C.brand }],
    margin: [0, 0, 0, 14],
  });

  // Company name centered, large
  parts.push({
    text: s?.company_name || "النظام المحاسبي",
    fontSize: 20,
    bold: true,
    color: C.navy,
    alignment: "center",
    margin: [0, 0, 0, 2],
  });

  if (s?.company_name_en) {
    parts.push({
      text: s.company_name_en,
      fontSize: 10,
      color: C.gray600,
      alignment: "center",
      margin: [0, 0, 0, 2],
    });
  }

  if (s?.business_activity) {
    parts.push({
      text: s.business_activity,
      fontSize: 8,
      color: C.gray500,
      alignment: "center",
      margin: [0, 0, 0, 4],
    });
  }

  // Contact line
  const contact: string[] = [];
  if (s?.address) contact.push(s.address);
  if (s?.phone) contact.push(s.phone);
  if (s?.email) contact.push(s.email);
  if (contact.length) {
    parts.push({
      text: contact.join("  ·  "),
      fontSize: 7.5,
      color: C.gray600,
      alignment: "center",
      margin: [0, 0, 0, 3],
    });
  }

  // Legal info
  const legal: string[] = [];
  if (s?.tax_number) legal.push(`VAT: ${s.tax_number}`);
  if (s?.commercial_register) legal.push(`C.R: ${s.commercial_register}`);
  if (legal.length) {
    parts.push({
      text: legal.join("    ·    "),
      fontSize: 7.5,
      bold: true,
      color: C.gray700,
      alignment: "center",
      margin: [0, 0, 0, 8],
    });
  }

  // Separator line
  parts.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth, y2: 0, lineWidth: 0.8, lineColor: C.gray300 }],
    margin: [0, 0, 0, 12],
  });

  return parts;
}

// ═══════════════════════════════════════════
//  FOOTER
// ═══════════════════════════════════════════

function buildFooter(settings: CompanySettings | null) {
  return (currentPage: number, pageCount: number) => ({
    stack: [
      {
        canvas: [{ type: "line", x1: 30, y1: 0, x2: 565, y2: 0, lineWidth: 0.5, lineColor: C.gray300 }],
        margin: [0, 0, 0, 4] as [number, number, number, number],
      },
      {
        columns: [
          { text: `Page ${currentPage} / ${pageCount}`, fontSize: 7, color: C.gray500, alignment: "left" as const },
          { text: settings?.invoice_footer || "", fontSize: 7, color: C.gray600, alignment: "center" as const },
          { text: fmtDateFull(new Date()), fontSize: 7, color: C.gray500, alignment: "right" as const },
        ],
      },
    ],
    margin: [30, 5, 30, 0] as [number, number, number, number],
  });
}

// ═══════════════════════════════════════════
//  REPORT PDF — Professional Financial Report
// ═══════════════════════════════════════════

interface ReportPdfOptions {
  title: string;
  settings: CompanySettings | null;
  headers: string[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
  orientation?: "portrait" | "landscape";
  filename: string;
}

export async function exportReportPdf({
  title, settings, headers, rows, summaryCards,
  orientation = "portrait", filename,
}: ReportPdfOptions) {
  const content: Content[] = [];
  const pageWidth = orientation === "landscape" ? 770 : 515;
  const currency = settings?.default_currency || "EGP";

  // Header
  content.push(...buildHeader(settings, pageWidth));

  // Report title with date range badge
  content.push({
    columns: [
      { text: "", width: "*" },
      {
        stack: [
          { text: title, fontSize: 16, bold: true, color: C.navy, alignment: "center" as const },
          {
            text: `Generated: ${fmtDateFull(new Date())}  |  Currency: ${currency}`,
            fontSize: 8,
            color: C.gray600,
            alignment: "center" as const,
            margin: [0, 4, 0, 0] as [number, number, number, number],
          },
        ],
        width: "auto",
      },
      { text: "", width: "*" },
    ],
    margin: [0, 0, 0, 16],
  });

  // Summary KPI Cards
  if (summaryCards?.length) {
    const cells: TableCell[] = summaryCards.map((card) => ({
      stack: [
        { text: card.value, fontSize: 14, bold: true, color: C.brand, alignment: "center" as const },
        { text: card.label, fontSize: 7.5, color: C.gray600, alignment: "center" as const, margin: [0, 4, 0, 0] as [number, number, number, number] },
      ],
      margin: [4, 8, 4, 8] as [number, number, number, number],
    }));

    content.push({
      table: {
        widths: summaryCards.map(() => "*"),
        body: [cells],
      },
      layout: {
        hLineWidth: () => 0,
        vLineWidth: (i: number) => (i === 0 || i === summaryCards!.length ? 0 : 0.5),
        vLineColor: () => C.gray300,
        fillColor: () => C.gray100,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 16] as [number, number, number, number],
    });
  }

  // Data Table
  const headerRow: TableCell[] = headers.map((h) => ({
    text: h, fontSize: 8, bold: true, color: C.white, alignment: "center" as const,
  }));

  const bodyRows: TableCell[][] = rows.map((row) =>
    row.map((cell) => ({
      text: String(cell), fontSize: 8, color: C.charcoal, alignment: "center" as const,
    }))
  );

  content.push({
    table: {
      headerRows: 1,
      widths: headers.map(() => "*"),
      body: [headerRow, ...bodyRows],
    },
    layout: REPORT_TABLE_LAYOUT,
  });

  // Record count
  content.push({
    text: `Total Records: ${rows.length}`,
    fontSize: 7.5,
    color: C.gray600,
    alignment: "left",
    margin: [0, 6, 0, 0],
  });

  const docDef: TDocumentDefinitions = {
    pageOrientation: orientation,
    pageMargins: [30, 20, 30, 45],
    defaultStyle: { fontSize: 9, alignment: "right" },
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDef).download(`${filename}.pdf`);
}

// ═══════════════════════════════════════════
//  INVOICE PDF — Odoo-Inspired Clean Layout
// ═══════════════════════════════════════════

interface InvoicePdfOptions {
  type: "sales_invoice" | "purchase_invoice" | "sales_return" | "purchase_return";
  number: number | string;
  date: string;
  partyName: string;
  partyLabel: string;
  reference?: string;
  notes?: string;
  items: { name: string; quantity: number; unitPrice: number; discount: number; total: number }[];
  subtotal: number;
  discountTotal?: number;
  taxAmount?: number;
  taxRate?: number;
  grandTotal: number;
  showTax?: boolean;
  showDiscount?: boolean;
  settings: CompanySettings | null;
  status?: string;
  dueDate?: string;
  paidAmount?: number;
}

const TYPE_META: Record<string, { label: string; color: string; bgColor: string }> = {
  sales_invoice: { label: "فاتورة مبيعات", color: C.brand, bgColor: "#F3E8EF" },
  purchase_invoice: { label: "فاتورة مشتريات", color: "#2C3E50", bgColor: "#EBF5FB" },
  sales_return: { label: "مرتجع مبيعات", color: C.red, bgColor: C.redBg },
  purchase_return: { label: "مرتجع مشتريات", color: C.orange, bgColor: C.orangeBg },
};

export function exportInvoicePdf(options: InvoicePdfOptions) {
  const {
    type, number: num, date, partyName, partyLabel, reference, notes,
    items, subtotal, discountTotal, taxAmount = 0, taxRate = 0, grandTotal,
    showTax, showDiscount = true, settings, status, dueDate, paidAmount,
  } = options;

  const meta = TYPE_META[type] || TYPE_META.sales_invoice;
  const currency = settings?.default_currency || "EGP";
  const content: Content[] = [];

  // ═══ TOP SECTION: Brand bar + Document header ═══

  // Top brand bar
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: meta.color }],
    margin: [0, 0, 0, 16],
  });

  // ═══ ROW 1: Company info (right) | Document badge (left) ═══
  const companyLines: Content[] = [
    { text: settings?.company_name || "النظام المحاسبي", fontSize: 18, bold: true, color: C.navy, alignment: "right" as const },
  ];
  if (settings?.company_name_en) {
    companyLines.push({ text: settings.company_name_en, fontSize: 9, color: C.gray600, alignment: "right" as const, margin: [0, 2, 0, 0] as [number, number, number, number] });
  }

  // Contact details under company name
  const contactLines: string[] = [];
  if (settings?.address) contactLines.push(settings.address);
  if (settings?.phone) contactLines.push(settings.phone);
  if (settings?.email) contactLines.push(settings.email);
  if (contactLines.length) {
    companyLines.push({
      text: contactLines.join("\n"),
      fontSize: 7.5,
      color: C.gray600,
      alignment: "right" as const,
      lineHeight: 1.5,
      margin: [0, 6, 0, 0] as [number, number, number, number],
    });
  }

  // Legal
  const legalLine: string[] = [];
  if (settings?.tax_number) legalLine.push(`VAT: ${settings.tax_number}`);
  if (settings?.commercial_register) legalLine.push(`C.R: ${settings.commercial_register}`);
  if (legalLine.length) {
    companyLines.push({
      text: legalLine.join("  |  "),
      fontSize: 7,
      bold: true,
      color: C.gray700,
      alignment: "right" as const,
      margin: [0, 4, 0, 0] as [number, number, number, number],
    });
  }

  // Document type badge — clean card with colored left border
  const docBadge: Content = {
    table: {
      widths: [4, "*"],
      body: [[
        { text: "", fillColor: meta.color, border: [false, false, false, false] },
        {
          stack: [
            { text: meta.label, fontSize: 14, bold: true, color: meta.color, alignment: "center" as const },
            { text: `# ${num}`, fontSize: 20, bold: true, color: C.navy, alignment: "center" as const, margin: [0, 4, 0, 4] as [number, number, number, number] },
            // Status badge inline
            ...(status ? [{
              table: {
                widths: ["*"],
                body: [[{
                  text: status === "posted" || status === "approved" ? "✓ مُعتمد" : status === "draft" ? "مسودة" : status,
                  fontSize: 8,
                  bold: true,
                  color: status === "posted" || status === "approved" ? C.green : status === "draft" ? C.orange : C.gray600,
                  alignment: "center" as const,
                  fillColor: status === "posted" || status === "approved" ? C.greenBg : status === "draft" ? C.orangeBg : C.gray100,
                  margin: [0, 2, 0, 2] as [number, number, number, number],
                }]],
              },
              layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
            }] : []),
          ],
          border: [false, false, false, false],
          margin: [8, 10, 8, 10] as [number, number, number, number],
        },
      ]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.8 : 0),
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 0.8 : 0),
      hLineColor: () => C.gray300,
      vLineColor: () => C.gray300,
    },
  };

  content.push({
    columns: [
      { width: "55%", stack: companyLines },
      { width: "5%", text: "" },
      { width: "40%", stack: [docBadge] },
    ],
    margin: [0, 0, 0, 14],
  });

  // ═══ SEPARATOR ═══
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: C.gray300 }],
    margin: [0, 0, 0, 14],
  });

  // ═══ ROW 2: Party info (right) | Document details (left) ═══
  // Party card - simple gray bg
  const partyInfo: Content = {
    table: {
      widths: ["*"],
      body: [[{
        stack: [
          { text: partyLabel, fontSize: 8, color: C.gray600, margin: [0, 0, 0, 3] as [number, number, number, number] },
          { text: partyName, fontSize: 13, bold: true, color: C.navy },
        ],
        fillColor: C.gray100,
        margin: [10, 8, 10, 8] as [number, number, number, number],
      }]],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
  };

  // Document details - clean key:value pairs
  const details: { k: string; v: string }[] = [
    { k: "التاريخ", v: fmtDate(date) },
  ];
  if (dueDate) details.push({ k: "تاريخ الاستحقاق", v: fmtDate(dueDate) });
  if (reference) details.push({ k: "المرجع", v: reference });
  details.push({ k: "العملة", v: currency });

  const detailRows: TableCell[][] = details.map((d) => [
    { text: d.v, fontSize: 8.5, color: C.charcoal, alignment: "left" as const },
    { text: d.k, fontSize: 8.5, bold: true, color: C.gray700, alignment: "right" as const },
  ]);

  const detailInfo: Content = {
    table: {
      widths: ["*", 100],
      body: detailRows,
    },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : 0.3),
      vLineWidth: () => 0,
      hLineColor: () => C.gray200,
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };

  content.push({
    columns: [
      { width: "48%", stack: [detailInfo] },
      { width: "4%", text: "" },
      { width: "48%", stack: [partyInfo] },
    ],
    margin: [0, 0, 0, 18],
  });

  // ═══ ITEMS TABLE ═══
  const colHeaders: string[] = ["#", "الصنف", "الكمية", "سعر الوحدة"];
  if (showDiscount) colHeaders.push("الخصم");
  colHeaders.push("الإجمالي");

  const hCells: TableCell[] = colHeaders.map((h) => ({
    text: h, fontSize: 8, bold: true, color: C.white, alignment: "center" as const,
  }));

  const iRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1), fontSize: 8, color: C.gray700, alignment: "center" as const },
      { text: item.name, fontSize: 8, color: C.charcoal, alignment: "right" as const },
      { text: fmtNum(item.quantity), fontSize: 8, color: C.charcoal, alignment: "center" as const },
      { text: fmtNum(item.unitPrice), fontSize: 8, color: C.charcoal, alignment: "center" as const },
    ];
    if (showDiscount) {
      row.push({ text: fmtNum(item.discount), fontSize: 8, color: item.discount > 0 ? C.red : C.gray500, alignment: "center" as const });
    }
    row.push({ text: fmtNum(item.total), fontSize: 8, bold: true, color: C.navy, alignment: "center" as const });
    return row;
  });

  const colWidths = showDiscount ? [24, "*", 45, 70, 50, 80] : [24, "*", 50, 75, 85];

  content.push({
    table: {
      headerRows: 1,
      widths: colWidths,
      body: [hCells, ...iRows],
    },
    layout: INVOICE_TABLE_LAYOUT,
    margin: [0, 0, 0, 14],
  });

  // ═══ TOTALS SECTION — Right-aligned summary box ═══
  const totals: TableCell[][] = [];

  totals.push([
    { text: "الإجمالي الفرعي", fontSize: 9, color: C.gray700, alignment: "right" as const },
    { text: `${fmtNum(subtotal)} ${currency}`, fontSize: 9, color: C.charcoal, alignment: "left" as const },
  ]);

  if (showDiscount && discountTotal && discountTotal > 0) {
    totals.push([
      { text: "الخصم", fontSize: 9, color: C.red, alignment: "right" as const },
      { text: `(${fmtNum(discountTotal)}) ${currency}`, fontSize: 9, color: C.red, alignment: "left" as const },
    ]);
  }

  if (showTax && taxRate > 0) {
    totals.push([
      { text: `ضريبة القيمة المضافة ${taxRate}%`, fontSize: 9, color: C.gray700, alignment: "right" as const },
      { text: `${fmtNum(taxAmount)} ${currency}`, fontSize: 9, color: C.charcoal, alignment: "left" as const },
    ]);
  }

  // Grand total — highlighted row
  totals.push([
    { text: "الإجمالي المستحق", fontSize: 11, bold: true, color: C.white, alignment: "right" as const, fillColor: meta.color, margin: [0, 5, 0, 5] as [number, number, number, number] },
    { text: `${fmtNum(grandTotal)} ${currency}`, fontSize: 11, bold: true, color: C.white, alignment: "left" as const, fillColor: meta.color, margin: [0, 5, 0, 5] as [number, number, number, number] },
  ]);

  // Paid & balance
  if (paidAmount !== undefined && paidAmount > 0) {
    totals.push([
      { text: "المدفوع", fontSize: 9, bold: true, color: C.green, alignment: "right" as const },
      { text: `${fmtNum(paidAmount)} ${currency}`, fontSize: 9, bold: true, color: C.green, alignment: "left" as const },
    ]);
    const balance = grandTotal - paidAmount;
    if (balance > 0) {
      totals.push([
        { text: "المتبقي", fontSize: 10, bold: true, color: C.red, alignment: "right" as const },
        { text: `${fmtNum(balance)} ${currency}`, fontSize: 10, bold: true, color: C.red, alignment: "left" as const },
      ]);
    }
  }

  content.push({
    columns: [
      { width: "*", text: "" },
      {
        width: 260,
        table: { widths: ["*", 110], body: totals },
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.4),
          vLineWidth: () => 0,
          hLineColor: () => C.gray200,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      },
    ],
    margin: [0, 0, 0, 16],
  });

  // ═══ NOTES ═══
  if (notes) {
    content.push({
      table: {
        widths: ["*"],
        body: [[{
          stack: [
            { text: "ملاحظات", fontSize: 9, bold: true, color: C.gray700, margin: [0, 0, 0, 4] as [number, number, number, number] },
            { text: notes, fontSize: 8, color: C.gray600, lineHeight: 1.5 },
          ],
          fillColor: C.gray100,
          margin: [10, 8, 10, 8] as [number, number, number, number],
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
      margin: [0, 0, 0, 10],
    });
  }

  // ═══ INVOICE TERMS / NOTES ═══
  if (settings?.invoice_notes) {
    content.push({
      text: settings.invoice_notes,
      fontSize: 7,
      color: C.gray600,
      alignment: "center",
      margin: [0, 6, 0, 0],
    });
  }

  // Bottom accent
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 3, color: meta.color }],
    margin: [0, 14, 0, 0],
  });

  const docDef: TDocumentDefinitions = {
    pageMargins: [30, 20, 30, 45],
    defaultStyle: { fontSize: 9, alignment: "right" },
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDef).download(`${meta.label}-${num}.pdf`);
}
