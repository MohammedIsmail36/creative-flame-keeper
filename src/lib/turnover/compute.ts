// ─── Inventory turnover: pure core computation ───────────────────────────────
// كل قواعد التصنيف (دوران، ABC، أولوية الإجراء، ترشيح الإرجاع للمورد) هنا
// كدوال خالصة بلا استعلامات ولا حالة React — لتكون قابلة للاختبار والمراجعة.

import { differenceInDays } from "date-fns";
import { formatProductDisplay } from "@/lib/product-utils";
import { round2 } from "@/lib/utils";
import {
  INVENTORY_RULES,
  type InventoryAction,
} from "@/lib/inventory/definitions";
import {
  ABCClass,
  DAYS_CONSIDERED_NEW,
  ProductTurnoverData,
  TurnoverClass,
} from "./constants";
import type { PurchasesAgg, ReturnsAgg, SalesAgg } from "./aggregations";


export interface TurnoverProductRow {
  id: string;
  code: string;
  name: string;
  quantity_on_hand: number | string;
  purchase_price?: number | string | null;
  selling_price?: number | string | null;
  category_id?: string | null;
  is_active?: boolean | null;
  created_at?: string | null;
  min_stock_level?: number | string | null;
  model_number?: string | null;
  product_categories?: { name?: string | null } | null;
  product_brands?: { name?: string | null } | null;
}

export interface ComputeTurnoverInput {
  products: TurnoverProductRow[];
  salesByProduct: Record<string, SalesAgg>;
  purchasesByProduct: Record<string, PurchasesAgg>;
  salesReturnsByProduct: Record<string, ReturnsAgg>;
  purchaseReturnsByProduct: Record<string, ReturnsAgg>;
  wacMap: Record<string, number>;
  firstActivityMap: Record<string, string>;
  variabilityByProduct: Record<string, number | null>;
  priorYearSalesByProduct: Record<string, number>;
  /** طول الفترة بعد الحماية الرياضية (حد أدنى 7 أيام) */
  periodDays: number;
  today: Date;
}

/** عتبة أيام بدون إعادة شراء تُعد بعدها فرصة بيع ضائعة */
export const LOST_SALE_DAYS = 14;

export function computeTurnoverData(
  input: ComputeTurnoverInput,
): ProductTurnoverData[] {
  const {
    products,
    salesByProduct,
    purchasesByProduct,
    salesReturnsByProduct,
    purchaseReturnsByProduct,
    wacMap,
    firstActivityMap,
    variabilityByProduct,
    priorYearSalesByProduct,
    periodDays,
    today,
  } = input;

  const items: ProductTurnoverData[] = products.map((p) => {
    const sales = salesByProduct[p.id];
    const purchases = purchasesByProduct[p.id];
    const sReturns = salesReturnsByProduct[p.id];
    const pReturns = purchaseReturnsByProduct[p.id];

    const currentStock = Number(p.quantity_on_hand);
    const grossSoldQty = sales?.soldQty || 0;
    const returnedQty = sReturns?.returnedQty || 0;
    const soldQty = Math.max(0, grossSoldQty - returnedQty);
    const grossPurchasedQty = purchases?.purchasedQty || 0;
    const purchaseReturnedQty = pReturns?.returnedQty || 0;
    const purchasedQty = Math.max(0, grossPurchasedQty - purchaseReturnedQty);
    const lastPurchasePrice =
      purchases?.lastPrice ??
      (p.purchase_price != null ? Number(p.purchase_price) : null);
    // WAC = نفس مصدر تقرير المخزون و GL (حساب 1104)، وإلا آخر سعر شراء
    const wacFromMovements = wacMap[p.id];
    const wac =
      typeof wacFromMovements === "number" && wacFromMovements > 0
        ? wacFromMovements
        : lastPurchasePrice;
    const lastSupplierName = purchases?.lastSupplierName || null;
    const revenue = Math.max(
      0,
      (sales?.revenue || 0) - (sReturns?.returnedValue || 0),
    );
    const lastSaleDate = sales?.lastDate || null;
    const lastPurchaseDate = purchases?.lastDate || null;
    const sellingPrice =
      p.selling_price != null ? Number(p.selling_price) : null;
    const minStockLevel =
      p.min_stock_level != null ? Number(p.min_stock_level) : null;
    const isActive = p.is_active !== false;
    const belowMinStock =
      minStockLevel !== null && currentStock < minStockLevel;

    // هامش الربح على WAC للاتساق مع COGS و GL
    const profitMargin =
      sellingPrice && wac && sellingPrice > 0
        ? ((sellingPrice - wac) / sellingPrice) * 100
        : null;

    const daysSinceAdded = p.created_at
      ? differenceInDays(today, new Date(p.created_at))
      : Infinity;
    const daysSinceLastPurchaseVal = lastPurchaseDate
      ? differenceInDays(today, new Date(lastPurchaseDate))
      : Infinity;
    const daysSinceLastSaleVal = lastSaleDate
      ? differenceInDays(today, new Date(lastSaleDate))
      : null;

    // أول حركة فعلية للمنتج — حماية المنتجات الحديثة
    const firstMovement = firstActivityMap[p.id] || null;
    const candidateDates: string[] = [];
    if (firstMovement) candidateDates.push(firstMovement);
    if (lastPurchaseDate) candidateDates.push(lastPurchaseDate);
    if (lastSaleDate) candidateDates.push(lastSaleDate);
    if (p.created_at) candidateDates.push(String(p.created_at).slice(0, 10));
    const firstActivityDate =
      candidateDates.length > 0 ? candidateDates.sort()[0] : null;
    const daysSinceFirstActivity = firstActivityDate
      ? differenceInDays(today, new Date(firstActivityDate))
      : daysSinceAdded === Infinity
        ? 9999
        : daysSinceAdded;

    // effectiveAge = الأقدم من (آخر شراء، أول حركة، تاريخ الإضافة)
    const effectiveAge = Math.min(
      lastPurchaseDate ? daysSinceLastPurchaseVal : Infinity,
      daysSinceFirstActivity,
      daysSinceAdded === Infinity ? 9999 : daysSinceAdded,
    );

    const isNeverPurchased = lastPurchaseDate === null && soldQty === 0;
    const isNewProduct =
      !isNeverPurchased && daysSinceFirstActivity < DAYS_CONSIDERED_NEW;
    const isRecentlyAdded =
      soldQty === 0 && isNeverPurchased && daysSinceAdded < DAYS_CONSIDERED_NEW;

    // قيمة المخزون التشغيلية = الكمية × WAC (تتطابق مع تقرير المخزون)
    const stockValue = wac !== null ? currentStock * wac : null;
    const productName = formatProductDisplay(
      p.name,
      p.product_brands?.name ?? undefined,
      p.model_number ?? undefined,
    );

    // ── Health Flags (للعرض فقط، لا تؤثر على التصنيف) ──────────────────
    const flagHighReturns =
      grossSoldQty > 0 && returnedQty / grossSoldQty > 0.3;
    const flagNoSellingPrice = !sellingPrice || sellingPrice <= 0;
    const flagNegativeMargin =
      sellingPrice !== null &&
      sellingPrice > 0 &&
      wac !== null &&
      wac > sellingPrice;
    const flagZeroWac = currentStock > 0 && (!wac || wac <= 0);
    const flagFullySupplierReturned =
      grossPurchasedQty > 0 && purchaseReturnedQty >= grossPurchasedQty;

    const salesVariability = variabilityByProduct[p.id] ?? null;
    const isSeasonalOrVolatile =
      salesVariability !== null && salesVariability > 1.5;

    const priorYearSalesQty =
      daysSinceFirstActivity >= 365
        ? (priorYearSalesByProduct[p.id] ?? 0)
        : null;

    // فرصة بيع ضائعة: نفد + بِيع + لم يُشترَ منذ +14 يوم
    const lostSale =
      currentStock === 0 &&
      soldQty > 0 &&
      (daysSinceLastPurchaseVal === Infinity ||
        daysSinceLastPurchaseVal >= LOST_SALE_DAYS);
    const daysWithoutRepurchase = lostSale
      ? daysSinceLastPurchaseVal === Infinity
        ? null
        : daysSinceLastPurchaseVal
      : null;

    const baseProps = {
      productId: p.id,
      productCode: p.code,
      productName,
      categoryName: p.product_categories?.name || "بدون تصنيف",
      categoryId: p.category_id ?? null,
      currentStock,
      stockValue,
      soldQty,
      grossSoldQty,
      returnedQty,
      purchasedQty,
      grossPurchasedQty,
      purchaseReturnedQty,
      avgDailySales: 0,
      lastSaleDate,
      lastPurchaseDate,
      lastPurchasePrice,
      wac,
      sellingPrice,
      profitMargin,
      abcClass: "excluded" as ABCClass,
      actionPriority: null as 1 | 2 | 3 | null,
      actionLabel: null as string | null,
      revenue,
      lastSupplierName,
      isActive,
      minStockLevel,
      belowMinStock,
      suggestedPurchaseQty: 0,
      daysSinceLastSale: daysSinceLastSaleVal,
      daysSinceLastPurchase:
        daysSinceLastPurchaseVal === Infinity ? null : daysSinceLastPurchaseVal,
      effectiveAge: effectiveAge === Infinity ? 9999 : effectiveAge,
      supplierReturnCandidate: false,
      supplierReturnReason: null as string | null,
      firstActivityDate,
      daysSinceFirstActivity,
      salesVariability,
      isSeasonalOrVolatile,
      priorYearSalesQty,
      lostSale,
      daysWithoutRepurchase,
      flagHighReturns,
      flagNoSellingPrice,
      flagNegativeMargin,
      flagZeroWac,
      flagFullySupplierReturned,
      flagNoMinStock: false, // يُحدَّد بعد ABC
      hasAnyHealthFlag:
        flagHighReturns ||
        flagNoSellingPrice ||
        flagNegativeMargin ||
        flagZeroWac ||
        flagFullySupplierReturned,
      recommendedAction: "watch" as InventoryAction,
      decisionBasis: null as string | null,
      moneyImpact: 0,
    };


    if (!isActive) {
      return {
        ...baseProps,
        turnoverRate: null,
        coverageDays: null,
        turnoverClass: "inactive" as TurnoverClass,
      };
    }
    if (isNeverPurchased && !isRecentlyAdded) {
      return {
        ...baseProps,
        turnoverRate: null,
        coverageDays: null,
        turnoverClass: "new_unlisted" as TurnoverClass,
      };
    }
    if (isNewProduct || isRecentlyAdded) {
      return {
        ...baseProps,
        turnoverRate: null,
        coverageDays: null,
        turnoverClass: "new" as TurnoverClass,
      };
    }

    let turnoverRate: number;
    let turnoverClass: TurnoverClass;
    let coverageDays: number | null;

    if (currentStock === 0 && soldQty > 0) {
      turnoverRate = soldQty;
      turnoverClass = "excellent";
      coverageDays = 0;
    } else {
      turnoverRate = soldQty / Math.max(currentStock, 1);
      const annualizedRate = turnoverRate * (365 / periodDays);
      if (annualizedRate >= 6) turnoverClass = "excellent";
      else if (annualizedRate >= 3) turnoverClass = "good";
      else if (annualizedRate >= 1 && (daysSinceLastSaleVal ?? Infinity) <= 90)
        turnoverClass = "slow";
      else turnoverClass = "stagnant";
      const avgDaily = soldQty / periodDays;
      coverageDays = avgDaily > 0 ? Math.round(currentStock / avgDaily) : null;
    }

    const avgDailySales = soldQty / periodDays;
    const suggestedPurchaseQty =
      avgDailySales > 0 && turnoverClass !== "stagnant"
        ? Math.max(0, Math.ceil(avgDailySales * 30) - currentStock)
        : 0;

    return {
      ...baseProps,
      turnoverRate,
      coverageDays,
      avgDailySales,
      turnoverClass,
      suggestedPurchaseQty,
      abcClass: "C" as ABCClass,
    };
  });

  applyAbcClassification(items);
  applyActionPriorities(items);
  applySupplierReturnCandidates(items);
  applyDecisions(items);

  return items;
}

/**
 * طبقة القرار: تحوّل التصنيفات إلى (إجراء واحد + سبب بالأرقام + أثر مالي).
 * تعمل بعد ABC وترشيح الإرجاع لأنها تعتمد عليهما.
 */
export function applyDecisions(items: ProductTurnoverData[]): void {
  items.forEach((p) => {
    const unitCost = p.wac ?? p.lastPurchasePrice ?? 0;
    const frozen = round2(Math.max(0, p.currentStock) * unitCost);

    // 1) لا نحكم على الجديد أو الموقوف
    if (p.turnoverClass === "new" || p.turnoverClass === "new_unlisted") {
      p.recommendedAction = "watch";
      p.decisionBasis =
        p.turnoverClass === "new_unlisted"
          ? "أُضيف للنظام ولم يُشترَ بعد — لا يوجد ما يُقيَّم."
          : `تحت الاختبار: لم يمضِ ${INVENTORY_RULES.NEW_PRODUCT_DAYS} يومًا على أول حركة (${p.daysSinceFirstActivity} يومًا).`;
      p.moneyImpact = frozen;
      return;
    }
    if (p.turnoverClass === "inactive") {
      p.recommendedAction = p.currentStock > 0 ? "discount" : "keep";
      p.decisionBasis =
        p.currentStock > 0
          ? `صنف موقوف ولا يزال به ${p.currentStock} وحدة بقيمة ${frozen.toLocaleString("en-US")} — صفِّ الكمية.`
          : "صنف موقوف بلا مخزون — لا إجراء.";
      p.moneyImpact = frozen;
      return;
    }

    // 2) مشاكل تسعير تمنع أي قرار سليم
    if (p.flagNoSellingPrice && p.currentStock > 0) {
      p.recommendedAction = "fix_pricing";
      p.decisionBasis = "لا يوجد سعر بيع للصنف — لا يمكن بيعه ولا حساب ربحه.";
      p.moneyImpact = frozen;
      return;
    }
    if (p.flagNegativeMargin) {
      p.recommendedAction = "fix_pricing";
      p.decisionBasis = `تكلفة الوحدة ${round2(unitCost).toLocaleString("en-US")} أعلى من سعر البيع ${round2(p.sellingPrice ?? 0).toLocaleString("en-US")} — كل بيعة خسارة.`;
      p.moneyImpact = frozen;
      return;
    }

    // 3) الشراء
    if (p.lostSale) {
      p.recommendedAction = "buy_now";
      p.decisionBasis = `نفد المخزون ولم تُعِد الشراء منذ ${p.daysWithoutRepurchase ?? INVENTORY_RULES.LOST_SALE_DAYS} يومًا مع وجود طلب (${p.soldQty} وحدة مبيعة).`;
      p.moneyImpact = round2(Math.max(p.suggestedPurchaseQty, 1) * unitCost);
      return;
    }
    if (p.currentStock <= 0 && p.soldQty > 0) {
      p.recommendedAction = "buy_now";
      p.decisionBasis = `نفد المخزون وسبق بيع ${p.soldQty} وحدة — فئة ${p.abcClass}.`;
      p.moneyImpact = round2(Math.max(p.suggestedPurchaseQty, 1) * unitCost);
      return;
    }
    if (
      p.coverageDays !== null &&
      p.coverageDays < INVENTORY_RULES.URGENT_COVERAGE_DAYS &&
      (p.abcClass === "A" || p.abcClass === "B")
    ) {
      p.recommendedAction = "buy_now";
      p.decisionBasis = `يكفي ${p.coverageDays} يومًا فقط (أقل من ${INVENTORY_RULES.URGENT_COVERAGE_DAYS}) لصنف من فئة ${p.abcClass}.`;
      p.moneyImpact = round2(p.suggestedPurchaseQty * unitCost);
      return;
    }
    if (
      p.coverageDays !== null &&
      p.coverageDays < INVENTORY_RULES.COVERAGE_TARGET_DAYS &&
      p.suggestedPurchaseQty > 0
    ) {
      p.recommendedAction = "buy_soon";
      p.decisionBasis = `التغطية ${p.coverageDays} يومًا — أقل من هدف ${INVENTORY_RULES.COVERAGE_TARGET_DAYS} يومًا.`;
      p.moneyImpact = round2(p.suggestedPurchaseQty * unitCost);
      return;
    }
    if (p.belowMinStock && p.suggestedPurchaseQty > 0) {
      p.recommendedAction = "buy_soon";
      p.decisionBasis = `الكمية ${p.currentStock} تحت الحد الأدنى ${p.minStockLevel}.`;
      p.moneyImpact = round2(p.suggestedPurchaseQty * unitCost);
      return;
    }

    // 4) التخلص من الراكد
    if (p.supplierReturnCandidate) {
      p.recommendedAction = "supplier_return";
      p.decisionBasis = `${p.supplierReturnReason ?? "راكد"} — المورد: ${p.lastSupplierName ?? "غير معروف"}.`;
      p.moneyImpact = frozen;
      return;
    }
    if (p.turnoverClass === "stagnant" && p.currentStock > 0) {
      const bigEnough = frozen > INVENTORY_RULES.STAGNANT_VALUE_THRESHOLD;
      p.recommendedAction = bigEnough ? "discount" : "watch";
      p.decisionBasis = `${p.soldQty === 0 ? `لم يُبَع أي وحدة منذ ${p.effectiveAge} يومًا` : `دوران راكد وتغطية ${p.coverageDays ?? "∞"} يومًا`} — ${frozen.toLocaleString("en-US")} مجمّدة.`;
      p.moneyImpact = frozen;
      return;
    }
    if (
      p.coverageDays !== null &&
      p.coverageDays > INVENTORY_RULES.OVERSTOCK_COVERAGE_DAYS
    ) {
      p.recommendedAction = "reduce_orders";
      p.decisionBasis = `مخزونك يكفي ${p.coverageDays} يومًا (أكثر من ${INVENTORY_RULES.OVERSTOCK_COVERAGE_DAYS}) — لا تشترِ الآن.`;
      p.moneyImpact = frozen;
      return;
    }

    p.recommendedAction = "keep";
    p.decisionBasis =
      p.coverageDays !== null
        ? `تغطية ${p.coverageDays} يومًا ودوران ${p.turnoverClass === "excellent" ? "ممتاز" : "جيد"} — لا إجراء.`
        : "الوضع مستقر — لا إجراء.";
    p.moneyImpact = 0;
  });
}


/** تصنيف ABC حسب الإيراد التراكمي (80% / 95%) */
export function applyAbcClassification(items: ProductTurnoverData[]): void {
  const eligible = items.filter((p) => p.abcClass !== "excluded");
  const sorted = [...eligible].sort((a, b) => b.revenue - a.revenue);
  const totalRev = sorted.reduce((s, p) => s + p.revenue, 0);
  let cumulative = 0;
  sorted.forEach((p) => {
    cumulative += p.revenue;
    const pct = totalRev > 0 ? cumulative / totalRev : 1;
    p.abcClass = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
  });
  const abcMap = new Map(sorted.map((p) => [p.productId, p.abcClass]));
  items.forEach((p) => {
    if (p.abcClass !== "excluded") p.abcClass = abcMap.get(p.productId) || "C";
  });
}

/** أولوية الإجراء والعلامة النصية المعروضة للمستخدم */
export function applyActionPriorities(items: ProductTurnoverData[]): void {
  items.forEach((p) => {
    if (
      p.turnoverClass === "new" ||
      p.turnoverClass === "new_unlisted" ||
      p.turnoverClass === "inactive"
    )
      return;

    if (p.lostSale) {
      p.actionPriority = 1;
      p.actionLabel = `فرصة بيع ضائعة منذ ${p.daysWithoutRepurchase ?? "+14"} يوم — أعد الشراء`;
      return;
    }

    if (p.currentStock === 0 && p.soldQty > 0 && p.abcClass === "A") {
      p.actionPriority = 1;
      p.actionLabel = `نفد المخزون — ${p.lastSupplierName ?? "راجع الموردين"}`;
    } else if (
      p.coverageDays !== null &&
      p.coverageDays < 15 &&
      (p.abcClass === "A" || p.abcClass === "B") &&
      p.currentStock > 0
    ) {
      p.actionPriority = 1;
      p.actionLabel = `شراء عاجل (${p.coverageDays} يوم) — ${p.lastSupplierName ?? ""}`;
    } else if (p.turnoverClass === "stagnant" && (p.stockValue ?? 0) > 1000) {
      p.actionPriority = 2;
      p.actionLabel = "مخزون راكد — فكّر في تخفيض السعر";
    } else if (
      p.coverageDays !== null &&
      p.coverageDays > 180 &&
      p.abcClass === "A"
    ) {
      p.actionPriority = 2;
      p.actionLabel = "مخزون زائد — قلّل كمية الطلب";
    } else if (p.turnoverClass === "slow" && p.abcClass === "C") {
      p.actionPriority = 3;
      p.actionLabel = "إيراد منخفض ودوران بطيء — راجع الاستمرار";
    } else if (
      p.coverageDays !== null &&
      p.coverageDays > 180 &&
      p.abcClass !== "A"
    ) {
      p.actionPriority = 3;
      p.actionLabel = "مخزون فائض";
    }

    // منتج A/B بدون حد أدنى محدد
    if (
      (p.abcClass === "A" || p.abcClass === "B") &&
      (p.minStockLevel === null || p.minStockLevel === 0)
    ) {
      p.flagNoMinStock = true;
      p.hasAnyHealthFlag = true;
    }
  });
}

/**
 * ترشيح الإرجاع للمورد — بعد فترة ملاحظة كافية فقط (30 يوم)،
 * مع استثناء المنتجات الموسمية/المتذبذبة أو التي بِيعت في نفس فترة العام الماضي.
 */
export function applySupplierReturnCandidates(
  items: ProductTurnoverData[],
): void {
  const MIN_OBSERVATION_DAYS = DAYS_CONSIDERED_NEW;
  items.forEach((p) => {
    if (
      p.turnoverClass === "new" ||
      p.turnoverClass === "new_unlisted" ||
      p.turnoverClass === "inactive"
    )
      return;
    if (p.currentStock <= 0) return;
    if (p.effectiveAge < MIN_OBSERVATION_DAYS) return;
    if (p.daysSinceFirstActivity < MIN_OBSERVATION_DAYS) return;
    if (
      p.daysSinceLastPurchase !== null &&
      p.daysSinceLastPurchase < MIN_OBSERVATION_DAYS
    )
      return;
    if (p.isSeasonalOrVolatile) return;
    if (p.priorYearSalesQty !== null && p.priorYearSalesQty > 0) return;

    if (
      p.turnoverClass === "stagnant" &&
      p.currentStock > 0 &&
      p.lastSupplierName
    ) {
      p.supplierReturnCandidate = true;
      p.supplierReturnReason =
        p.soldQty === 0
          ? `لم يُباع أي وحدة منذ ${p.effectiveAge} يوم`
          : `دوران راكد — تغطية ${p.coverageDays ?? "∞"} يوم`;
    } else if (
      p.abcClass === "C" &&
      p.turnoverClass === "slow" &&
      (p.coverageDays ?? 0) > 120 &&
      p.lastSupplierName
    ) {
      p.supplierReturnCandidate = true;
      p.supplierReturnReason = `فئة C + تغطية ${p.coverageDays} يوم — استبدل بمنتج أفضل`;
    }
  });
}
