import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen } from "lucide-react";

export default function Accounts() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">شجرة الحسابات</h1>
        <p className="text-muted-foreground text-sm mt-1">دليل الحسابات المحاسبية</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="w-4 h-4" />
            الحسابات
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">سيتم بناء شجرة الحسابات بعد إنشاء قاعدة البيانات</p>
        </CardContent>
      </Card>
    </div>
  );
}
