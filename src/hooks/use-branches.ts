import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Branch {
  id: string;
  code: string;
  name: string;
  name_en: string | null;
  address: string | null;
  phone: string | null;
  is_main: boolean;
  is_active: boolean;
}

export interface Warehouse {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  is_main: boolean;
  is_active: boolean;
}

export interface UserBranchAssignment {
  id: string;
  user_id: string;
  branch_id: string;
  is_default: boolean;
}

export function useBranches() {
  return useQuery({
    queryKey: ["branches"],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, code, name, name_en, address, phone, is_main, is_active")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Branch[];
    },
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async (): Promise<Warehouse[]> => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, branch_id, code, name, is_main, is_active")
        .order("code");
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
  });
}

/** تعيينات الفروع لمستخدم محدد (أو كل التعيينات للمدير) */
export function useUserBranchAssignments(userId?: string) {
  return useQuery({
    queryKey: ["user_branches", userId ?? "all"],
    queryFn: async (): Promise<UserBranchAssignment[]> => {
      let q = supabase
        .from("user_branches")
        .select("id, user_id, branch_id, is_default");
      if (userId) q = q.eq("user_id", userId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as UserBranchAssignment[];
    },
  });
}
