import { ProductTurnoverData } from "./types";

export type DormantBucket = "critical" | "watch" | "archive";

export type DormantReason =
  | "never_sold"
  | "stopped_long"
  | "negative_margin"
  | "no_price"
  | "c_class_overstock"
  | "fully_returned"
  | "other";

export const REASON_LABELS: Record<DormantReason, string> = {
  never_sold: "لم يُباع إطلاقاً",
  stopped_long: "متوقف منذ فترة طويلة",
  negative_margin: "هامش ربح سالب",
  no_price: "بدون سعر بيع",
  c_class_overstock: "فئة C — تغطية مفرطة",
  fully_returned: "مرتجع بالكامل للمورد سابقاً",
  other: "أخرى",
};

export const REASON_COLORS: Record<DormantReason, string> = {
  never_sold: "bg-red-500",
  stopped_long: "bg-orange-500",
  negative_margin: "bg-rose-500",
  no_price: "bg-amber-500",
  c_class_overstock: "bg-yellow-500",
  fully_returned: "bg-purple-500",
  other: "bg-gray-400",
};

export interface DormantEnriched extends ProductTurnoverData {
  riskScore: number;
  bucket: DormantBucket;
  primaryReason: DormantReason;
  recommendedAction: string;
  lastActivityDays: number | null;
}

/** 0-100 risk score weighted: value(40), age-without-sale(30), ABC(15), margin-flag(15) */
function computeRiskScore(p: ProductTurnoverData, maxValue: number): number {
  const valueScore =
    maxValue > 0 ? Math.min(100, ((p.stockValue ?? 0) / maxValue) * 100) : 0;
  const age = p.daysSinceLastSale ?? p.effectiveAge ?? 0;
  const ageScore = Math.min(100, (age / 365) * 100);
  const abcScore = p.abcClass === "A" ? 100 : p.abcClass === "B" ? 60 : 30;
  const marginScore =
    p.flagNegativeMargin || p.flagNoSellingPrice ? 100 : 0;
  return Math.round(
    valueScore * 0.4 + ageScore * 0.3 + abcScore * 0.15 + marginScore * 0.15,
  );
}

function detectReason(p: ProductTurnoverData): DormantReason {
  if (p.flagFullySupplierReturned) return "fully_returned";
  if (p.flagNegativeMargin) return "negative_margin";
  if (p.flagNoSellingPrice) return "no_price";
  if (p.daysSinceLastSale === null) return "never_sold";
  if ((p.daysSinceLastSale ?? 0) > 180) return "stopped_long";
  if (p.abcClass === "C" && (p.coverageDays ?? 0) > 120)
    return "c_class_overstock";
  return "other";
}

function determineBucket(
  p: ProductTurnoverData,
  reason: DormantReason,
): DormantBucket {
  if (
    p.supplierReturnCandidate ||
    reason === "negative_margin" ||
    reason === "fully_returned" ||
    ((p.stockValue ?? 0) > 5000 && reason === "never_sold")
  ) {
    return "critical";
  }
  if (p.turnoverClass === "inactive" && p.currentStock <= 1) return "archive";
  return "watch";
}

function recommendAction(
  p: ProductTurnoverData,
  bucket: DormantBucket,
  reason: DormantReason,
): string {
  if (bucket === "critical") {
    if (p.supplierReturnCandidate && p.lastSupplierName)
      return "إرجاع للمورد فوراً";
    if (reason === "negative_margin") return "تصحيح التسعير أو شطب";
    return "تصفية بخصم حاد";
  }
  if (bucket === "archive") return "تعطيل المنتج (أرشفة)";
  return "حملة ترويجية / عرض خاص";
}

export function enrichDormantList(
  list: ProductTurnoverData[],
): DormantEnriched[] {
  const maxValue = list.reduce((m, p) => Math.max(m, p.stockValue ?? 0), 0);
  return list.map((p) => {
    const riskScore = computeRiskScore(p, maxValue);
    const primaryReason = detectReason(p);
    const bucket = determineBucket(p, primaryReason);
    const recommendedAction = recommendAction(p, bucket, primaryReason);
    const lastActivityDays =
      p.daysSinceLastSale !== null && p.daysSinceLastPurchase !== null
        ? Math.min(p.daysSinceLastSale, p.daysSinceLastPurchase)
        : (p.daysSinceLastSale ?? p.daysSinceLastPurchase ?? null);
    return {
      ...p,
      riskScore,
      bucket,
      primaryReason,
      recommendedAction,
      lastActivityDays,
    };
  });
}

export function riskColor(score: number): string {
  if (score >= 70) return "bg-red-500";
  if (score >= 40) return "bg-amber-500";
  return "bg-emerald-500";
}
