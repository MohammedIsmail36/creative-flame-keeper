// ─── Inventory turnover: pure KPI computation ────────────────────────────────

import { differenceInDays } from "date-fns";
import {
  DAYS_CONSIDERED_NEW,
  ProductTurnoverData,
  TurnoverClass,
} from "./constants";
import type { PurchasesAgg } from "./aggregations";
import type { TurnoverProductRow } from "./compute";

export interface TurnoverKPIValues {
  avgTurnover: number;
  stagnantVal: number;
  urgentBuy: number;
  classACount: number;
  classAPct: number;
  turnoverChange: number | null;
  stagnantChange: number | null;
  belowMinCount: number;
  totalSuggestedCost: number;
  inactiveStockValue: number;
  supplierReturnValue: number;
  // GL reconciliation
  glInventoryBalance: number;
  operationalTotalValue: number;
  inventoryDiff: number;
  // Deep analytics KPIs
  frozenCapitalPct: number;
  customerReturnRate: number;
  shortPeriodWarning: boolean;
  lostSaleCount: number;
  healthFlagsCount: number;
}

export interface ComputeKpisInput {
  eligibleData: ProductTurnoverData[];
  allTurnoverData: ProductTurnoverData[];
  purchaseSuggestions: ProductTurnoverData[];
  inactiveProducts: ProductTurnoverData[];
  supplierReturnCandidates: ProductTurnoverData[];
  products: TurnoverProductRow[];
  prevSalesByProduct: Record<string, { soldQty: number; revenue: number }>;
  purchasesByProduct: Record<string, PurchasesAgg>;
  wacMap: Record<string, number>;
  glInventoryBalance: number;
  periodDays: number;
  /** الطول الفعلي للفترة قبل الحد الأدنى (للتحذير من الفترات القصيرة) */
  rawPeriodDays: number;
  today: Date;
}

export function computeTurnoverKpis(
  input: ComputeKpisInput,
): TurnoverKPIValues {
  const {
    eligibleData,
    allTurnoverData,
    purchaseSuggestions,
    inactiveProducts,
    supplierReturnCandidates,
    products,
    prevSalesByProduct,
    purchasesByProduct,
    wacMap,
    glInventoryBalance,
    periodDays,
    rawPeriodDays,
    today,
  } = input;

  const withSales = eligibleData.filter((p) => p.soldQty > 0);
  const avgTurnover =
    withSales.length > 0
      ? withSales.reduce((s, p) => s + (p.turnoverRate ?? 0), 0) /
        withSales.length
      : 0;
  const stagnantVal = eligibleData
    .filter((p) => p.turnoverClass === "stagnant")
    .reduce((s, p) => s + (p.stockValue ?? 0), 0);
  const urgentBuy = eligibleData.filter((p) => p.actionPriority === 1).length;
  const classA = eligibleData.filter((p) => p.abcClass === "A");
  const totalRev = eligibleData.reduce((s, p) => s + p.revenue, 0);
  const classAPct =
    totalRev > 0
      ? (classA.reduce((s, p) => s + p.revenue, 0) / totalRev) * 100
      : 0;

  // ── مقارنة الفترة السابقة ──────────────────────────────────────────────
  const prevCalc = products
    .filter((p) => {
      const purchases = purchasesByProduct[p.id];
      const soldQty = prevSalesByProduct[p.id]?.soldQty || 0;
      const lpd = purchases?.lastDate || null;
      const dsa = p.created_at
        ? differenceInDays(today, new Date(p.created_at))
        : Infinity;
      const dslp = lpd ? differenceInDays(today, new Date(lpd)) : Infinity;
      const neverPurchased = lpd === null && soldQty === 0;
      if (neverPurchased && dsa >= DAYS_CONSIDERED_NEW) return false;
      if (soldQty === 0 && !neverPurchased && dslp < DAYS_CONSIDERED_NEW)
        return false;
      if (soldQty === 0 && neverPurchased && dsa < DAYS_CONSIDERED_NEW)
        return false;
      return true;
    })
    .map((p) => {
      const ps = prevSalesByProduct[p.id];
      const stock = Number(p.quantity_on_hand);
      const sold = ps?.soldQty || 0;
      // نفس أساس WAC المستخدم في الفترة الحالية لمقارنة عادلة
      const wacFromMovements = wacMap[p.id];
      const lpp =
        purchasesByProduct[p.id]?.lastPrice ??
        (p.purchase_price ? Number(p.purchase_price) : null);
      const wac =
        typeof wacFromMovements === "number" && wacFromMovements > 0
          ? wacFromMovements
          : lpp;
      const tr = stock > 0 ? sold / stock : sold > 0 ? sold : 0;
      const ann = tr * (365 / periodDays);
      const tc: TurnoverClass =
        ann >= 6 ? "excellent" : ann >= 3 ? "good" : ann >= 1 ? "slow" : "stagnant";
      return {
        turnoverRate: tr,
        turnoverClass: tc,
        stockValue: wac !== null ? stock * wac : 0,
      };
    });

  const prevWithSales = prevCalc.filter((p) => p.turnoverRate > 0);
  const prevAvgTR =
    prevWithSales.length > 0
      ? prevWithSales.reduce((s, p) => s + p.turnoverRate, 0) /
        prevWithSales.length
      : 0;
  const prevStagnantV = prevCalc
    .filter((p) => p.turnoverClass === "stagnant")
    .reduce((s, p) => s + p.stockValue, 0);

  const belowMinCount = eligibleData.filter((p) => p.belowMinStock).length;
  const totalSuggestedCost = purchaseSuggestions.reduce(
    (s, p) => s + p.suggestedPurchaseQty * (p.lastPurchasePrice ?? p.wac ?? 0),
    0,
  );
  const inactiveStockValue = inactiveProducts.reduce(
    (s, p) => s + (p.stockValue ?? 0),
    0,
  );
  const supplierReturnValue = supplierReturnCandidates.reduce(
    (s, p) => s + (p.stockValue ?? 0),
    0,
  );

  // قيمة المخزون التشغيلية الإجمالية (شاملة غير النشط للمطابقة مع GL)
  const operationalTotalValue = allTurnoverData.reduce(
    (s, p) => s + (p.stockValue ?? 0),
    0,
  );
  const inventoryDiff = operationalTotalValue - glInventoryBalance;

  const frozenCapitalPct =
    operationalTotalValue > 0
      ? ((stagnantVal + inactiveStockValue) / operationalTotalValue) * 100
      : 0;

  const totalGrossSold = eligibleData.reduce((s, p) => s + p.grossSoldQty, 0);
  const totalReturned = eligibleData.reduce((s, p) => s + p.returnedQty, 0);
  const customerReturnRate =
    totalGrossSold > 0 ? (totalReturned / totalGrossSold) * 100 : 0;

  const shortPeriodWarning = rawPeriodDays < 14;

  const lostSaleCount = eligibleData.filter((p) => p.lostSale).length;
  const healthFlagsCount = allTurnoverData.filter((p) => p.hasAnyHealthFlag)
    .length;

  return {
    avgTurnover,
    stagnantVal,
    urgentBuy,
    classACount: classA.length,
    classAPct,
    turnoverChange: shortPeriodWarning
      ? null
      : prevAvgTR > 0
        ? ((avgTurnover - prevAvgTR) / prevAvgTR) * 100
        : null,
    stagnantChange: shortPeriodWarning
      ? null
      : prevStagnantV > 0
        ? ((stagnantVal - prevStagnantV) / prevStagnantV) * 100
        : null,
    belowMinCount,
    totalSuggestedCost,
    inactiveStockValue,
    supplierReturnValue,
    glInventoryBalance,
    operationalTotalValue,
    inventoryDiff,
    frozenCapitalPct,
    customerReturnRate,
    shortPeriodWarning,
    lostSaleCount,
    healthFlagsCount,
  };
}
