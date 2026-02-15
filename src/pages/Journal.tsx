import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function Journal() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">القيود المحاسبية</h1>
        <p className="text-muted-foreground text-sm mt-1">قيود اليومية المحاسبية</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="w-4 h-4" />
            القيود
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">سيتم بناء القيود المحاسبية بعد إنشاء قاعدة البيانات</p>
        </CardContent>
      </Card>
    </div>
  );
}
