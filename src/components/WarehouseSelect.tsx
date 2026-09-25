import { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranches, useWarehouses } from "@/hooks/use-branches";
import { useBranch } from "@/contexts/BranchContext";

interface Props {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}

/** اختيار مخزن المستند — المخازن مقيّدة بفروع المستخدم، والافتراضي مخزن الفرع النشط الرئيسي */
export function WarehouseSelect({ value, onChange, disabled }: Props) {
  const { data: warehouses = [] } = useWarehouses();
  const { data: branches = [] } = useBranches();
  const { activeBranchId, canAccessBranch } = useBranch() as any;

  const options = useMemo(
    () =>
      warehouses
        .filter((w) => w.is_active && (!canAccessBranch || canAccessBranch(w.branch_id)))
        .map((w) => ({ ...w, branchName: branches.find((b) => b.id === w.branch_id)?.name ?? "" })),
    [warehouses, branches, canAccessBranch],
  );

  useEffect(() => {
    if (value || disabled || options.length === 0) return;
    const inBranch = options.filter((w) => !activeBranchId || w.branch_id === activeBranchId);
    const pick = inBranch.find((w) => w.is_main) ?? inBranch[0] ?? options.find((w) => w.is_main) ?? options[0];
    if (pick) onChange(pick.id);
  }, [value, disabled, options, activeBranchId, onChange]);

  const current = options.find((w) => w.id === value);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-muted-foreground">المخزن</Label>
      {disabled ? (
        <div className="h-10 px-4 flex items-center rounded-xl border bg-muted/30 text-sm font-medium">
          {current ? `${current.name} — ${current.branchName}` : "المخزن الرئيسي"}
        </div>
      ) : (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger className="h-10 rounded-xl">
            <SelectValue placeholder="اختر المخزن" />
          </SelectTrigger>
          <SelectContent>
            {options.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name} — {w.branchName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
