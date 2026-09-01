import { describe, expect, it } from "vitest";
import { groupSalesAndReturns } from "./sales-report-grouping";

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
