import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, ShoppingCart, Package, Clock, TrendingUp, Award } from "lucide-react";
import SalesReport from "./reports/SalesReport";
import PurchasesReport from "./reports/PurchasesReport";
import InventoryReport from "./reports/InventoryReport";
import DebtAgingReport from "./reports/DebtAgingReport";
import GrowthAnalytics from "./reports/GrowthAnalytics";
import ProductAnalytics from "./reports/ProductAnalytics";

export default function Reports() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">التقارير</h1>
        <p className="text-muted-foreground text-sm mt-1">التقارير التشغيلية والتحليلية المتقدمة</p>
      </div>

      <Tabs defaultValue="growth" dir="rtl">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="growth" className="gap-1.5"><TrendingUp className="w-4 h-4" />تحليلات النمو</TabsTrigger>
          <TabsTrigger value="products" className="gap-1.5"><Award className="w-4 h-4" />تحليل المنتجات</TabsTrigger>
          <TabsTrigger value="sales" className="gap-1.5"><BarChart3 className="w-4 h-4" />المبيعات</TabsTrigger>
          <TabsTrigger value="purchases" className="gap-1.5"><ShoppingCart className="w-4 h-4" />المشتريات</TabsTrigger>
          <TabsTrigger value="inventory" className="gap-1.5"><Package className="w-4 h-4" />المخزون</TabsTrigger>
          <TabsTrigger value="aging" className="gap-1.5"><Clock className="w-4 h-4" />أعمار الديون</TabsTrigger>
        </TabsList>

        <TabsContent value="growth"><GrowthAnalytics /></TabsContent>
        <TabsContent value="products"><ProductAnalytics /></TabsContent>
        <TabsContent value="sales"><SalesReport /></TabsContent>
        <TabsContent value="purchases"><PurchasesReport /></TabsContent>
        <TabsContent value="inventory"><InventoryReport /></TabsContent>
        <TabsContent value="aging"><DebtAgingReport /></TabsContent>
      </Tabs>
    </div>
  );
}
