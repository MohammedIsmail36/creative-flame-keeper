// ─── Inventory turnover: pure derived datasets ───────────────────────────────

import {
  ProductTurnoverData,
  TURNOVER_LABELS,
  TURNOVER_PIE_COLORS,
  getTurnoverSpeed,
} from "./constants";

export interface TurnoverDerived {
  categoryFilteredData: ProductTurnoverData[];
  eligibleData: ProductTurnoverData[];
  filteredData: ProductTurnoverData[];
  purchaseSuggestions: ProductTurnoverData[];
  supplierReturnCandidates: ProductTurnoverData[];
  dormantProducts: ProductTurnoverData[];
  inactiveProducts: ProductTurnoverData[];
  newProductsUnderTest: ProductTurnoverData[];
  unlistedProducts: ProductTurnoverData[];
  alerts: {
    urgent: ProductTurnoverData[];
    followup: ProductTurnoverData[];
    review: ProductTurnoverData[];
  };
  matrixCounts: Record<string, number>;
  pieData: { name: string; value: number; color: string }[];
  newProductsCount: number;
  allProductsNew: boolean;
  uniqueSuppliers: string[];
}

export function computeTurnoverDerived(
  allTurnoverData: ProductTurnoverData[],
  categoryDescendantIds: Set<string> | null,
): TurnoverDerived {
  const categoryFilteredData = categoryDescendantIds
    ? allTurnoverData.filter((p) =>
        categoryDescendantIds.has(p.categoryId ?? ""),
      )
    : allTurnoverData;

  const eligibleData = categoryFilteredData.filter(
    (p) => p.abcClass !== "excluded",
  );

  const newProductsCount = categoryFilteredData.filter(
    (p) => p.turnoverClass === "new" || p.turnoverClass === "new_unlisted",
  ).length;

  const inactiveProducts = categoryFilteredData.filter(
    (p) => p.turnoverClass === "inactive" && p.currentStock > 0,
  );

  const allProductsNew =
    eligibleData.length === 0 && categoryFilteredData.length > 0;

  const newProductsUnderTest = categoryFilteredData.filter(
    (p) =>
      p.turnoverClass === "new" &&
      !(p.lastPurchaseDate === null && p.soldQty === 0),
  );

  const unlistedProducts = categoryFilteredData.filter(
    (p) =>
      p.turnoverClass === "new_unlisted" ||
      (p.turnoverClass === "new" &&
        p.lastPurchaseDate === null &&
        p.soldQty === 0),
  );

  const purchaseSuggestions = eligibleData
    .filter((p) => p.suggestedPurchaseQty > 0 || p.belowMinStock)
    .sort((a, b) => {
      if (a.currentStock === 0 && b.currentStock !== 0) return -1;
      if (b.currentStock === 0 && a.currentStock !== 0) return 1;
      if (a.belowMinStock && !b.belowMinStock) return -1;
      if (b.belowMinStock && !a.belowMinStock) return 1;
      return (a.coverageDays ?? 9999) - (b.coverageDays ?? 9999);
    });

  const supplierReturnCandidates = categoryFilteredData
    .filter((p) => p.supplierReturnCandidate && p.currentStock > 0)
    .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0));

  const dormantProducts = eligibleData.filter(
    (p) =>
      p.turnoverClass === "stagnant" && p.soldQty === 0 && p.currentStock > 0,
  );

  const alerts = {
    urgent: eligibleData.filter((p) => p.actionPriority === 1),
    followup: eligibleData.filter((p) => p.actionPriority === 2),
    review: eligibleData.filter((p) => p.actionPriority === 3),
  };

  const matrixCounts: Record<string, number> = {};
  ["A", "B", "C"].forEach((abc) =>
    ["fast", "medium", "slow"].forEach((speed) => {
      matrixCounts[`${abc}-${speed}`] = eligibleData.filter(
        (p) => p.abcClass === abc && getTurnoverSpeed(p.turnoverClass) === speed,
      ).length;
    }),
  );

  const groups: Record<string, number> = {
    ممتاز: 0,
    جيد: 0,
    بطيء: 0,
    راكد: 0,
    جديد: 0,
    "غير نشط": 0,
  };
  categoryFilteredData.forEach((p) => {
    const label =
      p.turnoverClass === "new" || p.turnoverClass === "new_unlisted"
        ? "جديد"
        : TURNOVER_LABELS[p.turnoverClass];
    if (label in groups) groups[label] += p.stockValue ?? 0;
  });
  const pieData = Object.entries(groups)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({
      name,
      value,
      color: TURNOVER_PIE_COLORS[name] || "hsl(0,0%,60%)",
    }));

  const supplierSet = new Set<string>();
  allTurnoverData.forEach((p) => {
    if (p.lastSupplierName) supplierSet.add(p.lastSupplierName);
  });

  return {
    categoryFilteredData,
    eligibleData,
    filteredData: categoryFilteredData,
    purchaseSuggestions,
    supplierReturnCandidates,
    dormantProducts,
    inactiveProducts,
    newProductsUnderTest,
    unlistedProducts,
    alerts,
    matrixCounts,
    pieData,
    newProductsCount,
    allProductsNew,
    uniqueSuppliers: Array.from(supplierSet).sort(),
  };
}
