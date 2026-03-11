import pdfMake from "pdfmake-rtl/build/pdfmake";
import "pdfmake-rtl/build/vfs_fonts";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

// ─── Clean Blue Palette (Inspired by uploaded invoice03 design) ───
const C = {
  blue:      "#1d4ed8",
  blueMid:   "#2563eb",
  blueSoft:  "#3b82f6",
  bluePale:  "#eff6ff",
  blueLine:  "#dbeafe",
  blueLight: "#93c5fd",
  ink:       "#0f172a",
  ink2:      "#334155",
  ink3:      "#64748b",
  ink4:      "#94a3b8",
  border:    "#e2e8f0",
  bgSoft:    "#f8fafc",
  white:     "#ffffff",
  green:     "#15803d",
  greenBg:   "#f0fdf4",
  greenBorder: "#bbf7d0",
  red:       "#dc2626",
  redBg:     "#fef2f2",
  orange:    "#ea580c",
  orangeBg:  "#fff7ed",
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

// Report table: dark ink header, zebra rows, clean lines
const REPORT_TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0) return 1;
    if (i === 1) return 1.2;
    if (i === node.table.body.length) return 1;
    return 0.5;
  },
  vLineWidth: (i: number, node: any) =>
    i === 0 || i === node.table.widths.length ? 1 : 0,
  hLineColor: (i: number) => (i <= 1 ? C.border : C.blueLine),
  vLineColor: () => C.border,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 7,
  paddingBottom: () => 7,
  fillColor: (i: number) => {
    if (i === 0) return C.ink;
    return i % 2 === 0 ? C.white : C.bluePale;
  },
};

// Invoice items table: dark header, blue-pale zebra
const INVOICE_TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0) return 1;
    if (i === 1) return 1.2;
    if (i === node.table.body.length) return 1;
    return 0.5;
  },
  vLineWidth: (i: number, node: any) =>
    i === 0 || i === node.table.widths.length ? 1 : 0,
  hLineColor: (i: number) => (i <= 1 ? C.border : C.blueLine),
  vLineColor: () => C.border,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 7,
  paddingBottom: () => 7,
  fillColor: (i: number) => {
    if (i === 0) return C.ink;
    return i % 2 === 0 ? C.white : C.bluePale;
  },
};

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
  const s = settings;

  // ═══ TOP STRIPE ═══
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: pageWidth, h: 4, color: C.blueMid }],
    margin: [0, 0, 0, 16],
  });

  // ═══ HEADER: Company info (right) | Report badge (left) ═══
  const companyStack: Content[] = [
    { text: s?.company_name || "النظام المحاسبي", fontSize: 18, bold: true, color: C.ink, alignment: "right" as const },
  ];
  if (s?.company_name_en) {
    companyStack.push({ text: s.company_name_en, fontSize: 9.5, color: C.ink3, alignment: "right" as const, margin: [0, 2, 0, 0] as any });
  }
  if (s?.business_activity) {
    companyStack.push({ text: s.business_activity, fontSize: 8.5, color: C.ink4, alignment: "right" as const, margin: [0, 2, 0, 0] as any });
  }

  const reportBadge: Content = {
    stack: [
      { text: "تقرير", fontSize: 8, bold: true, color: C.blueMid, alignment: "left" as const, characterSpacing: 2 },
      { text: title, fontSize: 16, bold: true, color: C.ink, alignment: "left" as const, margin: [0, 3, 0, 3] as any },
      {
        text: `${fmtDateFull(new Date())}  ·  ${currency}`,
        fontSize: 8.5, color: C.ink3, alignment: "left" as const,
      },
    ],
  };

  content.push({
    columns: [
      { width: "55%", stack: companyStack },
      { width: "5%", text: "" },
      { width: "40%", stack: [reportBadge] },
    ],
    margin: [0, 0, 0, 0],
  });

  // Ink separator
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth, y2: 0, lineWidth: 1.5, lineColor: C.ink }],
    margin: [0, 12, 0, 0],
  });

  // ═══ SUBHEADER: Legal info bar ═══
  const legalParts: string[] = [];
  if (s?.address) legalParts.push(s.address);
  if (s?.phone) legalParts.push(s.phone);
  if (s?.email) legalParts.push(s.email);
  if (s?.tax_number) legalParts.push(`VAT: ${s.tax_number}`);
  if (s?.commercial_register) legalParts.push(`C.R: ${s.commercial_register}`);

  if (legalParts.length) {
    content.push({
      table: {
        widths: ["*"],
        body: [[{
          text: legalParts.join("   ·   "),
          fontSize: 7.5, color: C.ink3, alignment: "center" as const,
          margin: [8, 6, 8, 6] as any,
        }]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => C.bgSoft },
      margin: [0, 0, 0, 14],
    });
  }

  // ═══ SUMMARY KPI CARDS (summary bar style) ═══
  if (summaryCards?.length) {
    const kpiCells: TableCell[] = [];
    summaryCards.forEach((card, idx) => {
      if (idx > 0) {
        kpiCells.push({
          text: "", width: 1, fillColor: C.blueLine,
          border: [false, false, false, false],
          margin: [0, 4, 0, 4] as any,
        });
      }
      kpiCells.push({
        stack: [
          { text: card.label, fontSize: 7.5, color: C.ink3, alignment: "center" as const },
          { text: card.value, fontSize: 12, bold: true, color: C.blueMid, alignment: "center" as const, margin: [0, 3, 0, 0] as any },
        ],
        border: [false, false, false, false],
        margin: [6, 6, 6, 6] as any,
      });
    });

    content.push({
      table: {
        body: [kpiCells],
        widths: kpiCells.map((_: any, i: number) => {
          // separators get tiny width
          if (summaryCards!.length > 1 && i % 2 === 1 && i > 0) return 1;
          return "*";
        }),
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 1 : 0),
        vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
        hLineColor: () => C.blueLine,
        vLineColor: () => C.blueLine,
        fillColor: () => C.bluePale,
      },
      margin: [0, 0, 0, 14] as any,
    });
  }

  // ═══ SECTION LABEL ═══
  content.push({
    text: "تفاصيل البيانات",
    fontSize: 8, bold: true, color: C.blueMid, characterSpacing: 2,
    margin: [0, 0, 0, 6],
  });

  // ═══ DATA TABLE ═══
  const headerRow: TableCell[] = headers.map((h) => ({
    text: h, fontSize: 8, bold: true, color: "rgba(255,255,255,0.6)", alignment: "center" as const, characterSpacing: 0.8,
  }));

  const bodyRows: TableCell[][] = rows.map((row, idx) =>
    row.map((cell, colIdx) => ({
      text: String(cell),
      fontSize: 9,
      color: colIdx === 0 ? C.ink4 : C.ink2,
      bold: colIdx === row.length - 1,
      alignment: "center" as const,
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
    text: `إجمالي السجلات: ${rows.length}`,
    fontSize: 7.5, color: C.ink4, alignment: "left",
    margin: [0, 6, 0, 0],
  });

  // ═══ BOTTOM STRIPE ═══
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: pageWidth, h: 4, color: C.blueMid }],
    margin: [0, 18, 0, 0],
  });

  const docDef: TDocumentDefinitions = {
    pageOrientation: orientation,
    pageMargins: [30, 20, 30, 50],
    defaultStyle: { fontSize: 9, alignment: "right" },
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDef).download(`${filename}.pdf`);
}

// ═══════════════════════════════════════════
//  FOOTER — Clean centered contact bar
// ═══════════════════════════════════════════

function buildFooter(settings: CompanySettings | null) {
  return (currentPage: number, pageCount: number) => {
    const parts: string[] = [];
    if (settings?.address) parts.push(`📍 ${settings.address}`);
    if (settings?.email) parts.push(`✉ ${settings.email}`);
    if (settings?.phone) parts.push(`📞 ${settings.phone}`);
    if (settings?.tax_number) parts.push(`VAT: ${settings.tax_number}`);

    return {
      stack: [
        {
          canvas: [{ type: "line", x1: 30, y1: 0, x2: 565, y2: 0, lineWidth: 1, lineColor: C.border }],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          columns: [
            { text: `Page ${currentPage} / ${pageCount}`, fontSize: 7, color: C.ink4, alignment: "left" as const },
            { text: parts.join("   ·   "), fontSize: 7, color: C.ink3, alignment: "center" as const },
            { text: fmtDateFull(new Date()), fontSize: 7, color: C.ink4, alignment: "right" as const },
          ],
        },
        ...(settings?.invoice_footer ? [{
          text: settings.invoice_footer, fontSize: 6.5, color: C.ink4, alignment: "center" as const,
          margin: [0, 3, 0, 0] as [number, number, number, number],
        }] : []),
      ],
      margin: [30, 5, 30, 0] as [number, number, number, number],
    };
  };
}

// ═══════════════════════════════════════════
//  INVOICE PDF — invoice03.html Inspired
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

const TYPE_META: Record<string, { label: string; typeLabel: string; color: string }> = {
  sales_invoice:    { label: "فاتورة مبيعات", typeLabel: "فاتورة ضريبية", color: C.blueMid },
  purchase_invoice: { label: "فاتورة مشتريات", typeLabel: "فاتورة مشتريات", color: "#0e7490" },
  sales_return:     { label: "مرتجع مبيعات", typeLabel: "إشعار مرتجع", color: C.red },
  purchase_return:  { label: "مرتجع مشتريات", typeLabel: "إشعار مرتجع مشتريات", color: C.orange },
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
  const s = settings;

  // ═══ 1. TOP STRIPE (4px colored bar) ═══
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: meta.color }],
    margin: [0, 0, 0, 16],
  });

  // ═══ 2. HEADER — Company info (right) | Invoice badge (left) ═══
  const companyStack: Content[] = [
    { text: s?.company_name || "النظام المحاسبي", fontSize: 18, bold: true, color: C.ink, alignment: "right" as const },
  ];
  if (s?.company_name_en) {
    companyStack.push({ text: s.company_name_en, fontSize: 9.5, color: C.ink3, alignment: "right" as const, margin: [0, 2, 0, 0] as any });
  }
  if (s?.business_activity) {
    companyStack.push({ text: s.business_activity, fontSize: 8.5, color: C.ink3, alignment: "right" as const, margin: [0, 1, 0, 0] as any });
  }

  // Invoice badge (left side) — type label, number, status pill
  const badgeStack: Content[] = [
    { text: meta.typeLabel, fontSize: 8, bold: true, color: meta.color, alignment: "left" as const, characterSpacing: 2 },
    { text: `#${num}`, fontSize: 20, bold: true, color: C.ink, alignment: "left" as const, margin: [0, 3, 0, 3] as any },
  ];

  // Status pill
  if (status) {
    const isApproved = status === "posted" || status === "approved";
    const isDraft = status === "draft";
    badgeStack.push({
      table: {
        widths: ["auto"],
        body: [[{
          text: isApproved ? "✓ مُعتمد" : isDraft ? "مسودة" : status,
          fontSize: 8, bold: true,
          color: isApproved ? C.green : isDraft ? C.orange : C.ink3,
          alignment: "center" as const,
          margin: [10, 2, 10, 2] as any,
        }]],
      },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => isApproved ? C.greenBorder : isDraft ? "#fed7aa" : C.border,
        vLineColor: () => isApproved ? C.greenBorder : isDraft ? "#fed7aa" : C.border,
        fillColor: () => isApproved ? C.greenBg : isDraft ? C.orangeBg : C.bgSoft,
      },
    });
  }

  content.push({
    columns: [
      { width: "55%", stack: companyStack },
      { width: "5%", text: "" },
      { width: "40%", stack: badgeStack },
    ],
    margin: [0, 0, 0, 0],
  });

  // ═══ INK SEPARATOR (like header bottom border) ═══
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: C.ink }],
    margin: [0, 12, 0, 0],
  });

  // ═══ 3. SUBHEADER BAR — Client block (right) | Meta cells (left) ═══
  // Build as a single table row with bgSoft background
  const metaCells: { label: string; value: string }[] = [
    { label: "تاريخ الإصدار", value: fmtDate(date) },
  ];
  if (dueDate) metaCells.push({ label: "تاريخ الاستحقاق", value: fmtDate(dueDate) });
  if (reference) metaCells.push({ label: "المرجع", value: reference });
  metaCells.push({ label: "العملة", value: currency });

  // Client block
  const clientContent: Content = {
    stack: [
      { text: partyLabel, fontSize: 8, bold: true, color: C.blueMid, characterSpacing: 1.5, margin: [0, 0, 0, 3] as any },
      { text: partyName, fontSize: 13, bold: true, color: C.ink },
    ],
    margin: [8, 8, 8, 8] as any,
  };

  // Meta cells as key-value pairs in small boxes
  const metaContent: Content = {
    table: {
      widths: metaCells.map(() => "*"),
      body: [
        metaCells.map(m => ({
          stack: [
            { text: m.label, fontSize: 7, bold: true, color: C.ink4, characterSpacing: 1 },
            { text: m.value, fontSize: 10, bold: true, color: C.ink, margin: [0, 2, 0, 0] as any },
          ],
          border: [false, false, false, false],
          margin: [6, 6, 6, 6] as any,
        })),
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
      vLineColor: () => C.border,
    },
  };

  // Subheader as a full-width table
  content.push({
    table: {
      widths: ["40%", "60%"],
      body: [[
        { stack: [clientContent], border: [false, false, true, false], borderColor: [C.border, C.border, C.border, C.border] },
        { stack: [metaContent], border: [false, false, false, false] },
      ]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === node.table.body.length ? 1 : 0),
      vLineWidth: (i: number) => (i === 1 ? 0.5 : 0),
      hLineColor: () => C.border,
      vLineColor: () => C.border,
      fillColor: () => C.bgSoft,
    },
    margin: [0, 0, 0, 16],
  });

  // ═══ 4. ITEMS TABLE ═══
  // Section label
  content.push({
    text: "تفاصيل البنود",
    fontSize: 8, bold: true, color: C.blueMid, characterSpacing: 2,
    margin: [0, 0, 0, 6],
  });

  // Table headers
  const colHeaders: string[] = ["#", "الوصف", "الكمية", "سعر الوحدة"];
  if (showDiscount) colHeaders.push("الخصم");
  colHeaders.push(`الإجمالي (${currency})`);

  const hCells: TableCell[] = colHeaders.map((h) => ({
    text: h, fontSize: 8, bold: true, color: "rgba(255,255,255,0.55)", alignment: "center" as const, characterSpacing: 0.8,
  }));

  const iRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1).padStart(2, "0"), fontSize: 8.5, color: C.ink4, alignment: "center" as const },
      { text: item.name, fontSize: 9.5, bold: true, color: C.ink, alignment: "right" as const },
      { text: fmtNum(item.quantity), fontSize: 9, color: C.ink2, alignment: "center" as const },
      { text: fmtNum(item.unitPrice), fontSize: 9, color: C.ink2, alignment: "center" as const },
    ];
    if (showDiscount) {
      row.push({
        text: item.discount > 0 ? fmtNum(item.discount) : "—",
        fontSize: 9, color: item.discount > 0 ? C.red : C.ink4, alignment: "center" as const,
      });
    }
    row.push({ text: fmtNum(item.total), fontSize: 9.5, bold: true, color: C.ink, alignment: "center" as const });
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

  // ═══ 5. BOTTOM GRID — Notes+Summary (right) | Totals box (left) ═══

  // Summary bar (items count)
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);
  const summaryBar: Content = {
    table: {
      widths: ["auto", 1, "auto"],
      body: [[
        {
          text: [
            { text: "منتجات: ", fontSize: 9, color: C.ink3 },
            { text: String(items.length), fontSize: 10, bold: true, color: C.blueMid },
          ],
          border: [false, false, false, false],
          margin: [8, 5, 8, 5] as any,
        },
        { text: "", fillColor: C.blueLine, border: [false, false, false, false], margin: [0, 3, 0, 3] as any },
        {
          text: [
            { text: "وحدات: ", fontSize: 9, color: C.ink3 },
            { text: fmtNum(totalQty), fontSize: 10, bold: true, color: C.blueMid },
          ],
          border: [false, false, false, false],
          margin: [8, 5, 8, 5] as any,
        },
      ]],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 1 : 0),
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
      hLineColor: () => C.blueLine,
      vLineColor: () => C.blueLine,
      fillColor: () => C.bluePale,
    },
  };

  // Notes box
  const notesBox: Content = notes ? {
    table: {
      widths: ["*"],
      body: [[{
        stack: [
          { text: "ملاحظات وشروط الدفع", fontSize: 7, bold: true, color: C.blueMid, characterSpacing: 1.5, margin: [0, 0, 0, 4] as any },
          { text: notes, fontSize: 9, color: C.ink3, lineHeight: 1.8 },
        ],
        margin: [10, 8, 10, 8] as any,
      }]],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => C.border,
      vLineColor: () => C.border,
      fillColor: () => C.bgSoft,
    },
  } : { text: "" };

  // Left column stack
  const leftCol: Content = {
    stack: [summaryBar, ...(notes ? [{ text: "", margin: [0, 6, 0, 0] as any }, notesBox] : [])],
  };

  // ═══ TOTALS BOX — bordered card with grand total dark row ═══
  const totalsRows: TableCell[][] = [];

  // Subtotal
  totalsRows.push([
    { text: "المجموع الفرعي", fontSize: 10, color: C.ink3, alignment: "right" as const, border: [false, false, false, false] },
    { text: fmtNum(subtotal), fontSize: 10, color: C.ink, alignment: "left" as const, border: [false, false, false, false] },
  ]);

  // Tax
  if (showTax && taxRate > 0) {
    totalsRows.push([
      { text: `ضريبة القيمة المضافة ${taxRate}%`, fontSize: 10, color: C.ink3, alignment: "right" as const, border: [false, false, false, false] },
      { text: fmtNum(taxAmount), fontSize: 10, color: C.ink, alignment: "left" as const, border: [false, false, false, false] },
    ]);
  }

  // Discount
  if (showDiscount && discountTotal && discountTotal > 0) {
    totalsRows.push([
      { text: "الخصم", fontSize: 10, color: C.ink3, alignment: "right" as const, border: [false, false, false, false] },
      { text: `− ${fmtNum(discountTotal)}`, fontSize: 10, color: C.red, alignment: "left" as const, border: [false, false, false, false] },
    ]);
  }

  // Grand total (dark row)
  totalsRows.push([
    { text: "الإجمالي المستحق", fontSize: 11, bold: true, color: "rgba(255,255,255,0.65)", alignment: "right" as const, fillColor: C.ink, margin: [0, 4, 0, 4] as any, border: [false, false, false, false] },
    { text: `${fmtNum(grandTotal)} ${currency}`, fontSize: 14, bold: true, color: C.blueLight, alignment: "left" as const, fillColor: C.ink, margin: [0, 4, 0, 4] as any, border: [false, false, false, false] },
  ]);

  // Paid & balance (after grand total)
  if (paidAmount !== undefined && paidAmount > 0) {
    totalsRows.push([
      { text: "المدفوع", fontSize: 10, bold: true, color: C.green, alignment: "right" as const, border: [false, false, false, false] },
      { text: `${fmtNum(paidAmount)} ${currency}`, fontSize: 10, bold: true, color: C.green, alignment: "left" as const, border: [false, false, false, false] },
    ]);
    const balance = grandTotal - paidAmount;
    if (balance > 0.01) {
      totalsRows.push([
        { text: "المتبقي", fontSize: 10, bold: true, color: C.red, alignment: "right" as const, border: [false, false, false, false] },
        { text: `${fmtNum(balance)} ${currency}`, fontSize: 10, bold: true, color: C.red, alignment: "left" as const, border: [false, false, false, false] },
      ]);
    }
  }

  const totalsBox: Content = {
    table: {
      widths: ["*", 110],
      body: totalsRows,
    },
    layout: {
      hLineWidth: (i: number, node: any) => {
        if (i === 0) return 1;
        if (i === node.table.body.length) return 1;
        return 0.5;
      },
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
      hLineColor: () => C.blueLine,
      vLineColor: () => C.border,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  };

  content.push({
    columns: [
      { width: "55%", stack: [leftCol] },
      { width: "3%", text: "" },
      { width: "42%", stack: [totalsBox] },
    ],
    margin: [0, 0, 0, 14],
  });

  // ═══ INVOICE NOTES (from settings) ═══
  if (settings?.invoice_notes) {
    content.push({
      text: settings.invoice_notes,
      fontSize: 7.5, color: C.ink4, alignment: "center",
      margin: [0, 4, 0, 0],
    });
  }

  // ═══ BOTTOM STRIPE ═══
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 4, color: meta.color }],
    margin: [0, 14, 0, 0],
  });

  const docDef: TDocumentDefinitions = {
    pageMargins: [30, 20, 30, 50],
    defaultStyle: { fontSize: 9, alignment: "right" },
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDef).download(`${meta.label}-${num}.pdf`);
}
