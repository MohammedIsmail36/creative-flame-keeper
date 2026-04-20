import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSettings } from "@/contexts/SettingsContext";
import { format, differenceInDays, subDays } from "date-fns";
import { formatProductDisplay } from "@/lib/product-utils";
import { buildCategoryTree, getDescendantIds } from "@/lib/category-utils";
import {
  ProductTurnoverData,
  TurnoverClass,
  ABCClass,
  TURNOVER_LABELS,
  TURNOVER_PIE_COLORS,
  DAYS_CONSIDERED_NEW,
  getTurnoverSpeed,
} from "./types";

// ─── KPI values ──────────────────────────────────────────────────────────────

export interface TurnoverKPIValues {
  avgTurnover: number;
  stagnantVal: number;
  urgentBuy: number;
  classACount: number;
  classAPct: number;
  turnoverChange: number | null;
  stagnantChange: number | null;
  belowMinCount: number;
  totalSuggestedCost: number;
  inactiveStockValue: number;
  supplierReturnValue: number;
}

// ─── context value ───────────────────────────────────────────────────────────

interface TurnoverDataContextValue {
  // Date filters (shared across pages)
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;

  // Loading
  isLoading: boolean;

  // Core data
  allTurnoverData: ProductTurnoverData[];

  // Derived datasets
  eligibleData: ProductTurnoverData[];
  filteredData: ProductTurnoverData[];
  purchaseSuggestions: ProductTurnoverData[];
  supplierReturnCandidates: ProductTurnoverData[];
  dormantProducts: ProductTurnoverData[];
  inactiveProducts: ProductTurnoverData[];
  newProductsUnderTest: ProductTurnoverData[];
  unlistedProducts: ProductTurnoverData[];
  alerts: {
    urgent: ProductTurnoverData[];
    followup: ProductTurnoverData[];
    review: ProductTurnoverData[];
  };
  matrixCounts: Record<string, number>;
  pieData: { name: string; value: number; color: string }[];
  newProductsCount: number;
  allProductsNew: boolean;

  // KPIs
  kpis: TurnoverKPIValues;

  // Categories for filter
  categories: any[];

  // Unique suppliers list
  uniqueSuppliers: string[];

  // Settings
  settings: any;
}

const TurnoverDataContext = createContext<TurnoverDataContextValue | null>(
  null,
);

export function useTurnoverData() {
  const ctx = useContext(TurnoverDataContext);
  if (!ctx)
    throw new Error("useTurnoverData must be used inside TurnoverDataProvider");
  return ctx;
}

// ─── provider ────────────────────────────────────────────────────────────────

export function TurnoverDataProvider({ children }: { children: ReactNode }) {
  const { settings } = useSettings();

  const [dateFrom, setDateFrom] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState("all");

  const periodDays = Math.max(
    differenceInDays(new Date(dateTo), new Date(dateFrom)),
    1,
  );
  const prevFrom = format(
    subDays(new Date(dateFrom), periodDays),
    "yyyy-MM-dd",
  );
  const prevTo = format(subDays(new Date(dateFrom), 1), "yyyy-MM-dd");
  const today = new Date();

  // ── queries ──────────────────────────────────────────────────────────────

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ["turnover-products"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, code, name, quantity_on_hand, purchase_price, selling_price, category_id, is_active, created_at, min_stock_level, model_number, product_categories(name), product_brands(name)",
        )
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: salesData = [], isLoading: loadingSales } = useQuery({
    queryKey: ["turnover-sales", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select(
          "product_id, quantity, total, unit_price, invoice:sales_invoices!inner(invoice_date, status)",
        )
        .gte("invoice.invoice_date", dateFrom)
        .lte("invoice.invoice_date", dateTo)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: prevSalesData = [] } = useQuery({
    queryKey: ["turnover-prev-sales", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select(
          "product_id, quantity, total, invoice:sales_invoices!inner(invoice_date, status)",
        )
        .gte("invoice.invoice_date", prevFrom)
        .lte("invoice.invoice_date", prevTo)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return data as any[];
    },
  });

  const twoYearsAgo = format(subDays(new Date(), 730), "yyyy-MM-dd");
  const { data: purchaseData = [], isLoading: loadingPurchases } = useQuery({
    queryKey: ["turnover-purchases"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_invoice_items")
        .select(
          "product_id, quantity, unit_price, invoice:purchase_invoices!inner(invoice_date, status, supplier_id, suppliers(name))",
        )
        .eq("invoice.status", "posted")
        .gte("invoice.invoice_date", twoYearsAgo)
        .order("invoice_date", {
          ascending: false,
          foreignTable: "purchase_invoices",
        });
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["turnover-categories"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_categories")
        .select("id, name, parent_id")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: salesReturnData = [] } = useQuery({
    queryKey: ["turnover-sales-returns", dateFrom, dateTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_return_items")
        .select(
          "product_id, quantity, total, ret:sales_returns!inner(return_date, status)",
        )
        .gte("ret.return_date", dateFrom)
        .lte("ret.return_date", dateTo)
        .eq("ret.status", "posted");
      if (error) throw error;
      return data as any[];
    },
  });

  const { data: purchaseReturnData = [] } = useQuery({
    queryKey: ["turnover-purchase-returns"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_return_items")
        .select(
          "product_id, quantity, total, ret:purchase_returns!inner(return_date, status)",
        )
        .gte("ret.return_date", twoYearsAgo)
        .eq("ret.status", "posted");
      if (error) throw error;
      return data as any[];
    },
  });

  // ── WAC per product (نفس مصدر InventoryReport و GL لحساب 1104) ─────────────
  const { data: wacMap = {} } = useQuery({
    queryKey: ["turnover-wac"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, movement_type, quantity, total_cost")
        .in("movement_type", ["purchase", "opening_balance", "purchase_return"]);
      if (error) throw error;
      const agg: Record<string, { qty: number; cost: number }> = {};
      (data ?? []).forEach((m: any) => {
        const pid = m.product_id;
        if (!agg[pid]) agg[pid] = { qty: 0, cost: 0 };
        const q = Number(m.quantity);
        const c = Number(m.total_cost);
        if (m.movement_type === "purchase_return") {
          agg[pid].qty -= q;
          agg[pid].cost -= c;
        } else {
          agg[pid].qty += q;
          agg[pid].cost += c;
        }
      });
      const result: Record<string, number> = {};
      Object.entries(agg).forEach(([pid, { qty, cost }]) => {
        result[pid] = qty > 0 ? cost / qty : 0;
      });
      return result;
    },
  });

  const isLoading = loadingProducts || loadingSales || loadingPurchases;

  // ── aggregations ─────────────────────────────────────────────────────────

  const salesReturnsByProduct = useMemo(() => {
    const map: Record<string, { returnedQty: number; returnedValue: number }> =
      {};
    salesReturnData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { returnedQty: 0, returnedValue: 0 };
      map[pid].returnedQty += Number(item.quantity);
      map[pid].returnedValue += Number(item.total);
    });
    return map;
  }, [salesReturnData]);

  const purchaseReturnsByProduct = useMemo(() => {
    const map: Record<string, { returnedQty: number; returnedValue: number }> =
      {};
    purchaseReturnData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { returnedQty: 0, returnedValue: 0 };
      map[pid].returnedQty += Number(item.quantity);
      map[pid].returnedValue += Number(item.total);
    });
    return map;
  }, [purchaseReturnData]);

  const salesByProduct = useMemo(() => {
    const map: Record<
      string,
      { soldQty: number; revenue: number; lastDate: string | null }
    > = {};
    salesData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { soldQty: 0, revenue: 0, lastDate: null };
      map[pid].soldQty += Number(item.quantity);
      map[pid].revenue += Number(item.total);
      const d = item.invoice?.invoice_date;
      if (d && (!map[pid].lastDate || d > map[pid].lastDate!))
        map[pid].lastDate = d;
    });
    return map;
  }, [salesData]);

  const prevSalesByProduct = useMemo(() => {
    const map: Record<string, { soldQty: number; revenue: number }> = {};
    prevSalesData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      if (!map[pid]) map[pid] = { soldQty: 0, revenue: 0 };
      map[pid].soldQty += Number(item.quantity);
      map[pid].revenue += Number(item.total);
    });
    return map;
  }, [prevSalesData]);

  const purchasesByProduct = useMemo(() => {
    const map: Record<
      string,
      {
        purchasedQty: number;
        lastDate: string | null;
        lastPrice: number | null;
        lastSupplierName: string | null;
      }
    > = {};
    purchaseData.forEach((item: any) => {
      const pid = item.product_id;
      if (!pid) return;
      const d = item.invoice?.invoice_date;
      if (!map[pid]) {
        map[pid] = {
          purchasedQty: 0,
          lastDate: d || null,
          lastPrice: item.unit_price != null ? Number(item.unit_price) : null,
          lastSupplierName: item.invoice?.suppliers?.name || null,
        };
      }
      map[pid].purchasedQty += Number(item.quantity);
      if (d && (!map[pid].lastDate || d > map[pid].lastDate!)) {
        map[pid].lastDate = d;
        map[pid].lastPrice =
          item.unit_price != null
            ? Number(item.unit_price)
            : map[pid].lastPrice;
        map[pid].lastSupplierName =
          item.invoice?.suppliers?.name || map[pid].lastSupplierName;
      }
    });
    return map;
  }, [purchaseData]);

  // ── core calculation ─────────────────────────────────────────────────────

  const allTurnoverData = useMemo(() => {
    const items: ProductTurnoverData[] = products.map((p: any) => {
      const sales = salesByProduct[p.id];
      const purchases = purchasesByProduct[p.id];
      const sReturns = salesReturnsByProduct[p.id];
      const pReturns = purchaseReturnsByProduct[p.id];

      const currentStock = Number(p.quantity_on_hand);
      const grossSoldQty = sales?.soldQty || 0;
      const returnedQty = sReturns?.returnedQty || 0;
      const soldQty = Math.max(0, grossSoldQty - returnedQty);
      const grossPurchasedQty = purchases?.purchasedQty || 0;
      const purchaseReturnedQty = pReturns?.returnedQty || 0;
      const purchasedQty = Math.max(0, grossPurchasedQty - purchaseReturnedQty);
      const lastPurchasePrice =
        purchases?.lastPrice ??
        (p.purchase_price != null ? Number(p.purchase_price) : null);
      // WAC = نفس مصدر تقرير المخزون و GL (حساب 1104)
      // fallback: لو لا توجد حركات، نستخدم آخر سعر شراء
      const wacFromMovements = wacMap[p.id];
      const wac =
        typeof wacFromMovements === "number" && wacFromMovements > 0
          ? wacFromMovements
          : lastPurchasePrice;
      const lastSupplierName = purchases?.lastSupplierName || null;
      const revenue = Math.max(
        0,
        (sales?.revenue || 0) - (sReturns?.returnedValue || 0),
      );
      const lastSaleDate = sales?.lastDate || null;
      const lastPurchaseDate = purchases?.lastDate || null;
      const sellingPrice =
        p.selling_price != null ? Number(p.selling_price) : null;
      const minStockLevel =
        p.min_stock_level != null ? Number(p.min_stock_level) : null;
      const isActive = p.is_active !== false;
      const belowMinStock =
        minStockLevel !== null && currentStock < minStockLevel;

      // هامش الربح يُحتسب على WAC للاتساق مع COGS و GL
      const profitMargin =
        sellingPrice && wac && sellingPrice > 0
          ? ((sellingPrice - wac) / sellingPrice) * 100
          : null;

      const daysSinceAdded = p.created_at
        ? differenceInDays(today, new Date(p.created_at))
        : Infinity;
      const daysSinceLastPurchaseVal = lastPurchaseDate
        ? differenceInDays(today, new Date(lastPurchaseDate))
        : Infinity;
      const daysSinceLastSaleVal = lastSaleDate
        ? differenceInDays(today, new Date(lastSaleDate))
        : null;
      const effectiveAge = lastPurchaseDate
        ? daysSinceLastPurchaseVal
        : daysSinceAdded;

      const isNeverPurchased = lastPurchaseDate === null && soldQty === 0;
      const isNewProduct =
        soldQty === 0 &&
        !isNeverPurchased &&
        effectiveAge < DAYS_CONSIDERED_NEW;
      const isRecentlyAdded =
        soldQty === 0 &&
        isNeverPurchased &&
        daysSinceAdded < DAYS_CONSIDERED_NEW;

      // قيمة المخزون التشغيلية = الكمية × WAC (تتطابق مع جدول InventoryReport)
      const stockValue = wac !== null ? currentStock * wac : null;
      const productName = formatProductDisplay(
        p.name,
        p.product_brands?.name,
        p.model_number,
      );

      const baseProps = {
        productId: p.id,
        productCode: p.code,
        productName,
        categoryName: p.product_categories?.name || "بدون تصنيف",
        categoryId: p.category_id,
        currentStock,
        stockValue,
        soldQty,
        grossSoldQty,
        returnedQty,
        purchasedQty,
        grossPurchasedQty,
        purchaseReturnedQty,
        avgDailySales: 0,
        lastSaleDate,
        lastPurchaseDate,
        lastPurchasePrice,
        sellingPrice,
        profitMargin,
        abcClass: "excluded" as ABCClass,
        actionPriority: null as 1 | 2 | 3 | null,
        actionLabel: null as string | null,
        revenue,
        lastSupplierName,
        isActive,
        minStockLevel,
        belowMinStock,
        suggestedPurchaseQty: 0,
        daysSinceLastSale: daysSinceLastSaleVal,
        daysSinceLastPurchase:
          daysSinceLastPurchaseVal === Infinity
            ? null
            : daysSinceLastPurchaseVal,
        effectiveAge: effectiveAge === Infinity ? 9999 : effectiveAge,
        supplierReturnCandidate: false,
        supplierReturnReason: null as string | null,
      };

      if (!isActive) {
        return {
          ...baseProps,
          turnoverRate: null,
          coverageDays: null,
          turnoverClass: "inactive" as TurnoverClass,
        };
      }
      if (isNeverPurchased && !isRecentlyAdded) {
        return {
          ...baseProps,
          turnoverRate: null,
          coverageDays: null,
          turnoverClass: "new_unlisted" as TurnoverClass,
        };
      }
      if (isNewProduct || isRecentlyAdded) {
        return {
          ...baseProps,
          turnoverRate: null,
          coverageDays: null,
          turnoverClass: "new" as TurnoverClass,
        };
      }

      let turnoverRate: number;
      let turnoverClass: TurnoverClass;
      let coverageDays: number | null;

      if (currentStock === 0 && soldQty > 0) {
        turnoverRate = soldQty;
        turnoverClass = "excellent";
        coverageDays = 0;
      } else {
        turnoverRate = soldQty / Math.max(currentStock, 1);
        const annualizedRate = turnoverRate * (365 / periodDays);
        if (annualizedRate >= 6) turnoverClass = "excellent";
        else if (annualizedRate >= 3) turnoverClass = "good";
        else if (
          annualizedRate >= 1 &&
          (daysSinceLastSaleVal ?? Infinity) <= 90
        )
          turnoverClass = "slow";
        else turnoverClass = "stagnant";
        const avgDaily = soldQty / periodDays;
        coverageDays =
          avgDaily > 0 ? Math.round(currentStock / avgDaily) : null;
      }

      const avgDailySales = soldQty / periodDays;
      const suggestedPurchaseQty =
        avgDailySales > 0 && turnoverClass !== "stagnant"
          ? Math.max(0, Math.ceil(avgDailySales * 30) - currentStock)
          : 0;

      return {
        ...baseProps,
        turnoverRate,
        coverageDays,
        avgDailySales,
        turnoverClass,
        suggestedPurchaseQty,
        abcClass: "C" as ABCClass,
      };
    });

    // Step C: ABC
    const eligible = items.filter((p) => p.abcClass !== "excluded");
    const sorted = [...eligible].sort((a, b) => b.revenue - a.revenue);
    const totalRev = sorted.reduce((s, p) => s + p.revenue, 0);
    let cumulative = 0;
    sorted.forEach((p) => {
      cumulative += p.revenue;
      const pct = totalRev > 0 ? cumulative / totalRev : 1;
      p.abcClass = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
    });
    const abcMap = new Map(sorted.map((p) => [p.productId, p.abcClass]));
    items.forEach((p) => {
      if (p.abcClass !== "excluded")
        p.abcClass = abcMap.get(p.productId) || "C";
    });

    // Step D: action priorities
    items.forEach((p) => {
      if (
        p.turnoverClass === "new" ||
        p.turnoverClass === "new_unlisted" ||
        p.turnoverClass === "inactive"
      )
        return;
      if (p.currentStock === 0 && p.soldQty > 0 && p.abcClass === "A") {
        p.actionPriority = 1;
        p.actionLabel = `نفد المخزون — ${p.lastSupplierName ?? "راجع الموردين"}`;
      } else if (
        p.coverageDays !== null &&
        p.coverageDays < 15 &&
        (p.abcClass === "A" || p.abcClass === "B") &&
        p.currentStock > 0
      ) {
        p.actionPriority = 1;
        p.actionLabel = `شراء عاجل (${p.coverageDays} يوم) — ${p.lastSupplierName ?? ""}`;
      } else if (p.turnoverClass === "stagnant" && (p.stockValue ?? 0) > 1000) {
        p.actionPriority = 2;
        p.actionLabel = "مخزون راكد — فكّر في تخفيض السعر";
      } else if (
        p.coverageDays !== null &&
        p.coverageDays > 180 &&
        p.abcClass === "A"
      ) {
        p.actionPriority = 2;
        p.actionLabel = "مخزون زائد — قلّل كمية الطلب";
      } else if (p.turnoverClass === "slow" && p.abcClass === "C") {
        p.actionPriority = 3;
        p.actionLabel = "إيراد منخفض ودوران بطيء — راجع الاستمرار";
      } else if (
        p.coverageDays !== null &&
        p.coverageDays > 180 &&
        p.abcClass !== "A"
      ) {
        p.actionPriority = 3;
        p.actionLabel = "مخزون فائض";
      }
    });

    // Step E: supplier returns
    items.forEach((p) => {
      if (
        p.turnoverClass === "new" ||
        p.turnoverClass === "new_unlisted" ||
        p.turnoverClass === "inactive"
      )
        return;
      if (p.currentStock <= 0) return;
      if (
        p.turnoverClass === "stagnant" &&
        p.currentStock > 0 &&
        p.lastSupplierName
      ) {
        p.supplierReturnCandidate = true;
        p.supplierReturnReason =
          p.soldQty === 0
            ? "لم يُباع أي وحدة خلال الفترة"
            : `دوران راكد — تغطية ${p.coverageDays ?? "∞"} يوم`;
      } else if (
        p.abcClass === "C" &&
        p.turnoverClass === "slow" &&
        (p.coverageDays ?? 0) > 120 &&
        p.lastSupplierName
      ) {
        p.supplierReturnCandidate = true;
        p.supplierReturnReason = `فئة C + تغطية ${p.coverageDays} يوم — استبدل بمنتج أفضل`;
      }
    });

    return items;
  }, [
    products,
    salesByProduct,
    purchasesByProduct,
    salesReturnsByProduct,
    purchaseReturnsByProduct,
    periodDays,
    today,
  ]);

  // ── derived data ─────────────────────────────────────────────────────────

  const categoryDescendantIds = useMemo(() => {
    if (categoryFilter === "all") return null;
    const tree = buildCategoryTree(
      categories.map((c: any) => ({ ...c, is_active: true })),
    );
    const ids = getDescendantIds(tree, categoryFilter);
    return new Set(ids);
  }, [categoryFilter, categories]);

  const categoryFilteredData = useMemo(
    () =>
      allTurnoverData.filter((p) => {
        if (
          categoryDescendantIds &&
          !categoryDescendantIds.has(p.categoryId ?? "")
        )
          return false;
        return true;
      }),
    [allTurnoverData, categoryDescendantIds],
  );

  const eligibleData = useMemo(
    () => categoryFilteredData.filter((p) => p.abcClass !== "excluded"),
    [categoryFilteredData],
  );

  const newProductsCount = useMemo(
    () =>
      categoryFilteredData.filter(
        (p) => p.turnoverClass === "new" || p.turnoverClass === "new_unlisted",
      ).length,
    [categoryFilteredData],
  );

  const inactiveProducts = useMemo(
    () =>
      categoryFilteredData.filter(
        (p) => p.turnoverClass === "inactive" && p.currentStock > 0,
      ),
    [categoryFilteredData],
  );

  const allProductsNew =
    eligibleData.length === 0 && categoryFilteredData.length > 0;

  const newProductsUnderTest = useMemo(
    () =>
      categoryFilteredData.filter(
        (p) =>
          p.turnoverClass === "new" &&
          !(p.lastPurchaseDate === null && p.soldQty === 0),
      ),
    [categoryFilteredData],
  );

  const unlistedProducts = useMemo(
    () =>
      categoryFilteredData.filter(
        (p) =>
          p.turnoverClass === "new_unlisted" ||
          (p.turnoverClass === "new" &&
            p.lastPurchaseDate === null &&
            p.soldQty === 0),
      ),
    [categoryFilteredData],
  );

  const purchaseSuggestions = useMemo(
    () =>
      eligibleData
        .filter((p) => p.suggestedPurchaseQty > 0 || p.belowMinStock)
        .sort((a, b) => {
          if (a.currentStock === 0 && b.currentStock !== 0) return -1;
          if (b.currentStock === 0 && a.currentStock !== 0) return 1;
          if (a.belowMinStock && !b.belowMinStock) return -1;
          if (b.belowMinStock && !a.belowMinStock) return 1;
          return (a.coverageDays ?? 9999) - (b.coverageDays ?? 9999);
        }),
    [eligibleData],
  );

  const supplierReturnCandidates = useMemo(
    () =>
      categoryFilteredData
        .filter((p) => p.supplierReturnCandidate && p.currentStock > 0)
        .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0)),
    [categoryFilteredData],
  );

  const dormantProducts = useMemo(
    () =>
      eligibleData.filter(
        (p) =>
          p.turnoverClass === "stagnant" &&
          p.soldQty === 0 &&
          p.currentStock > 0,
      ),
    [eligibleData],
  );

  const filteredData = categoryFilteredData;

  const alerts = useMemo(
    () => ({
      urgent: eligibleData.filter((p) => p.actionPriority === 1),
      followup: eligibleData.filter((p) => p.actionPriority === 2),
      review: eligibleData.filter((p) => p.actionPriority === 3),
    }),
    [eligibleData],
  );

  const matrixCounts = useMemo(() => {
    const c: Record<string, number> = {};
    ["A", "B", "C"].forEach((abc) =>
      ["fast", "medium", "slow"].forEach((speed) => {
        c[`${abc}-${speed}`] = eligibleData.filter(
          (p) =>
            p.abcClass === abc && getTurnoverSpeed(p.turnoverClass) === speed,
        ).length;
      }),
    );
    return c;
  }, [eligibleData]);

  const pieData = useMemo(() => {
    const groups: Record<string, number> = {
      ممتاز: 0,
      جيد: 0,
      بطيء: 0,
      راكد: 0,
      جديد: 0,
      "غير نشط": 0,
    };
    categoryFilteredData.forEach((p) => {
      const label =
        p.turnoverClass === "new" || p.turnoverClass === "new_unlisted"
          ? "جديد"
          : TURNOVER_LABELS[p.turnoverClass];
      if (label in groups) groups[label] += p.stockValue ?? 0;
    });
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name,
        value,
        color: TURNOVER_PIE_COLORS[name] || "hsl(0,0%,60%)",
      }));
  }, [categoryFilteredData]);

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpis = useMemo<TurnoverKPIValues>(() => {
    const withSales = eligibleData.filter((p) => p.soldQty > 0);
    const avgTurnover =
      withSales.length > 0
        ? withSales.reduce((s, p) => s + (p.turnoverRate ?? 0), 0) /
          withSales.length
        : 0;
    const stagnantVal = eligibleData
      .filter((p) => p.turnoverClass === "stagnant")
      .reduce((s, p) => s + (p.stockValue ?? 0), 0);
    const urgentBuy = eligibleData.filter((p) => p.actionPriority === 1).length;
    const classA = eligibleData.filter((p) => p.abcClass === "A");
    const totalRev = eligibleData.reduce((s, p) => s + p.revenue, 0);
    const classAPct =
      totalRev > 0
        ? (classA.reduce((s, p) => s + p.revenue, 0) / totalRev) * 100
        : 0;

    // Previous period comparison
    const prevCalc = products
      .filter((p: any) => {
        const purchases = purchasesByProduct[p.id];
        const soldQty = prevSalesByProduct[p.id]?.soldQty || 0;
        const lpd = purchases?.lastDate || null;
        const dsa = p.created_at
          ? differenceInDays(today, new Date(p.created_at))
          : Infinity;
        const dslp = lpd ? differenceInDays(today, new Date(lpd)) : Infinity;
        const neverPurchased = lpd === null && soldQty === 0;
        if (neverPurchased && dsa >= DAYS_CONSIDERED_NEW) return false;
        if (soldQty === 0 && !neverPurchased && dslp < DAYS_CONSIDERED_NEW)
          return false;
        if (soldQty === 0 && neverPurchased && dsa < DAYS_CONSIDERED_NEW)
          return false;
        return true;
      })
      .map((p: any) => {
        const ps = prevSalesByProduct[p.id];
        const stock = Number(p.quantity_on_hand);
        const sold = ps?.soldQty || 0;
        const lpp =
          purchasesByProduct[p.id]?.lastPrice ??
          (p.purchase_price ? Number(p.purchase_price) : null);
        const tr = stock > 0 ? sold / stock : sold > 0 ? sold : 0;
        const ann = tr * (365 / periodDays);
        const tc: TurnoverClass =
          ann >= 6
            ? "excellent"
            : ann >= 3
              ? "good"
              : ann >= 1
                ? "slow"
                : "stagnant";
        return {
          turnoverRate: tr,
          turnoverClass: tc,
          stockValue: lpp !== null ? stock * lpp : 0,
        };
      });

    const prevWithSales = prevCalc.filter((p) => p.turnoverRate > 0);
    const prevAvgTR =
      prevWithSales.length > 0
        ? prevWithSales.reduce((s, p) => s + p.turnoverRate, 0) /
          prevWithSales.length
        : 0;
    const prevStagnantV = prevCalc
      .filter((p) => p.turnoverClass === "stagnant")
      .reduce((s, p) => s + p.stockValue, 0);

    const belowMinCount = eligibleData.filter((p) => p.belowMinStock).length;
    const totalSuggestedCost = purchaseSuggestions.reduce(
      (s, p) => s + p.suggestedPurchaseQty * (p.lastPurchasePrice ?? 0),
      0,
    );
    const inactiveStockValue = inactiveProducts.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );
    const supplierReturnValue = supplierReturnCandidates.reduce(
      (s, p) => s + (p.stockValue ?? 0),
      0,
    );

    return {
      avgTurnover,
      stagnantVal,
      urgentBuy,
      classACount: classA.length,
      classAPct,
      turnoverChange:
        prevAvgTR > 0 ? ((avgTurnover - prevAvgTR) / prevAvgTR) * 100 : null,
      stagnantChange:
        prevStagnantV > 0
          ? ((stagnantVal - prevStagnantV) / prevStagnantV) * 100
          : null,
      belowMinCount,
      totalSuggestedCost,
      inactiveStockValue,
      supplierReturnValue,
    };
  }, [
    eligibleData,
    products,
    prevSalesByProduct,
    purchasesByProduct,
    purchaseSuggestions,
    inactiveProducts,
    supplierReturnCandidates,
    periodDays,
    today,
  ]);

  // ── unique suppliers ─────────────────────────────────────────────────────

  const uniqueSuppliers = useMemo(() => {
    const set = new Set<string>();
    allTurnoverData.forEach((p) => {
      if (p.lastSupplierName) set.add(p.lastSupplierName);
    });
    return Array.from(set).sort();
  }, [allTurnoverData]);

  // ── context value ────────────────────────────────────────────────────────

  const value = useMemo<TurnoverDataContextValue>(
    () => ({
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      categoryFilter,
      setCategoryFilter,
      isLoading,
      allTurnoverData,
      eligibleData,
      filteredData,
      purchaseSuggestions,
      supplierReturnCandidates,
      dormantProducts,
      inactiveProducts,
      newProductsUnderTest,
      unlistedProducts,
      alerts,
      matrixCounts,
      pieData,
      newProductsCount,
      allProductsNew,
      kpis,
      categories,
      uniqueSuppliers,
      settings,
    }),
    [
      dateFrom,
      dateTo,
      categoryFilter,
      isLoading,
      allTurnoverData,
      eligibleData,
      filteredData,
      purchaseSuggestions,
      supplierReturnCandidates,
      dormantProducts,
      inactiveProducts,
      newProductsUnderTest,
      unlistedProducts,
      alerts,
      matrixCounts,
      pieData,
      newProductsCount,
      allProductsNew,
      kpis,
      categories,
      uniqueSuppliers,
      settings,
    ],
  );

  return (
    <TurnoverDataContext.Provider value={value}>
      {children}
    </TurnoverDataContext.Provider>
  );
}
