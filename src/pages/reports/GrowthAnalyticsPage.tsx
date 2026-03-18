import { TrendingUp } from "lucide-react";
import GrowthAnalytics from "./GrowthAnalytics";

export default function GrowthAnalyticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">تحليلات النمو</h1>
          <p className="text-muted-foreground text-sm mt-1">مؤشرات الأداء واتجاهات النمو الشهرية والسنوية</p>
        </div>
      </div>
      <GrowthAnalytics />
    </div>
  );
}
