import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function Sales() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">فواتير البيع</h1>
        <p className="text-muted-foreground text-sm mt-1">إدارة فواتير المبيعات</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            الفواتير
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">سيتم بناء نظام الفواتير بعد إنشاء قاعدة البيانات</p>
        </CardContent>
      </Card>
    </div>
  );
}
