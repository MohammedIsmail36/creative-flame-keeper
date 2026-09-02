import { describe, expect, it } from "vitest";
import { buildCustomerSalesGroups, groupSalesAndReturns } from "./grouping";

describe("buildCustomerSalesGroups", () => {
  it("combines posted sales, returns, and invoice coverage by customer", () => {
    const rows = buildCustomerSalesGroups(
      [
        {
          id: "inv-1",
          customer_id: "customer-1",
          customer: { name: "أحمد" },
          status: "posted",
          total: 115,
          tax: 15,
        },
      ],
      [
        {
          customer_id: "customer-1",
          customer: { name: "أحمد" },
          status: "posted",
          total: 23,
          tax: 3,
        },
      ],
      () => ({ cashCollected: 80, returnSettled: 10 }),
    );

    expect(rows).toEqual([
      {
        name: "أحمد",
        count: 1,
        total: 100,
        invoiceGrossTotal: 115,
        cashCollected: 80,
        returnSettled: 10,
        returns: 20,
        returnOnly: false,
      },
    ]);
  });

  it("keeps a standalone cash-customer return as a return-only row", () => {
    const rows = buildCustomerSalesGroups(
      [],
      [
        {
          customer_id: null,
          customer: null,
          status: "posted",
          total: 50,
          tax: 0,
        },
      ],
      () => ({ cashCollected: 0, returnSettled: 0 }),
    );

    expect(rows).toEqual([
      expect.objectContaining({
        name: "عميل نقدي",
        count: 0,
        returns: 50,
        returnOnly: true,
      }),
    ]);
  });
});

interface Group {
  name: string;
  sales: number;
  returns: number;
}

describe("groupSalesAndReturns", () => {
  it("ينشئ مجموعات من اتحاد مفاتيح المبيعات والمرتجعات", () => {
    const groups = groupSalesAndReturns(
      [
        { key: "shared", name: "مشترك", amount: 100 },
        { key: "sale-only", name: "مبيعات فقط", amount: 50 },
      ],
      [
        { key: "shared", name: "مشترك", amount: 20 },
        { key: "return-only", name: "مرتجع فقط", amount: 30 },
      ],
      {
        getSaleKey: (row) => row.key,
        getReturnKey: (row) => row.key,
        createFromSale: (_key, row): Group => ({
          name: row.name,
          sales: 0,
          returns: 0,
        }),
        createFromReturn: (_key, row): Group => ({
          name: row.name,
          sales: 0,
          returns: 0,
        }),
        addSale: (group, row) => {
          group.sales += row.amount;
        },
        addReturn: (group, row) => {
          group.returns += row.amount;
        },
      },
    );

    expect(Array.from(groups.keys())).toEqual([
      "shared",
      "sale-only",
      "return-only",
    ]);
    expect(groups.get("shared")).toEqual({
      name: "مشترك",
      sales: 100,
      returns: 20,
    });
    expect(groups.get("return-only")).toEqual({
      name: "مرتجع فقط",
      sales: 0,
      returns: 30,
    });
  });

  it("يجمع عدة مرتجعات مستقلة تحت المفتاح نفسه", () => {
    const groups = groupSalesAndReturns<never, { key: string; amount: number }, Group>(
      [],
      [
        { key: "product-1", amount: 15 },
        { key: "product-1", amount: 25 },
      ],
      {
        getSaleKey: () => "",
        getReturnKey: (row) => row.key,
        createFromSale: (): Group => ({ name: "", sales: 0, returns: 0 }),
        createFromReturn: (key): Group => ({
          name: key,
          sales: 0,
          returns: 0,
        }),
        addSale: () => undefined,
        addReturn: (group, row) => {
          group.returns += row.amount;
        },
      },
    );

    expect(groups.get("product-1")).toEqual({
      name: "product-1",
      sales: 0,
      returns: 40,
    });
  });
});
