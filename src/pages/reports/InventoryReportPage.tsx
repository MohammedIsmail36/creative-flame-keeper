import InventoryReport from "./InventoryReport";

export default function InventoryReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">تقرير المخزون</h1>
        <p className="text-muted-foreground text-sm mt-1">حالة المخزون الحالية وقيمته والأصناف المنخفضة</p>
      </div>
      <InventoryReport />
    </div>
  );
}
