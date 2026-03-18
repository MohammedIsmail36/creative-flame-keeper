import { Calculator } from "lucide-react";
import AccountBalancesReport from "./AccountBalancesReport";

export default function AccountBalancesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Calculator className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold">أرصدة الحسابات</h1>
          <p className="text-muted-foreground text-sm mt-1">ملخص أرصدة جميع الحسابات النشطة</p>
        </div>
      </div>
      <AccountBalancesReport />
    </div>
  );
}
