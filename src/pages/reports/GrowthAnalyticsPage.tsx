import { BarChart3 } from "lucide-react";
import GrowthAnalytics from "./GrowthAnalytics";

export default function GrowthAnalyticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">لوحة الأداء المالي</h1>
          <p className="text-muted-foreground text-sm mt-1">مقارنة دورية لمؤشرات الإيرادات والمصروفات والأرباح مع الفترة السابقة</p>
        </div>
      </div>
      <GrowthAnalytics />
    </div>
  );
}
