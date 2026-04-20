import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/components/ui/data-table";
import { ExportMenu } from "@/components/ExportMenu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryTreeSelect } from "@/components/CategoryTreeSelect";
import { DatePickerInput } from "@/components/DatePickerInput";
import { ColumnDef } from "@tanstack/react-table";
import { useSettings } from "@/contexts/SettingsContext";
import {
  format,
  differenceInDays,
  subDays,
  formatDistanceToNow,
} from "date-fns";
import { ar } from "date-fns/locale";
import { Clock, Eye, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatProductDisplay } from "@/lib/product-utils";

// ── extracted sub-components ─────────────────────────────────────────────────
import {
  type ProductTurnoverData,
  type TurnoverClass,
  type ABCClass,
  fmt,
  fmtInt,
  DAYS_CONSIDERED_NEW,
  TURNOVER_LABELS,
  TURNOVER_PIE_COLORS,
  getTurnoverSpeed,
  MetricHelp,
  PriorityDot,
} from "./inventory-turnover/types";
import { TurnoverKPIs, type TurnoverKPIValues } from "./inventory-turnover/TurnoverKPIs";
import { SmartAlertsSection } from "./inventory-turnover/SmartAlertsSection";
import { DecisionMatrix } from "./inventory-turnover/DecisionMatrix";
import { PurchaseSuggestionsTable } from "./inventory-turnover/PurchaseSuggestionsTable";
import { NewProductsTable } from "./inventory-turnover/NewProductsTable";
import { SupplierReturnTable } from "./inventory-turnover/SupplierReturnTable";
import { DormantProductsTable } from "./inventory-turnover/DormantProductsTable";
import { InactiveProductsTable } from "./inventory-turnover/InactiveProductsTable";
import { TurnoverPieChart } from "./inventory-turnover/TurnoverPieChart";

// ─── main component ───────────────────────────────────────────────────────────

export default function InventoryTurnoverReport() {
  const { settings } = useSettings();

  const [dateFrom, setDateFrom] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [dateTo, setDateTo] = useState(format(new Date(), "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [turnoverFilter, setTurnoverFilter] = useState<TurnoverClass | "all">(
    "all",
  );
  const [abcFilter, setAbcFilter] = useState<ABCClass | "all">("all");
  const [matrixFilter, setMatrixFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<
    "all" | "active" | "inactive"
  >("all");

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

  // ── queries ────────────────────────────────────────────────────────────────

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

  // FIX: Use foreignTable for ordering in Supabase, with a 2-year window to limit data
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

  // ── returns queries ────────────────────────────────────────────────────────

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

  // WAC per product (نفس مصدر InventoryReport و GL لحساب 1104)
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

  // ── aggregations ───────────────────────────────────────────────────────────

  // Sales returns by product
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

  // Purchase returns by product
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
      // Keep most recent purchase data (query is already ordered DESC)
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

  // ── core calculation ──────────────────────────────────────────────────────

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

      // ── Step A: new-product & inactive detection ─────────────────────────
      const daysSinceAdded = p.created_at
        ? differenceInDays(today, new Date(p.created_at))
        : Infinity;
      const daysSinceLastPurchaseVal = lastPurchaseDate
        ? differenceInDays(today, new Date(lastPurchaseDate))
        : Infinity;
      const daysSinceLastSaleVal = lastSaleDate
        ? differenceInDays(today, new Date(lastSaleDate))
        : null;
      // Use first purchase date as the "product entry date" — more accurate than created_at
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
        wac,
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

      // Inactive products — separate class
      if (!isActive) {
        return {
          ...baseProps,
          turnoverRate: null,
          coverageDays: null,
          turnoverClass: "inactive" as TurnoverClass,
        };
      }

      if (isNeverPurchased && !isRecentlyAdded) {
        return; // completely exclude from report
      }
      if (isNewProduct || isRecentlyAdded) {
        return {
          ...baseProps,
          turnoverRate: null,
          coverageDays: null,
          turnoverClass: "new" as TurnoverClass,
        };
      }

      // ── Step B: normal calculations ───────────────────────────────────────
      let turnoverRate: number;
      let turnoverClass: TurnoverClass;
      let coverageDays: number | null;

      if (currentStock === 0 && soldQty > 0) {
        // Out of stock due to high demand
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

      // ── Suggested purchase quantity (30-day forecast) ─────────────────────
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

    // ── Step C: ABC (eligible only — exclude new, unlisted, inactive) ─────
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

    // ── Step D: action priority (skip new/inactive) ───────────────────────
    items.forEach((p) => {
      if (
        p.turnoverClass === "new" ||
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

    // ── Step E: supplier return candidates ────────────────────────────────
    items.forEach((p) => {
      if (
        p.turnoverClass === "new" ||
          p.turnoverClass === "inactive"
      )
        return;
      if (p.currentStock <= 0) return;

      // Criteria: stagnant with stock, OR class C with no sales in period, OR slow C with high coverage
      if (
        p.turnoverClass === "stagnant" &&
        p.currentStock > 0 &&
        p.lastSupplierName
      ) {
        p.supplierReturnCandidate = true;
        if (p.soldQty === 0) {
          p.supplierReturnReason = "لم يُباع أي وحدة خلال الفترة";
        } else {
          p.supplierReturnReason = `دوران راكد — تغطية ${p.coverageDays ?? "∞"} يوم`;
        }
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
    wacMap,
    periodDays,
    today,
  ]);

  // ── derived lists ─────────────────────────────────────────────────────────

  const eligibleData = useMemo(
    () => allTurnoverData.filter((p) => p.abcClass !== "excluded"),
    [allTurnoverData],
  );
  const newProductsCount = useMemo(
    () =>
      allTurnoverData.filter(
        (p) => p.turnoverClass === "new",
      ).length,
    [allTurnoverData],
  );
  const inactiveProducts = useMemo(
    () =>
      allTurnoverData.filter(
        (p) => p.turnoverClass === "inactive" && p.currentStock > 0,
      ),
    [allTurnoverData],
  );
  const allProductsNew =
    eligibleData.length === 0 && allTurnoverData.length > 0;

  // ── new sections data ──────────────────────────────────────────────────────

  const newProductsUnderTest = useMemo(
    () => allTurnoverData.filter((p) => p.turnoverClass === "new"),
    [allTurnoverData],
  );

  const purchaseSuggestions = useMemo(
    () =>
      eligibleData
        .filter((p) => p.suggestedPurchaseQty > 0 || p.belowMinStock)
        .sort((a, b) => {
          // Out of stock first, then below min, then by coverage days ascending
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
      allTurnoverData
        .filter((p) => p.supplierReturnCandidate && p.currentStock > 0)
        .sort((a, b) => (b.stockValue ?? 0) - (a.stockValue ?? 0)),
    [allTurnoverData],
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

  const filteredData = useMemo(
    () =>
      allTurnoverData.filter((p) => {
        if (activeFilter === "active" && !p.isActive) return false;
        if (activeFilter === "inactive" && p.isActive) return false;
        if (categoryFilter !== "all" && p.categoryId !== categoryFilter)
          return false;
        if (turnoverFilter !== "all" && p.turnoverClass !== turnoverFilter)
          return false;
        if (abcFilter !== "all" && p.abcClass !== abcFilter) return false;
        if (matrixFilter) {
          const [abc, speed] = matrixFilter.split("-");
          if (p.abcClass !== abc) return false;
          if (getTurnoverSpeed(p.turnoverClass) !== speed) return false;
        }
        return true;
      }),
    [
      allTurnoverData,
      activeFilter,
      categoryFilter,
      turnoverFilter,
      abcFilter,
      matrixFilter,
    ],
  );

  // ── KPIs ──────────────────────────────────────────────────────────────────

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

    // Previous period — apply same new-product exclusion logic
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
        if (neverPurchased && dsa >= DAYS_CONSIDERED_NEW) return false; // new_unlisted
        if (soldQty === 0 && !neverPurchased && dslp < DAYS_CONSIDERED_NEW)
          return false; // new
        if (soldQty === 0 && neverPurchased && dsa < DAYS_CONSIDERED_NEW)
          return false; // recently_added
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

    // New KPIs
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

  // ── alerts ────────────────────────────────────────────────────────────────

  const alerts = useMemo(
    () => ({
      urgent: eligibleData.filter((p) => p.actionPriority === 1),
      followup: eligibleData.filter((p) => p.actionPriority === 2),
      review: eligibleData.filter((p) => p.actionPriority === 3),
    }),
    [eligibleData],
  );

  // ── matrix counts ─────────────────────────────────────────────────────────

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

  // ── pie data ──────────────────────────────────────────────────────────────

  const pieData = useMemo(() => {
    const groups: Record<string, number> = {
      ممتاز: 0,
      جيد: 0,
      بطيء: 0,
      راكد: 0,
      جديد: 0,
      "غير نشط": 0,
    };
    allTurnoverData.forEach((p) => {
      const label =
        p.turnoverClass === "new"
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
  }, [allTurnoverData]);

  // ── export config ─────────────────────────────────────────────────────────

  const exportConfig = useMemo(
    () => ({
      filenamePrefix: "تقرير-دوران-المخزون",
      sheetName: "دوران المخزون",
      pdfTitle: "تقرير دوران المخزون",
      headers: [
        "الكود",
        "المنتج",
        "التصنيف",
        "الحالة",
        "ABC",
        "المخزون",
        "الحد الأدنى",
        "القيمة",
        "المباع (صافي)",
        "المرتجع",
        "معدل الدوران",
        "أيام التغطية",
        "كمية الشراء المقترحة",
        "هامش الربح %",
        "آخر بيع",
        "آخر مورد",
        "فئة الدوران",
        "الأولوية",
      ],
      rows: filteredData.map((p) => [
        p.productCode,
        p.productName,
        p.categoryName,
        p.isActive ? "نشط" : "غير نشط",
        p.abcClass === "excluded" ? "مستبعد" : p.abcClass,
        p.currentStock,
        p.minStockLevel ?? "—",
        p.stockValue !== null ? p.stockValue : "—",
        p.soldQty,
        p.returnedQty > 0 ? p.returnedQty : "—",
        p.turnoverRate !== null ? Number(p.turnoverRate.toFixed(1)) : "—",
        p.coverageDays !== null ? p.coverageDays : "—",
        p.suggestedPurchaseQty > 0 ? p.suggestedPurchaseQty : "—",
        p.profitMargin !== null ? Number(p.profitMargin.toFixed(1)) : "—",
        p.lastSaleDate || "—",
        p.lastSupplierName || "—",
        TURNOVER_LABELS[p.turnoverClass],
        p.actionPriority ? `P${p.actionPriority}` : "—",
      ]),
      summaryCards: [
        { label: "متوسط الدوران", value: kpis.avgTurnover.toFixed(2) },
        { label: "قيمة الراكد", value: fmt(kpis.stagnantVal) },
        { label: "شراء عاجل", value: String(kpis.urgentBuy) },
        {
          label: "فئة A",
          value: `${kpis.classACount} (${kpis.classAPct.toFixed(0)}%)`,
        },
        { label: "تحت الحد الأدنى", value: String(kpis.belowMinCount) },
        { label: "تكلفة الشراء المقترح", value: fmt(kpis.totalSuggestedCost) },
        { label: "مخزون غير نشط", value: fmt(kpis.inactiveStockValue) },
        { label: "مقترح إرجاعه للمورد", value: fmt(kpis.supplierReturnValue) },
      ],
      settings,
      pdfOrientation: "landscape" as const,
    }),
    [filteredData, kpis, settings],
  );

  // ── table columns ─────────────────────────────────────────────────────────

  const columns = useMemo<ColumnDef<ProductTurnoverData, any>[]>(
    () => [
      {
        id: "priority_dot",
        header: "",
        accessorKey: "actionPriority",
        enableSorting: false,
        cell: ({ getValue }) => (
          <div className="flex justify-center">
            <PriorityDot priority={getValue() as 1 | 2 | 3 | null} />
          </div>
        ),
        size: 28,
      },
      {
        accessorKey: "productCode",
        header: "الكود",
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-muted-foreground">
            {getValue() as string}
          </span>
        ),
      },
      {
        accessorKey: "productName",
        header: "المنتج",
        cell: ({ row }) => (
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-sm leading-tight">
                {row.original.productName}
              </p>
              {!row.original.isActive && (
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400 px-1 py-0"
                >
                  غير نشط
                </Badge>
              )}
            </div>
            {row.original.categoryName !== "بدون تصنيف" && (
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {row.original.categoryName}
              </p>
            )}
          </div>
        ),
      },
      {
        accessorKey: "abcClass",
        header: "ABC",
        cell: ({ getValue }) => {
          const v = getValue() as ABCClass;
          const cls =
            v === "A"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 font-bold"
              : v === "B"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400 font-bold"
                : v === "excluded"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400"
                  : "bg-muted text-muted-foreground";
          return (
            <Badge variant="secondary" className={cn("text-xs", cls)}>
              {v === "excluded" ? "—" : v}
            </Badge>
          );
        },
      },
      {
        accessorKey: "currentStock",
        header: "المخزون",
        cell: ({ row }) => (
          <div className="text-right tabular-nums">
            <span
              className={cn(
                "font-semibold text-sm",
                row.original.currentStock === 0
                  ? "text-destructive"
                  : row.original.belowMinStock
                    ? "text-amber-600"
                    : "text-foreground",
              )}
            >
              {fmtInt(row.original.currentStock)}
            </span>
            {row.original.currentStock === 0 && (
              <span className="text-[10px] text-destructive block">نفد</span>
            )}
            {row.original.belowMinStock && row.original.currentStock > 0 && (
              <span className="text-[10px] text-amber-600 block">
                تحت الحد ({row.original.minStockLevel})
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "stockValue",
        header: "القيمة",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null || isNaN(v))
            return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <span className="tabular-nums font-mono text-xs">{fmt(v)}</span>
          );
        },
      },
      {
        accessorKey: "soldQty",
        header: () => (
          <div className="flex items-center gap-1">
            <span>المباع</span>
            <MetricHelp text="صافي الكمية المباعة بعد خصم مرتجعات البيع." />
          </div>
        ),
        cell: ({ row }) => (
          <div className="tabular-nums text-sm">
            <span>{fmtInt(row.original.soldQty)}</span>
            {row.original.returnedQty > 0 && (
              <span className="text-[10px] text-amber-600 block">
                مرتجع: {row.original.returnedQty}
              </span>
            )}
          </div>
        ),
      },
      {
        accessorKey: "turnoverRate",
        header: () => (
          <div className="flex items-center gap-1">
            <span>معدل الدوران</span>
            <MetricHelp text="عدد مرات تجديد المخزون خلال الفترة. كلما ارتفع كان أفضل." />
          </div>
        ),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span className="tabular-nums font-semibold">{v.toFixed(1)}</span>
          );
        },
      },
      {
        accessorKey: "coverageDays",
        header: () => (
          <div className="flex items-center gap-1">
            <span>أيام التغطية</span>
            <MetricHelp text="كم يوم يكفي المخزون الحالي بناءً على معدل البيع الحالي." />
          </div>
        ),
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className={cn(
                "tabular-nums font-semibold text-sm",
                v < 15
                  ? "text-destructive"
                  : v <= 90
                    ? "text-emerald-600"
                    : "text-foreground",
              )}
            >
              {v}
              <span className="text-xs font-normal text-muted-foreground">
                {" "}
                يوم
              </span>
            </span>
          );
        },
      },
      {
        accessorKey: "suggestedPurchaseQty",
        header: () => (
          <div className="flex items-center gap-1">
            <span>كمية الشراء</span>
            <MetricHelp text="الكمية المقترح شراؤها لتغطية 30 يوم من المبيعات." />
          </div>
        ),
        cell: ({ row }) => {
          const v = row.original.suggestedPurchaseQty;
          if (v <= 0)
            return <span className="text-muted-foreground text-sm">—</span>;
          const cost = v * (row.original.lastPurchasePrice ?? 0);
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="tabular-nums font-semibold text-sm text-primary cursor-help">
                    {fmtInt(v)}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  التكلفة المتوقعة: {fmt(cost)}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        },
      },
      {
        accessorKey: "profitMargin",
        header: "الهامش %",
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v === null)
            return <span className="text-muted-foreground text-sm">—</span>;
          return (
            <span
              className={cn(
                "tabular-nums text-xs font-semibold",
                v >= 30
                  ? "text-emerald-600"
                  : v >= 15
                    ? "text-foreground"
                    : v >= 0
                      ? "text-amber-600"
                      : "text-destructive",
              )}
            >
              {v.toFixed(1)}%
            </span>
          );
        },
      },
      {
        accessorKey: "lastSaleDate",
        header: "آخر بيع",
        cell: ({ getValue }) => {
          const v = getValue() as string | null;
          if (!v)
            return (
              <span className="text-muted-foreground text-xs italic">
                لم يُباع
              </span>
            );
          try {
            return (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(v), {
                  addSuffix: true,
                  locale: ar,
                })}
              </span>
            );
          } catch {
            return <span className="text-xs">{v}</span>;
          }
        },
      },
      {
        accessorKey: "turnoverClass",
        header: "الفئة",
        cell: ({ getValue }) => {
          const v = getValue() as TurnoverClass;
          const cls =
            v === "excellent"
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
              : v === "good"
                ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                : v === "slow"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400"
                  : v === "stagnant"
                    ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                    : v === "inactive"
                      ? "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400"
                      : v === "new"
                        ? "bg-muted text-muted-foreground"
                        : "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";
          return (
            <Badge variant="secondary" className={cn("text-xs", cls)}>
              {TURNOVER_LABELS[v]}
            </Badge>
          );
        },
      },
    ],
    [],
  );

  // ── row class name helper (pass to DataTable if it supports it) ───────────

  const getRowClassName = (row: ProductTurnoverData): string => {
    if (row.actionPriority === 1)
      return "bg-red-50/60 dark:bg-red-500/5 hover:bg-red-100/60";
    if (row.actionPriority === 2)
      return "bg-amber-50/60 dark:bg-amber-500/5 hover:bg-amber-100/60";
    return "";
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-5 p-1">
        {/* ── Filters bar ───────────────────────────────────────────────── */}
        <Card className="border shadow-sm">
          <CardContent className="py-3 px-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium shrink-0">
                <BarChart2 className="h-3.5 w-3.5" />
                <span>الفترة:</span>
              </div>
              <DatePickerInput
                value={dateFrom}
                onChange={setDateFrom}
                placeholder="من"
                className="w-36 h-9"
              />
              <span className="text-muted-foreground text-xs">—</span>
              <DatePickerInput
                value={dateTo}
                onChange={setDateTo}
                placeholder="إلى"
                className="w-36 h-9"
              />

              <div className="w-px h-5 bg-border mx-1" />

              <CategoryTreeSelect
                categories={categories}
                value={categoryFilter}
                onValueChange={setCategoryFilter}
                placeholder="كافة التصنيفات"
                className="w-44"
              />
              <Select
                value={turnoverFilter}
                onValueChange={(v) => {
                  setTurnoverFilter(v as any);
                  setMatrixFilter(null);
                }}
              >
                <SelectTrigger className="w-36 h-9">
                  <SelectValue placeholder="فئة الدوران" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفئات</SelectItem>
                  <SelectItem value="excellent">✅ ممتاز</SelectItem>
                  <SelectItem value="good">🔵 جيد</SelectItem>
                  <SelectItem value="slow">🟡 بطيء</SelectItem>
                  <SelectItem value="stagnant">🔴 راكد</SelectItem>
                  <SelectItem value="new">⬜ جديد</SelectItem>
                  <SelectItem value="inactive">⚫ غير نشط</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={abcFilter}
                onValueChange={(v) => {
                  setAbcFilter(v as any);
                  setMatrixFilter(null);
                }}
              >
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="ABC" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="A">🟢 A</SelectItem>
                  <SelectItem value="B">🔵 B</SelectItem>
                  <SelectItem value="C">⚫ C</SelectItem>
                  <SelectItem value="excluded">مستبعد</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={activeFilter}
                onValueChange={(v) => setActiveFilter(v as any)}
              >
                <SelectTrigger className="w-28 h-9">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>

              {matrixFilter && (
                <button
                  onClick={() => setMatrixFilter(null)}
                  className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors"
                >
                  <Eye className="h-3 w-3" />
                  إلغاء فلتر المصفوفة
                </button>
              )}

              <div className="mr-auto">
                <ExportMenu config={exportConfig} disabled={isLoading} />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── All products are new ───────────────────────────────────────── */}
        {allProductsNew && !isLoading && (
          <Card className="border shadow-sm">
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
                <Clock className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-2">
                لا توجد بيانات كافية بعد
              </h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                جميع المنتجات جديدة (أقل من {DAYS_CONSIDERED_NEW} يوم). سيبدأ
                التقرير بعرض التحليل تلقائياً بعد مرور فترة كافية من النشاط.
              </p>
            </CardContent>
          </Card>
        )}

        {!allProductsNew && (
          <>
            <TurnoverKPIs kpis={kpis} isLoading={isLoading} />

            {/* Matrix + Pie side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <DecisionMatrix
                matrixCounts={matrixCounts}
                matrixFilter={matrixFilter}
                setMatrixFilter={setMatrixFilter}
                newProductsCount={newProductsCount}
              />
              <TurnoverPieChart
                pieData={pieData}
                newProductsCount={newProductsCount}
              />
            </div>

            <SmartAlertsSection alerts={alerts} />

            <PurchaseSuggestionsTable
              data={purchaseSuggestions}
              totalCost={kpis.totalSuggestedCost}
              settings={settings}
              isLoading={isLoading}
            />

            <NewProductsTable
              data={newProductsUnderTest}
              settings={settings}
              isLoading={isLoading}
            />

            <SupplierReturnTable
              data={supplierReturnCandidates}
              totalValue={kpis.supplierReturnValue}
              settings={settings}
              isLoading={isLoading}
            />

            <DormantProductsTable
              data={dormantProducts}
              settings={settings}
              isLoading={isLoading}
            />

            <InactiveProductsTable
              data={inactiveProducts}
              totalValue={kpis.inactiveStockValue}
              settings={settings}
              isLoading={isLoading}
            />
          </>
        )}

        {/* ── Main Data Table (always shown) ─────────────────────────────── */}
        {(!allProductsNew || filteredData.length > 0) && (
          <DataTable
            columns={columns}
            data={filteredData}
            searchPlaceholder="البحث بالاسم أو الكود..."
            isLoading={isLoading}
            emptyMessage={
              allProductsNew
                ? "لا توجد بيانات — جميع المنتجات جديدة"
                : "لا توجد نتائج تطابق الفلاتر المحددة"
            }
          />
        )}
      </div>
    </TooltipProvider>
  );
}
