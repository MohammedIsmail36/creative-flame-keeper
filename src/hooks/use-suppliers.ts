import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FIVE_MIN = 5 * 60 * 1000;

export function useSuppliers() {
  return useQuery({
    queryKey: ["suppliers"],
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("suppliers")
        .select("id, code, name, phone, email, balance, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvalidateSuppliers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["suppliers"] });
}
