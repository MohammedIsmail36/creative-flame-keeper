import { describe, it, expect } from "vitest";
import { formatProductName, productsToLookupItems, ProductWithBrand } from "./product-utils";

describe("formatProductName", () => {
  it("should return only product name when no brand or model", () => {
    const product: ProductWithBrand = { id: "1", code: "P001", name: "قميص" };
    expect(formatProductName(product)).toBe("قميص");
  });

  it("should include brand when available", () => {
    const product: ProductWithBrand = {
      id: "1", code: "P001", name: "قميص",
      product_brands: { name: "زارا" },
    };
    expect(formatProductName(product)).toBe("قميص - زارا");
  });

  it("should include model number when available", () => {
    const product: ProductWithBrand = {
      id: "1", code: "P001", name: "قميص", model_number: "327",
    };
    expect(formatProductName(product)).toBe("قميص - 327");
  });

  it("should format correctly with brand and model", () => {
    const product: ProductWithBrand = {
      id: "1", code: "P001", name: "قميص قصير شيفون",
      product_brands: { name: "زارا" }, model_number: "327",
    };
    expect(formatProductName(product)).toBe("قميص قصير شيفون - زارا - 327");
  });

  it("should handle null brand and model", () => {
    const product: ProductWithBrand = {
      id: "1", code: "P001", name: "منتج",
      product_brands: null, model_number: null,
    };
    expect(formatProductName(product)).toBe("منتج");
  });
});

describe("productsToLookupItems", () => {
  const products: ProductWithBrand[] = [
    {
      id: "1", code: "P001", name: "قميص",
      product_brands: { name: "زارا" }, model_number: "327",
      quantity_on_hand: 50, selling_price: 150,
    },
    {
      id: "2", code: "P002", name: "بنطلون",
      product_brands: null, model_number: null,
      quantity_on_hand: 10,
    },
  ];

  it("should create lookup items with correct names", () => {
    const items = productsToLookupItems(products);
    expect(items[0].name).toBe("قميص - زارا - 327");
    expect(items[1].name).toBe("بنطلون");
  });

  it("should include quantity when showQty is true", () => {
    const items = productsToLookupItems(products, true);
    expect(items[0].name).toBe("قميص - زارا - 327 (50)");
    expect(items[1].name).toBe("بنطلون (10)");
  });

  it("should build search keywords from all fields", () => {
    const items = productsToLookupItems(products);
    expect(items[0].searchKeywords).toContain("P001");
    expect(items[0].searchKeywords).toContain("327");
    expect(items[0].searchKeywords).toContain("زارا");
    expect(items[0].searchKeywords).toContain("قميص");
  });

  it("should return correct IDs", () => {
    const items = productsToLookupItems(products);
    expect(items[0].id).toBe("1");
    expect(items[1].id).toBe("2");
  });
});
