import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  useRef,
  ReactNode,
} from "react";
import { useSettings } from "@/contexts/SettingsContext";
import { format, differenceInDays, subDays } from "date-fns";
import { buildCategoryTree, getDescendantIds } from "@/lib/category-utils";
import {
  aggregatePrevSalesByProduct,
  aggregatePurchasesByProduct,
  aggregateQuantityByProduct,
  aggregateReturnsByProduct,
  aggregateSalesByProduct,
  computeFirstActivityMap,
  computeVariabilityByProduct,
  computeWacMap,
} from "@/lib/turnover/aggregations";
import { computeTurnoverData } from "@/lib/turnover/compute";
import { computeTurnoverDerived } from "@/lib/turnover/derived";
import { computeTurnoverKpis, TurnoverKPIValues } from "@/lib/turnover/kpis";
import { ProductTurnoverData } from "@/lib/turnover/constants";
import {
  CategoryRow,
  useLastActivityDate,
  useTurnoverQueries,
} from "./useTurnoverQueries";

export type { TurnoverKPIValues };

// ─── context value ───────────────────────────────────────────────────────────

interface TurnoverDataContextValue {
  // Date filters (shared across pages)
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  lastActivityDate: string | null;
  isPeriodAutoAligned: boolean;
  resetPeriodToLastActivity: () => void;

  isLoading: boolean;

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

  kpis: TurnoverKPIValues;
  categories: CategoryRow[];
  uniqueSuppliers: string[];
  settings: ReturnType<typeof useSettings>["settings"];
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

  const [dateFrom, setDateFromState] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [dateTo, setDateToState] = useState(format(new Date(), "yyyy-MM-dd"));
  const [categoryFilter, setCategoryFilter] = useState("all");
  // هل عدّل المستخدم التواريخ يدويًا؟ (حينها لا نعيد المحاذاة تلقائيًا)
  const userTouchedDatesRef = useRef(false);
  const setDateFrom = (v: string) => {
    userTouchedDatesRef.current = true;
    setDateFromState(v);
  };
  const setDateTo = (v: string) => {
    userTouchedDatesRef.current = true;
    setDateToState(v);
  };

  const { data: lastActivityDate = null } = useLastActivityDate();

  // محاذاة الفترة الافتراضية مع آخر نشاط — مرة واحدة وفقط إن لم يعدّلها المستخدم
  useEffect(() => {
    if (!lastActivityDate || userTouchedDatesRef.current) return;
    const todayStr = format(new Date(), "yyyy-MM-dd");
    if (dateTo !== todayStr) return;
    setDateFromState(
      format(subDays(new Date(lastActivityDate), 30), "yyyy-MM-dd"),
    );
    setDateToState(lastActivityDate);
  }, [lastActivityDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const isPeriodAutoAligned =
    !userTouchedDatesRef.current &&
    !!lastActivityDate &&
    dateTo === lastActivityDate;

  const resetPeriodToLastActivity = () => {
    if (!lastActivityDate) return;
    userTouchedDatesRef.current = false;
    setDateToState(lastActivityDate);
    setDateFromState(
      format(subDays(new Date(lastActivityDate), 30), "yyyy-MM-dd"),
    );
  };

  const rawPeriodDays = Math.max(
    differenceInDays(new Date(dateTo), new Date(dateFrom)),
    1,
  );
  // حماية رياضية: حد أدنى 7 أيام لتجنب تطرف التغطية/المتوسط اليومي
  const periodDays = Math.max(rawPeriodDays, 7);
  const prevFrom = format(
    subDays(new Date(dateFrom), rawPeriodDays),
    "yyyy-MM-dd",
  );
  const prevTo = format(subDays(new Date(dateFrom), 1), "yyyy-MM-dd");
  const today = useMemo(() => new Date(), []);

  const {
    products,
    salesData,
    prevSalesData,
    purchaseData,
    categories,
    salesReturnData,
    prevSalesReturnData,
    purchaseReturnData,
    movements,
    firstActivityMovements,
    priorYearSalesData,
    weeklySalesData,
    glInventoryBalance,
    isLoading,
  } = useTurnoverQueries({
    dateFrom,
    dateTo,
    prevFrom,
    prevTo,
    lockedUntilDate: settings?.locked_until_date,
  });

  // ── aggregations ─────────────────────────────────────────────────────────

  const salesByProduct = useMemo(
    () => aggregateSalesByProduct(salesData),
    [salesData],
  );
  const salesReturnsByProduct = useMemo(
    () => aggregateReturnsByProduct(salesReturnData),
    [salesReturnData],
  );
  const purchaseReturnsByProduct = useMemo(
    () => aggregateReturnsByProduct(purchaseReturnData),
    [purchaseReturnData],
  );
  const prevSalesReturnsByProduct = useMemo(
    () => aggregateQuantityByProduct(prevSalesReturnData),
    [prevSalesReturnData],
  );
  const prevSalesByProduct = useMemo(
    () => aggregatePrevSalesByProduct(prevSalesData, prevSalesReturnsByProduct),
    [prevSalesData, prevSalesReturnsByProduct],
  );
  const purchasesByProduct = useMemo(
    () => aggregatePurchasesByProduct(purchaseData),
    [purchaseData],
  );
  const priorYearSalesByProduct = useMemo(
    () => aggregateQuantityByProduct(priorYearSalesData),
    [priorYearSalesData],
  );
  const variabilityByProduct = useMemo(
    () => computeVariabilityByProduct(weeklySalesData),
    [weeklySalesData],
  );
  const wacMap = useMemo(() => computeWacMap(movements), [movements]);
  const firstActivityMap = useMemo(
    () => computeFirstActivityMap(firstActivityMovements),
    [firstActivityMovements],
  );

  // ── core calculation ─────────────────────────────────────────────────────

  const allTurnoverData = useMemo(
    () =>
      computeTurnoverData({
        products,
        salesByProduct,
        purchasesByProduct,
        salesReturnsByProduct,
        purchaseReturnsByProduct,
        wacMap,
        firstActivityMap,
        variabilityByProduct,
        priorYearSalesByProduct,
        periodDays,
        today,
      }),
    [
      products,
      salesByProduct,
      purchasesByProduct,
      salesReturnsByProduct,
      purchaseReturnsByProduct,
      wacMap,
      firstActivityMap,
      variabilityByProduct,
      priorYearSalesByProduct,
      periodDays,
      today,
    ],
  );

  // ── derived data ─────────────────────────────────────────────────────────

  const categoryDescendantIds = useMemo(() => {
    if (categoryFilter === "all") return null;
    const tree = buildCategoryTree(
      categories.map((c) => ({ ...c, is_active: true })),
    );
    return new Set(getDescendantIds(tree, categoryFilter));
  }, [categoryFilter, categories]);

  const derived = useMemo(
    () => computeTurnoverDerived(allTurnoverData, categoryDescendantIds),
    [allTurnoverData, categoryDescendantIds],
  );

  const kpis = useMemo(
    () =>
      computeTurnoverKpis({
        eligibleData: derived.eligibleData,
        allTurnoverData,
        purchaseSuggestions: derived.purchaseSuggestions,
        inactiveProducts: derived.inactiveProducts,
        supplierReturnCandidates: derived.supplierReturnCandidates,
        products,
        prevSalesByProduct,
        purchasesByProduct,
        wacMap,
        glInventoryBalance,
        periodDays,
        rawPeriodDays,
        today,
      }),
    [
      derived,
      allTurnoverData,
      products,
      prevSalesByProduct,
      purchasesByProduct,
      wacMap,
      glInventoryBalance,
      periodDays,
      rawPeriodDays,
      today,
    ],
  );

  const value = useMemo<TurnoverDataContextValue>(
    () => ({
      dateFrom,
      dateTo,
      setDateFrom,
      setDateTo,
      categoryFilter,
      setCategoryFilter,
      lastActivityDate,
      isPeriodAutoAligned,
      resetPeriodToLastActivity,
      isLoading,
      allTurnoverData,
      eligibleData: derived.eligibleData,
      filteredData: derived.filteredData,
      purchaseSuggestions: derived.purchaseSuggestions,
      supplierReturnCandidates: derived.supplierReturnCandidates,
      dormantProducts: derived.dormantProducts,
      inactiveProducts: derived.inactiveProducts,
      newProductsUnderTest: derived.newProductsUnderTest,
      unlistedProducts: derived.unlistedProducts,
      alerts: derived.alerts,
      matrixCounts: derived.matrixCounts,
      pieData: derived.pieData,
      newProductsCount: derived.newProductsCount,
      allProductsNew: derived.allProductsNew,
      kpis,
      categories,
      uniqueSuppliers: derived.uniqueSuppliers,
      settings,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      dateFrom,
      dateTo,
      categoryFilter,
      lastActivityDate,
      isPeriodAutoAligned,
      isLoading,
      allTurnoverData,
      derived,
      kpis,
      categories,
      settings,
    ],
  );

  return (
    <TurnoverDataContext.Provider value={value}>
      {children}
    </TurnoverDataContext.Provider>
  );
}
