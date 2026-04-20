import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const FIVE_MIN = 5 * 60 * 1000;

export function useAccounts() {
  return useQuery({
    queryKey: ["accounts"],
    staleTime: FIVE_MIN,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, code, name, account_type, parent_id, is_parent, is_active, is_system")
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvalidateAccounts() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["accounts"] });
}
