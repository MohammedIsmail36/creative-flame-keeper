import { Package } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import InventoryReport from "./InventoryReport";

export default function InventoryReportPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={Package}
        title="تقرير المخزون"
        description="حالة المخزون الحالية وقيمته والأصناف المنخفضة"
      />
      <InventoryReport />
    </div>
  );
}
