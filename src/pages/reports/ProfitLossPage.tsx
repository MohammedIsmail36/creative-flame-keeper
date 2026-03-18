import ProfitLossReport from "./ProfitLossReport";

export default function ProfitLossPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تقرير الأرباح والخسائر</h1>
        <p className="text-muted-foreground text-sm mt-1">تحليل تفصيلي للإيرادات والمصروفات مع مقارنة شهرية وسنوية</p>
      </div>
      <ProfitLossReport />
    </div>
  );
}
