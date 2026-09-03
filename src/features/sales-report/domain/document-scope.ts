export type SalesDocumentStatusFilter =
  | "all"
  | "posted"
  | "draft"
  | "cancelled";

interface SalesDocumentWithStatus {
  status?: string | null;
}

/**
 * Separates the operational invoice list from the posted-only financial scope.
 * Changing the detail filter must never change aggregate financial analysis.
 */
export function buildSalesInvoiceScopes<T extends SalesDocumentWithStatus>(
  invoices: T[],
  detailStatus: SalesDocumentStatusFilter,
) {
  const financialInvoices = invoices.filter(
    (invoice) => invoice.status === "posted",
  );
  const detailInvoices =
    detailStatus === "all"
      ? invoices
      : invoices.filter((invoice) => invoice.status === detailStatus);

  return { detailInvoices, financialInvoices };
}
