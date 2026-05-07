import { useState } from "react";
import { Eye } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useTurnoverData } from "./TurnoverDataContext";
import NewProductsPage from "./NewProductsPage";
import UnlistedProductsPage from "./UnlistedProductsPage";
import ProductHealthPage from "./ProductHealthPage";

type Tab = "new" | "unlisted" | "health";

export default function UnderObservationPage() {
  const [tab, setTab] = useState<Tab>("new");
  const { newProductsUnderTest, unlistedProducts, allTurnoverData } =
    useTurnoverData();

  const newCount = newProductsUnderTest.length;
  const unlistedCount = unlistedProducts.length;
  const healthCount = allTurnoverData.filter((p) => p.hasAnyHealthFlag).length;

  return (
    <div className="space-y-4" dir="rtl">
      <PageHeader
        icon={Eye}
        title="تحت المراقبة"
        description="منتجات تحتاج متابعة قبل اتخاذ قرار: جديدة، أو ناقصة بيانات، أو بمؤشرات صحة سلبية"
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-auto bg-muted/50 p-1">
          <TabsTrigger value="new" className="gap-2 data-[state=active]:bg-background">
            منتجات جديدة
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {newCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="unlisted" className="gap-2 data-[state=active]:bg-background">
            مراجعة مطلوبة
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {unlistedCount}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-2 data-[state=active]:bg-background">
            مؤشرات صحة
            <Badge variant="secondary" className="text-[10px] tabular-nums">
              {healthCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="mt-4">
          <NewProductsPage />
        </TabsContent>
        <TabsContent value="unlisted" className="mt-4">
          <UnlistedProductsPage />
        </TabsContent>
        <TabsContent value="health" className="mt-4">
          <ProductHealthPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
