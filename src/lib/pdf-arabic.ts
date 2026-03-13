import React from "react";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  pdf,
} from "@react-pdf/renderer";
import type { CompanySettings } from "@/contexts/SettingsContext";

// ── Font Registration ──
Font.register({
  family: "Tajawal",
  fonts: [
    { src: "/fonts/Tajawal-Regular.ttf", fontWeight: "normal" },
    { src: "/fonts/Tajawal-Medium.ttf", fontWeight: "medium" },
    { src: "/fonts/Tajawal-Bold.ttf", fontWeight: "bold" },
  ],
});

// Disable hyphenation for Arabic
Font.registerHyphenationCallback((word) => [word]);

// ── Color Palette ──
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
  red: "#dc2626",
  orange: "#ea580c",
  orangeBg: "#fff7ed",
  amber: "#b45309",
  amberDark: "#92400e",
};

// ── Helpers ──
const fmtNum = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });
};

const fmtDateFull = (d: Date) =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

// ── Shared Styles ──
const base = StyleSheet.create({
  page: {
    fontFamily: "Tajawal",
    fontSize: 9,
    paddingTop: 0,
    paddingBottom: 50,
    paddingHorizontal: 0,
    direction: "rtl" as any,
  },
  body: {
    paddingHorizontal: 30,
  },
  goldStripe: {
    height: 4,
    backgroundColor: C.gold,
  },
  header: {
    backgroundColor: C.ink,
    paddingHorizontal: 30,
    paddingVertical: 18,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
  },
  companyName: {
    fontSize: 14,
    fontWeight: "bold",
    color: C.white,
    textAlign: "right",
  },
  companyNameEn: {
    fontSize: 8,
    color: C.ink4,
    textAlign: "right",
    marginTop: 2,
  },
  companyActivity: {
    fontSize: 7,
    color: C.ink3,
    textAlign: "right",
    marginTop: 1,
  },
  badgeLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.gold,
    textAlign: "left",
    letterSpacing: 1.5,
  },
  badgeNumber: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.white,
    textAlign: "left",
    marginTop: 4,
  },
  legalBar: {
    backgroundColor: C.bgSoft,
    paddingVertical: 6,
    paddingHorizontal: 30,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  legalText: {
    fontSize: 7,
    color: C.ink6,
    textAlign: "center",
  },
  sectionLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.gold,
    letterSpacing: 2,
    marginBottom: 6,
    textAlign: "right",
  },
  footer: {
    position: "absolute",
    bottom: 10,
    left: 30,
    right: 30,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    paddingTop: 5,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
  },
  footerText: {
    fontSize: 7,
    color: C.ink6,
  },
  footerCenter: {
    fontSize: 7,
    color: C.ink5,
    textAlign: "center",
    flex: 1,
  },
});

// ── Table Styles ──
const tbl = StyleSheet.create({
  headerRow: {
    flexDirection: "row-reverse",
    backgroundColor: C.ink,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  headerCell: {
    fontSize: 8,
    fontWeight: "bold",
    color: "#ffffff90",
    textAlign: "center",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  row: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  rowEven: {
    backgroundColor: "#fafafa",
  },
  rowOdd: {
    backgroundColor: C.white,
  },
  cell: {
    fontSize: 9,
    color: C.ink4,
    textAlign: "center",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  cellBold: {
    fontSize: 9,
    fontWeight: "bold",
    color: C.ink,
    textAlign: "center",
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  cellRight: {
    textAlign: "right",
  },
  cellLeft: {
    textAlign: "left",
  },
});

// ── Footer Component ──
function PdfFooter({ settings }: { settings: CompanySettings | null }) {
  const tags: string[] = [];
  if (settings?.address) tags.push(settings.address);
  if (settings?.email) tags.push(settings.email);
  if (settings?.phone) tags.push(settings.phone);
  if (settings?.tax_number) tags.push(`VAT: ${settings.tax_number}`);
  if (settings?.commercial_register) tags.push(`C.R: ${settings.commercial_register}`);

  return React.createElement(
    View,
    { style: base.footer, fixed: true },
    React.createElement(Text, { style: base.footerText }, fmtDateFull(new Date())),
    React.createElement(Text, { style: base.footerCenter }, tags.join("  ·  ")),
    React.createElement(
      Text,
      { style: base.footerText, render: ({ pageNumber, totalPages }: any) => `${pageNumber} / ${totalPages}` }
    )
  );
}

// ── Header Component ──
function PdfHeader({
  settings,
  badgeElements,
}: {
  settings: CompanySettings | null;
  badgeElements: React.ReactNode;
}) {
  const s = settings;
  const companyStack = React.createElement(
    View,
    { style: { maxWidth: "55%" } },
    React.createElement(Text, { style: base.companyName }, s?.company_name || "النظام المحاسبي"),
    s?.company_name_en ? React.createElement(Text, { style: base.companyNameEn }, s.company_name_en) : null,
    s?.business_activity ? React.createElement(Text, { style: base.companyActivity }, s.business_activity) : null
  );

  return React.createElement(
    View,
    null,
    React.createElement(View, { style: base.goldStripe }),
    React.createElement(
      View,
      { style: base.header },
      companyStack,
      React.createElement(View, { style: { maxWidth: "42%" } }, badgeElements)
    )
  );
}

// ── Legal Bar ──
function LegalBar({ settings }: { settings: CompanySettings | null }) {
  const s = settings;
  const legal: string[] = [];
  if (s?.address) legal.push(s.address);
  if (s?.phone) legal.push(s.phone);
  if (s?.email) legal.push(s.email);
  if (s?.tax_number) legal.push(`VAT: ${s.tax_number}`);
  if (s?.commercial_register) legal.push(`C.R: ${s.commercial_register}`);
  if (!legal.length) return null;
  return React.createElement(
    View,
    { style: base.legalBar },
    React.createElement(Text, { style: base.legalText }, legal.join("   ·   "))
  );
}

// ── Data Table ──
function DataTable({
  headers,
  rows,
  colWidths,
}: {
  headers: string[];
  rows: (string | number)[][];
  colWidths: (string | number)[];
}) {
  const headerRow = React.createElement(
    View,
    { style: tbl.headerRow },
    ...headers.map((h, i) =>
      React.createElement(
        Text,
        { key: `h-${i}`, style: [tbl.headerCell, { width: colWidths[i] }] },
        h
      )
    )
  );

  const bodyRows = rows.map((row, ri) =>
    React.createElement(
      View,
      { key: `r-${ri}`, style: [tbl.row, ri % 2 === 0 ? tbl.rowOdd : tbl.rowEven] },
      ...row.map((cell, ci) =>
        React.createElement(
          Text,
          {
            key: `c-${ri}-${ci}`,
            style: [
              ci === row.length - 1 ? tbl.cellBold : tbl.cell,
              { width: colWidths[ci] },
              ci === 0 ? tbl.cellLeft : null,
              ci === 1 ? tbl.cellRight : null,
            ].filter(Boolean),
          },
          String(cell)
        )
      )
    )
  );

  return React.createElement(View, null, headerRow, ...bodyRows);
}

// ── Download helper ──
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════════
//  REPORT PDF
// ═══════════════════════════════════════════════
interface ReportPdfOptions {
  title: string;
  settings: CompanySettings | null;
  headers: string[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
  orientation?: "portrait" | "landscape";
  filename: string;
}

function ReportDocument({
  title,
  settings,
  headers,
  rows,
  summaryCards,
  orientation = "portrait",
}: Omit<ReportPdfOptions, "filename">) {
  const currency = settings?.default_currency || "EGP";
  const colCount = headers.length;
  const colW = `${Math.floor(100 / colCount)}%`;
  const colWidths = headers.map(() => colW);

  const badge = React.createElement(
    View,
    null,
    React.createElement(Text, { style: base.badgeLabel }, "REPORT · تقرير"),
    React.createElement(
      Text,
      { style: [base.badgeNumber, { fontSize: 13 }] },
      title
    ),
    React.createElement(
      Text,
      { style: { fontSize: 8, color: C.ink4, textAlign: "left" as any, marginTop: 2 } },
      `${fmtDateFull(new Date())}  ·  ${currency}`
    )
  );

  const summaryRow =
    summaryCards && summaryCards.length
      ? React.createElement(
          View,
          {
            style: {
              flexDirection: "row-reverse",
              backgroundColor: C.goldPale,
              borderWidth: 1,
              borderColor: C.goldLine,
              borderRadius: 2,
              marginBottom: 12,
              paddingHorizontal: 30,
            },
          },
          ...summaryCards.map((card, i) =>
            React.createElement(
              View,
              {
                key: `sc-${i}`,
                style: {
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 8,
                  borderRightWidth: i > 0 ? 1 : 0,
                  borderRightColor: C.goldLine,
                },
              },
              React.createElement(
                Text,
                { style: { fontSize: 7, color: C.amberDark, textAlign: "center" as any } },
                card.label
              ),
              React.createElement(
                Text,
                {
                  style: {
                    fontSize: 12,
                    fontWeight: "bold",
                    color: C.amber,
                    textAlign: "center" as any,
                    marginTop: 3,
                  },
                },
                card.value
              )
            )
          )
        )
      : null;

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", orientation, style: base.page },
      React.createElement(PdfHeader, { settings, badgeElements: badge }),
      React.createElement(LegalBar, { settings }),
      React.createElement(
        View,
        { style: [base.body, { marginTop: 12 }] },
        summaryRow,
        React.createElement(Text, { style: base.sectionLabel }, "تفاصيل البيانات"),
        React.createElement(DataTable, { headers, rows, colWidths }),
        React.createElement(
          Text,
          { style: { fontSize: 7, color: C.ink6, textAlign: "left" as any, marginTop: 6 } },
          `إجمالي السجلات: ${rows.length}`
        )
      ),
      React.createElement(View, { style: [base.goldStripe, { marginTop: 16 }] }),
      React.createElement(PdfFooter, { settings })
    )
  );
}

export async function exportReportPdf(options: ReportPdfOptions) {
  const { filename, ...rest } = options;
  const doc = React.createElement(ReportDocument, rest) as any;
  const blob = await pdf(doc).toBlob();
  downloadBlob(blob, `${filename}.pdf`);
}

// ═══════════════════════════════════════════════
//  INVOICE PDF
// ═══════════════════════════════════════════════
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

const inv = StyleSheet.create({
  metaBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    backgroundColor: C.bgSoft,
    marginBottom: 14,
  },
  clientBox: {
    width: "36%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderLeftWidth: 1,
    borderLeftColor: C.gold,
  },
  clientLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.gold,
    letterSpacing: 1.5,
    textAlign: "right",
    marginBottom: 4,
  },
  clientName: {
    fontSize: 11,
    fontWeight: "bold",
    color: C.ink,
    textAlign: "right",
  },
  metaCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderLeftWidth: 0.5,
    borderLeftColor: C.border,
  },
  metaLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.ink6,
    letterSpacing: 1,
    textAlign: "right",
  },
  metaValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.ink,
    textAlign: "right",
    marginTop: 3,
  },
  bottomGrid: {
    flexDirection: "row-reverse",
    marginTop: 14,
  },
  summaryCol: {
    width: "54%",
    paddingRight: 10,
  },
  totalsCol: {
    width: "46%",
  },
  summaryBar: {
    flexDirection: "row-reverse",
    backgroundColor: C.goldPale,
    borderWidth: 1,
    borderColor: C.goldLine,
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  summaryItem: {
    flexDirection: "row-reverse",
    alignItems: "center",
    marginLeft: 14,
  },
  summaryLabel: {
    fontSize: 9,
    color: C.amberDark,
    marginLeft: 4,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.amber,
  },
  notesBox: {
    backgroundColor: C.bgSoft,
    borderWidth: 1,
    borderColor: C.border,
    borderRightWidth: 2,
    borderRightColor: C.gold,
    padding: 10,
    marginTop: 8,
  },
  notesLabel: {
    fontSize: 7,
    fontWeight: "bold",
    color: C.gold,
    letterSpacing: 1.5,
    marginBottom: 4,
    textAlign: "right",
  },
  notesText: {
    fontSize: 9,
    color: C.ink5,
    lineHeight: 1.8,
    textAlign: "right",
  },
  totalRow: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  totalLabel: {
    flex: 1,
    fontSize: 10,
    color: C.ink5,
    textAlign: "right",
  },
  totalValue: {
    width: 110,
    fontSize: 10,
    color: C.ink,
    textAlign: "left",
  },
  grandRow: {
    flexDirection: "row-reverse",
    backgroundColor: C.ink,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1.5,
    borderTopColor: C.gold,
  },
  grandLabel: {
    flex: 1,
    fontSize: 10,
    fontWeight: "bold",
    color: "#ffffff90",
    textAlign: "right",
  },
  grandValue: {
    width: 110,
    fontSize: 14,
    fontWeight: "bold",
    color: C.goldMid,
    textAlign: "left",
  },
});

function InvoiceDocument(props: Omit<InvoicePdfOptions, "settings"> & { settings: CompanySettings | null }) {
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
  } = props;

  const meta = TYPE_META[type] || TYPE_META.sales_invoice;
  const currency = settings?.default_currency || "EGP";

  const pillText =
    status === "posted" || status === "approved" ? "✓ مُعتمد" : status === "draft" ? "مسودة" : status || "";
  const pillColor = status === "posted" || status === "approved" ? C.green : status === "draft" ? C.orange : C.ink5;

  // Badge
  const badge = React.createElement(
    View,
    null,
    React.createElement(
      Text,
      { style: [base.badgeLabel, { color: meta.stripe === C.gold ? C.gold : meta.stripe }] },
      meta.typeLabel
    ),
    React.createElement(Text, { style: base.badgeNumber }, `#${num}`),
    pillText
      ? React.createElement(
          Text,
          { style: { fontSize: 8, fontWeight: "bold", color: pillColor, textAlign: "left" as any, marginTop: 4 } },
          pillText
        )
      : null
  );

  // Meta defs
  const metaDefs: { label: string; value: string }[] = [{ label: "تاريخ الإصدار", value: fmtDate(date) }];
  if (dueDate) metaDefs.push({ label: "الاستحقاق", value: fmtDate(dueDate) });
  if (reference) metaDefs.push({ label: "المرجع", value: reference });
  metaDefs.push({ label: "العملة", value: currency });

  // Items table
  const colHeaders: string[] = ["#", "الوصف", "الكمية", "سعر الوحدة"];
  if (showDiscount) colHeaders.push("الخصم");
  colHeaders.push(`الإجمالي (${currency})`);

  const colWidths = showDiscount
    ? ["6%", "34%", "12%", "18%", "12%", "18%"]
    : ["6%", "38%", "14%", "22%", "20%"];

  const tableRows: (string | number)[][] = items.map((item, idx) => {
    const row: (string | number)[] = [
      String(idx + 1).padStart(2, "0"),
      item.name,
      fmtNum(item.quantity),
      fmtNum(item.unitPrice),
    ];
    if (showDiscount) row.push(item.discount > 0 ? fmtNum(item.discount) : "—");
    row.push(fmtNum(item.total));
    return row;
  });

  const totalQty = items.reduce((a, i) => a + i.quantity, 0);

  // Totals rows
  const totalsElements: React.ReactNode[] = [];
  totalsElements.push(
    React.createElement(
      View,
      { key: "sub", style: inv.totalRow },
      React.createElement(Text, { style: inv.totalLabel }, "المجموع الفرعي"),
      React.createElement(Text, { style: inv.totalValue }, fmtNum(subtotal))
    )
  );
  if (showTax && taxRate > 0) {
    totalsElements.push(
      React.createElement(
        View,
        { key: "tax", style: inv.totalRow },
        React.createElement(Text, { style: inv.totalLabel }, `ضريبة القيمة المضافة ${taxRate}%`),
        React.createElement(Text, { style: inv.totalValue }, fmtNum(taxAmount))
      )
    );
  }
  if (showDiscount && discountTotal && discountTotal > 0) {
    totalsElements.push(
      React.createElement(
        View,
        { key: "disc", style: inv.totalRow },
        React.createElement(Text, { style: inv.totalLabel }, "الخصم"),
        React.createElement(Text, { style: [inv.totalValue, { color: C.red }] }, `− ${fmtNum(discountTotal)}`)
      )
    );
  }
  totalsElements.push(
    React.createElement(
      View,
      { key: "grand", style: inv.grandRow },
      React.createElement(Text, { style: inv.grandLabel }, "الإجمالي المستحق"),
      React.createElement(Text, { style: inv.grandValue }, `${fmtNum(grandTotal)} ${currency}`)
    )
  );
  if (paidAmount !== undefined && paidAmount > 0) {
    totalsElements.push(
      React.createElement(
        View,
        { key: "paid", style: inv.totalRow },
        React.createElement(Text, { style: [inv.totalLabel, { fontWeight: "bold", color: C.green }] }, "المدفوع"),
        React.createElement(
          Text,
          { style: [inv.totalValue, { fontWeight: "bold", color: C.green }] },
          `${fmtNum(paidAmount)} ${currency}`
        )
      )
    );
    const balance = grandTotal - paidAmount;
    if (balance > 0.01) {
      totalsElements.push(
        React.createElement(
          View,
          { key: "bal", style: inv.totalRow },
          React.createElement(Text, { style: [inv.totalLabel, { fontWeight: "bold", color: C.red }] }, "المتبقي"),
          React.createElement(
            Text,
            { style: [inv.totalValue, { fontWeight: "bold", color: C.red }] },
            `${fmtNum(balance)} ${currency}`
          )
        )
      );
    }
  }

  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", style: base.page },
      // Header
      React.createElement(PdfHeader, { settings, badgeElements: badge }),
      // Meta bar
      React.createElement(
        View,
        { style: inv.metaBar },
        React.createElement(
          View,
          { style: inv.clientBox },
          React.createElement(Text, { style: inv.clientLabel }, partyLabel),
          React.createElement(
            View,
            { style: { width: 20, height: 1.5, backgroundColor: C.gold, marginBottom: 4 } }
          ),
          React.createElement(Text, { style: inv.clientName }, partyName)
        ),
        ...metaDefs.map((m, i) =>
          React.createElement(
            View,
            { key: `meta-${i}`, style: inv.metaCell },
            React.createElement(Text, { style: inv.metaLabel }, m.label),
            React.createElement(Text, { style: inv.metaValue }, m.value)
          )
        )
      ),
      // Items section
      React.createElement(
        View,
        { style: base.body },
        React.createElement(Text, { style: base.sectionLabel }, "تفاصيل البنود"),
        React.createElement(DataTable, { headers: colHeaders, rows: tableRows, colWidths }),
        // Bottom grid
        React.createElement(
          View,
          { style: inv.bottomGrid },
          // Right side: summary + notes
          React.createElement(
            View,
            { style: inv.summaryCol },
            React.createElement(
              View,
              { style: inv.summaryBar },
              React.createElement(
                View,
                { style: inv.summaryItem },
                React.createElement(Text, { style: inv.summaryLabel }, "منتجات: "),
                React.createElement(Text, { style: inv.summaryValue }, String(items.length))
              ),
              React.createElement(
                View,
                { style: { width: 1, backgroundColor: C.goldLine, marginHorizontal: 10 } }
              ),
              React.createElement(
                View,
                { style: inv.summaryItem },
                React.createElement(Text, { style: inv.summaryLabel }, "وحدات: "),
                React.createElement(Text, { style: inv.summaryValue }, fmtNum(totalQty))
              )
            ),
            notes
              ? React.createElement(
                  View,
                  { style: inv.notesBox },
                  React.createElement(Text, { style: inv.notesLabel }, "ملاحظات وشروط الدفع"),
                  React.createElement(Text, { style: inv.notesText }, notes)
                )
              : null
          ),
          // Left side: totals
          React.createElement(
            View,
            { style: inv.totalsCol },
            React.createElement(
              View,
              { style: { borderWidth: 1, borderColor: C.border, borderRadius: 2 } },
              ...totalsElements
            )
          )
        )
      ),
      // Invoice notes
      settings?.invoice_notes
        ? React.createElement(
            Text,
            { style: { fontSize: 7, color: C.ink6, textAlign: "center", marginTop: 4, paddingHorizontal: 30 } },
            settings.invoice_notes
          )
        : null,
      // Bottom stripe
      React.createElement(View, { style: [base.goldStripe, { marginTop: 14 }] }),
      // Footer
      React.createElement(PdfFooter, { settings })
    )
  );
}

export async function exportInvoicePdf(options: InvoicePdfOptions) {
  const meta = TYPE_META[options.type] || TYPE_META.sales_invoice;
  const doc = React.createElement(InvoiceDocument, options) as any;
  const blob = await pdf(doc).toBlob();
  downloadBlob(blob, `${meta.label}-${options.number}.pdf`);
}
