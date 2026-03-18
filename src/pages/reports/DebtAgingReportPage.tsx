import { Clock } from "lucide-react";
import DebtAgingReport from "./DebtAgingReport";

export default function DebtAgingReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">تقرير أعمار الديون</h1>
          <p className="text-muted-foreground text-sm mt-1">تحليل الديون المستحقة حسب فترات الاستحقاق</p>
        </div>
      </div>
      <DebtAgingReport />
    </div>
  );
}
