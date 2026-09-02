import { formatProductDisplay } from "@/lib/product-utils";
import {
  getDocumentAmountExcludingTax,
  getSalesLineNetAmount,
} from "./metrics";

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

interface ProductLine {
  product_id?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  total?: number | string | null;
  net_total?: number | string | null;
  product?: {
    name?: string | null;
    model_number?: string | null;
    category_id?: string | null;
    category?: { name?: string | null } | null;
    brand?: { name?: string | null } | null;
  } | null;
}

interface ProductDocument {
  items?: ProductLine[] | null;
}

interface ProductCostMovement {
  product_id?: string | null;
  movement_type?: string | null;
  total_cost?: number | string | null;
}

export interface ProductSalesGroup {
  id: string;
  name: string;
  qtySold: number;
  qtyReturned: number;
  grossRevenue: number;
  returnsRevenue: number;
  revenue: number;
  cogs: number;
  returnOnly: boolean;
  reconciliationStatus:
    | "return_only"
    | "fully_returned"
    | "return_price_difference"
    | null;
}

export function buildProductSalesGroups(
  invoices: ProductDocument[],
  returns: ProductDocument[],
  movements: ProductCostMovement[],
): ProductSalesGroup[] {
  const cogsByProduct = movements.reduce<Record<string, number>>(
    (totals, movement) => {
      if (!movement.product_id) return totals;
      const sign = movement.movement_type === "sale" ? 1 : -1;
      if (!["sale", "sale_return"].includes(movement.movement_type ?? "")) {
        return totals;
      }
      totals[movement.product_id] =
        (totals[movement.product_id] ?? 0) +
        sign * Number(movement.total_cost ?? 0);
      return totals;
    },
    {},
  );

  const salesItems = invoices.flatMap((invoice) => invoice.items ?? []);
  const returnItems = returns.flatMap((salesReturn) => salesReturn.items ?? []);
  const itemKey = (item: ProductLine) =>
    item.product_id || `__desc__${item.description || "unknown"}`;
  const createGroup = (
    key: string,
    item: ProductLine,
  ): ProductSalesGroup => ({
    id: key,
    name: item.product
      ? formatProductDisplay(
          item.product.name ?? "",
          item.product.brand?.name,
          item.product.model_number,
        )
      : item.description || "منتج محذوف",
    qtySold: 0,
    qtyReturned: 0,
    grossRevenue: 0,
    returnsRevenue: 0,
    revenue: 0,
    cogs: 0,
    returnOnly: false,
    reconciliationStatus: null,
  });

  const groups = groupSalesAndReturns<
    ProductLine,
    ProductLine,
    ProductSalesGroup
  >(salesItems, returnItems, {
    getSaleKey: itemKey,
    getReturnKey: itemKey,
    createFromSale: createGroup,
    createFromReturn: createGroup,
    addSale: (group, item) => {
      group.qtySold += Number(item.quantity ?? 0);
      group.grossRevenue += getSalesLineNetAmount(item);
    },
    addReturn: (group, item) => {
      group.qtyReturned += Number(item.quantity ?? 0);
      group.returnsRevenue += getSalesLineNetAmount(item);
    },
  });

  return Array.from(groups.values())
    .map((group) => {
      const revenue = group.grossRevenue - group.returnsRevenue;
      const returnOnly = group.grossRevenue === 0 && group.returnsRevenue > 0;
      const hasFullyReturnedQuantity =
        group.qtySold > 0 &&
        Math.abs(group.qtySold - group.qtyReturned) < 0.000001;
      const reconciliationStatus = returnOnly
        ? "return_only"
        : hasFullyReturnedQuantity && Math.abs(revenue) < 0.005
          ? "fully_returned"
          : hasFullyReturnedQuantity
            ? "return_price_difference"
            : null;

      return {
        ...group,
        revenue,
        cogs: cogsByProduct[group.id] ?? 0,
        returnOnly,
        reconciliationStatus,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export interface CategorySalesGroup {
  id: string;
  name: string;
  productCount: number;
  qtySold: number;
  qtyReturned: number;
  revenue: number;
  returns: number;
  net: number;
  cogs: number;
  profit: number;
  margin: number | null;
  returnRate: number | null;
  pctOfTotal: number;
  returnOnly: boolean;
}

export function buildCategorySalesGroups(
  invoices: ProductDocument[],
  returns: ProductDocument[],
  movements: ProductCostMovement[],
  includeCost: boolean,
): CategorySalesGroup[] {
  type MutableCategoryGroup = {
    id: string;
    name: string;
    products: Set<string>;
    qtySold: number;
    qtyReturned: number;
    revenue: number;
    returns: number;
  };

  const productCategories: Record<string, string> = {};
  const salesItems = invoices.flatMap((invoice) => invoice.items ?? []);
  const returnItems = returns.flatMap((salesReturn) => salesReturn.items ?? []);
  const allItems = [...salesItems, ...returnItems];
  for (const item of allItems) {
    if (item.product_id) {
      productCategories[item.product_id] =
        item.product?.category_id || "__none__";
    }
  }

  const cogsByCategory = movements.reduce<Record<string, number>>(
    (totals, movement) => {
      if (!["sale", "sale_return"].includes(movement.movement_type ?? "")) {
        return totals;
      }
      const categoryId = movement.product_id
        ? productCategories[movement.product_id] || "__none__"
        : "__none__";
      const sign = movement.movement_type === "sale" ? 1 : -1;
      totals[categoryId] =
        (totals[categoryId] ?? 0) + sign * Number(movement.total_cost ?? 0);
      return totals;
    },
    {},
  );

  const categoryKey = (item: ProductLine) =>
    item.product?.category_id || "__none__";
  const createGroup = (
    key: string,
    item: ProductLine,
  ): MutableCategoryGroup => ({
    id: key,
    name: item.product?.category?.name || "بدون تصنيف",
    products: new Set(),
    qtySold: 0,
    qtyReturned: 0,
    revenue: 0,
    returns: 0,
  });
  const groups = groupSalesAndReturns<
    ProductLine,
    ProductLine,
    MutableCategoryGroup
  >(salesItems, returnItems, {
    getSaleKey: categoryKey,
    getReturnKey: categoryKey,
    createFromSale: createGroup,
    createFromReturn: createGroup,
    addSale: (group, item) => {
      if (item.product_id) group.products.add(item.product_id);
      group.qtySold += Number(item.quantity ?? 0);
      group.revenue += getSalesLineNetAmount(item);
    },
    addReturn: (group, item) => {
      if (item.product_id) group.products.add(item.product_id);
      group.qtyReturned += Number(item.quantity ?? 0);
      group.returns += getSalesLineNetAmount(item);
    },
  });

  const groupedValues = Array.from(groups.values());
  const totalNet = groupedValues.reduce(
    (total, category) => total + category.revenue - category.returns,
    0,
  );

  return groupedValues
    .map((category) => {
      const net = category.revenue - category.returns;
      const cogs = includeCost ? (cogsByCategory[category.id] ?? 0) : 0;
      const profit = includeCost ? net - cogs : 0;
      return {
        id: category.id,
        name: category.name,
        productCount: category.products.size,
        qtySold: category.qtySold,
        qtyReturned: category.qtyReturned,
        revenue: category.revenue,
        returns: category.returns,
        net,
        cogs,
        profit,
        margin: includeCost && net > 0 ? (profit / net) * 100 : null,
        returnRate:
          category.revenue > 0
            ? (category.returns / category.revenue) * 100
            : null,
        pctOfTotal: totalNet > 0 ? (net / totalNet) * 100 : 0,
        returnOnly: category.revenue === 0 && category.returns > 0,
      };
    })
    .sort((a, b) => b.net - a.net);
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
