import { describe, it, expect } from "vitest";
import {
  countProgress,
  detectStockDrift,
  isCounted,
  lineDifference,
  lineDifferenceValue,
  linesWithDifference,
  summarizeCount,
  type CountLine,
} from "./inventory-count";

function line(over: Partial<CountLine> = {}): CountLine {
  return {
    id: over.id ?? "l1",
    product_id: over.product_id ?? "p1",
    code: over.code ?? "PRD-001",
    product_name: over.product_name ?? "منتج",
    system_quantity: over.system_quantity ?? 5,
    counted_quantity:
      over.counted_quantity === undefined ? null : over.counted_quantity,
    unit_cost: over.unit_cost ?? 10,
    is_extra: over.is_extra ?? false,
    notes: over.notes ?? "",
  };
}

describe("inventory-count", () => {
  it("distinguishes not-counted (null) from counted zero", () => {
    expect(isCounted(line({ counted_quantity: null }))).toBe(false);
    expect(isCounted(line({ counted_quantity: 0 }))).toBe(true);
    expect(lineDifference(line({ counted_quantity: null }))).toBeNull();
    expect(lineDifference(line({ counted_quantity: 0 }))).toBe(-5);
  });

  it("computes difference value at cost", () => {
    expect(lineDifferenceValue(line({ counted_quantity: 8 }))).toBe(30);
    expect(lineDifferenceValue(line({ counted_quantity: 0 }))).toBe(50);
    expect(lineDifferenceValue(line({ counted_quantity: null }))).toBe(0);
  });

  it("tracks progress including counted zeros", () => {
    const p = countProgress([
      line({ id: "a", counted_quantity: 0 }),
      line({ id: "b", counted_quantity: 3 }),
      line({ id: "c", counted_quantity: null }),
      line({ id: "d", counted_quantity: null }),
    ]);
    expect(p).toEqual({ total: 4, counted: 2, remaining: 2, percent: 50 });
  });

  it("handles empty progress without dividing by zero", () => {
    expect(countProgress([])).toEqual({
      total: 0,
      counted: 0,
      remaining: 0,
      percent: 0,
    });
  });

  it("summarizes gains, losses, matches and uncounted", () => {
    const s = summarizeCount([
      line({ id: "a", system_quantity: 5, counted_quantity: 5 }), // match
      line({ id: "b", system_quantity: 8, counted_quantity: 6, unit_cost: 10 }), // loss 20
      line({ id: "c", system_quantity: 0, counted_quantity: 3, unit_cost: 10 }), // gain 30
      line({ id: "d", counted_quantity: null }), // uncounted
    ]);
    expect(s.totalLoss).toBe(20);
    expect(s.totalGain).toBe(30);
    expect(s.net).toBe(10);
    expect(s).toMatchObject({
      gainCount: 1,
      lossCount: 1,
      matchCount: 1,
      uncountedCount: 1,
    });
  });

  it("detects stock drift between snapshot and current quantities", () => {
    const lines = [
      line({ id: "a", product_id: "p1", system_quantity: 5 }),
      line({ id: "b", product_id: "p2", system_quantity: 2 }),
    ];
    const drift = detectStockDrift(lines, { p1: 5, p2: 4 });
    expect(drift).toHaveLength(1);
    expect(drift[0]).toMatchObject({
      product_id: "p2",
      snapshot_quantity: 2,
      current_quantity: 4,
    });
  });

  it("returns only lines that create a movement", () => {
    const lines = [
      line({ id: "a", counted_quantity: 5 }),
      line({ id: "b", counted_quantity: null }),
      line({ id: "c", counted_quantity: 7 }),
    ];
    expect(linesWithDifference(lines).map((l) => l.id)).toEqual(["c"]);
  });
});
