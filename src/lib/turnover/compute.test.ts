import { describe, expect, it } from "vitest";
import {
  aggregatePrevSalesByProduct,
  aggregatePurchasesByProduct,
  aggregateQuantityByProduct,
  aggregateReturnsByProduct,
  aggregateSalesByProduct,
  computeFirstActivityMap,
  computeVariabilityByProduct,
  computeWacMap,
} from "./aggregations";
import { computeTurnoverData, TurnoverProductRow } from "./compute";
import { computeTurnoverDerived } from "./derived";
import { computeTurnoverKpis } from "./kpis";

const TODAY = new Date("2026-08-31T00:00:00Z");
const daysAgo = (n: number) =>
  new Date(TODAY.getTime() - n * 86400000).toISOString().slice(0, 10);

function product(over: Partial<TurnoverProductRow> = {}): TurnoverProductRow {
  return {
    id: "p1",
    code: "PRD-001",
    name: "منتج",
    quantity_on_hand: 10,
    purchase_price: 100,
    selling_price: 150,
    category_id: "cat1",
    is_active: true,
    created_at: daysAgo(400),
    min_stock_level: 5,
    model_number: null,
    product_categories: { name: "تصنيف" },
    product_brands: { name: null },
    ...over,
  };
}

function run(
  products: TurnoverProductRow[],
  opts: Partial<Parameters<typeof computeTurnoverData>[0]> = {},
) {
  return computeTurnoverData({
    products,
    salesByProduct: {},
    purchasesByProduct: {},
    salesReturnsByProduct: {},
    purchaseReturnsByProduct: {},
    wacMap: {},
    firstActivityMap: {},
    variabilityByProduct: {},
    priorYearSalesByProduct: {},
    periodDays: 30,
    today: TODAY,
    ...opts,
  });
}

describe("aggregations", () => {
  it("يجمع المبيعات ويحفظ آخر تاريخ بيع", () => {
    const map = aggregateSalesByProduct([
      { product_id: "p1", quantity: 2, total: 200, invoice: { invoice_date: "2026-08-01" } },
      { product_id: "p1", quantity: 3, total: 300, invoice: { invoice_date: "2026-08-15" } },
      { product_id: null, quantity: 9, total: 900, invoice: { invoice_date: "2026-08-20" } },
    ]);
    expect(map.p1).toEqual({ soldQty: 5, revenue: 500, lastDate: "2026-08-15" });
  });

  it("يخصم مرتجعات الفترة السابقة من مبيعاتها ولا ينزل تحت الصفر", () => {
    const prevReturns = aggregateQuantityByProduct([
      { product_id: "p1", quantity: 7 },
    ]);
    const map = aggregatePrevSalesByProduct(
      [{ product_id: "p1", quantity: 5, total: 500 }],
      prevReturns,
    );
    expect(map.p1.soldQty).toBe(0);
    expect(map.p1.revenue).toBe(500);
  });

  it("يحسب WAC من الزيادات فقط ويستثني المبيعات", () => {
    const wac = computeWacMap([
      { product_id: "p1", movement_type: "purchase", quantity: 10, total_cost: 1000 },
      { product_id: "p1", movement_type: "sale", quantity: 5, total_cost: 500 },
      { product_id: "p1", movement_type: "adjustment", quantity: 10, total_cost: 1400 },
      { product_id: "p2", movement_type: "purchase", quantity: 5, total_cost: 500 },
      { product_id: "p2", movement_type: "purchase_return", quantity: 5, total_cost: 500 },
    ]);
    expect(wac.p1).toBe(120); // 2400 / 20
    expect(wac.p2).toBe(0); // لا كمية متبقية
  });

  it("يأخذ أقدم تاريخ حركة لكل منتج", () => {
    const map = computeFirstActivityMap([
      { product_id: "p1", movement_type: "sale", movement_date: "2026-05-10" },
      { product_id: "p1", movement_type: "purchase", movement_date: "2026-01-02" },
    ]);
    expect(map.p1).toBe("2026-01-02");
  });

  it("يعيد null لمعامل الاختلاف عند أقل من 4 أسابيع", () => {
    const cv = computeVariabilityByProduct([
      { product_id: "p1", quantity: 1, invoice: { invoice_date: "2026-08-01" } },
      { product_id: "p1", quantity: 1, invoice: { invoice_date: "2026-08-09" } },
    ]);
    expect(cv.p1).toBeNull();
  });

  it("يجمع المرتجعات كميةً وقيمة", () => {
    const map = aggregateReturnsByProduct([
      { product_id: "p1", quantity: 1, total: 150 },
      { product_id: "p1", quantity: 2, total: 300 },
    ]);
    expect(map.p1).toEqual({ returnedQty: 3, returnedValue: 450 });
  });

  it("يحتفظ بآخر سعر ومورد شراء", () => {
    const map = aggregatePurchasesByProduct([
      {
        product_id: "p1",
        quantity: 5,
        unit_price: 100,
        invoice: { invoice_date: "2026-01-01", suppliers: { name: "مورد أ" } },
      },
      {
        product_id: "p1",
        quantity: 5,
        unit_price: 120,
        invoice: { invoice_date: "2026-06-01", suppliers: { name: "مورد ب" } },
      },
    ]);
    expect(map.p1.purchasedQty).toBe(10);
    expect(map.p1.lastPrice).toBe(120);
    expect(map.p1.lastSupplierName).toBe("مورد ب");
  });
});

describe("computeTurnoverData", () => {
  it("يصنّف المنتج غير النشط بلا معدل دوران", () => {
    const [row] = run([product({ is_active: false })]);
    expect(row.turnoverClass).toBe("inactive");
    expect(row.turnoverRate).toBeNull();
    expect(row.abcClass).toBe("excluded");
  });

  it("يصنّف منتجًا لم يُشترَ ولم يُبَع كغير مُدرج", () => {
    const [row] = run([product({ created_at: daysAgo(200) })]);
    expect(row.turnoverClass).toBe("new_unlisted");
  });

  it("يعتبر المنتج جديدًا إذا كانت أول حركة أقل من 30 يومًا", () => {
    const [row] = run([product({ created_at: daysAgo(10) })], {
      salesByProduct: { p1: { soldQty: 2, revenue: 300, lastDate: daysAgo(3) } },
      firstActivityMap: { p1: daysAgo(10) },
      purchasesByProduct: {
        p1: {
          purchasedQty: 5,
          lastDate: daysAgo(10),
          lastPrice: 100,
          lastSupplierName: "مورد",
        },
      },
    });
    expect(row.turnoverClass).toBe("new");
  });

  it("يخصم مرتجعات العميل من الكمية المباعة والإيراد", () => {
    const [row] = run([product()], {
      salesByProduct: { p1: { soldQty: 10, revenue: 1500, lastDate: daysAgo(2) } },
      salesReturnsByProduct: { p1: { returnedQty: 4, returnedValue: 600 } },
      purchasesByProduct: {
        p1: { purchasedQty: 20, lastDate: daysAgo(120), lastPrice: 100, lastSupplierName: "مورد" },
      },
      firstActivityMap: { p1: daysAgo(300) },
    });
    expect(row.soldQty).toBe(6);
    expect(row.revenue).toBe(900);
    expect(row.flagHighReturns).toBe(true);
  });

  it("يعتبر المنتج الذي نفد وبِيع دورانًا ممتازًا بتغطية صفر", () => {
    const [row] = run([product({ quantity_on_hand: 0 })], {
      salesByProduct: { p1: { soldQty: 5, revenue: 750, lastDate: daysAgo(2) } },
      purchasesByProduct: {
        p1: { purchasedQty: 5, lastDate: daysAgo(5), lastPrice: 100, lastSupplierName: "مورد" },
      },
      firstActivityMap: { p1: daysAgo(300) },
    });
    expect(row.turnoverClass).toBe("excellent");
    expect(row.coverageDays).toBe(0);
    expect(row.lostSale).toBe(false); // اشتُري قبل 5 أيام فقط
  });

  it("يرصد فرصة البيع الضائعة عند نفاد المخزون وتأخر إعادة الشراء", () => {
    const [row] = run([product({ quantity_on_hand: 0 })], {
      salesByProduct: { p1: { soldQty: 5, revenue: 750, lastDate: daysAgo(20) } },
      purchasesByProduct: {
        p1: { purchasedQty: 5, lastDate: daysAgo(60), lastPrice: 100, lastSupplierName: "مورد" },
      },
      firstActivityMap: { p1: daysAgo(300) },
    });
    expect(row.lostSale).toBe(true);
    expect(row.daysWithoutRepurchase).toBe(60);
    expect(row.actionPriority).toBe(1);
  });

  it("يصنّف الراكد ويرشّحه للإرجاع للمورد بعد فترة الملاحظة", () => {
    const [row] = run([product({ quantity_on_hand: 20 })], {
      purchasesByProduct: {
        p1: { purchasedQty: 20, lastDate: daysAgo(200), lastPrice: 100, lastSupplierName: "مورد أ" },
      },
      firstActivityMap: { p1: daysAgo(300) },
      wacMap: { p1: 100 },
    });
    expect(row.turnoverClass).toBe("stagnant");
    expect(row.supplierReturnCandidate).toBe(true);
    expect(row.actionPriority).toBe(2); // قيمة راكدة > 1000
  });

  it("لا يرشّح للإرجاع منتجًا موسميًا أو له مبيعات العام الماضي", () => {
    const base = {
      purchasesByProduct: {
        p1: { purchasedQty: 20, lastDate: daysAgo(200), lastPrice: 100, lastSupplierName: "مورد أ" },
      },
      firstActivityMap: { p1: daysAgo(500) },
      wacMap: { p1: 100 },
    };
    const [seasonal] = run([product({ quantity_on_hand: 20 })], {
      ...base,
      variabilityByProduct: { p1: 2 },
    });
    expect(seasonal.supplierReturnCandidate).toBe(false);

    const [priorYear] = run([product({ quantity_on_hand: 20 })], {
      ...base,
      priorYearSalesByProduct: { p1: 3 },
    });
    expect(priorYear.supplierReturnCandidate).toBe(false);
  });

  it("لا يرشّح للإرجاع منتجًا اشتُري حديثًا", () => {
    const [row] = run([product({ quantity_on_hand: 20 })], {
      purchasesByProduct: {
        p1: { purchasedQty: 20, lastDate: daysAgo(10), lastPrice: 100, lastSupplierName: "مورد أ" },
      },
      firstActivityMap: { p1: daysAgo(300) },
    });
    expect(row.supplierReturnCandidate).toBe(false);
  });

  it("يحسب قيمة المخزون بمتوسط التكلفة المرجح لا بسعر البيع", () => {
    const [row] = run([product({ quantity_on_hand: 4 })], {
      wacMap: { p1: 90 },
      purchasesByProduct: {
        p1: { purchasedQty: 4, lastDate: daysAgo(100), lastPrice: 100, lastSupplierName: "م" },
      },
      firstActivityMap: { p1: daysAgo(300) },
    });
    expect(row.stockValue).toBe(360);
    expect(row.profitMargin).toBeCloseTo(40, 5);
  });

  it("يوزّع تصنيف ABC حسب الإيراد التراكمي", () => {
    const items = run(
      [
        product({ id: "a", code: "A", quantity_on_hand: 5 }),
        product({ id: "b", code: "B", quantity_on_hand: 5 }),
        product({ id: "c", code: "C", quantity_on_hand: 5 }),
      ],
      {
        salesByProduct: {
          a: { soldQty: 50, revenue: 8000, lastDate: daysAgo(1) },
          b: { soldQty: 5, revenue: 1500, lastDate: daysAgo(1) },
          c: { soldQty: 1, revenue: 500, lastDate: daysAgo(1) },
        },
        purchasesByProduct: {
          a: { purchasedQty: 60, lastDate: daysAgo(100), lastPrice: 100, lastSupplierName: "م" },
          b: { purchasedQty: 10, lastDate: daysAgo(100), lastPrice: 100, lastSupplierName: "م" },
          c: { purchasedQty: 10, lastDate: daysAgo(100), lastPrice: 100, lastSupplierName: "م" },
        },
        firstActivityMap: { a: daysAgo(300), b: daysAgo(300), c: daysAgo(300) },
      },
    );
    const byId = Object.fromEntries(items.map((i) => [i.productId, i.abcClass]));
    expect(byId).toEqual({ a: "A", b: "B", c: "C" });
  });
});

describe("computeTurnoverDerived", () => {
  it("يفلتر حسب التصنيف ويبني المجموعات والرسم الدائري", () => {
    const items = run(
      [
        product({ id: "a", quantity_on_hand: 20, category_id: "cat1" }),
        product({ id: "b", quantity_on_hand: 20, category_id: "cat2" }),
      ],
      {
        purchasesByProduct: {
          a: { purchasedQty: 20, lastDate: daysAgo(200), lastPrice: 100, lastSupplierName: "م" },
          b: { purchasedQty: 20, lastDate: daysAgo(200), lastPrice: 100, lastSupplierName: "م" },
        },
        firstActivityMap: { a: daysAgo(300), b: daysAgo(300) },
        wacMap: { a: 100, b: 100 },
      },
    );
    const all = computeTurnoverDerived(items, null);
    expect(all.eligibleData).toHaveLength(2);
    expect(all.dormantProducts).toHaveLength(2);
    expect(all.pieData.find((s) => s.name === "راكد")?.value).toBe(4000);

    const filtered = computeTurnoverDerived(items, new Set(["cat1"]));
    expect(filtered.filteredData).toHaveLength(1);
    expect(filtered.uniqueSuppliers).toEqual(["م"]); // من كل البيانات لا المفلترة
  });
});

describe("computeTurnoverKpis", () => {
  const items = run([product({ quantity_on_hand: 20 })], {
    purchasesByProduct: {
      p1: { purchasedQty: 20, lastDate: daysAgo(200), lastPrice: 100, lastSupplierName: "م" },
    },
    firstActivityMap: { p1: daysAgo(300) },
    wacMap: { p1: 100 },
  });
  const derived = computeTurnoverDerived(items, null);

  const kpis = (rawPeriodDays: number, gl: number) =>
    computeTurnoverKpis({
      eligibleData: derived.eligibleData,
      allTurnoverData: items,
      purchaseSuggestions: derived.purchaseSuggestions,
      inactiveProducts: derived.inactiveProducts,
      supplierReturnCandidates: derived.supplierReturnCandidates,
      products: [product({ quantity_on_hand: 20 })],
      prevSalesByProduct: {},
      purchasesByProduct: {
        p1: { purchasedQty: 20, lastDate: daysAgo(200), lastPrice: 100, lastSupplierName: "م" },
      },
      wacMap: { p1: 100 },
      glInventoryBalance: gl,
      periodDays: 30,
      rawPeriodDays,
      today: TODAY,
    });

  it("يحسب القيمة التشغيلية وفرق المطابقة مع حساب المخزون", () => {
    const k = kpis(30, 1800);
    expect(k.operationalTotalValue).toBe(2000);
    expect(k.inventoryDiff).toBe(200);
    expect(k.stagnantVal).toBe(2000);
    expect(k.frozenCapitalPct).toBe(100);
  });

  it("يوقف مقارنة الفترات ويرفع تحذير الفترة القصيرة", () => {
    const k = kpis(10, 2000);
    expect(k.shortPeriodWarning).toBe(true);
    expect(k.turnoverChange).toBeNull();
    expect(k.stagnantChange).toBeNull();
  });
});
