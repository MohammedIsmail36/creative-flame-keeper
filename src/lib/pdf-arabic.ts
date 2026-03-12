import pdfMake from "pdfmake-rtl/build/pdfmake";
import "pdfmake-rtl/build/vfs_fonts";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

// ─── Palette ───
const C = {
  blue: "#1d4ed8",
  blueMid: "#2563eb",
  blueSoft: "#3b82f6",
  bluePale: "#eff6ff",
  blueLine: "#dbeafe",
  blueLight: "#93c5fd",
  ink: "#0f172a",
  ink2: "#334155",
  ink3: "#64748b",
  ink4: "#94a3b8",
  border: "#e2e8f0",
  bgSoft: "#f8fafc",
  white: "#ffffff",
  green: "#15803d",
  greenBg: "#f0fdf4",
  greenBorder: "#bbf7d0",
  red: "#dc2626",
  orange: "#ea580c",
  orangeBg: "#fff7ed",
};

// ─── Logo ───
async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = () => resolve(null);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// ─── Formatters ───
const fmtNum = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const fmtDateFull = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

// ─────────────────────────────────────────────
//  TABLE LAYOUT  — dark ink header (invoice03)
//  Header row  → background: C.ink, text: white
//  Even rows   → white
//  Odd rows    → C.bluePale
// ─────────────────────────────────────────────
const TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0 || i === node.table.body.length) return 1;
    if (i === 1) return 0; // no line under dark header
    return 0.5;
  },
  vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
  hLineColor: () => C.border,
  vLineColor: () => C.border,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 8,
  paddingBottom: () => 8,
  fillColor: (rowIdx: number) => {
    if (rowIdx === 0) return C.ink; // dark header
    return rowIdx % 2 === 1 ? C.white : C.bluePale;
  },
};

// ─────────────────────────────────────────────
//  FOOTER
// ─────────────────────────────────────────────
function buildFooter(settings: CompanySettings | null) {
  return (currentPage: number, pageCount: number) => {
    const parts: string[] = [];
    if (settings?.address) parts.push(`📍 ${settings.address}`);
    if (settings?.email) parts.push(`✉ ${settings.email}`);
    if (settings?.phone) parts.push(`📞 ${settings.phone}`);
    if (settings?.tax_number) parts.push(`VAT: ${settings.tax_number}`);
    if (settings?.commercial_register) parts.push(`C.R: ${settings.commercial_register}`);

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
        ...(settings?.invoice_footer
          ? [
              {
                text: settings.invoice_footer,
                fontSize: 6.5,
                color: C.ink4,
                alignment: "center" as const,
                margin: [0, 3, 0, 0] as [number, number, number, number],
              },
            ]
          : []),
      ],
      margin: [30, 6, 30, 0] as [number, number, number, number],
    };
  };
}

// ═══════════════════════════════════════════
//  SHARED: header block (company + badge)
//  ⚠ pdfMake columns are always LEFT→RIGHT.
//  In the HTML (RTL): badge is on the LEFT,  company is on the RIGHT.
//  In pdfMake array:  columns[0] = LEFT side, columns[last] = RIGHT side.
//  So:  columns[0] = badge,  columns[last] = company+logo.
// ═══════════════════════════════════════════
function buildDocHeader(
  s: CompanySettings | null,
  logoData: string | null,
  badgeContent: Content,
  pageWidth: number,
): Content[] {
  const companyStack: Content[] = [
    {
      text: s?.company_name || "النظام المحاسبي",
      fontSize: 18,
      bold: true,
      color: C.ink,
      alignment: "right" as const,
    },
  ];
  if (s?.company_name_en) {
    companyStack.push({
      text: s.company_name_en,
      fontSize: 9,
      color: C.ink3,
      alignment: "right" as const,
      margin: [0, 2, 0, 0] as any,
    });
  }
  if (s?.business_activity) {
    companyStack.push({
      text: s.business_activity,
      fontSize: 8,
      color: C.ink4,
      alignment: "right" as const,
      margin: [0, 1, 0, 0] as any,
    });
  }

  // Right column: logo beside company text
  const rightCol: Content = logoData
    ? {
        columns: [
          // ⚠ logo on LEFT of this sub-column (visually rightmost in page due to RTL)
          { image: logoData, width: 52, height: 52, margin: [0, 0, 10, 0] as any },
          { stack: companyStack, width: "*" },
        ],
        width: "58%",
      }
    : { stack: companyStack, width: "58%" };

  return [
    // columns: [0]=LEFT=badge(left in HTML), [2]=RIGHT=company(right in HTML)
    {
      columns: [
        { ...badgeContent, width: "40%" }, // LEFT  → badge (invoice number / report title)
        { text: "", width: "2%" },
        { ...rightCol }, // RIGHT → company name + logo
      ],
      margin: [0, 0, 0, 0],
    },
    // ink separator under header
    {
      canvas: [{ type: "line", x1: 0, y1: 0, x2: pageWidth, y2: 0, lineWidth: 1.5, lineColor: C.ink }],
      margin: [0, 10, 0, 0],
    },
  ];
}

// ═══════════════════════════════════════════
//  REPORT PDF
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
  title,
  settings,
  headers,
  rows,
  summaryCards,
  orientation = "portrait",
  filename,
}: ReportPdfOptions) {
  const content: Content[] = [];
  const pageWidth = orientation === "landscape" ? 770 : 515;
  const currency = settings?.default_currency || "EGP";
  const s = settings;

  let logoData: string | null = null;
  if (s?.logo_url) logoData = await loadLogoBase64(s.logo_url);

  // TOP STRIPE
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: pageWidth, h: 4, color: C.blueMid }],
    margin: [0, 0, 0, 14],
  });

  // HEADER
  const reportBadge: Content = {
    stack: [
      { text: "تقرير", fontSize: 8, bold: true, color: C.blueMid, alignment: "left" as const, characterSpacing: 2 },
      { text: title, fontSize: 15, bold: true, color: C.ink, alignment: "left" as const, margin: [0, 4, 0, 4] as any },
      { text: `${fmtDateFull(new Date())}  ·  ${currency}`, fontSize: 8.5, color: C.ink3, alignment: "left" as const },
    ],
  };
  content.push(...buildDocHeader(s, logoData, reportBadge, pageWidth));

  // LEGAL BAR
  const legal: string[] = [];
  if (s?.address) legal.push(s.address);
  if (s?.phone) legal.push(s.phone);
  if (s?.email) legal.push(s.email);
  if (s?.tax_number) legal.push(`VAT: ${s.tax_number}`);
  if (s?.commercial_register) legal.push(`C.R: ${s.commercial_register}`);

  if (legal.length) {
    content.push({
      table: {
        widths: ["*"],
        body: [
          [
            {
              text: legal.join("   ·   "),
              fontSize: 7.5,
              color: C.ink3,
              alignment: "center" as const,
              margin: [8, 6, 8, 6] as any,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: (_i: number, node: any) => (_i === node.table.body.length ? 1 : 0),
        vLineWidth: () => 0,
        hLineColor: () => C.border,
        fillColor: () => C.bgSoft,
      },
      margin: [0, 0, 0, 12],
    });
  }

  // KPI CARDS
  if (summaryCards?.length) {
    const cells: TableCell[] = [];
    summaryCards.forEach((card, idx) => {
      if (idx > 0)
        cells.push({
          text: "",
          fillColor: C.blueLine,
          border: [false, false, false, false],
          margin: [0, 4, 0, 4] as any,
        });
      cells.push({
        stack: [
          { text: card.label, fontSize: 7.5, color: C.ink3, alignment: "center" as const },
          {
            text: card.value,
            fontSize: 12,
            color: C.blueMid,
            bold: true,
            alignment: "center" as const,
            margin: [0, 3, 0, 0] as any,
          },
        ],
        border: [false, false, false, false],
        margin: [6, 6, 6, 6] as any,
      });
    });
    content.push({
      table: {
        body: [cells],
        widths: cells.map((_: any, i: number) => (summaryCards!.length > 1 && i % 2 === 1 ? 1 : "*")),
      },
      layout: {
        hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 1 : 0),
        vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
        hLineColor: () => C.blueLine,
        vLineColor: () => C.blueLine,
        fillColor: () => C.bluePale,
      },
      margin: [0, 0, 0, 12] as any,
    });
  }

  // SECTION LABEL
  content.push({
    text: "تفاصيل البيانات",
    fontSize: 8,
    bold: true,
    color: C.blueMid,
    characterSpacing: 2,
    margin: [0, 0, 0, 6],
  });

  // DATA TABLE — dark header, white text
  const headerRow: TableCell[] = headers.map((h) => ({
    text: h,
    fontSize: 8.5,
    bold: true,
    color: "rgba(255,255,255,0.70)",
    alignment: "center" as const,
  }));
  const bodyRows: TableCell[][] = rows.map((row) =>
    row.map((cell, ci) => ({
      text: String(cell),
      fontSize: 9,
      color: ci === 0 ? C.ink4 : C.ink2,
      bold: ci === row.length - 1,
      alignment: "center" as const,
    })),
  );
  content.push({
    table: { headerRows: 1, widths: headers.map(() => "*"), body: [headerRow, ...bodyRows] },
    layout: TABLE_LAYOUT,
  });

  content.push({
    text: `إجمالي السجلات: ${rows.length}`,
    fontSize: 7.5,
    color: C.ink4,
    alignment: "left",
    margin: [0, 6, 0, 0],
  });

  // BOTTOM STRIPE
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: pageWidth, h: 4, color: C.blueMid }],
    margin: [0, 16, 0, 0],
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
//  INVOICE PDF
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
  sales_invoice: { label: "فاتورة مبيعات", typeLabel: "فاتورة ضريبية رسمية", color: C.blueMid },
  purchase_invoice: { label: "فاتورة مشتريات", typeLabel: "فاتورة مشتريات", color: "#0e7490" },
  sales_return: { label: "مرتجع مبيعات", typeLabel: "إشعار مرتجع مبيعات", color: C.red },
  purchase_return: { label: "مرتجع مشتريات", typeLabel: "إشعار مرتجع مشتريات", color: C.orange },
};

export async function exportInvoicePdf(options: InvoicePdfOptions) {
  const {
    type,
    number: num,
    date,
    partyName,
    partyLabel,
    reference,
    notes,
    items,
    subtotal,
    discountTotal,
    taxAmount = 0,
    taxRate = 0,
    grandTotal,
    showTax,
    showDiscount = true,
    settings,
    status,
    dueDate,
    paidAmount,
  } = options;

  const meta = TYPE_META[type] || TYPE_META.sales_invoice;
  const currency = settings?.default_currency || "EGP";
  const content: Content[] = [];
  const s = settings;
  const PW = 515; // portrait page width (inside margins)

  let logoData: string | null = null;
  if (s?.logo_url) logoData = await loadLogoBase64(s.logo_url);

  // ── 1. TOP STRIPE ──
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: PW, h: 4, color: meta.color }],
    margin: [0, 0, 0, 14],
  });

  // ── 2. HEADER ──
  // badge: LEFT side (alignment: left, as in HTML)
  const badgeStack: Content = {
    stack: [
      {
        text: meta.typeLabel,
        fontSize: 8,
        bold: true,
        color: meta.color,
        alignment: "left" as const,
        characterSpacing: 2,
      },
      {
        text: `#${num}`,
        fontSize: 20,
        bold: true,
        color: C.ink,
        alignment: "left" as const,
        margin: [0, 4, 0, 4] as any,
      },
    ],
  };

  if (status) {
    const isApproved = status === "posted" || status === "approved";
    const isDraft = status === "draft";
    const pillColor = isApproved ? C.green : isDraft ? C.orange : C.ink3;
    const pillBg = isApproved ? C.greenBg : isDraft ? C.orangeBg : C.bgSoft;
    const pillBorder = isApproved ? C.greenBorder : isDraft ? "#fed7aa" : C.border;

    (badgeStack.stack as Content[]).push({
      table: {
        widths: ["auto"],
        body: [
          [
            {
              text: isApproved ? "✓ مُعتمد" : isDraft ? "مسودة" : status,
              fontSize: 9,
              bold: true,
              color: pillColor,
              alignment: "center" as const,
              margin: [16, 3, 16, 3] as any,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: () => 1,
        vLineWidth: () => 1,
        hLineColor: () => pillBorder,
        vLineColor: () => pillBorder,
        fillColor: () => pillBg,
      },
    });
  }

  content.push(...buildDocHeader(s, logoData, badgeStack, PW));

  // ── 3. SUBHEADER — client (RIGHT) | meta cells (LEFT) ──
  // In HTML: client block is on the RIGHT, meta cells are on the LEFT.
  // In pdfMake columns[0]=LEFT → meta cells, columns[last]=RIGHT → client.
  const metaDefs: { label: string; value: string }[] = [{ label: "تاريخ الإصدار", value: fmtDate(date) }];
  if (dueDate) metaDefs.push({ label: "تاريخ الاستحقاق", value: fmtDate(dueDate) });
  if (reference) metaDefs.push({ label: "المرجع", value: reference });
  metaDefs.push({ label: "العملة", value: currency });

  // meta cells — LEFT side
  const metaTableCells: TableCell[] = metaDefs.map((m, i) => ({
    stack: [
      { text: m.label, fontSize: 7, bold: true, color: C.ink4, characterSpacing: 1 },
      { text: m.value, fontSize: 10, bold: true, color: C.ink, margin: [0, 3, 0, 0] as any },
    ],
    border: [i > 0, false, false, false] as any,
    borderColor: [C.border, C.border, C.border, C.border],
    margin: [8, 8, 8, 8] as any,
  }));

  // client block — RIGHT side
  const clientCell = {
    stack: [
      {
        text: partyLabel,
        fontSize: 8,
        bold: true,
        color: C.blueMid,
        characterSpacing: 1.5,
        margin: [0, 0, 0, 4] as any,
      },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 18, y2: 0, lineWidth: 1, lineColor: C.border }],
        margin: [0, 0, 0, 4] as any,
      },
      { text: partyName, fontSize: 13, bold: true, color: C.ink },
    ],
    border: [false, false, false, false] as any,
    margin: [10, 10, 10, 10] as any,
  };

  content.push({
    table: {
      // columns[0..n-2] = meta cells (LEFT), columns[last] = client (RIGHT)
      widths: [...metaDefs.map(() => "*"), "38%"],
      body: [
        [
          ...metaTableCells,
          {
            ...clientCell,
            border: [true, false, false, false] as any,
            borderColor: [C.border, C.border, C.border, C.border],
          },
        ],
      ],
    },
    layout: {
      hLineWidth: (_i: number, node: any) => (_i === node.table.body.length ? 1 : 0),
      vLineWidth: (i: number) => (i > 0 ? 0.5 : 0),
      hLineColor: () => C.border,
      vLineColor: () => C.border,
      fillColor: () => C.bgSoft,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 16],
  });

  // ── 4. ITEMS TABLE ──
  content.push({
    text: "تفاصيل البنود",
    fontSize: 8,
    bold: true,
    color: C.blueMid,
    characterSpacing: 2,
    margin: [0, 0, 0, 6],
  });

  const colHeaders: string[] = ["#", "الوصف", "الكمية", "سعر الوحدة"];
  if (showDiscount) colHeaders.push("الخصم");
  colHeaders.push(`الإجمالي (${currency})`);

  const hCells: TableCell[] = colHeaders.map((h) => ({
    text: h,
    fontSize: 8.5,
    bold: true,
    color: "rgba(255,255,255,0.70)",
    alignment: "center" as const,
  }));

  const iRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1).padStart(2, "0"), fontSize: 8.5, color: C.ink4, alignment: "center" as const },
      { text: item.name, fontSize: 10, bold: true, color: C.ink, alignment: "right" as const },
      { text: fmtNum(item.quantity), fontSize: 9, color: C.ink2, alignment: "center" as const },
      { text: fmtNum(item.unitPrice), fontSize: 9, color: C.ink2, alignment: "center" as const },
    ];
    if (showDiscount) {
      row.push({
        text: item.discount > 0 ? fmtNum(item.discount) : "—",
        fontSize: 9,
        color: item.discount > 0 ? C.red : C.ink4,
        alignment: "center" as const,
      });
    }
    row.push({ text: fmtNum(item.total), fontSize: 10, bold: true, color: C.ink, alignment: "left" as const });
    return row;
  });

  const colWidths = showDiscount ? [24, "*", 45, 70, 50, 80] : [24, "*", 50, 75, 85];

  content.push({
    table: { headerRows: 1, widths: colWidths, body: [hCells, ...iRows] },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 14],
  });

  // ── 5. BOTTOM GRID ──
  // HTML layout: LEFT col = notes/summary, RIGHT col = totals box
  // pdfMake:     columns[0]=LEFT=notes, columns[2]=RIGHT=totals — this is CORRECT (same direction)

  const totalQty = items.reduce((a, i) => a + i.quantity, 0);

  const summaryBar: Content = {
    table: {
      widths: ["auto", 1, "auto"],
      body: [
        [
          {
            text: [
              { text: "منتجات: ", fontSize: 9, color: C.ink3 },
              { text: String(items.length), fontSize: 10, bold: true, color: C.blueMid },
            ],
            border: [false, false, false, false],
            margin: [10, 6, 10, 6] as any,
          },
          { text: "", fillColor: C.blueLine, border: [false, false, false, false], margin: [0, 4, 0, 4] as any },
          {
            text: [
              { text: "وحدات: ", fontSize: 9, color: C.ink3 },
              { text: fmtNum(totalQty), fontSize: 10, bold: true, color: C.blueMid },
            ],
            border: [false, false, false, false],
            margin: [10, 6, 10, 6] as any,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 1 : 0),
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
      hLineColor: () => C.blueLine,
      vLineColor: () => C.blueLine,
      fillColor: () => C.bluePale,
    },
  };

  const notesBox: Content | null = notes
    ? {
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  {
                    text: "ملاحظات وشروط الدفع",
                    fontSize: 7,
                    bold: true,
                    color: C.blueMid,
                    characterSpacing: 1.5,
                    margin: [0, 0, 0, 4] as any,
                  },
                  { text: notes, fontSize: 9, color: C.ink3, lineHeight: 1.8 },
                ],
                margin: [10, 8, 10, 8] as any,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: () => 1,
          hLineColor: () => C.border,
          vLineColor: () => C.border,
          fillColor: () => C.bgSoft,
        },
      }
    : null;

  const leftColStack: Content[] = [summaryBar];
  if (notesBox) {
    leftColStack.push({ text: "", margin: [0, 6, 0, 0] as any });
    leftColStack.push(notesBox);
  }

  // Totals rows
  const totalsRows: TableCell[][] = [];

  totalsRows.push([
    { text: "المجموع الفرعي", fontSize: 11, color: C.ink3, alignment: "right" as const },
    { text: fmtNum(subtotal), fontSize: 11, color: C.ink, alignment: "left" as const },
  ]);
  if (showTax && taxRate > 0) {
    totalsRows.push([
      { text: `ضريبة القيمة المضافة ${taxRate}%`, fontSize: 11, color: C.ink3, alignment: "right" as const },
      { text: fmtNum(taxAmount), fontSize: 11, color: C.ink, alignment: "left" as const },
    ]);
  }
  if (showDiscount && discountTotal && discountTotal > 0) {
    totalsRows.push([
      { text: "الخصم", fontSize: 11, color: C.ink3, alignment: "right" as const },
      { text: `− ${fmtNum(discountTotal)}`, fontSize: 11, color: C.red, alignment: "left" as const },
    ]);
  }

  // Grand total — dark ink background, light-blue value
  totalsRows.push([
    {
      text: "الإجمالي المستحق",
      fontSize: 12,
      bold: true,
      color: "rgba(255,255,255,0.65)",
      alignment: "right" as const,
      fillColor: C.ink,
      margin: [0, 6, 0, 6] as any,
    },
    {
      text: `${fmtNum(grandTotal)} ${currency}`,
      fontSize: 17,
      bold: true,
      color: C.blueLight,
      alignment: "left" as const,
      fillColor: C.ink,
      margin: [0, 6, 0, 6] as any,
    },
  ]);

  if (paidAmount !== undefined && paidAmount > 0) {
    totalsRows.push([
      { text: "المدفوع", fontSize: 11, bold: true, color: C.green, alignment: "right" as const },
      {
        text: `${fmtNum(paidAmount)} ${currency}`,
        fontSize: 11,
        bold: true,
        color: C.green,
        alignment: "left" as const,
      },
    ]);
    const balance = grandTotal - paidAmount;
    if (balance > 0.01) {
      totalsRows.push([
        { text: "المتبقي", fontSize: 11, bold: true, color: C.red, alignment: "right" as const },
        { text: `${fmtNum(balance)} ${currency}`, fontSize: 11, bold: true, color: C.red, alignment: "left" as const },
      ]);
    }
  }

  const totalsBox: Content = {
    table: { widths: ["*", 115], body: totalsRows },
    layout: {
      hLineWidth: (i: number, node: any) => {
        if (i === 0 || i === node.table.body.length) return 1;
        return 0.5;
      },
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
      hLineColor: () => C.blueLine,
      vLineColor: () => C.border,
      paddingLeft: () => 14,
      paddingRight: () => 14,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  };

  content.push({
    columns: [
      { width: "55%", stack: leftColStack }, // LEFT  = notes/summary
      { width: "3%", text: "" },
      { width: "42%", stack: [totalsBox] }, // RIGHT = totals
    ],
    margin: [0, 0, 0, 14],
  });

  if (settings?.invoice_notes) {
    content.push({
      text: settings.invoice_notes,
      fontSize: 7.5,
      color: C.ink4,
      alignment: "center",
      margin: [0, 4, 0, 0],
    });
  }

  // BOTTOM STRIPE
  content.push({
    canvas: [{ type: "rect", x: 0, y: 0, w: PW, h: 4, color: meta.color }],
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
