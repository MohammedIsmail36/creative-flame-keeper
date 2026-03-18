import AccountBalancesReport from "./AccountBalancesReport";

export default function AccountBalancesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">أرصدة الحسابات</h1>
        <p className="text-muted-foreground text-sm mt-1">ملخص أرصدة جميع الحسابات النشطة</p>
      </div>
      <AccountBalancesReport />
    </div>
  );
}
