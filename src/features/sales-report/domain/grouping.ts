import { getDocumentAmountExcludingTax } from "./metrics";

// Dimension grouping used exclusively by the sales report feature.
export interface UnionGroupingConfig<TSale, TReturn, TGroup> {
  getSaleKey: (row: TSale) => string;
  getReturnKey: (row: TReturn) => string;
  createFromSale: (key: string, row: TSale) => TGroup;
  createFromReturn: (key: string, row: TReturn) => TGroup;
  addSale: (group: TGroup, row: TSale) => void;
  addReturn: (group: TGroup, row: TReturn) => void;
}

interface CustomerDocument {
  id?: string;
  customer_id?: string | null;
  customer?: { name?: string | null } | null;
  status: string | null;
  total: number | string | null;
  tax?: number | string | null;
}

interface CustomerCoverage {
  cashCollected: number;
  returnSettled: number;
}

export interface CustomerSalesGroup {
  name: string;
  count: number;
  total: number;
  invoiceGrossTotal: number;
  cashCollected: number;
  returnSettled: number;
  returns: number;
  returnOnly: boolean;
}

export function buildCustomerSalesGroups(
  invoices: CustomerDocument[],
  returns: CustomerDocument[],
  getCoverage: (invoiceId: string) => CustomerCoverage,
): CustomerSalesGroup[] {
  const createGroup = (row: CustomerDocument): CustomerSalesGroup => ({
    name: row.customer?.name || "عميل نقدي",
    count: 0,
    total: 0,
    invoiceGrossTotal: 0,
    cashCollected: 0,
    returnSettled: 0,
    returns: 0,
    returnOnly: false,
  });

  const groups = groupSalesAndReturns<
    CustomerDocument,
    CustomerDocument,
    CustomerSalesGroup
  >(invoices, returns, {
    getSaleKey: (invoice) => invoice.customer_id || "__none__",
    getReturnKey: (salesReturn) => salesReturn.customer_id || "__none__",
    createFromSale: (_key, invoice) => createGroup(invoice),
    createFromReturn: (_key, salesReturn) => createGroup(salesReturn),
    addSale: (group, invoice) => {
      group.count += 1;
      group.total += getDocumentAmountExcludingTax(invoice);
      if (invoice.status === "posted" && invoice.id) {
        const coverage = getCoverage(invoice.id);
        group.invoiceGrossTotal += Number(invoice.total ?? 0);
        group.cashCollected += coverage.cashCollected;
        group.returnSettled += coverage.returnSettled;
      }
    },
    addReturn: (group, salesReturn) => {
      group.returns += getDocumentAmountExcludingTax(salesReturn);
    },
  });

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      returnOnly: group.count === 0 && group.returns > 0,
    }))
    .sort((a, b) => b.total - b.returns - (a.total - a.returns));
}

/**
 * Groups sales and standalone returns using the union of keys from both sets.
 * A return-only key therefore produces a real group instead of being discarded.
 */
export function groupSalesAndReturns<TSale, TReturn, TGroup>(
  sales: TSale[],
  returns: TReturn[],
  config: UnionGroupingConfig<TSale, TReturn, TGroup>,
): Map<string, TGroup> {
  const groups = new Map<string, TGroup>();

  for (const row of sales) {
    const key = config.getSaleKey(row);
    const group = groups.get(key) ?? config.createFromSale(key, row);
    config.addSale(group, row);
    groups.set(key, group);
  }

  for (const row of returns) {
    const key = config.getReturnKey(row);
    const group = groups.get(key) ?? config.createFromReturn(key, row);
    config.addReturn(group, row);
    groups.set(key, group);
  }

  return groups;
}
