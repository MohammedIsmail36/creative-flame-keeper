import pdfMake from "pdfmake-rtl/build/pdfmake";
import "pdfmake-rtl/build/vfs_fonts";
import type { CompanySettings } from "@/contexts/SettingsContext";

type Content = any;
type TableCell = any;
type TDocumentDefinitions = any;

const C = {
  ink: "#0f172a",
  ink2: "#1e293b",
  ink3: "#334155",
  ink4: "#475569",
  ink5: "#64748b",
  ink6: "#94a3b8",
  gold: "#d4a853",
  goldDark: "#b8860b",
  goldPale: "#fffbeb",
  goldLine: "#f0d990",
  goldMid: "#f0c96a",
  border: "#e2e8f0",
  bgSoft: "#f8fafc",
  white: "#ffffff",
  green: "#15803d",
  greenBg: "#f0fdf4",
  greenBdr: "#bbf7d0",
  red: "#dc2626",
  orange: "#ea580c",
  orangeBg: "#fff7ed",
  amber: "#b45309",
  amberDark: "#92400e",
};

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

const fmtNum = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
};
const fmtDateFull = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

const TABLE_LAYOUT = {
  hLineWidth: (i: number, node: any) => {
    if (i === 0) return 1;
    if (i === 1) return 1.5;
    if (i === node.table.body.length) return 1.5;
    return 0.5;
  },
  vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
  hLineColor: (i: number) => {
    if (i === 1) return C.gold;
    return i === 0 ? C.border : "#f1f5f9";
  },
  vLineColor: () => C.border,
  paddingLeft: () => 10,
  paddingRight: () => 10,
  paddingTop: () => 8,
  paddingBottom: () => 8,
  fillColor: (rowIdx: number) => {
    if (rowIdx === 0) return C.ink;
    return rowIdx % 2 === 1 ? C.white : "#fafafa";
  },
};

const goldStripe = (w: number): Content => ({ canvas: [{ type: "rect", x: 0, y: 0, w, h: 4, color: C.gold }] });

function buildFooter(settings: CompanySettings | null) {
  return (currentPage: number, pageCount: number) => {
    const tags: string[] = [];
    if (settings?.address) tags.push(settings.address);
    if (settings?.email) tags.push(settings.email);
    if (settings?.phone) tags.push(settings.phone);
    if (settings?.tax_number) tags.push(`VAT: ${settings.tax_number}`);
    if (settings?.commercial_register) tags.push(`C.R: ${settings.commercial_register}`);
    return {
      stack: [
        {
          canvas: [{ type: "line", x1: 30, y1: 0, x2: 565, y2: 0, lineWidth: 0.5, lineColor: C.border }],
          margin: [0, 0, 0, 5] as [number, number, number, number],
        },
        {
          columns: [
            { text: `Page ${currentPage} / ${pageCount}`, fontSize: 7, color: C.ink6, alignment: "left" as const },
            { text: tags.join("  ·  "), fontSize: 7, color: C.ink5, alignment: "center" as const },
            { text: fmtDateFull(new Date()), fontSize: 7, color: C.ink6, alignment: "right" as const },
          ],
        },
        ...(settings?.invoice_footer
          ? [
              {
                text: settings.invoice_footer,
                fontSize: 6.5,
                color: C.ink6,
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

// ⚠️ pdfMake-RTL: columns[0] = RIGHT side of page, columns[last] = LEFT side
// Company (RIGHT) → columns[0], Badge (LEFT) → columns[2]
function buildHeader(s: CompanySettings | null, logoData: string | null, badgeContent: Content): Content {
  const coStack: Content[] = [
    {
      text: s?.company_name || "النظام المحاسبي",
      fontSize: 15,
      bold: true,
      color: C.white,
      alignment: "right" as const,
    },
  ];
  if (s?.company_name_en)
    coStack.push({
      text: s.company_name_en,
      fontSize: 8,
      color: C.ink4,
      alignment: "right" as const,
      margin: [0, 2, 0, 0] as any,
    });
  if (s?.business_activity)
    coStack.push({
      text: s.business_activity,
      fontSize: 7.5,
      color: C.ink3,
      alignment: "right" as const,
      margin: [0, 1, 0, 0] as any,
    });

  // sub-columns for logo + company: [0]=logo(RIGHT), [1]=text(LEFT)
  const companyCol: Content = logoData
    ? {
        columns: [
          { image: logoData, width: 44, height: 44, margin: [10, 0, 0, 0] as any },
          { stack: coStack, width: "*" },
        ],
        width: "55%",
      }
    : { stack: coStack, width: "55%" };

  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            columns: [
              companyCol, // columns[0] = RIGHT = company
              { text: "", width: "3%" },
              { ...badgeContent, width: "42%" }, // columns[2] = LEFT = badge
            ],
            border: [false, false, false, false] as any,
          },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: () => C.ink,
      paddingLeft: () => 30,
      paddingRight: () => 30,
      paddingTop: () => 20,
      paddingBottom: () => 18,
    },
  };
}

// ───────────────────────────────────────────────
// REPORT PDF
// ───────────────────────────────────────────────
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
  const PW = orientation === "landscape" ? 770 : 515;
  const currency = settings?.default_currency || "EGP";
  const s = settings;
  let logoData: string | null = null;
  if (s?.logo_url) logoData = await loadLogoBase64(s.logo_url);

  content.push({ ...goldStripe(PW), margin: [0, 0, 0, 0] });

  const reportBadge: Content = {
    stack: [
      {
        text: "REPORT · تقرير",
        fontSize: 7,
        bold: true,
        color: C.gold,
        alignment: "left" as const,
        characterSpacing: 1.5,
      },
      {
        text: title,
        fontSize: 13,
        bold: true,
        color: C.white,
        alignment: "left" as const,
        margin: [0, 4, 0, 4] as any,
      },
      { text: `${fmtDateFull(new Date())}  ·  ${currency}`, fontSize: 8, color: C.ink4, alignment: "left" as const },
    ],
  };
  content.push(buildHeader(s, logoData, reportBadge));

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
              color: C.ink6,
              alignment: "center" as const,
              margin: [0, 6, 0, 6] as any,
            },
          ],
        ],
      },
      layout: {
        hLineWidth: (_i: number, node: any) => (_i === node.table.body.length ? 0.5 : 0),
        vLineWidth: () => 0,
        hLineColor: () => C.border,
        fillColor: () => C.bgSoft,
      },
      margin: [0, 0, 0, 12],
    });
  }

  if (summaryCards?.length) {
    const cells: TableCell[] = [];
    summaryCards.forEach((card, idx) => {
      if (idx > 0)
        cells.push({
          text: "",
          border: [false, false, false, false],
          fillColor: C.goldLine,
          margin: [0, 6, 0, 6] as any,
        });
      cells.push({
        stack: [
          { text: card.label, fontSize: 7, color: C.amberDark, alignment: "center" as const },
          {
            text: card.value,
            fontSize: 12,
            bold: true,
            color: C.amber,
            alignment: "center" as const,
            margin: [0, 3, 0, 0] as any,
          },
        ],
        border: [false, false, false, false],
        margin: [6, 8, 6, 8] as any,
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
        hLineColor: () => C.goldLine,
        vLineColor: () => C.goldLine,
        fillColor: () => C.goldPale,
      },
      margin: [0, 0, 0, 12] as any,
    });
  }

  content.push({
    text: "تفاصيل البيانات",
    fontSize: 7.5,
    bold: true,
    color: C.gold,
    characterSpacing: 2,
    margin: [0, 0, 0, 6],
  });

  const headerRow: TableCell[] = headers.map((h) => ({
    text: h,
    fontSize: 8,
    bold: true,
    color: "rgba(255,255,255,0.55)",
    alignment: "center" as const,
  }));
  const bodyRows: TableCell[][] = rows.map((row) =>
    row.map((cell, ci) => ({
      text: String(cell),
      fontSize: 9,
      color: ci === 0 ? C.ink6 : ci === row.length - 1 ? C.ink : C.ink4,
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
    fontSize: 7,
    color: C.ink6,
    alignment: "left",
    margin: [0, 6, 0, 0],
  });
  content.push({ ...goldStripe(PW), margin: [0, 16, 0, 0] });

  pdfMake
    .createPdf({
      pageOrientation: orientation,
      pageMargins: [30, 20, 30, 48],
      defaultStyle: { fontSize: 9, alignment: "right" },
      content,
      footer: buildFooter(settings),
    } as TDocumentDefinitions)
    .download(`${filename}.pdf`);
}

// ───────────────────────────────────────────────
// INVOICE PDF
// ───────────────────────────────────────────────
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

const TYPE_META: Record<string, { label: string; typeLabel: string; stripe: string }> = {
  sales_invoice: { label: "فاتورة مبيعات", typeLabel: "INVOICE · فاتورة ضريبية رسمية", stripe: C.gold },
  purchase_invoice: { label: "فاتورة مشتريات", typeLabel: "INVOICE · فاتورة مشتريات", stripe: "#0e7490" },
  sales_return: { label: "مرتجع مبيعات", typeLabel: "RETURN · مرتجع مبيعات", stripe: C.red },
  purchase_return: { label: "مرتجع مشتريات", typeLabel: "RETURN · مرتجع مشتريات", stripe: C.orange },
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
  const PW = 515;
  let logoData: string | null = null;
  if (s?.logo_url) logoData = await loadLogoBase64(s.logo_url);

  // TOP STRIPE
  content.push({ ...goldStripe(PW), margin: [0, 0, 0, 0] });

  // HEADER — pill as plain text (no nested table)
  const pillText =
    status === "posted" || status === "approved" ? "✓ مُعتمد" : status === "draft" ? "مسودة" : status || "";
  const pillColor = status === "posted" || status === "approved" ? C.green : status === "draft" ? C.orange : C.ink5;

  const badgeStack: Content = {
    stack: [
      {
        text: meta.typeLabel,
        fontSize: 7,
        bold: true,
        color: meta.stripe === C.gold ? C.gold : meta.stripe,
        alignment: "left" as const,
        characterSpacing: 1,
      },
      {
        text: `#${num}`,
        fontSize: 20,
        bold: true,
        color: C.white,
        alignment: "left" as const,
        margin: [0, 4, 0, 0] as any,
      },
      ...(pillText
        ? [
            {
              text: pillText,
              fontSize: 8,
              bold: true,
              color: pillColor,
              alignment: "left" as const,
              margin: [0, 4, 0, 0] as any,
            },
          ]
        : []),
    ],
  };
  content.push(buildHeader(s, logoData, badgeStack));

  // SUBHEADER
  // ⚠️ pdfMake-RTL: columns[0]=RIGHT=client, columns[1..n]=LEFT=meta cells
  const metaDefs: { label: string; value: string }[] = [{ label: "تاريخ الإصدار", value: fmtDate(date) }];
  if (dueDate) metaDefs.push({ label: "الاستحقاق", value: fmtDate(dueDate) });
  if (reference) metaDefs.push({ label: "المرجع", value: reference });
  metaDefs.push({ label: "العملة", value: currency });

  const clientCell = {
    stack: [
      { text: partyLabel, fontSize: 7, bold: true, color: C.gold, characterSpacing: 1.5, margin: [0, 0, 0, 4] as any },
      {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 20, y2: 0, lineWidth: 1.5, lineColor: C.gold }],
        margin: [0, 0, 0, 4] as any,
      },
      { text: partyName, fontSize: 12, bold: true, color: C.ink },
    ],
    border: [false, false, false, false] as any,
    margin: [0, 10, 16, 10] as any,
  };

  const metaCells: TableCell[] = metaDefs.map((m, i) => ({
    stack: [
      { text: m.label, fontSize: 7, bold: true, color: C.ink6, characterSpacing: 1 },
      { text: m.value, fontSize: 10, bold: true, color: C.ink, margin: [0, 3, 0, 0] as any },
    ],
    border: [false, false, i < metaDefs.length - 1, false] as any,
    borderColor: [C.border, C.border, C.border, C.border],
    margin: [10, 10, 10, 10] as any,
  }));

  content.push({
    table: { widths: ["36%", ...metaDefs.map(() => "*")], body: [[clientCell, ...metaCells]] },
    layout: {
      hLineWidth: (_i: number, node: any) => (_i === node.table.body.length ? 0.5 : 0),
      vLineWidth: (i: number) => (i === 1 ? 1 : i > 1 ? 0.5 : 0),
      hLineColor: () => C.border,
      vLineColor: (i: number) => (i === 1 ? C.gold : C.border),
      fillColor: () => C.bgSoft,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 16],
  });

  // ITEMS TABLE
  content.push({
    text: "تفاصيل البنود",
    fontSize: 7.5,
    bold: true,
    color: C.gold,
    characterSpacing: 2.5,
    margin: [0, 0, 0, 6],
  });

  const colHeaders: string[] = ["#", "الوصف", "الكمية", "سعر الوحدة"];
  if (showDiscount) colHeaders.push("الخصم");
  colHeaders.push(`الإجمالي (${currency})`);

  const hCells: TableCell[] = colHeaders.map((h, i) => ({
    text: h,
    fontSize: 8,
    bold: true,
    color: "rgba(255,255,255,0.55)",
    alignment:
      i === 0
        ? ("center" as const)
        : i === colHeaders.length - 1
          ? ("left" as const)
          : i === 1
            ? ("right" as const)
            : ("center" as const),
  }));

  const iRows: TableCell[][] = items.map((item, idx) => {
    const row: TableCell[] = [
      { text: String(idx + 1).padStart(2, "0"), fontSize: 8.5, color: C.ink6, alignment: "center" as const },
      { text: item.name, fontSize: 10, bold: true, color: C.ink, alignment: "right" as const },
      { text: fmtNum(item.quantity), fontSize: 9, color: C.ink4, alignment: "center" as const },
      { text: fmtNum(item.unitPrice), fontSize: 9, color: C.ink4, alignment: "center" as const },
    ];
    if (showDiscount)
      row.push({
        text: item.discount > 0 ? fmtNum(item.discount) : "—",
        fontSize: 9,
        color: item.discount > 0 ? C.red : C.ink6,
        alignment: "center" as const,
      });
    row.push({ text: fmtNum(item.total), fontSize: 10, bold: true, color: C.ink, alignment: "left" as const });
    return row;
  });

  const colWidths = showDiscount ? [22, "*", 44, 68, 50, 78] : [22, "*", 48, 72, 84];
  content.push({
    table: { headerRows: 1, widths: colWidths, body: [hCells, ...iRows] },
    layout: TABLE_LAYOUT,
    margin: [0, 0, 0, 14],
  });

  // BOTTOM GRID
  const totalQty = items.reduce((a, i) => a + i.quantity, 0);

  const summaryBar: Content = {
    table: {
      widths: ["auto", 2, "auto"],
      body: [
        [
          {
            text: [
              { text: "منتجات: ", fontSize: 9, color: C.amberDark },
              { text: String(items.length), fontSize: 10, bold: true, color: C.amber },
            ],
            border: [false, false, false, false],
            margin: [10, 6, 10, 6] as any,
          },
          { text: "", fillColor: C.goldLine, border: [false, false, false, false], margin: [0, 2, 0, 2] as any },
          {
            text: [
              { text: "وحدات: ", fontSize: 9, color: C.amberDark },
              { text: fmtNum(totalQty), fontSize: 10, bold: true, color: C.amber },
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
      hLineColor: () => C.goldLine,
      vLineColor: () => C.goldLine,
      fillColor: () => C.goldPale,
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
                    color: C.gold,
                    characterSpacing: 1.5,
                    margin: [0, 0, 0, 4] as any,
                  },
                  { text: notes, fontSize: 9, color: C.ink5, lineHeight: 1.8 },
                ],
                margin: [12, 8, 10, 8] as any,
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 1,
          vLineWidth: (i: number) => (i === 0 ? 2 : i === 1 ? 1 : 0),
          hLineColor: () => C.border,
          vLineColor: (i: number) => (i === 0 ? C.gold : C.border),
          fillColor: () => C.bgSoft,
        },
      }
    : null;

  const leftColStack: Content[] = [summaryBar];
  if (notesBox) {
    leftColStack.push({ text: "", margin: [0, 8, 0, 0] as any });
    leftColStack.push(notesBox);
  }

  let grandIdx = 1;
  if (showTax && taxRate > 0) grandIdx++;
  if (showDiscount && discountTotal && discountTotal > 0) grandIdx++;

  const totalsRows: TableCell[][] = [];
  totalsRows.push([
    { text: "المجموع الفرعي", fontSize: 10, color: C.ink5, alignment: "right" as const },
    { text: fmtNum(subtotal), fontSize: 10, color: C.ink, alignment: "left" as const },
  ]);
  if (showTax && taxRate > 0)
    totalsRows.push([
      { text: `ضريبة القيمة المضافة ${taxRate}%`, fontSize: 10, color: C.ink5, alignment: "right" as const },
      { text: fmtNum(taxAmount), fontSize: 10, color: C.ink, alignment: "left" as const },
    ]);
  if (showDiscount && discountTotal && discountTotal > 0)
    totalsRows.push([
      { text: "الخصم", fontSize: 10, color: C.ink5, alignment: "right" as const },
      { text: `− ${fmtNum(discountTotal)}`, fontSize: 10, color: C.red, alignment: "left" as const },
    ]);

  totalsRows.push([
    {
      text: "الإجمالي المستحق",
      fontSize: 10,
      bold: true,
      color: "rgba(255,255,255,0.55)",
      alignment: "right" as const,
      fillColor: C.ink,
      margin: [0, 6, 0, 6] as any,
    },
    {
      text: `${fmtNum(grandTotal)} ${currency}`,
      fontSize: 16,
      bold: true,
      color: C.goldMid,
      alignment: "left" as const,
      fillColor: C.ink,
      margin: [0, 6, 0, 6] as any,
    },
  ]);

  if (paidAmount !== undefined && paidAmount > 0) {
    totalsRows.push([
      { text: "المدفوع", fontSize: 10, bold: true, color: C.green, alignment: "right" as const },
      {
        text: `${fmtNum(paidAmount)} ${currency}`,
        fontSize: 10,
        bold: true,
        color: C.green,
        alignment: "left" as const,
      },
    ]);
    const balance = grandTotal - paidAmount;
    if (balance > 0.01)
      totalsRows.push([
        { text: "المتبقي", fontSize: 10, bold: true, color: C.red, alignment: "right" as const },
        { text: `${fmtNum(balance)} ${currency}`, fontSize: 10, bold: true, color: C.red, alignment: "left" as const },
      ]);
  }

  const totalsBox: Content = {
    table: { widths: ["*", 112], body: totalsRows },
    layout: {
      hLineWidth: (i: number, node: any) => {
        if (i === 0 || i === node.table.body.length) return 1;
        if (i === grandIdx) return 1.5;
        return 0.5;
      },
      vLineWidth: (i: number, node: any) => (i === 0 || i === node.table.widths.length ? 1 : 0),
      hLineColor: (i: number) => (i === grandIdx ? C.gold : C.border),
      vLineColor: () => C.border,
      paddingLeft: () => 12,
      paddingRight: () => 12,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
  };

  // ⚠️ pdfMake-RTL bottom grid:
  // columns[0]=RIGHT=notes/summary, columns[2]=LEFT=totals
  content.push({
    columns: [
      { width: "54%", stack: leftColStack },
      { width: "3%", text: "" },
      { width: "43%", stack: [totalsBox] },
    ],
    margin: [0, 0, 0, 14],
  });

  if (settings?.invoice_notes)
    content.push({
      text: settings.invoice_notes,
      fontSize: 7,
      color: C.ink6,
      alignment: "center",
      margin: [0, 4, 0, 0],
    });

  content.push({ ...goldStripe(PW), margin: [0, 14, 0, 0] });

  pdfMake
    .createPdf({
      pageMargins: [30, 20, 30, 48],
      defaultStyle: { fontSize: 9, alignment: "right" },
      content,
      footer: buildFooter(settings),
    } as TDocumentDefinitions)
    .download(`${meta.label}-${num}.pdf`);
}
