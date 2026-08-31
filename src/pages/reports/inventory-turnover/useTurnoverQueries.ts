// ─── Inventory turnover: data fetching layer ─────────────────────────────────
// كل استعلامات تقرير الدوران في مكان واحد؛ الحسابات في src/lib/turnover.

import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { MovementRow, PurchaseRow, ReturnRow, SalesRow } from "@/lib/turnover/aggregations";
import type { TurnoverProductRow } from "@/lib/turnover/compute";

export interface TurnoverQueryParams {
  dateFrom: string;
  dateTo: string;
  prevFrom: string;
  prevTo: string;
  lockedUntilDate?: string | null;
}

export interface CategoryRow {
  id: string;
  name: string;
  parent_id: string | null;
}

/** آخر تاريخ نشاط بيعي (مرساة الفترة الافتراضية) */
export function useLastActivityDate() {
  return useQuery({
    queryKey: ["turnover-last-activity-date"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoices")
        .select("invoice_date")
        .eq("status", "posted")
        .order("invoice_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data?.invoice_date as string) ?? null;
    },
  });
}

export function useTurnoverQueries({
  dateFrom,
  dateTo,
  prevFrom,
  prevTo,
  lockedUntilDate,
}: TurnoverQueryParams) {
  const twoYearsAgo = format(subDays(new Date(), 730), "yyyy-MM-dd");
  const priorYearFrom = format(subDays(new Date(dateFrom), 365), "yyyy-MM-dd");
  const priorYearTo = format(subDays(new Date(dateTo), 365), "yyyy-MM-dd");
  const variabilityFrom = format(subDays(new Date(), 84), "yyyy-MM-dd"); // 12 أسبوعًا

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
      return (data ?? []) as unknown as TurnoverProductRow[];
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
      return (data ?? []) as unknown as SalesRow[];
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
      return (data ?? []) as unknown as SalesRow[];
    },
  });

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
      return (data ?? []) as unknown as PurchaseRow[];
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
      return (data ?? []) as CategoryRow[];
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
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  const { data: prevSalesReturnData = [] } = useQuery({
    queryKey: ["turnover-prev-sales-returns", prevFrom, prevTo],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_return_items")
        .select(
          "product_id, quantity, ret:sales_returns!inner(return_date, status)",
        )
        .gte("ret.return_date", prevFrom)
        .lte("ret.return_date", prevTo)
        .eq("ret.status", "posted");
      if (error) throw error;
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  /** رصيد حساب المخزون 1104 — مصدر الحقيقة المحاسبي */
  const { data: glInventoryBalance = 0 } = useQuery({
    queryKey: ["turnover-gl-1104", lockedUntilDate],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data: acc, error: accErr } = await supabase
        .from("accounts")
        .select("id")
        .eq("code", "1104")
        .maybeSingle();
      if (accErr) throw accErr;
      if (!acc?.id) return 0;
      let q = supabase
        .from("journal_entry_lines")
        .select("debit, credit, journal_entries!inner(status, entry_date)")
        .eq("account_id", acc.id)
        .eq("journal_entries.status", "posted");
      if (lockedUntilDate) {
        q = q.gt("journal_entries.entry_date", lockedUntilDate);
      }
      const { data, error } = await q;
      if (error) throw error;
      const balance = (data ?? []).reduce(
        (s: number, l: { debit: number | null; credit: number | null }) =>
          s + Number(l.debit || 0) - Number(l.credit || 0),
        0,
      );
      return Math.round(balance * 100) / 100;
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
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["turnover-movements-wac"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, movement_type, quantity, total_cost");
      if (error) throw error;
      return (data ?? []) as unknown as MovementRow[];
    },
  });

  const { data: firstActivityMovements = [] } = useQuery({
    queryKey: ["turnover-first-activity"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_movements")
        .select("product_id, movement_date, movement_type")
        .in("movement_type", ["purchase", "opening_balance", "sale"])
        .order("movement_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MovementRow[];
    },
  });

  const { data: priorYearSalesData = [] } = useQuery({
    queryKey: ["turnover-prior-year-sales", priorYearFrom, priorYearTo],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select(
          "product_id, quantity, invoice:sales_invoices!inner(invoice_date, status)",
        )
        .gte("invoice.invoice_date", priorYearFrom)
        .lte("invoice.invoice_date", priorYearTo)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return (data ?? []) as unknown as SalesRow[];
    },
  });

  const { data: weeklySalesData = [] } = useQuery({
    queryKey: ["turnover-weekly-sales", variabilityFrom],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_invoice_items")
        .select(
          "product_id, quantity, invoice:sales_invoices!inner(invoice_date, status)",
        )
        .gte("invoice.invoice_date", variabilityFrom)
        .eq("invoice.status", "posted");
      if (error) throw error;
      return (data ?? []) as unknown as SalesRow[];
    },
  });

  return {
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
    isLoading: loadingProducts || loadingSales || loadingPurchases,
  };
}
