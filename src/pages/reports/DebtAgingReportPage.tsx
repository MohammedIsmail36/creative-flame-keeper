import DebtAgingReport from "./DebtAgingReport";

export default function DebtAgingReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تقرير أعمار الديون</h1>
        <p className="text-muted-foreground text-sm mt-1">تحليل الديون المستحقة حسب فترات الاستحقاق</p>
      </div>
      <DebtAgingReport />
    </div>
  );
}
