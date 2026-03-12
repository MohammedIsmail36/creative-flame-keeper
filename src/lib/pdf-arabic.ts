/**
 * pdfExport.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Migration: pdfmake-rtl  →  @react-pdf/renderer
 *
 * ✅ نفس signatures تماماً — drop-in replacement
 *    exportReportPdf(options)
 *    exportInvoicePdf(options)
 *
 * الإعداد المطلوب:
 *   npm install @react-pdf/renderer
 *
 *   ضع الخطوط في /public/fonts/
 *     Tajwal-Regular.ttf | Tajwal-Medium.ttf | Tajwal-Bold.ttf
 *     IBMPlexMono-Regular.ttf | IBMPlexMono-SemiBold.ttf
 * ─────────────────────────────────────────────────────────────────────────────
 */

import React from "react";
import { Document, Page, View, Text, Image, StyleSheet, Font, pdf } from "@react-pdf/renderer";
import type { CompanySettings } from "@/contexts/SettingsContext";

// ─────────────────────────────────────────────────────────────────────────────
// 1. تسجيل الخطوط
// ─────────────────────────────────────────────────────────────────────────────
Font.register({
  family: "Tajwal",
  fonts: [
    { src: "/fonts/Tajwal-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/Tajwal-Medium.ttf", fontWeight: 500 },
    { src: "/fonts/Tajwal-Bold.ttf", fontWeight: 700 },
  ],
});
Font.register({
  family: "Mono",
  fonts: [
    { src: "/fonts/IBMPlexMono-Regular.ttf", fontWeight: 400 },
    { src: "/fonts/IBMPlexMono-SemiBold.ttf", fontWeight: 600 },
  ],
});
Font.registerHyphenationCallback((w) => [w]);

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
  goldDark: "#b8860b",
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
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Helpers
// ─────────────────────────────────────────────────────────────────────────────
const fmtNum = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d: string) => {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
};

const fmtDateFull = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });

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

// ─────────────────────────────────────────────────────────────────────────────
// 4. الأنماط المشتركة
// ─────────────────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: "Tajwal",
    fontSize: 9,
    color: C.ink,
    backgroundColor: C.white,
  },

  // ── شريط ذهبي ──
  goldStripe: { height: 4, backgroundColor: C.gold },

  // ── هيدر ──
  header: {
    backgroundColor: C.ink,
    paddingHorizontal: 30,
    paddingVertical: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coBlock: { flexDirection: "row", alignItems: "center", gap: 12 },
  coIconBox: {
    width: 44,
    height: 44,
    backgroundColor: C.gold,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  coIconTxt: { fontSize: 20, fontWeight: 800, color: C.white, fontFamily: "Tajwal" },
  coName: { fontSize: 15, fontWeight: 800, color: C.white, textAlign: "right" },
  coEn: { fontSize: 8, color: C.ink4, textAlign: "right", marginTop: 2 },
  coAct: { fontSize: 7.5, color: C.ink3, textAlign: "right", marginTop: 1 },

  // badge جانب يسار (في الهيدر)
  badgeBlock: { alignItems: "flex-start" },
  badgeType: { fontSize: 7, fontWeight: 700, color: C.gold, letterSpacing: 1, textAlign: "left" },
  badgeNum: {
    fontFamily: "Mono",
    fontSize: 20,
    fontWeight: 600,
    color: C.white,
    marginTop: 4,
    marginBottom: 2,
    textAlign: "left",
  },
  badgePill: {
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 3,
    fontSize: 8,
    fontWeight: 700,
    marginTop: 2,
  },

  // ── ساب هيدر ──
  sub: {
    backgroundColor: C.bgSoft,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexDirection: "row",
    paddingHorizontal: 30,
  },
  clientCell: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 16,
    borderRightWidth: 2,
    borderRightColor: C.gold,
    justifyContent: "center",
  },
  clientLabel: {
    fontSize: 7,
    fontWeight: 700,
    color: C.gold,
    letterSpacing: 1.5,
    textAlign: "right",
    marginBottom: 4,
  },
  clientName: { fontSize: 12, fontWeight: 700, color: C.ink, textAlign: "right" },
  metaGroup: { flexDirection: "row" },
  metaCell: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderLeftWidth: 1,
    borderLeftColor: C.border,
    minWidth: 80,
  },
  metaLbl: { fontSize: 7, fontWeight: 700, color: C.ink6, letterSpacing: 1, textAlign: "left" },
  metaVal: {
    fontFamily: "Mono",
    fontSize: 10,
    fontWeight: 600,
    color: C.ink,
    marginTop: 3,
    textAlign: "left",
  },

  // ── قانوني بار ──
  legalBar: {
    backgroundColor: C.bgSoft,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 30,
    paddingVertical: 7,
    fontSize: 7.5,
    color: C.ink6,
    textAlign: "center",
  },

  // ── تسمية قسم ──
  secLabel: {
    fontSize: 7.5,
    fontWeight: 700,
    color: C.gold,
    letterSpacing: 2.5,
    marginBottom: 6,
    textAlign: "right",
  },

  // ── جدول — رأس ──
  tableHead: {
    backgroundColor: C.ink,
    flexDirection: "row",
    borderBottomWidth: 1.5,
    borderBottomColor: C.gold,
  },
  th: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 8,
    fontWeight: 700,
    color: "rgba(255,255,255,0.55)",
    textAlign: "center",
  },

  // ── جدول — صف ──
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  tableRowEven: { backgroundColor: "#fafafa" },
  tableRowLast: { borderBottomWidth: 1.5, borderBottomColor: C.border },
  td: {
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 9,
    color: C.ink4,
    textAlign: "center",
  },

  // ── KPI بار ──
  kpiBar: {
    flexDirection: "row",
    backgroundColor: C.goldPale,
    borderWidth: 1,
    borderColor: "rgba(212,168,83,0.3)",
    borderRadius: 4,
    marginBottom: 14,
    overflow: "hidden",
  },
  kpiCell: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 12,
    alignItems: "center",
    borderLeftWidth: 1,
    borderLeftColor: "rgba(212,168,83,0.25)",
  },
  kpiLbl: { fontSize: 7.5, color: C.amberDark, fontWeight: 600, textAlign: "center" },
  kpiVal: {
    fontFamily: "Mono",
    fontSize: 13,
    fontWeight: 600,
    color: C.amber,
    marginTop: 4,
    textAlign: "center",
  },
  kpiUnit: { fontSize: 8, color: C.amber, marginTop: 2, textAlign: "center" },

  // ── شريط ملخص ──
  sumBar: {
    backgroundColor: C.goldPale,
    borderWidth: 1,
    borderColor: "rgba(212,168,83,0.3)",
    borderRadius: 4,
    flexDirection: "row",
    paddingHorizontal: 10,
    paddingVertical: 7,
    alignItems: "center",
    gap: 12,
  },
  sumTxt: { fontSize: 9, color: C.amberDark },
  sumVal: { fontFamily: "Mono", fontSize: 10, fontWeight: 600, color: C.amber },
  sumSep: { width: 1, height: 14, backgroundColor: "rgba(212,168,83,0.3)" },

  // ── صندوق ملاحظات ──
  notesBox: {
    backgroundColor: C.bgSoft,
    borderWidth: 1,
    borderColor: C.border,
    borderRightWidth: 3,
    borderRightColor: C.gold,
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  notesLbl: {
    fontSize: 7,
    fontWeight: 700,
    color: C.gold,
    letterSpacing: 1.5,
    marginBottom: 5,
    textAlign: "right",
  },
  notesTxt: { fontSize: 9, color: C.ink5, lineHeight: 1.8, textAlign: "right" },

  // ── صندوق الإجماليات ──
  totalsBox: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
    overflow: "hidden",
  },
  tRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 0.5,
    borderBottomColor: "#f1f5f9",
  },
  tRowGrand: {
    backgroundColor: C.ink,
    paddingVertical: 10,
    borderBottomWidth: 0,
  },
  tLbl: { fontSize: 10, color: C.ink5, textAlign: "right" },
  tVal: { fontFamily: "Mono", fontSize: 10, color: C.ink, textAlign: "left" },
  tLblGrand: { fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.55)", textAlign: "right" },
  tValGrand: { fontFamily: "Mono", fontSize: 15, fontWeight: 700, color: C.goldMid, textAlign: "left" },

  // ── فوتر ──
  footerWrap: {
    paddingHorizontal: 30,
    paddingTop: 6,
  },
  footerLine: {
    height: 0.5,
    backgroundColor: C.border,
    marginBottom: 5,
  },
  footerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footerTags: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
    flex: 1,
    justifyContent: "center",
  },
  footerTag: { fontSize: 7.5, color: C.ink5 },
  footerTagB: { fontSize: 7.5, color: C.ink3, fontWeight: 600 },
  footerDiv: { width: 1, height: 11, backgroundColor: C.border },
  footerPage: { fontSize: 7, color: C.ink6 },

  wrap: { paddingHorizontal: 30, paddingTop: 16, paddingBottom: 14 },
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. مكونات مشتركة
// ─────────────────────────────────────────────────────────────────────────────

const GoldStripe = () => <View style={S.goldStripe} />;

// ── هيدر الوثيقة ──
interface HeaderProps {
  settings: CompanySettings | null;
  logoData: string | null;
  badgeType: string;
  badgeTypeColor?: string;
  badgeMain: React.ReactNode; // رقم الفاتورة أو عنوان التقرير
  badgeSub?: React.ReactNode;
}
const DocHeader: React.FC<HeaderProps> = ({
  settings,
  logoData,
  badgeType,
  badgeTypeColor = C.gold,
  badgeMain,
  badgeSub,
}) => {
  const s = settings;
  return (
    <View style={S.header}>
      {/* ── يسار: badge ── */}
      <View style={S.badgeBlock}>
        <Text style={[S.badgeType, { color: badgeTypeColor }]}>{badgeType}</Text>
        {badgeMain}
        {badgeSub}
      </View>

      {/* ── يمين: شركة + شعار ── */}
      <View style={S.coBlock}>
        <View>
          <Text style={S.coName}>{s?.company_name || "النظام المحاسبي"}</Text>
          {s?.company_name_en && <Text style={S.coEn}>{s.company_name_en}</Text>}
          {s?.business_activity && <Text style={S.coAct}>{s.business_activity}</Text>}
        </View>
        {logoData ? (
          <Image src={logoData} style={{ width: 44, height: 44, borderRadius: 8 }} />
        ) : (
          <View style={S.coIconBox}>
            <Text style={S.coIconTxt}>{(s?.company_name || "N").charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

// ── فوتر الصفحة ──
interface FooterInfo {
  label: string;
  icon?: string;
}
const buildFooterRenderer = (settings: CompanySettings | null) => {
  const tags: string[] = [];
  if (settings?.address) tags.push(settings.address);
  if (settings?.email) tags.push(settings.email);
  if (settings?.phone) tags.push(settings.phone);
  if (settings?.tax_number) tags.push(`VAT: ${settings.tax_number}`);
  if (settings?.commercial_register) tags.push(`C.R: ${settings.commercial_register}`);
  const dateStr = fmtDateFull(new Date());

  // @react-pdf/renderer: footer كـ fixed component
  return ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => (
    <View style={S.footerWrap} fixed>
      <View style={S.footerLine} />
      <View style={S.footerRow}>
        <Text style={S.footerPage}>
          Page {pageNumber} / {totalPages}
        </Text>
        <View style={S.footerTags}>
          {tags.map((tag, i) => (
            <React.Fragment key={i}>
              {i > 0 && <View style={S.footerDiv} />}
              <Text style={S.footerTagB}>{tag}</Text>
            </React.Fragment>
          ))}
        </View>
        <Text style={S.footerPage}>{dateStr}</Text>
      </View>
      {settings?.invoice_footer && (
        <Text style={{ fontSize: 6.5, color: C.ink6, textAlign: "center", marginTop: 3 }}>
          {settings.invoice_footer}
        </Text>
      )}
    </View>
  );
};

// ── تسمية القسم ──
const SecLabel = ({ text }: { text: string }) => <Text style={S.secLabel}>{text}</Text>;

// ─────────────────────────────────────────────────────────────────────────────
// 6. نوع الفاتورة — ألوان ومعلومات
// ─────────────────────────────────────────────────────────────────────────────
const TYPE_META: Record<string, { label: string; typeLabel: string; accentColor: string }> = {
  sales_invoice: { label: "فاتورة مبيعات", typeLabel: "INVOICE · فاتورة ضريبية رسمية", accentColor: C.gold },
  purchase_invoice: { label: "فاتورة مشتريات", typeLabel: "INVOICE · فاتورة مشتريات", accentColor: C.cyan },
  sales_return: { label: "مرتجع مبيعات", typeLabel: "RETURN · مرتجع مبيعات", accentColor: C.red },
  purchase_return: { label: "مرتجع مشتريات", typeLabel: "RETURN · مرتجع مشتريات", accentColor: C.orange },
};

// ─────────────────────────────────────────────────────────────────────────────
// 7. Interfaces (نفس الكود الأصلي تماماً)
// ─────────────────────────────────────────────────────────────────────────────
interface ReportPdfOptions {
  title: string;
  settings: CompanySettings | null;
  headers: string[];
  rows: (string | number)[][];
  summaryCards?: { label: string; value: string }[];
  orientation?: "portrait" | "landscape";
  filename: string;
}

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

// ─────────────────────────────────────────────────────────────────────────────
// 8. مكون الفاتورة
// ─────────────────────────────────────────────────────────────────────────────
interface InvoiceDocProps extends InvoicePdfOptions {
  logoData: string | null;
}

const InvoiceDocument: React.FC<InvoiceDocProps> = (props) => {
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

  const meta = TYPE_META[type] || TYPE_META.sales_invoice;
  const accent = meta.accentColor;
  const currency = settings?.default_currency || "EGP";
  const FooterComp = buildFooterRenderer(settings);

  // pill للحالة
  const pillText =
    status === "posted" || status === "approved" ? "✓ مُعتمد" : status === "draft" ? "◷ مسودة" : status || "";
  const pillColor = status === "posted" || status === "approved" ? C.green : status === "draft" ? C.orange : C.ink5;

  // meta cells للساب هيدر
  const metaDefs: { label: string; value: string }[] = [{ label: "تاريخ الإصدار", value: fmtDate(date) }];
  if (dueDate) metaDefs.push({ label: "الاستحقاق", value: fmtDate(dueDate) });
  if (reference) metaDefs.push({ label: "المرجع", value: reference });
  metaDefs.push({ label: "العملة", value: currency });

  // أعمدة الجدول
  const showDiscCol = showDiscount;
  const colCount = showDiscCol ? 6 : 5;
  // عرض الأعمدة: #, وصف, كمية, سعر, خصم?, إجمالي
  const colW = showDiscCol ? ["4%", "40%", "10%", "16%", "12%", "18%"] : ["4%", "44%", "12%", "18%", "22%"];

  // صفوف الإجماليات
  const totalQty = items.reduce((a, i) => a + i.quantity, 0);

  const hasTax = !!(showTax && taxRate > 0);
  const hasDiscount = !!(showDiscCol && discountTotal && discountTotal > 0);
  const hasPaid = paidAmount !== undefined && paidAmount > 0;
  const balance = hasPaid ? grandTotal - (paidAmount ?? 0) : 0;

  return (
    <Document>
      <Page size="A4" style={S.page} orientation="portrait">
        {/* شريط ذهبي علوي */}
        <View style={[S.goldStripe, { backgroundColor: accent }]} />

        {/* هيدر */}
        <DocHeader
          settings={settings}
          logoData={logoData}
          badgeType={meta.typeLabel}
          badgeTypeColor={accent}
          badgeMain={<Text style={S.badgeNum}>{`#${num}`}</Text>}
          badgeSub={
            pillText ? (
              <Text
                style={[
                  S.badgePill,
                  {
                    color: pillColor,
                    backgroundColor: `${pillColor}1a`,
                    borderWidth: 1,
                    borderColor: `${pillColor}55`,
                  },
                ]}
              >
                {pillText}
              </Text>
            ) : undefined
          }
        />

        {/* ساب هيدر */}
        <View style={S.sub}>
          {/* يمين: العميل */}
          <View style={S.clientCell}>
            <Text style={[S.clientLabel, { color: accent }]}>{partyLabel}</Text>
            <Text style={S.clientName}>{partyName}</Text>
          </View>
          {/* يسار: خلايا الـ meta */}
          <View style={S.metaGroup}>
            {metaDefs.map((m, i) => (
              <View key={i} style={S.metaCell}>
                <Text style={S.metaLbl}>{m.label}</Text>
                <Text style={S.metaVal}>{m.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* المحتوى الرئيسي */}
        <View style={S.wrap}>
          <SecLabel text="تفاصيل البنود" />

          {/* رأس الجدول */}
          <View style={S.tableHead}>
            <Text style={[S.th, { width: colW[0] }]}>#</Text>
            <Text style={[S.th, { width: colW[1], textAlign: "right" }]}>الوصف</Text>
            <Text style={[S.th, { width: colW[2] }]}>الكمية</Text>
            <Text style={[S.th, { width: colW[3] }]}>سعر الوحدة</Text>
            {showDiscCol && <Text style={[S.th, { width: colW[4] }]}>الخصم</Text>}
            <Text style={[S.th, { width: colW[colCount - 1], textAlign: "left" }]}>{`الإجمالي (${currency})`}</Text>
          </View>

          {/* صفوف البنود */}
          {items.map((item, idx) => (
            <View
              key={idx}
              style={[S.tableRow, idx % 2 !== 0 && S.tableRowEven, idx === items.length - 1 && S.tableRowLast]}
            >
              <Text style={[S.td, { width: colW[0], fontFamily: "Mono", fontSize: 8, color: C.ink6 }]}>
                {String(idx + 1).padStart(2, "0")}
              </Text>
              <Text style={[S.td, { width: colW[1], textAlign: "right", fontWeight: 700, color: C.ink }]}>
                {item.name}
              </Text>
              <Text style={[S.td, { width: colW[2], fontFamily: "Mono", color: C.ink4 }]}>{fmtNum(item.quantity)}</Text>
              <Text style={[S.td, { width: colW[3], fontFamily: "Mono", color: C.ink4 }]}>
                {fmtNum(item.unitPrice)}
              </Text>
              {showDiscCol && (
                <Text
                  style={[
                    S.td,
                    {
                      width: colW[4],
                      fontFamily: "Mono",
                      color: item.discount > 0 ? C.red : C.ink6,
                    },
                  ]}
                >
                  {item.discount > 0 ? fmtNum(item.discount) : "—"}
                </Text>
              )}
              <Text
                style={[
                  S.td,
                  {
                    width: colW[colCount - 1],
                    fontFamily: "Mono",
                    fontWeight: 700,
                    color: C.ink,
                    textAlign: "left",
                  },
                ]}
              >
                {fmtNum(item.total)}
              </Text>
            </View>
          ))}
        </View>

        {/* البوتوم: ملاحظات + إجماليات */}
        <View style={[S.wrap, { flexDirection: "row", gap: 16, paddingTop: 0 }]}>
          {/* يمين: ملخص + ملاحظات */}
          <View style={{ flex: 1 }}>
            <View style={S.sumBar}>
              <Text style={S.sumTxt}>منتجات: </Text>
              <Text style={S.sumVal}>{items.length}</Text>
              <View style={S.sumSep} />
              <Text style={S.sumTxt}>وحدات: </Text>
              <Text style={S.sumVal}>{fmtNum(totalQty)}</Text>
            </View>
            {notes && (
              <View style={S.notesBox}>
                <Text style={S.notesLbl}>ملاحظات وشروط الدفع</Text>
                <Text style={S.notesTxt}>{notes}</Text>
              </View>
            )}
          </View>

          {/* يسار: صندوق الإجماليات */}
          <View style={[S.totalsBox, { width: 240 }]}>
            {/* المجموع الفرعي */}
            <View style={S.tRow}>
              <Text style={S.tVal}>{fmtNum(subtotal)}</Text>
              <Text style={S.tLbl}>المجموع الفرعي</Text>
            </View>
            {/* الضريبة */}
            {hasTax && (
              <View style={S.tRow}>
                <Text style={S.tVal}>{fmtNum(taxAmount)}</Text>
                <Text style={S.tLbl}>{`ضريبة القيمة المضافة ${taxRate}%`}</Text>
              </View>
            )}
            {/* الخصم */}
            {hasDiscount && (
              <View style={S.tRow}>
                <Text style={[S.tVal, { color: C.red }]}>− {fmtNum(discountTotal!)}</Text>
                <Text style={S.tLbl}>الخصم</Text>
              </View>
            )}
            {/* الإجمالي */}
            <View style={[S.tRow, S.tRowGrand]}>
              <Text style={S.tValGrand}>
                {fmtNum(grandTotal)} {currency}
              </Text>
              <Text style={S.tLblGrand}>الإجمالي المستحق</Text>
            </View>
            {/* المدفوع */}
            {hasPaid && (
              <View style={S.tRow}>
                <Text style={[S.tVal, { color: C.green, fontWeight: 700 }]}>
                  {fmtNum(paidAmount!)} {currency}
                </Text>
                <Text style={[S.tLbl, { color: C.green }]}>المدفوع</Text>
              </View>
            )}
            {/* المتبقي */}
            {hasPaid && balance > 0.01 && (
              <View style={[S.tRow, { borderBottomWidth: 0 }]}>
                <Text style={[S.tVal, { color: C.red, fontWeight: 700 }]}>
                  {fmtNum(balance)} {currency}
                </Text>
                <Text style={[S.tLbl, { color: C.red }]}>المتبقي</Text>
              </View>
            )}
          </View>
        </View>

        {/* ملاحظات إضافية من الإعدادات */}
        {settings?.invoice_notes && (
          <Text style={[S.wrap, { fontSize: 7, color: C.ink6, textAlign: "center", paddingTop: 4 }]}>
            {settings.invoice_notes}
          </Text>
        )}

        {/* شريط ذهبي سفلي */}
        <View style={[S.goldStripe, { backgroundColor: accent, marginTop: 14 }]} />

        {/* فوتر */}
        <FooterComp pageNumber={1} totalPages={1} />
      </Page>
    </Document>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 9. مكون التقرير
// ─────────────────────────────────────────────────────────────────────────────
interface ReportDocProps extends ReportPdfOptions {
  logoData: string | null;
}

const ReportDocument: React.FC<ReportDocProps> = ({
  title,
  settings,
  headers,
  rows,
  summaryCards,
  orientation = "portrait",
  logoData,
}) => {
  const currency = settings?.default_currency || "EGP";
  const FooterComp = buildFooterRenderer(settings);

  // معلومات الـ legal bar
  const legal: string[] = [];
  if (settings?.address) legal.push(settings.address);
  if (settings?.phone) legal.push(settings.phone);
  if (settings?.email) legal.push(settings.email);
  if (settings?.tax_number) legal.push(`VAT: ${settings.tax_number}`);
  if (settings?.commercial_register) legal.push(`C.R: ${settings.commercial_register}`);

  const colW = headers.map(() => `${Math.floor(100 / headers.length)}%`);

  return (
    <Document>
      <Page size="A4" style={S.page} orientation={orientation}>
        {/* شريط ذهبي */}
        <GoldStripe />

        {/* هيدر */}
        <DocHeader
          settings={settings}
          logoData={logoData}
          badgeType="REPORT · تقرير"
          badgeMain={
            <Text
              style={{
                fontSize: 13,
                fontWeight: 800,
                color: C.white,
                textAlign: "left",
                marginTop: 4,
                marginBottom: 4,
                fontFamily: "Tajwal",
              }}
            >
              {title}
            </Text>
          }
          badgeSub={
            <Text style={{ fontSize: 8, color: C.ink4, textAlign: "left" }}>
              {`${fmtDateFull(new Date())}  ·  ${currency}`}
            </Text>
          }
        />

        {/* بار المعلومات القانونية */}
        {legal.length > 0 && <Text style={S.legalBar}>{legal.join("   ·   ")}</Text>}

        <View style={S.wrap}>
          {/* KPI cards */}
          {summaryCards && summaryCards.length > 0 && (
            <View style={S.kpiBar}>
              {summaryCards.map((card, i) => (
                <View key={i} style={[S.kpiCell, i === 0 && { borderLeftWidth: 0 }]}>
                  <Text style={S.kpiLbl}>{card.label}</Text>
                  <Text style={S.kpiVal}>{card.value}</Text>
                </View>
              ))}
            </View>
          )}

          <SecLabel text="تفاصيل البيانات" />

          {/* رأس الجدول */}
          <View style={S.tableHead}>
            {headers.map((h, i) => (
              <Text key={i} style={[S.th, { width: colW[i] }]}>
                {h}
              </Text>
            ))}
          </View>

          {/* صفوف البيانات */}
          {rows.map((row, ri) => (
            <View
              key={ri}
              style={[S.tableRow, ri % 2 !== 0 && S.tableRowEven, ri === rows.length - 1 && S.tableRowLast]}
            >
              {row.map((cell, ci) => (
                <Text
                  key={ci}
                  style={[
                    S.td,
                    { width: colW[ci] },
                    ci === 0 && { color: C.ink6, fontFamily: "Mono" },
                    ci === row.length - 1 && { color: C.ink, fontWeight: 700, fontFamily: "Mono", textAlign: "left" },
                  ]}
                >
                  {String(cell)}
                </Text>
              ))}
            </View>
          ))}

          {/* عدد السجلات */}
          <Text style={{ fontSize: 7, color: C.ink6, textAlign: "left", marginTop: 6 }}>
            {`إجمالي السجلات: ${rows.length}`}
          </Text>
        </View>

        {/* شريط ذهبي سفلي */}
        <GoldStripe />

        {/* فوتر */}
        <FooterComp pageNumber={1} totalPages={1} />
      </Page>
    </Document>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. الدوال المُصدَّرة — نفس الـ signature بالضبط
// ─────────────────────────────────────────────────────────────────────────────

/**
 * تصدير تقرير PDF
 * @example
 *   await exportReportPdf({ title, settings, headers, rows, summaryCards, filename })
 */
export async function exportReportPdf({
  title,
  settings,
  headers,
  rows,
  summaryCards,
  orientation = "portrait",
  filename,
}: ReportPdfOptions): Promise<void> {
  const logoData = settings?.logo_url ? await loadLogoBase64(settings.logo_url) : null;

  const blob = await pdf(
    <ReportDocument
      title={title}
      settings={settings}
      headers={headers}
      rows={rows}
      summaryCards={summaryCards}
      orientation={orientation}
      filename={filename}
      logoData={logoData}
    />,
  ).toBlob();

  // تحميل الملف
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${filename}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * تصدير فاتورة PDF
 * @example
 *   await exportInvoicePdf({ type: "sales_invoice", number, date, ... })
 */
export async function exportInvoicePdf(options: InvoicePdfOptions): Promise<void> {
  const { settings, type, number: num } = options;
  const meta = TYPE_META[type] || TYPE_META.sales_invoice;
  const logoData = settings?.logo_url ? await loadLogoBase64(settings.logo_url) : null;

  const blob = await pdf(<InvoiceDocument {...options} logoData={logoData} />).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${meta.label}-${num}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}
