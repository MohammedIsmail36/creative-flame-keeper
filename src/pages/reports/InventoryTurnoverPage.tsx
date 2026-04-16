import { TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import InventoryTurnoverReport from "./InventoryTurnoverReport";

export default function InventoryTurnoverPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <PageHeader
        icon={TrendingUp}
        title="تقرير دوران المخزون"
        description="تحليل معدل دوران المخزون وتصنيف ABC والتنبيهات الذكية"
      />
      <InventoryTurnoverReport />
    </div>
  );
}
