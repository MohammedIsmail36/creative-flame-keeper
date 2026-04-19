import { Card, CardContent } from "@/components/ui/card";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  Legend,
} from "recharts";
import { fmt } from "./types";

interface TurnoverPieChartProps {
  pieData: { name: string; value: number; color: string }[];
  newProductsCount: number;
}

export function TurnoverPieChart({
  pieData,
  newProductsCount,
}: TurnoverPieChartProps) {
  if (pieData.length === 0) return null;

  return (
    <Card className="border shadow-sm">
      <CardContent className="py-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">
            توزيع فئات الدوران بالقيمة المالية
          </h3>
          {newProductsCount > 0 && (
            <span className="text-[11px] text-muted-foreground">
              يشمل {newProductsCount} منتج جديد
            </span>
          )}
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={80}
                innerRadius={35}
                paddingAngle={2}
                label={({ name, percent }) =>
                  percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : ""
                }
                labelLine={false}
              >
                {pieData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} strokeWidth={0} />
                ))}
              </Pie>
              <RTooltip
                formatter={(value: number) => [fmt(value), "القيمة"]}
                contentStyle={{
                  fontSize: "12px",
                  direction: "rtl",
                  borderRadius: "8px",
                }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", direction: "rtl" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
