import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Package } from "lucide-react";

export default function Products() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">المنتجات</h1>
        <p className="text-muted-foreground text-sm mt-1">إدارة المنتجات والمخزون</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-4 h-4" />
            قائمة المنتجات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">سيتم بناء إدارة المنتجات بعد إنشاء قاعدة البيانات</p>
        </CardContent>
      </Card>
    </div>
  );
}
