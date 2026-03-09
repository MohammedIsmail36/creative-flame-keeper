import pdfMake from "pdfmake-rtl/build/pdfmake";
import "pdfmake-rtl/build/vfs_fonts";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

// ─── Color Palette ───
const COLORS = {
  primary: "#1e3a5f",
  primaryLight: "#2d5a8e",
  accent: "#e8a838",
  dark: "#1a1a2e",
  text: "#2c3e50",
  textLight: "#7f8c8d",
  border: "#dce1e8",
  headerBg: "#1e3a5f",
  headerText: "#ffffff",
  rowAlt: "#f7f9fc",
  white: "#ffffff",
  success: "#27ae60",
  cardBg: "#f0f4f8",
  separator: "#1e3a5f",
};

// ─── Shared Styles ───
const BASE_STYLES = {
  companyName: { fontSize: 20, bold: true, color: COLORS.primary },
  companyNameEn: { fontSize: 11, color: COLORS.textLight },
  subInfo: { fontSize: 9, color: COLORS.textLight, lineHeight: 1.4 },
  reportTitle: { fontSize: 16, bold: true, color: COLORS.dark },
  info: { fontSize: 9, color: COLORS.textLight },
  cardValue: { fontSize: 14, bold: true, color: COLORS.primary },
  cardLabel: { fontSize: 9, color: COLORS.textLight },
  tableHeader: { fontSize: 9, bold: true, color: COLORS.headerText },
  tableCell: { fontSize: 9, color: COLORS.text },
  detailText: { fontSize: 10, color: COLORS.text, lineHeight: 1.5 },
  detailLabel: { fontSize: 10, bold: true, color: COLORS.primary },
  totalLabel: { fontSize: 10, color: COLORS.text },
  totalValue: { fontSize: 10, bold: true, color: COLORS.text },
  grandTotalLabel: { fontSize: 12, bold: true },
  grandTotalValue: { fontSize: 12, bold: true },
  invoiceTitle: { fontSize: 18, bold: true, color: COLORS.primary },
  invoiceNumber: { fontSize: 13, color: COLORS.textLight, bold: true },
  statusBadge: { fontSize: 10, color: COLORS.success, bold: true },
  sectionTitle: { fontSize: 11, bold: true, color: COLORS.primary },
  noteText: { fontSize: 9, color: COLORS.text, italics: true },
};

const TABLE_LAYOUT_CLEAN = {
  hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 1.2 : 0.4),
  vLineWidth: () => 0.4,
  hLineColor: (i: number) => (i <= 1 ? COLORS.primary : COLORS.border),
  vLineColor: () => COLORS.border,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
};

const formatNum = (val: number) =>
  val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ─── Company Header Builder ───
function buildCompanyHeader(settings: CompanySettings | null): Content[] {
  const parts: Content[] = [];

  // Company logo + name row
  const nameStack: Content[] = [
    { text: settings?.company_name || "النظام المحاسبي", style: "companyName", alignment: "center" },
  ];
  if (settings?.company_name_en) {
    nameStack.push({ text: settings.company_name_en, style: "companyNameEn", alignment: "center", margin: [0, 2, 0, 0] });
  }
  if (settings?.business_activity) {
    nameStack.push({ text: settings.business_activity, style: "subInfo", alignment: "center", margin: [0, 2, 0, 0] });
  }

  parts.push({ stack: nameStack, margin: [0, 0, 0, 4] });

  // Contact info line
  const infoParts: string[] = [];
  if (settings?.address) infoParts.push(settings.address);
  if (settings?.phone) infoParts.push(`هاتف: ${settings.phone}`);
  if (settings?.email) infoParts.push(settings.email);
  if (infoParts.length > 0) {
    parts.push({ text: infoParts.join("  ·  "), style: "info", alignment: "center", margin: [0, 0, 0, 2] });
  }

  // Tax/CR info
  const legalParts: string[] = [];
  if (settings?.tax_number) legalParts.push(`الرقم الضريبي: ${settings.tax_number}`);
  if (settings?.commercial_register) legalParts.push(`السجل التجاري: ${settings.commercial_register}`);
  if (legalParts.length > 0) {
    parts.push({ text: legalParts.join("  ·  "), style: "info", alignment: "center", margin: [0, 0, 0, 4] });
  }

  // Separator - double line
  const lineWidth = 515;
  parts.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: lineWidth, y2: 0, lineWidth: 2, lineColor: COLORS.primary },
      { type: "line", x1: 0, y1: 4, x2: lineWidth, y2: 4, lineWidth: 0.5, lineColor: COLORS.accent },
    ],
    margin: [0, 2, 0, 10],
  });

  return parts;
}

// ─── Footer Builder ───
function buildFooter(settings: CompanySettings | null) {
  return (currentPage: number, pageCount: number) => ({
    stack: [
      {
        canvas: [{ type: "line", x1: 30, y1: 0, x2: 565, y2: 0, lineWidth: 0.5, lineColor: COLORS.border }],
        margin: [0, 0, 0, 5] as [number, number, number, number],
      },
      {
        columns: [
          { text: settings?.invoice_footer || "", alignment: "center" as const, fontSize: 7, color: COLORS.textLight },
          { text: `صفحة ${currentPage} من ${pageCount}`, alignment: "center" as const, fontSize: 7, color: COLORS.textLight },
        ],
      },
    ],
    margin: [30, 5, 30, 0] as [number, number, number, number],
  });
}

// ═══════════════════════════════════════════
//  REPORT PDF EXPORT
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

  // Company header
  content.push(...buildCompanyHeader(settings));

  // Report title with date badge
  content.push({
    columns: [
      { text: "", width: "*" },
      {
        stack: [
          { text: title, style: "reportTitle", alignment: "center" },
          {
            text: `${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}  ·  العملة: ${settings?.default_currency || "EGP"}`,
            style: "info",
            alignment: "center",
            margin: [0, 3, 0, 0],
          },
        ],
        width: "auto",
      },
      { text: "", width: "*" },
    ],
    margin: [0, 0, 0, 12],
  });

  // Summary cards
  if (summaryCards && summaryCards.length > 0) {
    const cardCells: TableCell[] = summaryCards.map((card) => ({
      stack: [
        { text: card.value, style: "cardValue", alignment: "center" as const },
        { text: card.label, style: "cardLabel", alignment: "center" as const, margin: [0, 3, 0, 0] as [number, number, number, number] },
      ],
      fillColor: COLORS.cardBg,
      margin: [4, 8, 4, 8] as [number, number, number, number],
    }));

    content.push({
      table: {
        widths: summaryCards.map(() => "*"),
        body: [cardCells],
      },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0.8,
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 14] as [number, number, number, number],
    });
  }

  // Data table
  const headerRow: TableCell[] = headers.map((h) => ({
    text: h,
    style: "tableHeader",
    alignment: "center" as const,
    fillColor: COLORS.headerBg,
    color: COLORS.headerText,
  }));

  const bodyRows: TableCell[][] = rows.map((row, rowIdx) =>
    row.map((cell) => ({
      text: String(cell),
      style: "tableCell",
      alignment: "center" as const,
      fillColor: rowIdx % 2 === 0 ? COLORS.white : COLORS.rowAlt,
    }))
  );

  content.push({
    table: {
      headerRows: 1,
      widths: headers.map(() => "*"),
      body: [headerRow, ...bodyRows],
    },
    layout: TABLE_LAYOUT_CLEAN,
  });

  // Row count
  content.push({
    text: `إجمالي السجلات: ${rows.length}`,
    style: "info",
    alignment: "left",
    margin: [0, 6, 0, 0],
  });

  const docDefinition: TDocumentDefinitions = {
    pageOrientation: orientation,
    pageMargins: [30, 20, 30, 45],
    defaultStyle: { fontSize: 10, alignment: "right" },
    styles: BASE_STYLES,
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDefinition).download(`${filename}.pdf`);
}

// ═══════════════════════════════════════════
//  INVOICE PDF EXPORT (Professional - Odoo-style)
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

const typeLabels: Record<string, string> = {
  sales_invoice: "فاتورة مبيعات",
  purchase_invoice: "فاتورة مشتريات",
  sales_return: "مرتجع مبيعات",
  purchase_return: "مرتجع مشتريات",
};

const typeColors: Record<string, string> = {
  sales_invoice: COLORS.primary,
  purchase_invoice: "#7b2d8e",
  sales_return: "#c0392b",
  purchase_return: "#d35400",
};

export function exportInvoicePdf(options: InvoicePdfOptions) {
  const {
    type, number: num, date, partyName, partyLabel, reference, notes,
    items, subtotal, discountTotal, taxAmount = 0, taxRate = 0, grandTotal,
    showTax, showDiscount = true, settings, status, dueDate, paidAmount,
  } = options;

  const typeLabel = typeLabels[type] || type;
  const typeColor = typeColors[type] || COLORS.primary;
  const currency = settings?.default_currency || "EGP";
  const content: Content[] = [];

  // ─── Top Section: Company + Invoice Badge ───
  content.push({
    columns: [
      {
        width: "*",
        stack: [
          { text: settings?.company_name || "النظام المحاسبي", style: "companyName", alignment: "right" },
          ...(settings?.company_name_en ? [{ text: settings.company_name_en, style: "companyNameEn", alignment: "right" as const, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
          ...(settings?.business_activity ? [{ text: settings.business_activity, style: "subInfo", alignment: "right" as const, margin: [0, 2, 0, 0] as [number, number, number, number] }] : []),
          ...(settings?.address ? [{ text: settings.address, style: "subInfo", alignment: "right" as const }] : []),
          ...(settings?.phone ? [{ text: `هاتف: ${settings.phone}`, style: "subInfo", alignment: "right" as const }] : []),
        ],
      },
      {
        width: "auto",
        stack: [
          {
            table: {
              body: [[{
                stack: [
                  { text: typeLabel, fontSize: 16, bold: true, color: COLORS.white, alignment: "center" as const },
                  { text: `# ${num}`, fontSize: 12, color: COLORS.white, alignment: "center" as const, margin: [0, 3, 0, 0] as [number, number, number, number] },
                ],
                fillColor: typeColor,
                margin: [15, 10, 15, 10] as [number, number, number, number],
              }]],
            },
            layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
          },
          ...(status ? [{
            text: status === "posted" ? "✓ مُعتمد" : status === "draft" ? "مسودة" : status,
            fontSize: 9,
            bold: true,
            color: status === "posted" ? COLORS.success : COLORS.textLight,
            alignment: "center" as const,
            margin: [0, 4, 0, 0] as [number, number, number, number],
          }] : []),
        ],
      },
    ],
    margin: [0, 0, 0, 6],
  });

  // Separator
  content.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2.5, lineColor: typeColor },
      { type: "line", x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 0.5, lineColor: COLORS.accent },
    ],
    margin: [0, 0, 0, 14],
  });

  // ─── Invoice Details - Two Column Layout ───
  const rightDetails: Content[] = [
    { text: partyLabel, style: "sectionTitle", margin: [0, 0, 0, 4] as [number, number, number, number] },
    { text: partyName, fontSize: 13, bold: true, color: COLORS.dark, margin: [0, 0, 0, 8] as [number, number, number, number] },
  ];

  const leftDetails: Content[] = [
    { text: "بيانات الفاتورة", style: "sectionTitle", margin: [0, 0, 0, 4] as [number, number, number, number] },
  ];

  // Details table for clean alignment
  const detailRows: TableCell[][] = [
    [
      { text: "التاريخ", style: "detailLabel", alignment: "right" as const, border: [false, false, false, false] },
      { text: date, style: "detailText", alignment: "right" as const, border: [false, false, false, false] },
    ],
  ];
  if (dueDate) {
    detailRows.push([
      { text: "تاريخ الاستحقاق", style: "detailLabel", alignment: "right" as const, border: [false, false, false, false] },
      { text: dueDate, style: "detailText", alignment: "right" as const, border: [false, false, false, false] },
    ]);
  }
  if (reference) {
    detailRows.push([
      { text: "المرجع", style: "detailLabel", alignment: "right" as const, border: [false, false, false, false] },
      { text: reference, style: "detailText", alignment: "right" as const, border: [false, false, false, false] },
    ]);
  }

  leftDetails.push({
    table: { widths: [70, "*"], body: detailRows },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 2, paddingRight: () => 2, paddingTop: () => 2, paddingBottom: () => 2 },
  });

  // Tax info on right side
  if (settings?.tax_number) {
    rightDetails.push({ text: `الرقم الضريبي: ${settings.tax_number}`, style: "subInfo" });
  }

  content.push({
    columns: [
      {
        width: "*",
        stack: leftDetails,
        margin: [0, 0, 10, 0] as [number, number, number, number],
      },
      {
        width: "*",
        stack: rightDetails,
      },
    ],
    margin: [0, 0, 0, 16],
  });

  // ─── Items Table ───
  const tableHeaders: string[] = ["#", "الصنف", "الكمية", "سعر الوحدة"];
  if (showDiscount) tableHeaders.push("الخصم");
  tableHeaders.push("الإجمالي");

  const headerCells: TableCell[] = tableHeaders.map((h) => ({
    text: h,
    style: "tableHeader",
    alignment: "center" as const,
    fillColor: typeColor,
    color: COLORS.headerText,
    margin: [0, 2, 0, 2] as [number, number, number, number],
  }));

  const itemRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1), alignment: "center" as const, style: "tableCell", fillColor: idx % 2 === 0 ? COLORS.white : COLORS.rowAlt },
      { text: item.name, alignment: "right" as const, style: "tableCell", fillColor: idx % 2 === 0 ? COLORS.white : COLORS.rowAlt },
      { text: String(item.quantity), alignment: "center" as const, style: "tableCell", fillColor: idx % 2 === 0 ? COLORS.white : COLORS.rowAlt },
      { text: formatNum(item.unitPrice), alignment: "center" as const, style: "tableCell", fillColor: idx % 2 === 0 ? COLORS.white : COLORS.rowAlt },
    ];
    if (showDiscount) {
      row.push({ text: formatNum(item.discount), alignment: "center" as const, style: "tableCell", fillColor: idx % 2 === 0 ? COLORS.white : COLORS.rowAlt });
    }
    row.push({
      text: formatNum(item.total),
      alignment: "center" as const,
      style: "tableCell",
      bold: true,
      fillColor: idx % 2 === 0 ? COLORS.white : COLORS.rowAlt,
    });
    return row;
  });

  const tWidths = showDiscount ? [25, "*", 50, 75, 60, 85] : [25, "*", 55, 80, 90];

  content.push({
    table: {
      headerRows: 1,
      widths: tWidths,
      body: [headerCells, ...itemRows],
    },
    layout: {
      ...TABLE_LAYOUT_CLEAN,
      hLineColor: (i: number) => (i <= 1 ? typeColor : COLORS.border),
    },
    margin: [0, 0, 0, 14],
  });

  // ─── Totals Section (Right-aligned box) ───
  const totalsBody: TableCell[][] = [];

  totalsBody.push([
    { text: "الإجمالي الفرعي", style: "totalLabel", alignment: "right" as const, border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
    { text: `${formatNum(subtotal)} ${currency}`, style: "totalValue", alignment: "left" as const, border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
  ]);

  if (showDiscount && discountTotal && discountTotal > 0) {
    totalsBody.push([
      { text: "الخصم", style: "totalLabel", alignment: "right" as const, color: "#c0392b", border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
      { text: `- ${formatNum(discountTotal)} ${currency}`, style: "totalValue", alignment: "left" as const, color: "#c0392b", border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
    ]);
  }

  if (showTax && taxRate > 0) {
    totalsBody.push([
      { text: `ضريبة القيمة المضافة (${taxRate}%)`, style: "totalLabel", alignment: "right" as const, border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
      { text: `${formatNum(taxAmount)} ${currency}`, style: "totalValue", alignment: "left" as const, border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
    ]);
  }

  // Grand total row
  totalsBody.push([
    { text: "الإجمالي المستحق", style: "grandTotalLabel", alignment: "right" as const, fillColor: typeColor, color: COLORS.white, margin: [0, 4, 0, 4] as [number, number, number, number], border: [false, false, false, false] },
    { text: `${formatNum(grandTotal)} ${currency}`, style: "grandTotalValue", alignment: "left" as const, fillColor: typeColor, color: COLORS.white, margin: [0, 4, 0, 4] as [number, number, number, number], border: [false, false, false, false] },
  ]);

  // Paid amount & balance
  if (paidAmount !== undefined && paidAmount > 0) {
    totalsBody.push([
      { text: "المبلغ المدفوع", style: "totalLabel", alignment: "right" as const, color: COLORS.success, border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
      { text: `${formatNum(paidAmount)} ${currency}`, style: "totalValue", alignment: "left" as const, color: COLORS.success, border: [false, false, false, true], borderColor: [COLORS.border, COLORS.border, COLORS.border, COLORS.border] },
    ]);
    const balance = grandTotal - paidAmount;
    if (balance > 0) {
      totalsBody.push([
        { text: "المتبقي", style: "totalLabel", alignment: "right" as const, color: "#c0392b", bold: true, border: [false, false, false, false] },
        { text: `${formatNum(balance)} ${currency}`, style: "totalValue", alignment: "left" as const, color: "#c0392b", bold: true, border: [false, false, false, false] },
      ]);
    }
  }

  content.push({
    columns: [
      { width: "*", text: "" },
      {
        width: 260,
        table: {
          widths: ["*", "auto"],
          body: totalsBody,
        },
        layout: {
          hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
          vLineWidth: () => 0,
          hLineColor: () => COLORS.border,
          paddingLeft: () => 10,
          paddingRight: () => 10,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
    ],
    margin: [0, 0, 0, 16],
  });

  // ─── Notes Section ───
  if (notes) {
    content.push({
      table: {
        widths: ["*"],
        body: [[
          {
            stack: [
              { text: "ملاحظات", style: "sectionTitle", margin: [0, 0, 0, 4] as [number, number, number, number] },
              { text: notes, style: "noteText" },
            ],
            fillColor: COLORS.cardBg,
            margin: [8, 8, 8, 8] as [number, number, number, number],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => COLORS.border,
        vLineColor: () => COLORS.border,
      },
      margin: [0, 0, 0, 10],
    });
  }

  // ─── Invoice Footer / Terms ───
  if (settings?.invoice_notes) {
    content.push({
      text: settings.invoice_notes,
      style: "info",
      alignment: "center",
      margin: [0, 10, 0, 0],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageMargins: [30, 20, 30, 45],
    defaultStyle: { fontSize: 10, alignment: "right" },
    styles: BASE_STYLES,
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDefinition).download(`${typeLabel}-${num}.pdf`);
}
