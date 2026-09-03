import { formatDisplayNumber } from "@/lib/posted-number-utils";
import type { InvoiceCoverage } from "./collections";
import {
  getInvoiceCoverage,
  isSalesInvoiceOverdue,
  type SalesInsightInvoice,
} from "./insights";
import { getDocumentAmountExcludingTax } from "./metrics";

type NumericValue = number | string | null | undefined;
type ExportCell = string | number;

interface SalesExportInvoice extends SalesInsightInvoice {
  invoice_number: number;
  posted_number: number | null;
  invoice_date: string;
  customer?: { name?: string | null } | null;
  tax?: NumericValue;
}

interface SalesExportReturn {
  return_number: number;
  posted_number: number | null;
  return_date: string;
  status: string;
  total: NumericValue;
  tax?: NumericValue;
  customer?: { name?: string | null } | null;
  items?: unknown[] | null;
}

export interface DocumentSalesExportConfig {
  filenamePrefix: string;
  sheetName: string;
  pdfTitle: string;
  headers: string[];
  rows: ExportCell[][];
  pdfOrientation?: "landscape";
}

const toFiniteNumber = (value: NumericValue): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

const getArabicDocumentStatus = (status: string | null) =>
  status === "posted" ? "مُرحّل" : status === "cancelled" ? "ملغي" : "مسودة";

export function buildInvoiceSalesExport({
  invoices,
  dateFrom,
  dateTo,
  invoicePrefix,
  cogsByInvoice,
  coverageByInvoice,
  today,
}: {
  invoices: SalesExportInvoice[];
  dateFrom: string;
  dateTo: string;
  invoicePrefix: string;
  cogsByInvoice: Record<string, number>;
  coverageByInvoice: Record<string, InvoiceCoverage>;
  today: string;
}): DocumentSalesExportConfig {
  return {
    filenamePrefix: `تقرير-المبيعات-${dateFrom}-${dateTo}`,
    sheetName: "المبيعات",
    pdfTitle: `تقرير المبيعات (${dateFrom} - ${dateTo})`,
    headers: [
      "رقم",
      "التاريخ",
      "العميل",
      "الحالة",
      "الإجمالي",
      "التحصيل النقدي/البنكي",
      "تسوية بمرتجع",
      "المتبقي",
      "تكلفة البضاعة",
      "الربح قبل المرتجعات المستقلة",
      "الهامش%",
      "متأخر",
    ],
    rows: invoices.map((invoice) => {
      const coverage = getInvoiceCoverage(invoice.id, coverageByInvoice);
      const total = toFiniteNumber(invoice.total);
      const revenue = total - toFiniteNumber(invoice.tax);
      const cogs = cogsByInvoice[invoice.id] ?? 0;
      const isPosted = invoice.status === "posted";
      const profit = revenue - cogs;
      const margin =
        isPosted && revenue > 0 && cogs > 0
          ? `${((profit / revenue) * 100).toFixed(1)}%`
          : "—";

      return [
        formatDisplayNumber(
          invoicePrefix,
          invoice.posted_number,
          invoice.invoice_number,
          invoice.status ?? "draft",
        ),
        invoice.invoice_date,
        invoice.customer?.name || "-",
        getArabicDocumentStatus(invoice.status),
        total,
        coverage.cashCollected,
        coverage.returnSettled,
        total - coverage.totalCovered,
        cogs,
        isPosted ? profit : "—",
        margin,
        isSalesInvoiceOverdue(invoice, coverageByInvoice, today) ? "نعم" : "",
      ];
    }),
    pdfOrientation: "landscape",
  };
}

export function buildReturnSalesExport({
  returns,
  dateFrom,
  dateTo,
  returnPrefix,
}: {
  returns: SalesExportReturn[];
  dateFrom: string;
  dateTo: string;
  returnPrefix: string;
}): DocumentSalesExportConfig {
  return {
    filenamePrefix: `تقرير-مرتجعات-المبيعات-${dateFrom}-${dateTo}`,
    sheetName: "المرتجعات المستقلة",
    pdfTitle: `مستندات مرتجعات المبيعات المستقلة (${dateFrom} - ${dateTo})`,
    headers: [
      "رقم المرتجع",
      "التاريخ",
      "العميل",
      "عدد البنود",
      "المرتجع قبل الضريبة",
      "النوع",
    ],
    rows: returns.map((salesReturn) => [
      formatDisplayNumber(
        returnPrefix,
        salesReturn.posted_number,
        salesReturn.return_number,
        salesReturn.status,
      ),
      salesReturn.return_date,
      salesReturn.customer?.name || "عميل نقدي",
      (salesReturn.items ?? []).length,
      getDocumentAmountExcludingTax(salesReturn),
      "مستند مستقل",
    ]),
  };
}
