import type { LookupItem } from "@/components/LookupCombobox";

export interface ProductWithBrand {
  id: string;
  code: string;
  name: string;
  barcode?: string | null;
  model_number?: string | null;
  selling_price?: number;
  purchase_price?: number;
  quantity_on_hand?: number;
  product_brands?: { name: string } | null;
}

/**
 * Format product display name: اسم المنتج - الماركة - الموديل
 */
export function formatProductName(p: ProductWithBrand): string {
  return formatProductDisplay(p.name, p.product_brands?.name, p.model_number);
}

/**
 * Simple formatter: اسم المنتج - الماركة - الموديل
 * Works with any inline product data without needing the full ProductWithBrand type.
 */
export function formatProductDisplay(
  name: string,
  brandName?: string | null,
  modelNumber?: string | null,
): string {
  const extra = [brandName, modelNumber].filter(Boolean);
  if (extra.length > 0) return `${name} - ${extra.join(" - ")}`;
  return name;
}

/**
 * Convert products array to LookupCombobox items with structured search fields
 */
export function productsToLookupItems(
  products: ProductWithBrand[],
  showQty = false,
): LookupItem[] {
  return products.map((p) => {
    let name = formatProductName(p);
    if (showQty && p.quantity_on_hand != null) {
      name += ` (${p.quantity_on_hand})`;
    }
    // Legacy combined keywords for fallback
    const searchKeywords = [
      p.code,
      p.model_number,
      p.product_brands?.name,
      p.name,
      p.barcode,
    ]
      .filter(Boolean)
      .join(" ");

    // Structured fields for smart filtering
    const searchFields: Record<string, string> = {};
    if (p.code) searchFields.code = p.code;
    if (p.name) searchFields.name = p.name;
    if (p.model_number) searchFields.model = p.model_number;
    if (p.product_brands?.name) searchFields.brand = p.product_brands.name;
    if (p.barcode) searchFields.barcode = p.barcode;

    return { id: p.id, name, searchKeywords, searchFields };
  });
}

/** Common select fields for product queries that include brand info */
export const PRODUCT_SELECT_FIELDS =
  "id, code, name, barcode, model_number, selling_price, purchase_price, quantity_on_hand, product_brands(name)";
export const PRODUCT_SELECT_FIELDS_BASIC =
  "id, code, name, barcode, model_number, purchase_price, product_brands(name)";
