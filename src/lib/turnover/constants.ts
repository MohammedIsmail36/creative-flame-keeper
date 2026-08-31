// ─── Inventory turnover: shared types & runtime constants (UI-free) ─────────
// يُستورد من طبقة الحساب النقية والاختبارات، وتعيد types.tsx تصديره للتوافق.

import { INVENTORY_RULES, type InventoryAction } from "@/lib/inventory/definitions";

export const DAYS_CONSIDERED_NEW = INVENTORY_RULES.NEW_PRODUCT_DAYS;


export type TurnoverClass =
  | "excellent"
  | "good"
  | "slow"
  | "stagnant"
  | "new"
  | "new_unlisted"
  | "inactive";

export type ABCClass = "A" | "B" | "C" | "excluded";

export interface ProductTurnoverData {
  productId: string;
  productCode: string;
  productName: string;
  categoryName: string;
  categoryId: string | null;
  currentStock: number;
  stockValue: number | null;
  soldQty: number;
  grossSoldQty: number;
  returnedQty: number;
  purchasedQty: number;
  grossPurchasedQty: number;
  purchaseReturnedQty: number;
  avgDailySales: number;
  lastSaleDate: string | null;
  lastPurchaseDate: string | null;
  lastPurchasePrice: number | null;
  wac: number | null;
  sellingPrice: number | null;
  profitMargin: number | null;
  turnoverRate: number | null;
  turnoverClass: TurnoverClass;
  abcClass: ABCClass;
  coverageDays: number | null;
  actionPriority: 1 | 2 | 3 | null;
  actionLabel: string | null;
  revenue: number;
  lastSupplierName: string | null;
  isActive: boolean;
  minStockLevel: number | null;
  belowMinStock: boolean;
  suggestedPurchaseQty: number;
  daysSinceLastSale: number | null;
  daysSinceLastPurchase: number | null;
  effectiveAge: number;
  supplierReturnCandidate: boolean;
  supplierReturnReason: string | null;
  // ── Deep analysis fields (decision-maker friendly) ──────────────
  firstActivityDate: string | null;
  daysSinceFirstActivity: number;
  salesVariability: number | null;
  isSeasonalOrVolatile: boolean;
  priorYearSalesQty: number | null;
  lostSale: boolean;
  daysWithoutRepurchase: number | null;
  // Health Flags
  flagHighReturns: boolean;
  flagNoSellingPrice: boolean;
  flagNegativeMargin: boolean;
  flagZeroWac: boolean;
  flagFullySupplierReturned: boolean;
  flagNoMinStock: boolean;
  hasAnyHealthFlag: boolean;
}

export const TURNOVER_LABELS: Record<TurnoverClass, string> = {
  excellent: "ممتاز",
  good: "جيد",
  slow: "بطيء",
  stagnant: "راكد",
  new: "جديد",
  new_unlisted: "جديد",
  inactive: "غير نشط",
};

export const TURNOVER_PIE_COLORS: Record<string, string> = {
  ممتاز: "hsl(152, 69%, 41%)",
  جيد: "hsl(217, 91%, 60%)",
  بطيء: "hsl(45, 93%, 47%)",
  راكد: "hsl(0, 72%, 51%)",
  جديد: "hsl(220, 14%, 70%)",
  "غير نشط": "hsl(0, 0%, 50%)",
};

export function getTurnoverSpeed(
  tc: TurnoverClass,
): "fast" | "medium" | "slow" {
  if (tc === "excellent") return "fast";
  if (tc === "good") return "medium";
  return "slow";
}
