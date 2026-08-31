import {
  ACTION_LABELS,
  ACTION_TONE,
  type InventoryAction,
} from "@/lib/inventory/definitions";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Info } from "lucide-react";

const TONE_CLASS: Record<(typeof ACTION_TONE)[InventoryAction], string> = {
  danger:
    "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
  warning:
    "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  info: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  success:
    "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
};

interface ActionBadgeProps {
  action: InventoryAction;
  /** شرح "على أي أساس" ظهرت التوصية */
  basis?: string | null;
  className?: string;
}

/**
 * شارة الإجراء المقترح الموحّدة لكل تقارير المخزون — الصياغة تأتي من
 * ACTION_LABELS فقط، والتلميح يوضّح أساس التوصية لصاحب المتجر.
 */
export function ActionBadge({ action, basis, className }: ActionBadgeProps) {
  const badge = (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-semibold gap-1 whitespace-nowrap",
        TONE_CLASS[ACTION_TONE[action]],
        className,
      )}
    >
      {ACTION_LABELS[action]}
      {basis ? <Info className="h-3 w-3 opacity-70" /> : null}
    </Badge>
  );

  if (!basis) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help">{badge}</span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[260px] text-xs leading-5">
          {basis}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
