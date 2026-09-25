import { useQuery } from "@tanstack/react-query";
import { Warehouse as WarehouseIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBranches, useWarehouses } from "@/hooks/use-branches";
const formatCurrency = (n: number) => Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** الكمية لكل مخزن + تكلفة متوسطة لكل فرع لصنف واحد */
export function ProductWarehouseStock({ productId }: { productId: string }) {
  const { data: warehouses = [] } = useWarehouses();
  const { data: branches = [] } = useBranches();
  const { data } = useQuery({
    queryKey: ["product-warehouse-stock", productId],
    queryFn: async () => {
      const [ws, bv] = await Promise.all([
        supabase.from("warehouse_stock").select("warehouse_id, quantity").eq("product_id", productId),
        supabase.from("branch_inventory_valuation").select("branch_id, quantity, inventory_value").eq("product_id", productId),
      ]);
      return { stock: ws.data ?? [], valuation: bv.data ?? [] };
    },
  });
  const rows = (data?.stock ?? []).filter((r) => Number(r.quantity) !== 0);
  if (!data || rows.length === 0) return null;

  return (
    <section className="bg-card rounded-2xl border p-5">
      <div className="flex items-center gap-2 mb-4">
        <WarehouseIcon className="h-5 w-5 text-primary" />
        <h3 className="font-bold">الكمية حسب المخزن</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => {
          const w = warehouses.find((x) => x.id === r.warehouse_id);
          const b = branches.find((x) => x.id === w?.branch_id);
          const v = data.valuation.find((x) => x.branch_id === w?.branch_id);
          const wac = v && Number(v.quantity) > 0 ? Number(v.inventory_value) / Number(v.quantity) : 0;
          return (
            <div key={r.warehouse_id} className="rounded-xl border bg-muted/30 p-3">
              <div className="text-sm font-medium">{w?.name ?? "—"}</div>
              <div className="text-xs text-muted-foreground">{b?.name}</div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xl font-bold tabular-nums">{Number(r.quantity).toLocaleString("en-US")}</span>
                <span className="text-xs text-muted-foreground tabular-nums">متوسط تكلفة الفرع {formatCurrency(wac)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
