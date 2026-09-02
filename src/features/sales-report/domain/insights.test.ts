import { describe, expect, it } from "vitest";
import {
  buildOverdueSalesInfo,
  buildSalesDiscountTaxInfo,
  buildSalesTargetInfo,
  isSalesInvoiceOverdue,
} from "./insights";

describe("sales report auxiliary insights", () => {
  const invoices = [
    {
      id: "overdue",
      status: "posted",
      total: "1000",
      due_date: "2026-08-31",
      discount: "25",
      tax: "150",
    },
    {
      id: "covered",
      status: "posted",
      total: 500,
      due_date: "2026-08-20",
      discount: 5,
      tax: 75,
    },
    {
      id: "draft",
      status: "draft",
      total: 900,
      due_date: "2026-08-01",
      discount: 90,
      tax: 135,
    },
  ];
  const coverage = {
    overdue: { cashCollected: 600, returnSettled: 100, totalCovered: 700 },
    covered: { cashCollected: 500, returnSettled: 0, totalCovered: 500 },
  };

  it("counts only posted, past-due invoices with a remaining balance", () => {
    expect(buildOverdueSalesInfo(invoices, coverage, "2026-09-02")).toEqual({
      count: 1,
      total: 300,
    });
    expect(
      isSalesInvoiceOverdue(invoices[1], coverage, "2026-09-02"),
    ).toBe(false);
  });

  it("sums discount and tax from posted invoices only", () => {
    expect(buildSalesDiscountTaxInfo(invoices)).toEqual({
      discount: 30,
      tax: 225,
    });
  });

  it("scales a monthly target by calendar months without timezone conversion", () => {
    expect(
      buildSalesTargetInfo(10_000, "2025-12-15", "2026-02-01", 15_000),
    ).toEqual({
      scaledTarget: 30_000,
      pct: 50,
      monthsInRange: 3,
    });
  });

  it("hides an absent target and safely handles invalid dates", () => {
    expect(buildSalesTargetInfo(0, "2026-08-01", "2026-08-31", 100)).toBeNull();
    expect(buildSalesTargetInfo(1000, "invalid", "invalid", 500)).toEqual({
      scaledTarget: 1000,
      pct: 50,
      monthsInRange: 1,
    });
  });
});
