import { Award } from "lucide-react";
import ProductAnalytics from "./ProductAnalytics";

export default function ProductAnalyticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Award className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">تحليل المنتجات</h1>
          <p className="text-muted-foreground text-sm mt-1">أداء المنتجات والأصناف الأكثر مبيعاً وربحية</p>
        </div>
      </div>
      <ProductAnalytics />
    </div>
  );
}
