import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator } from "lucide-react";

export default function Ledger() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">دفتر الأستاذ</h1>
        <p className="text-muted-foreground text-sm mt-1">حركة الحسابات التفصيلية</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="w-4 h-4" />
            الأستاذ
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">سيتم بناء دفتر الأستاذ بعد إنشاء قاعدة البيانات</p>
        </CardContent>
      </Card>
    </div>
  );
}
