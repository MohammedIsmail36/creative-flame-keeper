import { useParams } from "react-router-dom";
import AccountStatement from "./reports/AccountStatement";

export default function SupplierStatement() {
  const { id } = useParams();
  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">كشف حساب مورد</h1>
        <p className="text-muted-foreground text-sm mt-1">عرض حركات وأرصدة المورد</p>
      </div>
      <AccountStatement defaultEntityType="supplier" defaultEntityId={id} />
    </div>
  );
}
