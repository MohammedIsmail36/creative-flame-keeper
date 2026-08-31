import { describe, expect, it } from "vitest";
import {
  ACTION_ROUTES,
  computeMoneyMap,
  groupByAction,
  topDecisions,
} from "./decisions";
import type { ProductTurnoverData } from "./constants";
import type { InventoryAction } from "@/lib/inventory/definitions";

function row(
  action: InventoryAction,
  moneyImpact: number,
  over: Partial<ProductTurnoverData> = {},
): ProductTurnoverData {
  return {
    recommendedAction: action,
    decisionBasis: "أساس",
    moneyImpact,
    productId: `${action}-${moneyImpact}`,
    productName: "منتج",
    productCode: "PRD-1",
  } as unknown as ProductTurnoverData;
}

describe("groupByAction", () => {
  it("يجمع الأصناف حسب الإجراء ويحسب الأثر المالي", () => {
    const groups = groupByAction([
      row("buy_now", 100),
      row("buy_now", 50),
      row("discount", 400),
    ]);
    expect(groups[0].action).toBe("discount");
    expect(groups[0].moneyImpact).toBe(400);
    expect(groups[1].action).toBe("buy_now");
    expect(groups[1].count).toBe(2);
    expect(groups[1].moneyImpact).toBe(150);
  });

  it("يستثني الإجراءات الخاملة (راقب / استمر) افتراضيًا", () => {
    const groups = groupByAction([row("watch", 900), row("keep", 900)]);
    expect(groups).toHaveLength(0);
    expect(groupByAction([row("watch", 900)], { includePassive: true })).toHaveLength(1);
  });

  it("يرتّب الأصناف داخل المجموعة بالأثر المالي تنازليًا", () => {
    const [group] = groupByAction([row("buy_now", 10), row("buy_now", 90)]);
    expect(group.items.map((i) => i.moneyImpact)).toEqual([90, 10]);
  });
});

describe("topDecisions", () => {
  it("يعيد الأصناف الأعلى أثرًا فقط ويستبعد صفر الأثر والخاملة", () => {
    const top = topDecisions(
      [
        row("buy_now", 0),
        row("watch", 999),
        row("discount", 300),
        row("supplier_return", 700),
      ],
      2,
    );
    expect(top.map((p) => p.moneyImpact)).toEqual([700, 300]);
  });
});

describe("computeMoneyMap", () => {
  it("يحسب الأموال المجمّدة والقابلة للاسترداد والنسبة", () => {
    const map = computeMoneyMap(
      [
        row("supplier_return", 600),
        row("discount", 300),
        row("deactivate", 100),
        row("buy_now", 500),
      ],
      2000,
    );
    expect(map.frozenCapital).toBe(1000);
    expect(map.frozenPct).toBe(50);
    expect(map.recoverable).toBe(600);
    expect(map.buyNeeded).toBe(500);
  });

  it("لا يقسم على صفر عند غياب قيمة مخزون", () => {
    const map = computeMoneyMap([row("discount", 100)], 0);
    expect(map.frozenPct).toBe(0);
  });
});

describe("ACTION_ROUTES", () => {
  it("يوجّه الإرجاع للمورد إلى تبويب الإرجاع في شاشة الراكد", () => {
    expect(ACTION_ROUTES.supplier_return).toContain("tab=return");
  });
});
