import pdfMake from "pdfmake/build/pdfmake";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

let fontsConfigured = false;

function configureFonts() {
  if (fontsConfigured) return;
  pdfMake.fonts = {
    Amiri: {
      normal: window.location.origin + "/fonts/Amiri-Regular.ttf",
      bold: window.location.origin + "/fonts/Amiri-Bold.ttf",
      italics: window.location.origin + "/fonts/Amiri-Regular.ttf",
      bolditalics: window.location.origin + "/fonts/Amiri-Bold.ttf",
    },
  };
  fontsConfigured = true;
}

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
  title,
  settings,
  headers,
  rows,
  summaryCards,
  orientation = "portrait",
  filename,
}: ReportPdfOptions) {
  configureFonts();

  const content: Content[] = [];

  // === Company Header ===
  content.push({
    text: settings?.company_name || "النظام المحاسبي",
    style: "companyName",
    alignment: "center",
    margin: [0, 0, 0, 4],
  });

  if (settings?.business_activity) {
    content.push({
      text: settings.business_activity,
      style: "subHeader",
      alignment: "center",
      margin: [0, 0, 0, 3],
    });
  }

  const infoParts: string[] = [];
  if (settings?.phone) infoParts.push(`هاتف: ${settings.phone}`);
  if (settings?.tax_number) infoParts.push(`الرقم الضريبي: ${settings.tax_number}`);
  if (infoParts.length > 0) {
    content.push({
      text: infoParts.join("  |  "),
      style: "info",
      alignment: "center",
      margin: [0, 0, 0, 6],
    });
  }

  // Separator
  content.push({
    canvas: [
      {
        type: "line",
        x1: 0,
        y1: 0,
        x2: orientation === "landscape" ? 770 : 515,
        y2: 0,
        lineWidth: 1,
        lineColor: "#1e40af",
      },
    ],
    margin: [0, 2, 0, 8],
  });

  // Report title
  content.push({
    text: title,
    style: "reportTitle",
    alignment: "center",
    margin: [0, 0, 0, 3],
  });

  // Date & currency
  content.push({
    text: `التاريخ: ${new Date().toLocaleDateString("ar-EG")}  |  العملة: ${settings?.default_currency || "EGP"}`,
    style: "info",
    alignment: "center",
    margin: [0, 0, 0, 10],
  });

  // === Summary Cards ===
  if (summaryCards && summaryCards.length > 0) {
    const cardCells: TableCell[] = summaryCards.map((card) => ({
      stack: [
        { text: card.value, style: "cardValue", alignment: "center" as const },
        { text: card.label, style: "cardLabel", alignment: "center" as const },
      ],
      fillColor: "#f0f4ff",
      margin: [4, 6, 4, 6] as [number, number, number, number],
    }));

    content.push({
      table: {
        widths: summaryCards.map(() => "*"),
        body: [cardCells],
      },
      layout: {
        hLineWidth: () => 0.5,
        vLineWidth: () => 0.5,
        hLineColor: () => "#cbd5e1",
        vLineColor: () => "#cbd5e1",
        paddingLeft: () => 6,
        paddingRight: () => 6,
        paddingTop: () => 4,
        paddingBottom: () => 4,
      },
      margin: [0, 0, 0, 12] as [number, number, number, number],
    });
  }

  // === Data Table ===
  const colCount = headers.length;
  const widths = headers.map(() => "*");

  // Header row
  const headerRow: TableCell[] = headers.map((h) => ({
    text: h,
    style: "tableHeader",
    alignment: "center" as const,
    fillColor: "#1e3a8a",
    color: "#ffffff",
  }));

  // Data rows
  const bodyRows: TableCell[][] = rows.map((row, rowIdx) =>
    row.map((cell) => ({
      text: String(cell),
      style: "tableCell",
      alignment: "center" as const,
      fillColor: rowIdx % 2 === 0 ? "#ffffff" : "#f8fafc",
    }))
  );

  content.push({
    table: {
      headerRows: 1,
      widths,
      body: [headerRow, ...bodyRows],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? "#1e3a8a" : "#e2e8f0"),
      vLineColor: () => "#e2e8f0",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  });

  // === Document Definition ===
  const docDefinition: TDocumentDefinitions = {
    pageOrientation: orientation,
    pageMargins: [30, 20, 30, 40],
    defaultStyle: {
      font: "Amiri",
      fontSize: 10,
      alignment: "right",
    },
    styles: {
      companyName: { fontSize: 18, bold: true, color: "#1e3a8a" },
      subHeader: { fontSize: 11, color: "#475569" },
      info: { fontSize: 9, color: "#64748b" },
      reportTitle: { fontSize: 15, bold: true, color: "#0f172a" },
      cardValue: { fontSize: 13, bold: true, color: "#1e3a8a" },
      cardLabel: { fontSize: 9, color: "#64748b" },
      tableHeader: { fontSize: 10, bold: true, color: "#ffffff" },
      tableCell: { fontSize: 9, color: "#1e293b" },
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: settings?.invoice_footer || "",
          alignment: "center",
          fontSize: 8,
          color: "#94a3b8",
          margin: [30, 0, 0, 0],
        },
        {
          text: `صفحة ${currentPage} من ${pageCount}`,
          alignment: "center",
          fontSize: 8,
          color: "#94a3b8",
          margin: [0, 0, 30, 0],
        },
      ],
      margin: [30, 10, 30, 0] as [number, number, number, number],
    }),
  };

  pdfMake.createPdf(docDefinition).download(`${filename}.pdf`);
}

/**
 * Generate a professional invoice/return PDF
 */
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
  taxAmount?: number;
  taxRate?: number;
  grandTotal: number;
  showTax?: boolean;
  showDiscount?: boolean;
  settings: CompanySettings | null;
  status?: string;
}

const typeLabels: Record<string, string> = {
  sales_invoice: "فاتورة مبيعات",
  purchase_invoice: "فاتورة مشتريات",
  sales_return: "مرتجع مبيعات",
  purchase_return: "مرتجع مشتريات",
};

export function exportInvoicePdf(options: InvoicePdfOptions) {
  configureFonts();
  const {
    type, number: num, date, partyName, partyLabel, reference, notes,
    items, subtotal, taxAmount = 0, taxRate = 0, grandTotal,
    showTax, showDiscount = true, settings, status,
  } = options;

  const typeLabel = typeLabels[type] || type;
  const content: Content[] = [];

  // Header section with company info
  content.push({
    columns: [
      {
        width: "*",
        stack: [
          { text: settings?.company_name || "النظام المحاسبي", style: "companyName", alignment: "right" },
          ...(settings?.business_activity ? [{ text: settings.business_activity, style: "subInfo", alignment: "right" as const }] : []),
          ...(settings?.address ? [{ text: settings.address, style: "subInfo", alignment: "right" as const }] : []),
        ],
      },
      {
        width: "auto",
        stack: [
          { text: typeLabel, style: "invoiceTitle", alignment: "left" },
          { text: `# ${num}`, style: "invoiceNumber", alignment: "left" },
          ...(status ? [{ text: status === "posted" ? "مُرحّل" : status === "draft" ? "مسودة" : status, style: "statusBadge", alignment: "left" as const }] : []),
        ],
      },
    ],
    margin: [0, 0, 0, 8],
  });

  // Blue separator
  content.push({
    canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: "#1e40af" }],
    margin: [0, 0, 0, 12],
  });

  // Invoice details
  const detailsLeft: Content[] = [];
  const detailsRight: Content[] = [
    { text: [{ text: `${partyLabel}: `, bold: true }, partyName], style: "detailText" },
    { text: [{ text: "التاريخ: ", bold: true }, date], style: "detailText" },
  ];
  if (reference) detailsRight.push({ text: [{ text: "المرجع: ", bold: true }, reference], style: "detailText" });

  if (settings?.phone) detailsLeft.push({ text: [{ text: "هاتف: ", bold: true }, settings.phone], style: "detailText" });
  if (settings?.tax_number) detailsLeft.push({ text: [{ text: "الرقم الضريبي: ", bold: true }, settings.tax_number], style: "detailText" });

  content.push({
    columns: [
      { width: "*", stack: detailsLeft },
      { width: "*", stack: detailsRight },
    ],
    margin: [0, 0, 0, 14],
  });

  // Items table
  const tableHeaders: string[] = ["#", "الصنف", "الكمية", "السعر"];
  if (showDiscount) tableHeaders.push("الخصم");
  tableHeaders.push("الإجمالي");

  const headerCells: TableCell[] = tableHeaders.map((h) => ({
    text: h,
    style: "tableHeader",
    alignment: "center" as const,
    fillColor: "#1e3a8a",
    color: "#ffffff",
  }));

  const itemRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1), alignment: "center" as const, style: "tableCell" },
      { text: item.name, alignment: "right" as const, style: "tableCell" },
      { text: String(item.quantity), alignment: "center" as const, style: "tableCell" },
      { text: item.unitPrice.toLocaleString("en-US", { minimumFractionDigits: 2 }), alignment: "center" as const, style: "tableCell" },
    ];
    if (showDiscount) {
      row.push({ text: item.discount.toLocaleString("en-US", { minimumFractionDigits: 2 }), alignment: "center" as const, style: "tableCell" });
    }
    row.push({
      text: item.total.toLocaleString("en-US", { minimumFractionDigits: 2 }),
      alignment: "center" as const,
      style: "tableCell",
      bold: true,
    });
    return row;
  });

  const tWidths = showDiscount ? [25, "*", 50, 70, 60, 80] : [25, "*", 50, 70, 80];

  content.push({
    table: {
      headerRows: 1,
      widths: tWidths,
      body: [headerCells, ...itemRows],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5),
      vLineWidth: () => 0.5,
      hLineColor: (i: number) => (i <= 1 ? "#1e3a8a" : "#e2e8f0"),
      vLineColor: () => "#e2e8f0",
      paddingLeft: () => 6,
      paddingRight: () => 6,
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
    margin: [0, 0, 0, 12],
  });

  // Totals section
  const currency = settings?.default_currency || "EGP";
  const totalsBody: TableCell[][] = [
    [
      { text: "الإجمالي الفرعي", alignment: "right" as const, style: "totalLabel" },
      { text: `${subtotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`, alignment: "left" as const, style: "totalValue" },
    ],
  ];

  if (showTax && taxRate > 0) {
    totalsBody.push([
      { text: `الضريبة (${taxRate}%)`, alignment: "right" as const, style: "totalLabel" },
      { text: `${taxAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`, alignment: "left" as const, style: "totalValue" },
    ]);
  }

  totalsBody.push([
    { text: "الإجمالي الكلي", alignment: "right" as const, style: "grandTotalLabel", fillColor: "#1e3a8a", color: "#ffffff" },
    { text: `${grandTotal.toLocaleString("en-US", { minimumFractionDigits: 2 })} ${currency}`, alignment: "left" as const, style: "grandTotalValue", fillColor: "#1e3a8a", color: "#ffffff" },
  ]);

  content.push({
    columns: [
      { width: "*", text: "" },
      {
        width: 250,
        table: {
          widths: ["*", "auto"],
          body: totalsBody,
        },
        layout: {
          hLineWidth: () => 0.5,
          vLineWidth: () => 0,
          hLineColor: () => "#e2e8f0",
          paddingLeft: () => 8,
          paddingRight: () => 8,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
      },
    ],
    margin: [0, 0, 0, 12],
  });

  // Notes
  if (notes) {
    content.push({
      stack: [
        { text: "ملاحظات:", bold: true, style: "detailText", margin: [0, 0, 0, 3] as [number, number, number, number] },
        { text: notes, style: "info", fillColor: "#f8fafc" },
      ],
      margin: [0, 0, 0, 10],
    });
  }

  const docDefinition: TDocumentDefinitions = {
    pageMargins: [30, 20, 30, 40],
    defaultStyle: {
      font: "Amiri",
      fontSize: 10,
      alignment: "right",
    },
    styles: {
      companyName: { fontSize: 16, bold: true, color: "#1e3a8a" },
      invoiceTitle: { fontSize: 16, bold: true, color: "#1e3a8a" },
      invoiceNumber: { fontSize: 14, color: "#475569" },
      statusBadge: { fontSize: 10, color: "#059669", bold: true },
      subInfo: { fontSize: 9, color: "#64748b" },
      detailText: { fontSize: 10, color: "#334155", lineHeight: 1.6 },
      info: { fontSize: 9, color: "#64748b" },
      tableHeader: { fontSize: 10, bold: true },
      tableCell: { fontSize: 9, color: "#1e293b" },
      totalLabel: { fontSize: 10, color: "#475569" },
      totalValue: { fontSize: 10, bold: true, color: "#1e293b" },
      grandTotalLabel: { fontSize: 12, bold: true },
      grandTotalValue: { fontSize: 12, bold: true },
    },
    content,
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: settings?.invoice_footer || "", alignment: "center", fontSize: 8, color: "#94a3b8" },
        { text: `صفحة ${currentPage} من ${pageCount}`, alignment: "center", fontSize: 8, color: "#94a3b8" },
      ],
      margin: [30, 10, 30, 0] as [number, number, number, number],
    }),
  };

  pdfMake.createPdf(docDefinition).download(`${typeLabel}-${num}.pdf`);
}
