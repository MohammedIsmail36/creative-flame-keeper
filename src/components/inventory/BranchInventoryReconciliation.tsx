import { useQuery } from "@tanstack/react-query";
import { Scale } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";
import { StatusBadge } from "@/components/StatusBadge";

interface Row { branch_id: string; branch_name: string; stock_value: number; gl_value: number; difference: number }

/** مطابقة قيمة مخزون كل فرع مع رصيد حساب المخزون للفرع نفسه */
export function BranchInventoryReconciliation() {
  const { data = [] } = useQuery({
    queryKey: ["branch-inventory-reconciliation"],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase.rpc as any)("get_branch_inventory_reconciliation");
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });
  if (data.length === 0) return null;
  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="flex items-center gap-2 mb-4">
        <Scale className="h-5 w-5 text-primary" />
        <h3 className="font-bold">مطابقة مخزون الفروع مع حساب المخزون</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted-foreground">
            <tr className="border-b">
              <th className="text-start py-2">الفرع</th>
              <th className="text-start py-2">قيمة المخزون</th>
              <th className="text-start py-2">رصيد الحساب</th>
              <th className="text-start py-2">الفرق</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.branch_id} className="border-b last:border-0">
                <td className="py-2 font-medium">{r.branch_name}</td>
                <td className="py-2 tabular-nums">{formatCurrency(r.stock_value)}</td>
                <td className="py-2 tabular-nums">{formatCurrency(r.gl_value)}</td>
                <td className="py-2 tabular-nums">{formatCurrency(r.difference)}</td>
                <td className="py-2">
                  <StatusBadge status={Math.abs(r.difference) < 0.01 ? "posted" : "cancelled"} label={Math.abs(r.difference) < 0.01 ? "مطابق" : "فرق"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
