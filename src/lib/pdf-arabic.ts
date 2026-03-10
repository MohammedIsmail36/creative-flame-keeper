import pdfMake from "pdfmake-rtl/build/pdfmake";
import "pdfmake-rtl/build/vfs_fonts";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

// ─── Premium Color Palette ───
const COLORS = {
  primary: "#1a3353",
  primaryMid: "#2a5580",
  primaryLight: "#3a7ab5",
  accent: "#c8973e",
  accentLight: "#e8c76e",
  dark: "#0f1b2d",
  text: "#1e293b",
  textMedium: "#475569",
  textLight: "#94a3b8",
  border: "#e2e8f0",
  borderLight: "#f1f5f9",
  headerBg: "#1a3353",
  headerText: "#ffffff",
  rowAlt: "#f8fafc",
  white: "#ffffff",
  success: "#059669",
  successLight: "#d1fae5",
  danger: "#dc2626",
  dangerLight: "#fee2e2",
  warning: "#d97706",
  cardBg: "#f0f4f8",
  cardBorder: "#cbd5e1",
  separator: "#1a3353",
  gold: "#b8860b",
  lightGray: "#f8fafc",
};

// ─── Professional Styles ───
const BASE_STYLES = {
  companyName: { fontSize: 22, bold: true, color: COLORS.primary, characterSpacing: 0.5 },
  companyNameEn: { fontSize: 11, color: COLORS.textMedium, characterSpacing: 0.3 },
  subInfo: { fontSize: 8.5, color: COLORS.textLight, lineHeight: 1.5 },
  reportTitle: { fontSize: 18, bold: true, color: COLORS.dark, characterSpacing: 0.3 },
  reportSubtitle: { fontSize: 10, color: COLORS.textMedium },
  info: { fontSize: 8.5, color: COLORS.textLight },
  cardValue: { fontSize: 15, bold: true, color: COLORS.primary },
  cardLabel: { fontSize: 8.5, color: COLORS.textMedium },
  tableHeader: { fontSize: 8.5, bold: true, color: COLORS.headerText },
  tableCell: { fontSize: 8.5, color: COLORS.text },
  tableCellBold: { fontSize: 8.5, bold: true, color: COLORS.text },
  detailText: { fontSize: 9.5, color: COLORS.text, lineHeight: 1.6 },
  detailLabel: { fontSize: 9.5, bold: true, color: COLORS.primary },
  totalLabel: { fontSize: 9.5, color: COLORS.text },
  totalValue: { fontSize: 9.5, bold: true, color: COLORS.text },
  grandTotalLabel: { fontSize: 12, bold: true, color: COLORS.white },
  grandTotalValue: { fontSize: 13, bold: true, color: COLORS.white },
  invoiceTitle: { fontSize: 20, bold: true, color: COLORS.primary },
  invoiceNumber: { fontSize: 14, color: COLORS.textMedium, bold: true },
  sectionTitle: { fontSize: 11, bold: true, color: COLORS.primary },
  noteText: { fontSize: 8.5, color: COLORS.textMedium, italics: true, lineHeight: 1.5 },
  footerText: { fontSize: 7, color: COLORS.textLight },
  legalText: { fontSize: 7.5, color: COLORS.textMedium },
};

// ─── Professional Table Layout ───
const TABLE_LAYOUT_PROFESSIONAL = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0) return 0;
    if (i === 1) return 1.5;
    if (i === node.table.body.length) return 1.5;
    return 0.5;
  },
  vLineWidth: () => 0,
  hLineColor: (i: number, node: any) => {
    if (i === 1) return COLORS.primary;
    if (i === node.table.body.length) return COLORS.primary;
    return COLORS.borderLight;
  },
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 7,
  paddingBottom: () => 7,
  fillColor: (rowIndex: number) => {
    if (rowIndex === 0) return COLORS.headerBg;
    return rowIndex % 2 === 0 ? COLORS.white : COLORS.rowAlt;
  },
};

const TABLE_LAYOUT_INVOICE_ITEMS = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0) return 0;
    if (i === 1) return 2;
    if (i === node.table.body.length) return 2;
    return 0.3;
  },
  vLineWidth: (i: number, node: any) => {
    if (i === 0 || i === node.table.widths.length) return 0;
    return 0.3;
  },
  hLineColor: (i: number, node: any) => {
    if (i === 1 || i === node.table.body.length) return COLORS.primary;
    return COLORS.border;
  },
  vLineColor: () => COLORS.border,
  paddingLeft: () => 8,
  paddingRight: () => 8,
  paddingTop: () => 6,
  paddingBottom: () => 6,
  fillColor: (rowIndex: number) => {
    if (rowIndex === 0) return COLORS.headerBg;
    return rowIndex % 2 === 0 ? COLORS.white : COLORS.lightGray;
  },
};

const formatNum = (val: number) =>
  val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ═══════════════════════════════════════════
//  PROFESSIONAL COMPANY HEADER
// ═══════════════════════════════════════════

function buildCompanyHeader(settings: CompanySettings | null, pageWidth: number): Content[] {
  const parts: Content[] = [];

  // Top gold accent line
  parts.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: pageWidth, y2: 0, lineWidth: 3, lineColor: COLORS.accent },
    ],
    margin: [0, 0, 0, 12],
  });

  // Company info block
  const nameStack: Content[] = [
    { text: settings?.company_name || "النظام المحاسبي", style: "companyName", alignment: "center" },
  ];
  if (settings?.company_name_en) {
    nameStack.push({
      text: settings.company_name_en,
      style: "companyNameEn",
      alignment: "center",
      margin: [0, 3, 0, 0],
    });
  }
  if (settings?.business_activity) {
    nameStack.push({
      text: settings.business_activity,
      fontSize: 9,
      color: COLORS.textMedium,
      alignment: "center",
      margin: [0, 2, 0, 0],
    });
  }
  parts.push({ stack: nameStack, margin: [0, 0, 0, 6] });

  // Contact + Legal in a single centered line
  const infoParts: string[] = [];
  if (settings?.address) infoParts.push(settings.address);
  if (settings?.phone) infoParts.push(`هاتف: ${settings.phone}`);
  if (settings?.email) infoParts.push(settings.email);
  if (settings?.website) infoParts.push(settings.website);

  if (infoParts.length > 0) {
    parts.push({
      text: infoParts.join("  |  "),
      fontSize: 8,
      color: COLORS.textLight,
      alignment: "center",
      margin: [0, 0, 0, 3],
    });
  }

  const legalParts: string[] = [];
  if (settings?.tax_number) legalParts.push(`الرقم الضريبي: ${settings.tax_number}`);
  if (settings?.commercial_register) legalParts.push(`السجل التجاري: ${settings.commercial_register}`);
  if (legalParts.length > 0) {
    parts.push({
      text: legalParts.join("    |    "),
      fontSize: 8,
      color: COLORS.textMedium,
      bold: true,
      alignment: "center",
      margin: [0, 0, 0, 6],
    });
  }

  // Double separator: thick primary + thin accent
  parts.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: pageWidth, y2: 0, lineWidth: 2, lineColor: COLORS.primary },
      { type: "line", x1: 0, y1: 5, x2: pageWidth, y2: 5, lineWidth: 0.8, lineColor: COLORS.accent },
    ],
    margin: [0, 0, 0, 14],
  });

  return parts;
}

// ═══════════════════════════════════════════
//  PROFESSIONAL FOOTER
// ═══════════════════════════════════════════

function buildFooter(settings: CompanySettings | null) {
  return (currentPage: number, pageCount: number) => ({
    stack: [
      {
        canvas: [
          { type: "line", x1: 30, y1: 0, x2: 565, y2: 0, lineWidth: 0.8, lineColor: COLORS.accent },
        ],
        margin: [0, 0, 0, 6] as [number, number, number, number],
      },
      {
        columns: [
          {
            text: `صفحة ${currentPage} من ${pageCount}`,
            alignment: "left" as const,
            style: "footerText",
          },
          {
            text: settings?.invoice_footer || "",
            alignment: "center" as const,
            style: "footerText",
          },
          {
            text: new Date().toLocaleDateString("ar-EG", {
              year: "numeric",
              month: "short",
              day: "numeric",
            }),
            alignment: "right" as const,
            style: "footerText",
          },
        ],
      },
    ],
    margin: [30, 5, 30, 0] as [number, number, number, number],
  });
}

// ═══════════════════════════════════════════
//  REPORT PDF EXPORT (Professional)
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

  // ─── Company Header ───
  content.push(...buildCompanyHeader(settings, pageWidth));

  // ─── Report Title Block ───
  content.push({
    table: {
      widths: ["*"],
      body: [[
        {
          stack: [
            { text: title, style: "reportTitle", alignment: "center" },
            {
              text: `${new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}  ·  العملة: ${currency}`,
              style: "reportSubtitle",
              alignment: "center",
              margin: [0, 4, 0, 0],
            },
          ],
          margin: [0, 10, 0, 10] as [number, number, number, number],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => COLORS.lightGray,
    },
    margin: [0, 0, 0, 16] as [number, number, number, number],
  });

  // ─── Summary Cards (KPIs) ───
  if (summaryCards && summaryCards.length > 0) {
    const cardCells: TableCell[] = summaryCards.map((card) => ({
      stack: [
        { text: card.value, style: "cardValue", alignment: "center" as const },
        {
          canvas: [
            { type: "line", x1: 10, y1: 0, x2: 60, y2: 0, lineWidth: 1.5, lineColor: COLORS.accent },
          ],
          alignment: "center" as const,
          margin: [0, 4, 0, 4] as [number, number, number, number],
        },
        { text: card.label, style: "cardLabel", alignment: "center" as const },
      ],
      margin: [6, 10, 6, 10] as [number, number, number, number],
    }));

    content.push({
      table: {
        widths: summaryCards.map(() => "*"),
        body: [cardCells],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => COLORS.cardBorder,
        vLineColor: () => COLORS.cardBorder,
        fillColor: () => COLORS.white,
        paddingLeft: () => 4,
        paddingRight: () => 4,
        paddingTop: () => 2,
        paddingBottom: () => 2,
      },
      margin: [0, 0, 0, 16] as [number, number, number, number],
    });
  }

  // ─── Data Table ───
  const headerRow: TableCell[] = headers.map((h) => ({
    text: h,
    style: "tableHeader",
    alignment: "center" as const,
  }));

  const bodyRows: TableCell[][] = rows.map((row) =>
    row.map((cell, colIdx) => ({
      text: String(cell),
      style: "tableCell",
      alignment: colIdx === 0 ? ("center" as const) : ("center" as const),
    }))
  );

  content.push({
    table: {
      headerRows: 1,
      widths: headers.map(() => "*"),
      body: [headerRow, ...bodyRows],
    },
    layout: TABLE_LAYOUT_PROFESSIONAL,
  });

  // ─── Record Count Badge ───
  content.push({
    table: {
      widths: ["auto"],
      body: [[
        {
          text: `  إجمالي السجلات: ${rows.length}  `,
          fontSize: 8,
          color: COLORS.textMedium,
          bold: true,
          margin: [6, 3, 6, 3] as [number, number, number, number],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border,
      fillColor: () => COLORS.lightGray,
    },
    margin: [0, 8, 0, 0] as [number, number, number, number],
  });

  const docDefinition: TDocumentDefinitions = {
    pageOrientation: orientation,
    pageMargins: [30, 20, 30, 50],
    defaultStyle: { fontSize: 10, alignment: "right" },
    styles: BASE_STYLES,
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDefinition).download(`${filename}.pdf`);
}

// ═══════════════════════════════════════════
//  INVOICE PDF EXPORT (Odoo-Professional Style)
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
  sales_invoice: "#1a3353",
  purchase_invoice: "#5b2c6f",
  sales_return: "#922b21",
  purchase_return: "#b9770e",
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

  // ─── Top Accent Bar ───
  content.push({
    canvas: [
      { type: "rect", x: 0, y: 0, w: 515, h: 5, color: typeColor },
      { type: "rect", x: 0, y: 5, w: 515, h: 2, color: COLORS.accent },
    ],
    margin: [0, 0, 0, 16],
  });

  // ─── Header: Company Info (Right) + Invoice Badge (Left) ───
  const companyStack: Content[] = [
    { text: settings?.company_name || "النظام المحاسبي", fontSize: 20, bold: true, color: COLORS.primary, alignment: "right" as const },
  ];
  if (settings?.company_name_en) {
    companyStack.push({ text: settings.company_name_en, fontSize: 10, color: COLORS.textMedium, alignment: "right" as const, margin: [0, 2, 0, 0] as [number, number, number, number] });
  }
  if (settings?.business_activity) {
    companyStack.push({ text: settings.business_activity, fontSize: 8.5, color: COLORS.textLight, alignment: "right" as const, margin: [0, 2, 0, 0] as [number, number, number, number] });
  }

  const companyDetails: string[] = [];
  if (settings?.address) companyDetails.push(settings.address);
  if (settings?.phone) companyDetails.push(`هاتف: ${settings.phone}`);
  if (settings?.email) companyDetails.push(settings.email);
  if (companyDetails.length > 0) {
    companyStack.push({
      text: companyDetails.join("\n"),
      fontSize: 8,
      color: COLORS.textLight,
      alignment: "right" as const,
      lineHeight: 1.4,
      margin: [0, 6, 0, 0] as [number, number, number, number],
    });
  }

  // Invoice badge - professional card
  const badgeStack: Content[] = [
    {
      table: {
        widths: ["*"],
        body: [[
          {
            stack: [
              { text: typeLabel, fontSize: 18, bold: true, color: COLORS.white, alignment: "center" as const },
              {
                canvas: [
                  { type: "line", x1: 30, y1: 0, x2: 120, y2: 0, lineWidth: 1, lineColor: COLORS.accentLight },
                ],
                alignment: "center" as const,
                margin: [0, 5, 0, 5] as [number, number, number, number],
              },
              { text: `# ${num}`, fontSize: 14, color: COLORS.accentLight, alignment: "center" as const, bold: true },
            ],
            fillColor: typeColor,
            margin: [20, 14, 20, 14] as [number, number, number, number],
          },
        ]],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
    },
  ];

  // Status badge
  if (status) {
    const statusConfig = status === "posted"
      ? { text: "✓ مُعتمد", color: COLORS.success, bg: COLORS.successLight }
      : status === "draft"
        ? { text: "● مسودة", color: COLORS.warning, bg: "#fef3c7" }
        : { text: status, color: COLORS.textMedium, bg: COLORS.lightGray };

    badgeStack.push({
      table: {
        widths: ["*"],
        body: [[
          {
            text: statusConfig.text,
            fontSize: 9,
            bold: true,
            color: statusConfig.color,
            alignment: "center" as const,
            fillColor: statusConfig.bg,
            margin: [8, 4, 8, 4] as [number, number, number, number],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => statusConfig.color,
        vLineColor: () => statusConfig.color,
      },
      margin: [20, 6, 20, 0] as [number, number, number, number],
    });
  }

  content.push({
    columns: [
      { width: "*", stack: companyStack },
      { width: 190, stack: badgeStack },
    ],
    margin: [0, 0, 0, 8],
  });

  // ─── Separator ───
  content.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1.5, lineColor: typeColor },
    ],
    margin: [0, 4, 0, 16],
  });

  // ─── Two Column Details Section ───
  // Right: Customer/Supplier card
  const partyCard: Content = {
    table: {
      widths: ["*"],
      body: [[
        {
          stack: [
            { text: partyLabel, fontSize: 9, color: COLORS.textLight, margin: [0, 0, 0, 4] as [number, number, number, number] },
            { text: partyName, fontSize: 14, bold: true, color: COLORS.dark, margin: [0, 0, 0, 6] as [number, number, number, number] },
            ...(settings?.tax_number ? [{
              text: `الرقم الضريبي: ${settings.tax_number}`,
              fontSize: 8,
              color: COLORS.textMedium,
            }] : []),
          ],
          margin: [12, 10, 12, 10] as [number, number, number, number],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border,
      fillColor: () => COLORS.lightGray,
    },
  };

  // Left: Invoice details grid
  const detailPairs: { label: string; value: string }[] = [
    { label: "التاريخ", value: date },
  ];
  if (dueDate) detailPairs.push({ label: "تاريخ الاستحقاق", value: dueDate });
  if (reference) detailPairs.push({ label: "المرجع", value: reference });
  detailPairs.push({ label: "العملة", value: currency });

  const detailTableBody: TableCell[][] = detailPairs.map((d) => [
    { text: d.value, fontSize: 9, color: COLORS.text, alignment: "left" as const, border: [false, false, false, true], borderColor: [COLORS.borderLight, COLORS.borderLight, COLORS.borderLight, COLORS.borderLight] },
    { text: d.label, fontSize: 9, bold: true, color: COLORS.primary, alignment: "right" as const, border: [false, false, false, true], borderColor: [COLORS.borderLight, COLORS.borderLight, COLORS.borderLight, COLORS.borderLight] },
  ]);

  const detailCard: Content = {
    table: {
      widths: ["*"],
      body: [[
        {
          stack: [
            { text: "بيانات الفاتورة", style: "sectionTitle", margin: [0, 0, 0, 8] as [number, number, number, number] },
            {
              table: {
                widths: ["*", 90],
                body: detailTableBody,
              },
              layout: {
                hLineWidth: (i: number) => (i === 0 ? 0 : 0.5),
                vLineWidth: () => 0,
                hLineColor: () => COLORS.borderLight,
                paddingLeft: () => 4,
                paddingRight: () => 4,
                paddingTop: () => 5,
                paddingBottom: () => 5,
              },
            },
          ],
          margin: [12, 10, 12, 10] as [number, number, number, number],
        },
      ]],
    },
    layout: {
      hLineWidth: () => 1,
      vLineWidth: () => 1,
      hLineColor: () => COLORS.border,
      vLineColor: () => COLORS.border,
      fillColor: () => COLORS.white,
    },
  };

  content.push({
    columns: [
      { width: "48%", stack: [detailCard] },
      { width: "4%", text: "" },
      { width: "48%", stack: [partyCard] },
    ],
    margin: [0, 0, 0, 18],
  });

  // ─── Items Table (Professional) ───
  content.push({
    text: "بيان الأصناف",
    style: "sectionTitle",
    margin: [0, 0, 0, 8],
  });

  const tableHeaders: string[] = ["#", "الصنف", "الكمية", "سعر الوحدة"];
  if (showDiscount) tableHeaders.push("الخصم");
  tableHeaders.push("الإجمالي");

  const headerCells: TableCell[] = tableHeaders.map((h) => ({
    text: h,
    style: "tableHeader",
    alignment: "center" as const,
  }));

  const itemRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1), alignment: "center" as const, style: "tableCell" },
      { text: item.name, alignment: "right" as const, style: "tableCell" },
      { text: String(item.quantity), alignment: "center" as const, style: "tableCell" },
      { text: formatNum(item.unitPrice), alignment: "center" as const, style: "tableCell" },
    ];
    if (showDiscount) {
      row.push({ text: formatNum(item.discount), alignment: "center" as const, style: "tableCell" });
    }
    row.push({
      text: formatNum(item.total),
      alignment: "center" as const,
      style: "tableCellBold",
    });
    return row;
  });

  const tWidths = showDiscount ? [28, "*", 50, 75, 55, 85] : [28, "*", 55, 80, 90];

  content.push({
    table: {
      headerRows: 1,
      widths: tWidths,
      body: [headerCells, ...itemRows],
    },
    layout: TABLE_LAYOUT_INVOICE_ITEMS,
    margin: [0, 0, 0, 18],
  });

  // ─── Totals Section (Aligned right, professional box) ───
  const totalsBody: TableCell[][] = [];

  // Subtotal
  totalsBody.push([
    { text: "الإجمالي الفرعي", fontSize: 9.5, color: COLORS.textMedium, alignment: "right" as const },
    { text: `${formatNum(subtotal)} ${currency}`, fontSize: 9.5, bold: true, color: COLORS.text, alignment: "left" as const },
  ]);

  // Discount
  if (showDiscount && discountTotal && discountTotal > 0) {
    totalsBody.push([
      { text: "إجمالي الخصم", fontSize: 9.5, color: COLORS.danger, alignment: "right" as const },
      { text: `- ${formatNum(discountTotal)} ${currency}`, fontSize: 9.5, bold: true, color: COLORS.danger, alignment: "left" as const },
    ]);
  }

  // Tax
  if (showTax && taxRate > 0) {
    totalsBody.push([
      { text: `ضريبة القيمة المضافة (${taxRate}%)`, fontSize: 9.5, color: COLORS.textMedium, alignment: "right" as const },
      { text: `${formatNum(taxAmount)} ${currency}`, fontSize: 9.5, bold: true, color: COLORS.text, alignment: "left" as const },
    ]);
  }

  // Grand Total (highlighted row)
  totalsBody.push([
    { text: "الإجمالي المستحق", style: "grandTotalLabel", alignment: "right" as const, fillColor: typeColor, margin: [0, 6, 0, 6] as [number, number, number, number] },
    { text: `${formatNum(grandTotal)} ${currency}`, style: "grandTotalValue", alignment: "left" as const, fillColor: typeColor, margin: [0, 6, 0, 6] as [number, number, number, number] },
  ]);

  // Paid amount
  if (paidAmount !== undefined && paidAmount > 0) {
    totalsBody.push([
      { text: "المبلغ المدفوع", fontSize: 9.5, color: COLORS.success, bold: true, alignment: "right" as const },
      { text: `${formatNum(paidAmount)} ${currency}`, fontSize: 9.5, bold: true, color: COLORS.success, alignment: "left" as const },
    ]);
    const balance = grandTotal - paidAmount;
    if (balance > 0) {
      totalsBody.push([
        { text: "المتبقي", fontSize: 10, bold: true, color: COLORS.danger, alignment: "right" as const },
        { text: `${formatNum(balance)} ${currency}`, fontSize: 10, bold: true, color: COLORS.danger, alignment: "left" as const },
      ]);
    }
  }

  content.push({
    columns: [
      { width: "*", text: "" },
      {
        width: 270,
        table: {
          widths: ["*", 120],
          body: totalsBody,
        },
        layout: {
          hLineWidth: (i: number, node: any) => {
            if (i === 0) return 0;
            return 0.5;
          },
          vLineWidth: () => 0,
          hLineColor: () => COLORS.border,
          paddingLeft: () => 12,
          paddingRight: () => 12,
          paddingTop: () => 6,
          paddingBottom: () => 6,
        },
      },
    ],
    margin: [0, 0, 0, 18],
  });

  // ─── Notes Section ───
  if (notes) {
    content.push({
      table: {
        widths: ["*"],
        body: [[
          {
            stack: [
              {
                columns: [
                  { text: "", width: "*" },
                  {
                    text: "ملاحظات",
                    style: "sectionTitle",
                    width: "auto",
                  },
                ],
                margin: [0, 0, 0, 6] as [number, number, number, number],
              },
              { text: notes, style: "noteText" },
            ],
            margin: [12, 10, 12, 10] as [number, number, number, number],
          },
        ]],
      },
      layout: {
        hLineWidth: () => 0.8,
        vLineWidth: () => 0,
        hLineColor: () => COLORS.border,
        fillColor: () => COLORS.lightGray,
      },
      margin: [0, 0, 0, 12],
    });
  }

  // ─── Invoice Footer / Terms ───
  if (settings?.invoice_notes) {
    content.push({
      text: settings.invoice_notes,
      style: "legalText",
      alignment: "center",
      margin: [0, 8, 0, 0],
    });
  }

  // ─── Bottom accent bar ───
  content.push({
    canvas: [
      { type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.8, lineColor: COLORS.accent },
      { type: "rect", x: 200, y: 4, w: 115, h: 2, color: typeColor },
    ],
    margin: [0, 12, 0, 0],
  });

  const docDefinition: TDocumentDefinitions = {
    pageMargins: [30, 20, 30, 50],
    defaultStyle: { fontSize: 10, alignment: "right" },
    styles: BASE_STYLES,
    content,
    footer: buildFooter(settings),
  };

  pdfMake.createPdf(docDefinition).download(`${typeLabel}-${num}.pdf`);
}
