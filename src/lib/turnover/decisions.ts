// ─── مركز قرارات المخزون: تجميعات نقية للقرارات والأثر المالي ────────────────
// الهدف: تحويل صفوف المنتجات إلى "ماذا أفعل اليوم؟" بدل أرقام مجرّدة.

import {
  ACTION_LABELS,
  type InventoryAction,
} from "@/lib/inventory/definitions";
import type { ProductTurnoverData } from "./constants";

export interface ActionGroup {
  action: InventoryAction;
  label: string;
  count: number;
  /** مجموع الأثر المالي (تكلفة شراء مطلوبة أو أموال مجمّدة) */
  moneyImpact: number;
  items: ProductTurnoverData[];
}

/** الإجراءات التي لا تستحق ظهورًا في قرارات اليوم */
const PASSIVE_ACTIONS: InventoryAction[] = ["keep", "watch"];

/** المسار الذي ينفّذ فيه المستخدم كل إجراء */
export const ACTION_ROUTES: Record<InventoryAction, string> = {
  buy_now: "/reports/inventory-turnover/buy-now",
  buy_soon: "/reports/inventory-turnover/buy-now",
  supplier_return: "/reports/inventory-turnover/dormant?tab=return",
  discount: "/reports/inventory-turnover/dormant",
  reduce_orders: "/reports/inventory-turnover/dormant",
  fix_pricing: "/reports/inventory-turnover/dormant",
  deactivate: "/reports/inventory-turnover/dormant",
  watch: "/reports/inventory-turnover/under-observation",
  keep: "/reports/inventory-turnover/analysis",
};

export const round2 = (n: number) =>
  Math.round((n + Number.EPSILON) * 100) / 100;

/** تجميع الأصناف حسب الإجراء المقترح، مرتبة بحسب الأثر المالي */
export function groupByAction(
  items: ProductTurnoverData[],
  options: { includePassive?: boolean } = {},
): ActionGroup[] {
  const map = new Map<InventoryAction, ProductTurnoverData[]>();
  items.forEach((p) => {
    const action = p.recommendedAction;
    if (!options.includePassive && PASSIVE_ACTIONS.includes(action)) return;
    const arr = map.get(action) ?? [];
    arr.push(p);
    map.set(action, arr);
  });

  return Array.from(map.entries())
    .map(([action, list]) => ({
      action,
      label: ACTION_LABELS[action],
      count: list.length,
      moneyImpact: round2(
        list.reduce((s, p) => s + (p.moneyImpact ?? 0), 0),
      ),
      items: [...list].sort(
        (a, b) => (b.moneyImpact ?? 0) - (a.moneyImpact ?? 0),
      ),
    }))
    .sort((a, b) => b.moneyImpact - a.moneyImpact);
}

/** أهم القرارات أثرًا ماليًا (أصناف فردية) */
export function topDecisions(
  items: ProductTurnoverData[],
  limit = 10,
): ProductTurnoverData[] {
  return items
    .filter((p) => !PASSIVE_ACTIONS.includes(p.recommendedAction))
    .filter((p) => (p.moneyImpact ?? 0) > 0)
    .sort((a, b) => (b.moneyImpact ?? 0) - (a.moneyImpact ?? 0))
    .slice(0, limit);
}

export interface MoneyMap {
  /** قيمة المخزون التشغيلي (كمية × تكلفة) */
  inventoryValue: number;
  /** أموال مجمّدة في أصناف تحتاج تصفية أو إرجاع أو إيقاف */
  frozenCapital: number;
  frozenPct: number;
  /** المبلغ المطلوب لإعادة التخزين العاجل */
  buyNeeded: number;
  /** المبلغ القابل للاسترداد بإرجاع المورد */
  recoverable: number;
}

/** خريطة الأموال: أين مالي الآن وأي مبلغ مرتبط بأي قرار */
export function computeMoneyMap(
  items: ProductTurnoverData[],
  inventoryValue: number,
): MoneyMap {
  const sum = (list: ProductTurnoverData[]) =>
    round2(list.reduce((s, p) => s + (p.moneyImpact ?? 0), 0));

  const frozenCapital = sum(
    items.filter((p) =>
      ["supplier_return", "discount", "deactivate", "fix_pricing"].includes(
        p.recommendedAction,
      ),
    ),
  );
  const buyNeeded = sum(
    items.filter((p) => p.recommendedAction === "buy_now"),
  );
  const recoverable = sum(
    items.filter((p) => p.recommendedAction === "supplier_return"),
  );

  return {
    inventoryValue: round2(inventoryValue),
    frozenCapital,
    frozenPct:
      inventoryValue > 0 ? round2((frozenCapital / inventoryValue) * 100) : 0,
    buyNeeded,
    recoverable,
  };
}
