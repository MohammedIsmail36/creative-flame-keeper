import PurchasesReport from "./PurchasesReport";

export default function PurchasesReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تقرير المشتريات</h1>
        <p className="text-muted-foreground text-sm mt-1">تحليل تفصيلي لحركة المشتريات والمصروفات</p>
      </div>
      <PurchasesReport />
    </div>
  );
}
