import { useParams } from "react-router-dom";
import AccountStatement from "./reports/AccountStatement";

export default function CustomerStatement() {
  const { id } = useParams();
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">كشف حساب عميل</h1>
        <p className="text-muted-foreground text-sm mt-1">عرض حركات وأرصدة العميل</p>
      </div>
      <AccountStatement defaultEntityType="customer" defaultEntityId={id} />
    </div>
  );
}
