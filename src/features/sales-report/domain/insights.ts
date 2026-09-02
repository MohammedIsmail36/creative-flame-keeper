import type { InvoiceCoverage } from "./collections";

type NumericValue = number | string | null | undefined;

export interface SalesInsightInvoice {
  id: string;
  status: string | null;
  total: NumericValue;
  due_date?: string | null;
  discount?: NumericValue;
  tax?: NumericValue;
}

const EMPTY_COVERAGE: InvoiceCoverage = {
  cashCollected: 0,
  returnSettled: 0,
  totalCovered: 0,
};

const toFiniteNumber = (value: NumericValue): number => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

export function getInvoiceCoverage(
  invoiceId: string,
  coverageByInvoice: Record<string, InvoiceCoverage>,
): InvoiceCoverage {
  return coverageByInvoice[invoiceId] ?? EMPTY_COVERAGE;
}

export function isSalesInvoiceOverdue(
  invoice: SalesInsightInvoice,
  coverageByInvoice: Record<string, InvoiceCoverage>,
  today: string,
): boolean {
  const remaining =
    toFiniteNumber(invoice.total) -
    getInvoiceCoverage(invoice.id, coverageByInvoice).totalCovered;

  return Boolean(
    invoice.status === "posted" &&
      invoice.due_date &&
      invoice.due_date < today &&
      remaining > 0,
  );
}

export function buildOverdueSalesInfo(
  invoices: SalesInsightInvoice[],
  coverageByInvoice: Record<string, InvoiceCoverage>,
  today: string,
) {
  return invoices.reduce(
    (result, invoice) => {
      if (!isSalesInvoiceOverdue(invoice, coverageByInvoice, today)) {
        return result;
      }

      result.count += 1;
      result.total +=
        toFiniteNumber(invoice.total) -
        getInvoiceCoverage(invoice.id, coverageByInvoice).totalCovered;
      return result;
    },
    { count: 0, total: 0 },
  );
}

export function buildSalesDiscountTaxInfo(
  invoices: SalesInsightInvoice[],
) {
  return invoices.reduce(
    (result, invoice) => {
      if (invoice.status !== "posted") return result;
      result.discount += toFiniteNumber(invoice.discount);
      result.tax += toFiniteNumber(invoice.tax);
      return result;
    },
    { discount: 0, tax: 0 },
  );
}

function getMonthIndex(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return year * 12 + month - 1;
}

export function buildSalesTargetInfo(
  monthlyTarget: NumericValue,
  dateFrom: string,
  dateTo: string,
  netSales: number,
) {
  const target = toFiniteNumber(monthlyTarget);
  if (target <= 0) return null;

  const fromMonth = getMonthIndex(dateFrom);
  const toMonth = getMonthIndex(dateTo);
  const monthsInRange =
    fromMonth === null || toMonth === null
      ? 1
      : Math.max(1, toMonth - fromMonth + 1);
  const scaledTarget = target * monthsInRange;

  return {
    scaledTarget,
    pct: (toFiniteNumber(netSales) / scaledTarget) * 100,
    monthsInRange,
  };
}
