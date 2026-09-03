import { describe, expect, it } from "vitest";
import { buildSalesInvoiceScopes } from "./document-scope";

const invoices = [
  { id: "posted-1", status: "posted" },
  { id: "draft-1", status: "draft" },
  { id: "cancelled-1", status: "cancelled" },
  { id: "posted-2", status: "posted" },
];

describe("buildSalesInvoiceScopes", () => {
  it.each(["all", "posted", "draft", "cancelled"] as const)(
    "keeps financial invoices posted when detail status is %s",
    (detailStatus) => {
      const scopes = buildSalesInvoiceScopes(invoices, detailStatus);

      expect(scopes.financialInvoices.map(({ id }) => id)).toEqual([
        "posted-1",
        "posted-2",
      ]);
    },
  );

  it("applies the selected status only to invoice details", () => {
    expect(
      buildSalesInvoiceScopes(invoices, "draft").detailInvoices.map(
        ({ id }) => id,
      ),
    ).toEqual(["draft-1"]);
    expect(
      buildSalesInvoiceScopes(invoices, "all").detailInvoices,
    ).toEqual(invoices);
  });
});
