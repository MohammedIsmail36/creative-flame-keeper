import { Package } from "lucide-react";
import InventoryReport from "./InventoryReport";

export default function InventoryReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Package className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">تقرير المخزون</h1>
          <p className="text-muted-foreground text-sm mt-1">حالة المخزون الحالية وقيمته والأصناف المنخفضة</p>
        </div>
      </div>
      <InventoryReport />
    </div>
  );
}
