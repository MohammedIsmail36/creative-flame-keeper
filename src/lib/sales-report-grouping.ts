export interface UnionGroupingConfig<TSale, TReturn, TGroup> {
  getSaleKey: (row: TSale) => string;
  getReturnKey: (row: TReturn) => string;
  createFromSale: (key: string, row: TSale) => TGroup;
  createFromReturn: (key: string, row: TReturn) => TGroup;
  addSale: (group: TGroup, row: TSale) => void;
  addReturn: (group: TGroup, row: TReturn) => void;
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
