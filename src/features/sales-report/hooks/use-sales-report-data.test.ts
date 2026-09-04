import { buildSalesReportQueryKeys } from "./use-sales-report-data";

describe("buildSalesReportQueryKeys", () => {
  it("scopes every detail query to the selected period", () => {
    const keys = buildSalesReportQueryKeys("2026-08-01", "2026-08-31", {
      from: "2026-07-01",
      to: "2026-07-31",
    });

    expect(keys.invoices).toEqual([
      "sr-invoices",
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(keys.returns).toEqual([
      "sr-returns",
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(keys.movements).toEqual([
      "sr-cogs",
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(keys.paymentAllocations).toEqual([
      "sr-payment-allocations",
      "2026-08-01",
      "2026-08-31",
    ]);
    expect(keys.returnSettlements).toEqual([
      "sr-return-settlements",
      "2026-08-01",
      "2026-08-31",
    ]);
  });

  it("includes both periods and the customer scope in the summary key", () => {
    const keys = buildSalesReportQueryKeys(
      "2026-08-01",
      "2026-08-31",
      {
        from: "2026-07-01",
        to: "2026-07-31",
      },
      "customer-1",
    );

    expect(keys.summary).toEqual([
      "sr-server-summary",
      "2026-08-01",
      "2026-08-31",
      "2026-07-01",
      "2026-07-31",
      "customer-1",
    ]);
  });
});
