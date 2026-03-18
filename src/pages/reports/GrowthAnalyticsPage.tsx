import GrowthAnalytics from "./GrowthAnalytics";

export default function GrowthAnalyticsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تحليلات النمو</h1>
        <p className="text-muted-foreground text-sm mt-1">مؤشرات الأداء واتجاهات النمو الشهرية والسنوية</p>
      </div>
      <GrowthAnalytics />
    </div>
  );
}
