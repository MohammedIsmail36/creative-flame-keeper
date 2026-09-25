import { useEffect, useState } from "react";
import { Warehouse, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatCard, StatGrid } from "@/components/StatCard";
import { notify } from "@/lib/notify";
import { formatCurrency } from "@/lib/utils";

interface ProjectionCheck {
  warehouse_mismatches: number;
  product_total_mismatches: number;
  negative_rows: number;
  branches: { branch_id: string; name: string; inventory_value: number }[];
}

/** Stock-per-warehouse & value-per-branch integrity, rebuilt from the movements ledger. */
export function InventoryProjectionPanel() {
  const [data, setData] = useState<ProjectionCheck | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: res, error } = await supabase.rpc("get_inventory_projection_check" as never);
    if (error) return notify.error(error.message);
    setData(res as unknown as ProjectionCheck);
  };

  const rebuild = async () => {
    setBusy(true);
    const { error } = await supabase.rpc("rebuild_inventory_projections" as never);
    setBusy(false);
    if (error) return notify.error(error.message);
    notify.success("تمت إعادة بناء أرصدة المخازن من الحركات");
    void load();
  };

  useEffect(() => { void load(); }, []);
  if (!data) return null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 font-semibold">
            <Warehouse className="h-5 w-5 text-primary" />
            أرصدة المخازن وقيمة المخزون لكل فرع
          </div>
          <Button variant="outline" size="sm" onClick={rebuild} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ml-2 ${busy ? "animate-spin" : ""}`} />
            إعادة البناء من الحركات
          </Button>
        </div>
        <StatGrid>
          <StatCard label="فروق رصيد المخزن عن الحركات" value={String(data.warehouse_mismatches)} tone={data.warehouse_mismatches ? "red" : "emerald"} />
          <StatCard label="فروق إجمالي الصنف" value={String(data.product_total_mismatches)} tone={data.product_total_mismatches ? "red" : "emerald"} />
          <StatCard label="أرصدة سالبة" value={String(data.negative_rows)} tone={data.negative_rows ? "red" : "emerald"} />
          {data.branches.map((b) => (
            <StatCard key={b.branch_id} label={`قيمة مخزون ${b.name}`} value={formatCurrency(b.inventory_value)} />
          ))}
        </StatGrid>
      </CardContent>
    </Card>
  );
}
