import type { LookupItem } from "@/components/LookupCombobox";

export interface ProductWithBrand {
  id: string;
  code: string;
  name: string;
  model_number?: string | null;
  selling_price?: number;
  purchase_price?: number;
  quantity_on_hand?: number;
  product_brands?: { name: string } | null;
}

/**
 * Format product display name: اسم المنتج - الماركة - رقم الموديل
 */
export function formatProductName(p: ProductWithBrand): string {
  const parts = [p.name];
  if (p.product_brands?.name) parts.push(p.product_brands.name);
  if (p.model_number) parts.push(p.model_number);
  return parts.join(" - ");
}

/**
 * Convert products array to LookupCombobox items with search keywords
 */
export function productsToLookupItems(products: ProductWithBrand[], showQty = false): LookupItem[] {
  return products.map(p => {
    let name = formatProductName(p);
    if (showQty && p.quantity_on_hand != null) {
      name += ` (${p.quantity_on_hand})`;
    }
    const searchKeywords = [
      p.code,
      p.model_number,
      p.product_brands?.name,
      p.name,
    ].filter(Boolean).join(" ");
    return { id: p.id, name, searchKeywords };
  });
}

/** Common select fields for product queries that include brand info */
export const PRODUCT_SELECT_FIELDS = "id, code, name, model_number, selling_price, purchase_price, quantity_on_hand, product_brands(name)";
export const PRODUCT_SELECT_FIELDS_BASIC = "id, code, name, model_number, purchase_price, product_brands(name)";
