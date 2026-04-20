import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FIVE_MIN = 5 * 60 * 1000;

export function useProductsLookup() {
  return useQuery({
    queryKey: ["products-lookup"],
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, code, name, model_number, barcode, brand_id, category_id, unit, selling_price, purchase_price, quantity_on_hand, min_stock_level, is_active"
        )
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["products-lookup"] });
}
