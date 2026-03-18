import ProductAnalytics from "./ProductAnalytics";

export default function ProductAnalyticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تحليل المنتجات</h1>
        <p className="text-muted-foreground text-sm mt-1">أداء المنتجات والأصناف الأكثر مبيعاً وربحية</p>
      </div>
      <ProductAnalytics />
    </div>
  );
}
