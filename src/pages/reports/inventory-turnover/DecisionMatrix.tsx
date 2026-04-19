import { Card, CardContent } from "@/components/ui/card";
import { Info, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { MATRIX_DECISIONS, DAYS_CONSIDERED_NEW } from "./types";

interface DecisionMatrixProps {
  matrixCounts: Record<string, number>;
  matrixFilter: string | null;
  setMatrixFilter: (key: string | null) => void;
  newProductsCount: number;
}

export function DecisionMatrix({
  matrixCounts,
  matrixFilter,
  setMatrixFilter,
  newProductsCount,
}: DecisionMatrixProps) {
  return (
    <Card className="border shadow-sm">
      <CardContent className="py-4 px-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-foreground">مصفوفة القرار</h3>
          <span className="text-xs text-muted-foreground">
            ABC × معدل الدوران
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-center border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="w-10" />
                <th className="pb-1">
                  <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-0.5 rounded-full">
                    سريع ↑
                  </span>
                </th>
                <th className="pb-1">
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 rounded-full">
                    متوسط
                  </span>
                </th>
                <th className="pb-1">
                  <span className="text-xs font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded-full">
                    بطيء ↓
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {(["A", "B", "C"] as const).map((abc) => (
                <tr key={abc}>
                  <td className="py-1">
                    <span
                      className={cn(
                        "inline-block w-7 h-7 rounded-lg text-xs font-black leading-7 text-center",
                        abc === "A"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                          : abc === "B"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                            : "bg-muted text-muted-foreground",
                      )}
                    >
                      {abc}
                    </span>
                  </td>
                  {(["fast", "medium", "slow"] as const).map((speed) => {
                    const key = `${abc}-${speed}`;
                    const count = matrixCounts[key] || 0;
                    const decision = MATRIX_DECISIONS[key];
                    const isActive = matrixFilter === key;
                    return (
                      <td key={key} className="py-1">
                        <button
                          onClick={() => setMatrixFilter(isActive ? null : key)}
                          className={cn(
                            "w-full rounded-xl border transition-all duration-150 px-2 py-2 text-center",
                            decision.bg,
                            decision.border,
                            isActive
                              ? "ring-2 ring-primary ring-offset-1 scale-105"
                              : "hover:scale-102 hover:shadow-sm",
                          )}
                        >
                          <div className="text-base leading-none mb-1">
                            {decision.icon}
                          </div>
                          <div className="text-[10px] text-muted-foreground leading-tight mb-0.5">
                            {decision.text}
                          </div>
                          <div
                            className={cn(
                              "text-xs font-black",
                              count > 0
                                ? "text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
                            {count}
                          </div>
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {newProductsCount > 0 && (
          <p className="text-[11px] text-muted-foreground mt-3 text-center flex items-center justify-center gap-1">
            <Info className="h-3 w-3" />
            لا تشمل {newProductsCount} منتج جديد (أقل من {DAYS_CONSIDERED_NEW}{" "}
            يوم)
          </p>
        )}
      </CardContent>
    </Card>
  );
}
