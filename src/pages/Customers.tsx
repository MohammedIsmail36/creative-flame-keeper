import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users } from "lucide-react";

export default function Customers() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">العملاء</h1>
        <p className="text-muted-foreground text-sm mt-1">إدارة بيانات العملاء</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="w-4 h-4" />
            قائمة العملاء
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">سيتم بناء إدارة العملاء بعد إنشاء قاعدة البيانات</p>
        </CardContent>
      </Card>
    </div>
  );
}
