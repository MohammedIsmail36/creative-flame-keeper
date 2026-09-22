import { Building2 } from "lucide-react";
import { useBranchContext } from "@/contexts/BranchContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_BRANCHES = "__all__";

/** محوّل الفرع النشط — يظهر في أعلى القائمة الجانبية */
export function BranchSwitcher({ collapsed }: { collapsed: boolean }) {
  const { accessibleBranches, activeBranchId, setActiveBranchId, isRestricted, loading } =
    useBranchContext();

  if (loading || accessibleBranches.length === 0) return null;
  if (collapsed) return null;

  const active = accessibleBranches.filter((b) => b.is_active);
  const value = activeBranchId ?? ALL_BRANCHES;

  return (
    <div className="px-3 pt-2">
      <Select
        value={value}
        onValueChange={(v) => setActiveBranchId(v === ALL_BRANCHES ? null : v)}
      >
        <SelectTrigger className="h-8 text-[12px] bg-muted/40 border-border/50">
          <div className="flex items-center gap-1.5 truncate">
            <Building2 className="w-3.5 h-3.5 text-primary shrink-0" />
            <SelectValue />
          </div>
        </SelectTrigger>
        <SelectContent>
          {!isRestricted && (
            <SelectItem value={ALL_BRANCHES}>كل الفروع</SelectItem>
          )}
          {active.map((b) => (
            <SelectItem key={b.id} value={b.id}>
              {b.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
