// ─── Inventory turnover: pure aggregation helpers ────────────────────────────
// دوال خالصة تُحوّل صفوف قاعدة البيانات إلى خرائط لكل منتج (قابلة للاختبار).

export interface SalesRow {
  product_id: string | null;
  quantity: number | string;
  total?: number | string | null;
  unit_price?: number | string | null;
  invoice?: { invoice_date?: string | null } | null;
}

export interface ReturnRow {
  product_id: string | null;
  quantity: number | string;
  total?: number | string | null;
  ret?: { return_date?: string | null } | null;
}

export interface PurchaseRow {
  product_id: string | null;
  quantity: number | string;
  unit_price?: number | string | null;
  invoice?: {
    invoice_date?: string | null;
    suppliers?: { name?: string | null } | null;
  } | null;
}

export interface MovementRow {
  product_id: string;
  movement_type: string;
  quantity?: number | string | null;
  total_cost?: number | string | null;
  movement_date?: string | null;
}

export interface SalesAgg {
  soldQty: number;
  revenue: number;
  lastDate: string | null;
}

export interface ReturnsAgg {
  returnedQty: number;
  returnedValue: number;
}

export interface PurchasesAgg {
  purchasedQty: number;
  lastDate: string | null;
  lastPrice: number | null;
  lastSupplierName: string | null;
}

const num = (v: unknown) => Number(v ?? 0);

export function aggregateSalesByProduct(
  rows: SalesRow[],
): Record<string, SalesAgg> {
  const map: Record<string, SalesAgg> = {};
  rows.forEach((item) => {
    const pid = item.product_id;
    if (!pid) return;
    if (!map[pid]) map[pid] = { soldQty: 0, revenue: 0, lastDate: null };
    map[pid].soldQty += num(item.quantity);
    map[pid].revenue += num(item.total);
    const d = item.invoice?.invoice_date;
    if (d && (!map[pid].lastDate || d > map[pid].lastDate!))
      map[pid].lastDate = d;
  });
  return map;
}

export function aggregateReturnsByProduct(
  rows: ReturnRow[],
): Record<string, ReturnsAgg> {
  const map: Record<string, ReturnsAgg> = {};
  rows.forEach((item) => {
    const pid = item.product_id;
    if (!pid) return;
    if (!map[pid]) map[pid] = { returnedQty: 0, returnedValue: 0 };
    map[pid].returnedQty += num(item.quantity);
    map[pid].returnedValue += num(item.total);
  });
  return map;
}

/** إجمالي الكميات لكل منتج (يُستخدم للمرتجعات/مبيعات فترة المقارنة) */
export function aggregateQuantityByProduct(
  rows: { product_id: string | null; quantity: number | string }[],
): Record<string, number> {
  const map: Record<string, number> = {};
  rows.forEach((item) => {
    const pid = item.product_id;
    if (!pid) return;
    map[pid] = (map[pid] || 0) + num(item.quantity);
  });
  return map;
}

/** مبيعات فترة سابقة مخصومًا منها مرتجعات نفس الفترة (مقارنة عادلة) */
export function aggregatePrevSalesByProduct(
  rows: SalesRow[],
  prevReturnsQtyByProduct: Record<string, number>,
): Record<string, { soldQty: number; revenue: number }> {
  const map: Record<string, { soldQty: number; revenue: number }> = {};
  rows.forEach((item) => {
    const pid = item.product_id;
    if (!pid) return;
    if (!map[pid]) map[pid] = { soldQty: 0, revenue: 0 };
    map[pid].soldQty += num(item.quantity);
    map[pid].revenue += num(item.total);
  });
  Object.entries(prevReturnsQtyByProduct).forEach(([pid, retQty]) => {
    if (map[pid]) map[pid].soldQty = Math.max(0, map[pid].soldQty - retQty);
  });
  return map;
}

export function aggregatePurchasesByProduct(
  rows: PurchaseRow[],
): Record<string, PurchasesAgg> {
  const map: Record<string, PurchasesAgg> = {};
  rows.forEach((item) => {
    const pid = item.product_id;
    if (!pid) return;
    const d = item.invoice?.invoice_date ?? null;
    if (!map[pid]) {
      map[pid] = {
        purchasedQty: 0,
        lastDate: d,
        lastPrice: item.unit_price != null ? Number(item.unit_price) : null,
        lastSupplierName: item.invoice?.suppliers?.name || null,
      };
    }
    map[pid].purchasedQty += num(item.quantity);
    if (d && (!map[pid].lastDate || d > map[pid].lastDate!)) {
      map[pid].lastDate = d;
      map[pid].lastPrice =
        item.unit_price != null ? Number(item.unit_price) : map[pid].lastPrice;
      map[pid].lastSupplierName =
        item.invoice?.suppliers?.name || map[pid].lastSupplierName;
    }
  });
  return map;
}

/**
 * متوسط التكلفة المرجح (WAC) لكل منتج من حركات المخزون.
 * الزيادات: شراء، رصيد افتتاحي، تسوية. النقصان: مرتجع شراء.
 * المبيعات ومرتجعاتها لا تؤثر على WAC.
 */
export function computeWacMap(
  movements: MovementRow[],
): Record<string, number> {
  const agg: Record<string, { qty: number; cost: number }> = {};
  movements.forEach((m) => {
    const pid = m.product_id;
    if (!pid) return;
    if (!agg[pid]) agg[pid] = { qty: 0, cost: 0 };
    const q = num(m.quantity);
    const c = num(m.total_cost);
    if (m.movement_type === "purchase_return") {
      agg[pid].qty -= q;
      agg[pid].cost -= c;
    } else if (
      m.movement_type === "purchase" ||
      m.movement_type === "opening_balance" ||
      m.movement_type === "adjustment"
    ) {
      agg[pid].qty += q;
      agg[pid].cost += c;
    }
  });
  const result: Record<string, number> = {};
  Object.entries(agg).forEach(([pid, { qty, cost }]) => {
    result[pid] = qty > 0 ? cost / qty : 0;
  });
  return result;
}

/** أول حركة فعلية لكل منتج — يتوقع صفوفًا مرتّبة تصاعديًا بالتاريخ */
export function computeFirstActivityMap(
  movements: MovementRow[],
): Record<string, string> {
  const map: Record<string, string> = {};
  movements.forEach((m) => {
    const pid = m.product_id;
    if (!pid || !m.movement_date) return;
    if (!map[pid] || m.movement_date < map[pid]) map[pid] = m.movement_date;
  });
  return map;
}

/** معامل اختلاف المبيعات الأسبوعية (CV) — null إذا أقل من 4 أسابيع أو متوسط صفري */
export function computeVariabilityByProduct(
  rows: SalesRow[],
): Record<string, number | null> {
  const weekKey = (d: string) => {
    const dt = new Date(d);
    const onejan = new Date(dt.getFullYear(), 0, 1);
    const week = Math.ceil(
      ((dt.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7,
    );
    return `${dt.getFullYear()}-W${week}`;
  };
  const buckets: Record<string, Record<string, number>> = {};
  rows.forEach((item) => {
    const pid = item.product_id;
    const d = item.invoice?.invoice_date;
    if (!pid || !d) return;
    const wk = weekKey(d);
    if (!buckets[pid]) buckets[pid] = {};
    buckets[pid][wk] = (buckets[pid][wk] || 0) + num(item.quantity);
  });
  const result: Record<string, number | null> = {};
  Object.entries(buckets).forEach(([pid, weeks]) => {
    const vals = Object.values(weeks);
    if (vals.length < 4) {
      result[pid] = null;
      return;
    }
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    if (mean <= 0) {
      result[pid] = null;
      return;
    }
    const variance =
      vals.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / vals.length;
    result[pid] = Math.sqrt(variance) / mean;
  });
  return result;
}
