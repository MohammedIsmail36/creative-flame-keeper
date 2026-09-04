export type SalesReportAccessRole = "admin" | "accountant" | "sales";

/**
 * The full report exposes cost of goods sold, profit, and margin data.
 * Keep this list shared by route and navigation guards so access cannot drift.
 */
export const FULL_SALES_REPORT_ROLES: SalesReportAccessRole[] = [
  "admin",
  "accountant",
];

export function canAccessFullSalesReport(
  role: SalesReportAccessRole | null | undefined,
): boolean {
  return Boolean(role && FULL_SALES_REPORT_ROLES.includes(role));
}
