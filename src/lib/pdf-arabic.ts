/**
 * pdf-arabidc.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * يستخدم React.createElement بدلاً من JSX → يعمل كملف .ts بدون أخطاء
 *
 * الإصلاحات والتحسينات:
 *  ✅ fontWeight أرقام فقط (400/500/700)
 *  ✅ تحسين استخدام لون نوع الفاتورة (Accent Color) في التفاصيل
 *  ✅ توسيط رقم الفاتورة ونوعها (Badge)
 *  ✅ إزالة العملة والزخرفة الزائدة من شريط العميل/المورد
 *  ✅ تصحيح تخطيط الإجماليات ليكون RTL صحيح (الإجمالي يمينًا)
 *  ✅ تحسين الأداء (Memoization) لحساب أعمدة الجدول
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { Document, Page, Text, View, Image, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import type { CompanySettings } from "@/contexts/SettingsContext";

// ─────────────────────────────────────────────────────────────────────────────
// 1. تسجيل الخطوط
// ─────────────────────────────────────────────────────────────────────────────
Font.register({
  family: "Tajawal",
  fonts: [
    { src: "/fonts/Tajawal-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Tajawal-Medium.ttf", fontWeight: 500 },
    { src: "/fonts/Tajawal-Bold.ttf", fontWeight: 700 },
  ],
});

// Mono font removed — files not available, using Tajawal for all text

Font.registerHyphenationCallback((word) => [word]);

// ─────────────────────────────────────────────────────────────────────────────
// 2. الألوان
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  ink: "#0f172a",
  ink2: "#1e293b",
  ink3: "#334155",
  ink4: "#475569",
  ink5: "#64748b",
  ink6: "#94a3b8",
  gold: "#d4a853",
  goldPale: "#fffbeb",
  goldLine: "#f0d990",
  goldMid: "#f0c96a",
  border: "#e2e8f0",
  bgSoft: "#f8fafc",
  white: "#ffffff",
  green: "#15803d",
  red: "#dc2626",
  orange: "#ea580c",
  amber: "#b45309",
  amberDark: "#92400e",
  cyan: "#0e7490",
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// 3. Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtNum = (v: number): string => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string): string => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const fmtDateFull = (d: Date): string =>
  d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

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

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. الأنماط (Styles)
// ─────────────────────────────────────────────────────────────────────────────
const base = StyleSheet.create({
  page: {
    fontFamily: "Tajawal",
    fontSize: 9,
    paddingBottom: 58,
    backgroundColor: C.white,
  },
  body: {
    paddingHorizontal: 30,
  },
  goldStripe: {
    height: 4,
    backgroundColor: C.gold,
  },

  // ── هيدر ──
  header: {
    backgroundColor: C.ink,
    paddingHorizontal: 30,
    paddingVertical: 18,
    // تم تغيير الاتجاه لـ column من أجل توسيط الـ Badge
    flexDirection: "column",
    alignItems: "center",
  },

  // صف الشركة والشعار (أعلى)
  headerTopRow: {
    width: "100%",
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },

  // جانب الشركة
  companyBlock: {
    maxWidth: "55%",
    alignItems: "flex-end", // محاذاة النص يمين
  },
  companyName: {
    fontSize: 14,
    fontWeight: 700,
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

  // ── Badge (وسط) ──
  badgeBlock: {
    alignItems: "center", // توسيط كامل
  },
  badgeLabel: {
    fontSize: 8,
    fontWeight: 700,
    color: C.gold,
    textAlign: "center",
  },
  badgeNumber: {
    fontSize: 20,
    fontWeight: 700,
    color: C.white,
    textAlign: "center",
    marginTop: 4,
  },

  // ── Legal Bar ──
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

  // ── تسمية القسم ──
  sectionLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.gold,
    marginBottom: 6,
    textAlign: "right",
  },

  // ── Footer: ثابت في الأسفل ──
  footerFixed: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
  },
  footerStripe: {
    height: 4,
    backgroundColor: C.gold,
  },
  footerContent: {
    paddingHorizontal: 30,
    paddingVertical: 6,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.white,
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

const tbl = StyleSheet.create({
  headerRow: {
    flexDirection: "row-reverse",
    backgroundColor: C.ink,
    borderBottomWidth: 1.5,
    borderBottomColor: C.gold,
  },
  headerCell: {
    fontSize: 8,
    fontWeight: 700,
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
  rowEven: { backgroundColor: "#fafafa" },
  rowOdd: { backgroundColor: C.white },
  cell: {
    fontSize: 9,
    color: C.ink4,
    textAlign: "center",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  cellBold: {
    fontSize: 9,
    fontWeight: 700,
    color: C.ink,
    textAlign: "left",
    paddingVertical: 7,
    paddingHorizontal: 6,
    fontFamily: "Tajawal",
  },
  cellName: {
    fontSize: 9,
    fontWeight: 700,
    color: C.ink,
    textAlign: "right",
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  cellNum: {
    fontFamily: "Tajawal",
    fontSize: 8.5,
    color: C.ink4,
    textAlign: "center",
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
});

const inv = StyleSheet.create({
  metaBar: {
    flexDirection: "row-reverse",
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    backgroundColor: C.bgSoft,
    marginBottom: 14,
  },
  clientBox: {
    width: "40%",
    paddingVertical: 10,
    paddingHorizontal: 14,
    // تم إزالة الحدود الجانبية والزخرفة
    justifyContent: "center",
    borderLeftWidth: 0.5, // فاصل خفيف فقط
    borderLeftColor: C.border,
  },
  clientLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.gold, // سيتغير ديناميكياً
    textAlign: "right",
    marginBottom: 4,
  },
  clientName: {
    fontSize: 11,
    fontWeight: 700,
    color: C.ink,
    textAlign: "right",
  },
  metaCell: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRightWidth: 0.5,
    borderRightColor: C.border,
    justifyContent: "center",
  },
  metaLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.ink6,
    textAlign: "right",
  },
  metaValue: {
    fontFamily: "Mono",
    fontSize: 10,
    fontWeight: 600,
    color: C.ink,
    textAlign: "right",
    marginTop: 3,
  },

  // ── تعديل تخطيط الأسفل: الاتجاه "row" (افتراضي) ──
  // لجعل أول عنصر (الملخص) يسار، وثاني عنصر (الإجماليات) يمين
  bottomGrid: {
    flexDirection: "row",
    marginTop: 14,
    justifyContent: "space-between",
  },
  summaryCol: {
    width: "52%",
    paddingRight: 10, // مسافة بين العمودين
  },
  totalsCol: {
    width: "46%",
    alignItems: "flex-end", // ل sticking مربع الإجماليات لليمين
  },

  // ── مظهر المربعات ──
  summaryBar: {
    flexDirection: "row-reverse",
    backgroundColor: C.goldPale,
    borderWidth: 1,
    borderColor: C.goldLine, // ديناميكي
    borderRadius: 2,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  summaryLabel: {
    fontSize: 9,
    color: C.amberDark,
    marginLeft: 4,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: 700,
    color: C.amber,
  },
  notesBox: {
    backgroundColor: C.bgSoft,
    borderWidth: 1,
    borderColor: C.border,
    borderRightWidth: 2, // لمسة جمالية
    borderRightColor: C.gold, // ديناميكي
    padding: 10,
    marginTop: 8,
  },
  notesLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.gold, // ديناميكي
    marginBottom: 4,
    textAlign: "right",
  },
  notesText: {
    fontSize: 9,
    color: C.ink5,
    lineHeight: 1.8,
    textAlign: "right",
  },

  // ── صفوف الإجماليات ──
  totalRow: {
    width: "100%", // العرض الكامل داخل العمود
    flexDirection: "row-reverse",
    justifyContent: "space-between", // ✅ إصلاح التصاق النصوص
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  totalLabel: {
    fontSize: 10,
    color: C.ink5,
    textAlign: "right",
  },
  totalValue: {
    fontSize: 10,
    color: C.ink,
    textAlign: "left",
    fontFamily: "Mono",
  },
  grandRow: {
    width: "100%",
    flexDirection: "row-reverse",
    justifyContent: "space-between", // ✅ إصلاح التصاق النصوص
    backgroundColor: C.ink,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderTopWidth: 1.5,
    borderTopColor: C.gold,
  },
  grandLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "#ffffff90",
    textAlign: "right",
  },
  grandValue: {
    fontSize: 14,
    fontWeight: 700,
    color: C.goldMid,
    textAlign: "left",
    fontFamily: "Mono",
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. مكون Footer
// ─────────────────────────────────────────────────────────────────────────────
function PdfFooter({ settings, accentColor = C.gold }: { settings: CompanySettings | null; accentColor?: string }) {
  const tags: string[] = [];
  if (settings?.address) tags.push(settings.address);
  if (settings?.email) tags.push(settings.email);
  if (settings?.phone) tags.push(settings.phone);
  if (settings?.tax_number) tags.push(`VAT: ${settings.tax_number}`);
  if (settings?.commercial_register) tags.push(`C.R: ${settings.commercial_register}`);

  return React.createElement(
    View,
    { style: base.footerFixed, fixed: true },
    React.createElement(View, { style: { ...base.footerStripe, backgroundColor: accentColor } }),
    React.createElement(
      View,
      { style: base.footerContent },
      React.createElement(Text, { style: base.footerText }, fmtDateFull(new Date())),
      React.createElement(Text, { style: base.footerCenter }, tags.join("  ·  ")),
      React.createElement(Text, {
        style: base.footerText,
        render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
          `${pageNumber} / ${totalPages}`,
      }),
    ),
    settings?.invoice_footer
      ? React.createElement(
          View,
          { style: { backgroundColor: C.bgSoft, paddingHorizontal: 30, paddingBottom: 3 } },
          React.createElement(
            Text,
            { style: { fontSize: 6.5, color: C.ink6, textAlign: "center" as const } },
            settings.invoice_footer,
          ),
        )
      : null,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. مكون Header
// ─────────────────────────────────────────────────────────────────────────────
function PdfHeader({
  settings,
  logoData,
  accentColor,
}: {
  settings: CompanySettings | null;
  logoData: string | null;
  accentColor: string;
}) {
  const s = settings;

  const logoEl = logoData
    ? React.createElement(Image, {
        src: logoData,
        style: { width: 44, height: 44, borderRadius: 8, marginLeft: 10 },
      })
    : React.createElement(
        View,
        {
          style: {
            width: 44,
            height: 44,
            backgroundColor: accentColor, // لون ديناميكي
            borderRadius: 8,
            alignItems: "center" as const,
            justifyContent: "center" as const,
            marginLeft: 10,
          },
        },
        React.createElement(
          Text,
          { style: { fontSize: 20, fontWeight: 700, color: C.white, fontFamily: "Tajawal" } },
          (s?.company_name ?? "N").charAt(0).toUpperCase(),
        ),
      );

  // الهيدر الجديد: عمودي (أعلى: معلومات الشركة، أسفل: Badge في المنتصف)
  return React.createElement(
    View,
    null,
    React.createElement(View, { style: { ...base.goldStripe, backgroundColor: accentColor } }),
    React.createElement(
      View,
      { style: base.header },
      // الصف العلوي: شركة يمين، شعار يسار
      React.createElement(
        View,
        { style: base.headerTopRow },
        React.createElement(
          View,
          { style: base.companyBlock },
          React.createElement(Text, { style: base.companyName }, s?.company_name ?? "النظام المحاسبي"),
          s?.company_name_en ? React.createElement(Text, { style: base.companyNameEn }, s.company_name_en) : null,
          s?.business_activity ? React.createElement(Text, { style: base.companyActivity }, s.business_activity) : null,
        ),
        logoEl,
      ),
      // الـ Badge (سيُمرر كعنصر فرعي في الفاتورة، هنا لا نعرض شيء افتراضي)
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. LegalBar
// ─────────────────────────────────────────────────────────────────────────────
function LegalBar({ settings }: { settings: CompanySettings | null }) {
  const s = settings;
  const parts: string[] = [];
  if (s?.address) parts.push(s.address);
  if (s?.phone) parts.push(s.phone);
  if (s?.email) parts.push(s.email);
  if (s?.tax_number) parts.push(`VAT: ${s.tax_number}`);
  if (s?.commercial_register) parts.push(`C.R: ${s.commercial_register}`);
  if (!parts.length) return null;
  return React.createElement(
    View,
    { style: base.legalBar },
    React.createElement(Text, { style: base.legalText }, parts.join("   ·   ")),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. DataTable (Optimized)
// ─────────────────────────────────────────────────────────────────────────────
const WIDE_KEYWORDS = [
  "اسم",
  "وصف",
  "منتج",
  "بضاعة",
  "صنف",
  "بيان",
  "عنوان",
  "barcode",
  "باركود",
  "كود",
  "رقم المنتج",
  "العميل",
  "الجهة",
  "المورد",
];
const NARROW_KEYWORDS = [
  "كمية",
  "سعر",
  "إجمالي",
  "اجمالي",
  "ضريبة",
  "خصم",
  "رصيد",
  "مبلغ",
  "#",
  "رقم",
  "تاريخ",
  "نسبة",
  "معدل",
  "discount",
  "qty",
  "price",
  "total",
  "tax",
  "date",
];

function detectColType(header: string): "wide" | "narrow" | "medium" {
  const h = header.toLowerCase();
  if (WIDE_KEYWORDS.some((k) => h.includes(k))) return "wide";
  if (NARROW_KEYWORDS.some((k) => h.includes(k))) return "narrow";
  return "medium";
}

function buildColWidths(headers: string[]): string[] {
  const types = headers.map(detectColType);
  const wCount = types.filter((t) => t === "wide").length || 0;
  const nCount = types.filter((t) => t === "narrow").length || 0;
  const mCount = types.filter((t) => t === "medium").length || 0;

  const rawWide = 30;
  const rawNarrow = 10;
  const rawMedium = 15;
  const rawTotal = wCount * rawWide + nCount * rawNarrow + mCount * rawMedium;
  const scale = 100 / (rawTotal || headers.length * 15);

  return types.map((t) => {
    const pct = t === "wide" ? rawWide * scale : t === "narrow" ? rawNarrow * scale : rawMedium * scale;
    return `${Math.round(pct)}%`;
  });
}

function DataTable({
  headers,
  rows,
  colWidths: externalWidths,
}: {
  headers: string[];
  rows: (string | number)[][];
  colWidths?: (string | number)[];
}) {
  const colWidths = externalWidths ?? buildColWidths(headers);
  const colTypes = headers.map(detectColType); // ✅ حساب مرة واحدة

  const headerRow = React.createElement(
    View,
    { style: tbl.headerRow },
    ...headers.map((h, i) =>
      React.createElement(Text, { key: `h-${i}`, style: { ...tbl.headerCell, width: colWidths[i] } }, h),
    ),
  );

  const bodyRows = rows.map((row, ri) =>
    React.createElement(
      View,
      { key: `r-${ri}`, style: { ...tbl.row, ...(ri % 2 === 0 ? tbl.rowOdd : tbl.rowEven) } },
      ...row.map((cell, ci) => {
        const colType = colTypes[ci];
        const isLast = ci === row.length - 1;

        if (isLast)
          return React.createElement(
            Text,
            { key: `c-${ri}-${ci}`, style: { ...tbl.cellBold, width: colWidths[ci] } },
            String(cell),
          );
        if (colType === "wide")
          return React.createElement(
            Text,
            { key: `c-${ri}-${ci}`, style: { ...tbl.cellName, width: colWidths[ci] } },
            String(cell),
          );
        return React.createElement(
          Text,
          { key: `c-${ri}-${ci}`, style: { ...tbl.cellNum, width: colWidths[ci] } },
          String(cell),
        );
      }),
    ),
  );

  return React.createElement(View, null, headerRow, ...bodyRows);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. أنواع الفاتورة
// ─────────────────────────────────────────────────────────────────────────────
type InvoiceType = "sales_invoice" | "purchase_invoice" | "sales_return" | "purchase_return";

const TYPE_META: Record<InvoiceType, { label: string; typeLabel: string; stripe: string }> = {
  sales_invoice: { label: "فاتورة مبيعات", typeLabel: "INVOICE · فاتورة مبيعات ", stripe: C.gold },
  purchase_invoice: { label: "فاتورة مشتريات", typeLabel: "INVOICE · فاتورة مشتريات", stripe: C.cyan },
  sales_return: { label: "مرتجع مبيعات", typeLabel: "RETURN · مرتجع مبيعات", stripe: C.red },
  purchase_return: { label: "مرتجع مشتريات", typeLabel: "RETURN · مرتجع مشتريات", stripe: C.orange },
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. Interfaces
// ─────────────────────────────────────────────────────────────────────────────
export interface ReportPdfOptions {
  title: string;
  settings: CompanySettings | null;
  headers: string[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
  orientation?: "portrait" | "landscape";
  filename: string;
}

export interface InvoicePdfOptions {
  type: InvoiceType;
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

// ─────────────────────────────────────────────────────────────────────────────
// 11. ReportDocument
// ─────────────────────────────────────────────────────────────────────────────
function ReportDocument(props: Omit<ReportPdfOptions, "filename"> & { logoData: string | null }) {
  const { title, settings, headers, rows, summaryCards, orientation = "portrait", logoData } = props;
  const currency = settings?.default_currency ?? "EGP";
  const accent = C.gold; // التقارير ذهبية افتراضياً

  // Badge للتقرير (وسط)
  const badge = React.createElement(
    View,
    { style: base.badgeBlock },
    React.createElement(Text, { style: base.badgeLabel }, "REPORT · تقرير"),
    React.createElement(Text, { style: base.badgeNumber }, title),
    React.createElement(
      Text,
      { style: { fontSize: 8, color: C.ink4, textAlign: "center" as const, marginTop: 2 } },
      `${fmtDateFull(new Date())}  ·  ${currency}`,
    ),
  );

  const summaryRow = summaryCards?.length
    ? React.createElement(
        View,
        {
          style: {
            flexDirection: "row-reverse" as const,
            backgroundColor: C.goldPale,
            borderWidth: 1,
            borderColor: C.goldLine,
            borderRadius: 2,
            marginBottom: 12,
          },
        },
        ...summaryCards.map((card, i) =>
          React.createElement(
            View,
            {
              key: `sc-${i}`,
              style: {
                flex: 1,
                alignItems: "center" as const,
                paddingVertical: 8,
                borderRightWidth: i > 0 ? 1 : 0,
                borderRightColor: C.goldLine,
              },
            },
            React.createElement(
              Text,
              { style: { fontSize: 7, color: C.amberDark, textAlign: "center" as const } },
              card.label,
            ),
            React.createElement(
              Text,
              { style: { fontSize: 12, fontWeight: 700, color: C.amber, textAlign: "center" as const, marginTop: 3 } },
              card.value,
            ),
          ),
        ),
      )
    : null;

  // Header معدل ليشمل Badge في المنتصف
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: "A4", orientation, style: base.page },
      // هيدر مخصص للتقرير لأن الهيدر الرئيسي صار عاماً
      React.createElement(View, { style: { ...base.goldStripe, backgroundColor: accent } }),
      React.createElement(
        View,
        { style: { ...base.header, flexDirection: "column", alignItems: "center" } },
        React.createElement(
          View,
          { style: { width: "100%", flexDirection: "row-reverse", justifyContent: "space-between", marginBottom: 12 } },
          React.createElement(
            View,
            { style: base.companyBlock },
            React.createElement(Text, { style: base.companyName }, settings?.company_name ?? "النظام المحاسبي"),
            settings?.company_name_en
              ? React.createElement(Text, { style: base.companyNameEn }, settings.company_name_en)
              : null,
          ),
          logoData
            ? React.createElement(Image, { src: logoData, style: { width: 44, height: 44, borderRadius: 8 } })
            : null,
        ),
        badge,
      ),

      React.createElement(LegalBar, { settings }),
      React.createElement(
        View,
        { style: { ...base.body, marginTop: 12 } },
        summaryRow,
        React.createElement(Text, { style: base.sectionLabel }, "تفاصيل البيانات"),
        React.createElement(DataTable, { headers, rows }),
        React.createElement(
          Text,
          { style: { fontSize: 7, color: C.ink6, textAlign: "left" as const, marginTop: 6 } },
          `إجمالي السجلات: ${rows.length}`,
        ),
      ),
      React.createElement(PdfFooter, { settings, accentColor: accent }),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 12. InvoiceDocument
// ─────────────────────────────────────────────────────────────────────────────
function InvoiceDocument(props: InvoicePdfOptions & { logoData: string | null }) {
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
    logoData,
  } = props;

  const meta = TYPE_META[type] ?? TYPE_META.sales_invoice;
  const accent = meta.stripe;
  const currency = settings?.default_currency ?? "EGP";

  const pillText =
    status === "posted" || status === "approved" ? "مؤكدة" : status === "draft" ? "مسودة" : (status ?? "");
  const pillColor = status === "posted" || status === "approved" ? C.green : status === "draft" ? C.orange : C.ink5;

  // Badge (وسط)
  const badge = React.createElement(
    View,
    { style: base.badgeBlock }, // center aligned
    React.createElement(Text, { style: { ...base.badgeLabel, color: accent } }, meta.typeLabel),
    React.createElement(Text, { style: base.badgeNumber }, `#${num}`),
    pillText
      ? React.createElement(
          View,
          {
            style: {
              marginTop: 4,
              backgroundColor: `${pillColor}1a`,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 20,
            },
          },
          React.createElement(Text, { style: { fontSize: 8, fontWeight: 700, color: pillColor } }, pillText),
        )
      : null,
  );

  // Meta Bar
  // إزالة العملة
  const metaDefs: { label: string; value: string }[] = [{ label: "تاريخ الفاتورة", value: fmtDate(date) }];
  if (reference) metaDefs.push({ label: "المرجع", value: reference });

  const colHeaders: string[] = ["#", "الوصف", "الكمية", "سعر الوحدة"];
  if (showDiscount) colHeaders.push("الخصم");
  colHeaders.push(`الإجمالي (${currency})`);

  const colWidths = showDiscount ? ["5%", "38%", "10%", "16%", "11%", "20%"] : ["5%", "42%", "11%", "20%", "22%"];

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

  const totalsEls: React.ReactNode[] = [];
  totalsEls.push(
    React.createElement(
      View,
      { key: "sub", style: inv.totalRow },
      React.createElement(Text, { style: inv.totalValue }, fmtNum(subtotal)),
      React.createElement(Text, { style: inv.totalLabel }, "المجموع الفرعي"),
    ),
  );

  if (showTax && taxRate > 0) {
    totalsEls.push(
      React.createElement(
        View,
        { key: "tax", style: inv.totalRow },
        React.createElement(Text, { style: inv.totalValue }, fmtNum(taxAmount)),
        React.createElement(Text, { style: inv.totalLabel }, `ضريبة القيمة المضافة ${taxRate}%`),
      ),
    );
  }

  if (showDiscount && discountTotal && discountTotal > 0) {
    totalsEls.push(
      React.createElement(
        View,
        { key: "disc", style: inv.totalRow },
        React.createElement(Text, { style: { ...inv.totalValue, color: C.red } }, `− ${fmtNum(discountTotal)}`),
        React.createElement(Text, { style: inv.totalLabel }, "الخصم"),
      ),
    );
  }

  totalsEls.push(
    React.createElement(
      View,
      { key: "grand", style: { ...inv.grandRow, borderTopColor: accent } },
      React.createElement(Text, { style: inv.grandValue }, `${fmtNum(grandTotal)} ${currency}`),
      React.createElement(Text, { style: inv.grandLabel }, "الإجمالي المستحق"),
    ),
  );

  if (paidAmount !== undefined && paidAmount > 0) {
    totalsEls.push(
      React.createElement(
        View,
        { key: "paid", style: inv.totalRow },
        React.createElement(
          Text,
          { style: { ...inv.totalValue, color: C.green, fontWeight: 700 } },
          `${fmtNum(paidAmount)} ${currency}`,
        ),
        React.createElement(Text, { style: { ...inv.totalLabel, color: C.green } }, "المدفوع"),
      ),
    );
    const balance = grandTotal - paidAmount;
    if (balance > 0.01) {
      totalsEls.push(
        React.createElement(
          View,
          { key: "bal", style: { ...inv.totalRow, borderBottomWidth: 0 } },
          React.createElement(
            Text,
            { style: { ...inv.totalValue, color: C.red, fontWeight: 700 } },
            `${fmtNum(balance)} ${currency}`,
          ),
          React.createElement(Text, { style: { ...inv.totalLabel, color: C.red } }, "المتبقي"),
        ),
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
      React.createElement(PdfHeader, { settings, logoData, accentColor: accent }),
      // Badge (مدرج هنا ليظهر في المنتصف بعد الهيدر)
      React.createElement(View, { style: { backgroundColor: C.ink, paddingBottom: 12 } }, badge),

      // Meta Bar
      React.createElement(
        View,
        { style: inv.metaBar },
        React.createElement(
          View,
          { style: inv.clientBox },
          React.createElement(Text, { style: { ...inv.clientLabel, color: accent } }, partyLabel),
          // تم إزالة الخط التحتي هنا
          React.createElement(Text, { style: inv.clientName }, partyName),
        ),
        ...metaDefs.map((m, i) =>
          React.createElement(
            View,
            { key: `meta-${i}`, style: inv.metaCell },
            React.createElement(Text, { style: inv.metaLabel }, m.label),
            React.createElement(Text, { style: inv.metaValue }, m.value),
          ),
        ),
      ),

      // Body
      React.createElement(
        View,
        { style: base.body },
        React.createElement(Text, { style: base.sectionLabel }, "تفاصيل البنود"),
        React.createElement(DataTable, { headers: colHeaders, rows: tableRows, colWidths }),

        // Bottom Grid: Row (Summary Left, Totals Right)
        React.createElement(
          View,
          { style: inv.bottomGrid },

          // 1. Summary Col (Left visually in RTL context)
          React.createElement(
            View,
            { style: inv.summaryCol },
            React.createElement(
              View,
              { style: { ...inv.summaryBar, borderColor: accent } }, // لون ديناميكي
              React.createElement(Text, { style: inv.summaryLabel }, "منتجات: "),
              React.createElement(Text, { style: inv.summaryValue }, String(items.length)),
              React.createElement(View, {
                style: { width: 1, height: 14, backgroundColor: C.border, marginHorizontal: 10 },
              }),
              React.createElement(Text, { style: inv.summaryLabel }, "وحدات: "),
              React.createElement(Text, { style: inv.summaryValue }, fmtNum(totalQty)),
            ),
            notes
              ? React.createElement(
                  View,
                  { style: { ...inv.notesBox, borderRightColor: accent } }, // لون ديناميكي
                  React.createElement(Text, { style: { ...inv.notesLabel, color: accent } }, "ملاحظات وشروط الدفع"), // لون ديناميكي
                  React.createElement(Text, { style: inv.notesText }, notes),
                )
              : null,
          ),

          // 2. Totals Col (Right visually)
          React.createElement(
            View,
            { style: inv.totalsCol },
            React.createElement(
              View,
              { style: { borderWidth: 1, borderColor: C.border, borderRadius: 2, width: "100%" } },
              ...totalsEls,
            ),
          ),
        ),
      ),

      settings?.invoice_notes
        ? React.createElement(
            Text,
            {
              style: { fontSize: 7, color: C.ink6, textAlign: "center" as const, marginTop: 4, paddingHorizontal: 30 },
            },
            settings.invoice_notes,
          )
        : null,

      React.createElement(PdfFooter, { settings, accentColor: accent }),
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 13. الدوال المُصدَّرة
// ─────────────────────────────────────────────────────────────────────────────

export async function exportReportPdf(options: ReportPdfOptions): Promise<void> {
  const { filename, ...rest } = options;
  const logoData = rest.settings?.logo_url ? await loadLogoBase64(rest.settings.logo_url) : null;
  const doc = React.createElement(ReportDocument, { ...rest, logoData }) as React.ReactElement;
  const blob = await pdf(doc).toBlob();
  downloadBlob(blob, `${filename}.pdf`);
}

export async function exportInvoicePdf(options: InvoicePdfOptions): Promise<void> {
  const meta = TYPE_META[options.type] ?? TYPE_META.sales_invoice;
  const logoData = options.settings?.logo_url ? await loadLogoBase64(options.settings.logo_url) : null;
  const doc = React.createElement(InvoiceDocument, { ...options, logoData }) as React.ReactElement;
  const blob = await pdf(doc).toBlob();
  downloadBlob(blob, `${meta.label}-${options.number}.pdf`);
}
