import SalesReport from "./SalesReport";

export default function SalesReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تقرير المبيعات</h1>
        <p className="text-muted-foreground text-sm mt-1">تحليل تفصيلي لحركة المبيعات والإيرادات</p>
      </div>
      <SalesReport />
    </div>
  );
}
