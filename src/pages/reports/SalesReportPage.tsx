import { BarChart3 } from "lucide-react";
import SalesReport from "./SalesReport";

export default function SalesReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">تقرير المبيعات</h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل تفصيلي لحركة المبيعات والإيرادات</p>
        </div>
      </div>
      <SalesReport />
    </div>
  );
}
