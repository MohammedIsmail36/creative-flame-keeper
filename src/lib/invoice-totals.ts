import { round2 } from "@/lib/utils";

interface LineItem {
  total: number;
  discount: number;
}

interface InvoiceTotalsInput {
  items: LineItem[];
  invoiceDiscount?: number;
  showTax: boolean;
  taxRate: number;
}

interface InvoiceTotalsResult {
  subtotal: number;
  hasLineDiscount: boolean;
  hasInvoiceDiscount: boolean;
  discountMode: "line" | "invoice" | "none";
  afterDiscount: number;
  taxAmount: number;
  grandTotal: number;
}

export function calcInvoiceTotals({
  items,
  invoiceDiscount = 0,
  showTax,
  taxRate,
}: InvoiceTotalsInput): InvoiceTotalsResult {
  const subtotal = round2(items.reduce((s, i) => s + i.total, 0));
  const hasLineDiscount = items.some((i) => i.discount > 0);
  const hasInvoiceDiscount = invoiceDiscount > 0;
  const discountMode: "line" | "invoice" | "none" = hasLineDiscount
    ? "line"
    : hasInvoiceDiscount
      ? "invoice"
      : "none";
  const afterDiscount = round2(subtotal - invoiceDiscount);
  const taxAmount = round2(showTax ? afterDiscount * (taxRate / 100) : 0);
  const grandTotal = round2(afterDiscount + taxAmount);

  return {
    subtotal,
    hasLineDiscount,
    hasInvoiceDiscount,
    discountMode,
    afterDiscount,
    taxAmount,
    grandTotal,
  };
}
