import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FIVE_MIN = 5 * 60 * 1000;

export function useCustomers() {
  return useQuery({
    queryKey: ["customers"],
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, code, name, phone, email, balance, is_active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvalidateCustomers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["customers"] });
}
