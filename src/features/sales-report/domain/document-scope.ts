export type SalesDocumentStatusFilter =
  | "all"
  | "posted"
  | "draft"
  | "cancelled";

interface SalesDocumentWithStatus {
  id?: string | null;
  status?: string | null;
}

interface SalesCostMovement {
  reference_id?: string | null;
  reference_type?: string | null;
  movement_type?: string | null;
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

/**
 * Keeps COGS movements tied to the posted documents included in the report.
 * Date-only matching can leak orphaned, draft, cancelled, or out-of-scope
 * inventory movements into product profit.
 */
export function filterFinancialSalesMovements<T extends SalesCostMovement>(
  invoices: SalesDocumentWithStatus[],
  returns: SalesDocumentWithStatus[],
  movements: T[],
): T[] {
  const invoiceIds = new Set(
    invoices.flatMap(({ id, status }) =>
      id && status === "posted" ? [id] : [],
    ),
  );
  const returnIds = new Set(
    returns.flatMap(({ id, status }) =>
      id && status === "posted" ? [id] : [],
    ),
  );

  return movements.filter((movement) => {
    if (!movement.reference_id) return false;
    if (
      movement.movement_type === "sale" &&
      movement.reference_type === "sales_invoice"
    ) {
      return invoiceIds.has(movement.reference_id);
    }
    if (
      movement.movement_type === "sale_return" &&
      movement.reference_type === "sales_return"
    ) {
      return returnIds.has(movement.reference_id);
    }
    return false;
  });
}
