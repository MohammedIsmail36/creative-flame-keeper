import { describe, expect, it } from "vitest";
import {
  buildSalesInvoiceScopes,
  filterFinancialSalesMovements,
} from "./document-scope";

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

describe("filterFinancialSalesMovements", () => {
  const movements = [
    {
      id: "posted-sale",
      movement_type: "sale",
      reference_type: "sales_invoice",
      reference_id: "invoice-posted",
    },
    {
      id: "draft-sale",
      movement_type: "sale",
      reference_type: "sales_invoice",
      reference_id: "invoice-draft",
    },
    {
      id: "posted-return",
      movement_type: "sale_return",
      reference_type: "sales_return",
      reference_id: "return-posted",
    },
    {
      id: "outside-return",
      movement_type: "sale_return",
      reference_type: "sales_return",
      reference_id: "return-outside",
    },
    {
      id: "wrong-reference-type",
      movement_type: "sale",
      reference_type: "sales_return",
      reference_id: "invoice-posted",
    },
    { id: "orphan", movement_type: "sale", reference_id: null },
  ];

  it("keeps only movements linked to posted documents in the report", () => {
    const result = filterFinancialSalesMovements(
      [
        { id: "invoice-posted", status: "posted" },
        { id: "invoice-draft", status: "draft" },
      ],
      [
        { id: "return-posted", status: "posted" },
        { id: "return-outside", status: "cancelled" },
      ],
      movements,
    );

    expect(result.map(({ id }) => id)).toEqual([
      "posted-sale",
      "posted-return",
    ]);
  });

  it("does not admit a movement merely because its date was queried", () => {
    expect(filterFinancialSalesMovements([], [], movements)).toEqual([]);
  });
});
