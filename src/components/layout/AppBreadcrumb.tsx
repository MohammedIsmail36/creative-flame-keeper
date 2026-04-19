import { useLocation, Link } from "react-router-dom";
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronLeft, Home } from "lucide-react";

const routeLabels: Record<string, string> = {
  "": "لوحة التحكم",
  accounts: "شجرة الحسابات",
  journal: "القيود المحاسبية",
  ledger: "دفتر الأستاذ",
  "trial-balance": "ميزان المراجعة",
  "income-statement": "قائمة الدخل",
  "balance-sheet": "الميزانية العمومية",
  "cash-flow": "التدفقات النقدية",
  "fiscal-year-closing": "إقفال السنة المالية",
  sales: "فواتير البيع",
  "sales-returns": "مرتجعات البيع",
  "customer-payments": "مدفوعات العملاء",
  customers: "العملاء",
  "customer-statement": "كشف حساب عميل",
  purchases: "فواتير الشراء",
  "purchase-returns": "مرتجعات الشراء",
  "supplier-payments": "مدفوعات الموردين",
  suppliers: "الموردين",
  "supplier-statement": "كشف حساب مورد",
  products: "المنتجات",
  "inventory-adjustments": "تسوية المخزون",
  "inventory-movements": "حركة المخزون",
  inventory: "المخزون",
  categories: "التصنيفات",
  units: "وحدات القياس",
  brands: "الماركات",
  expenses: "المصروفات",
  "expense-types": "أنواع المصروفات",
  reports: "التقارير",
  "sales-report": "تقرير المبيعات",
  "purchases-report": "تقرير المشتريات",
  growth: "تحليلات النمو",
  "products-analytics": "تحليل المنتجات",
  aging: "أعمار الديون",
  balances: "أرصدة الحسابات",
  "profit-loss": "الأرباح والخسائر",
  "inventory-turnover": "دوران المخزون",
  dashboard: "لوحة المؤشرات",
  "urgent-actions": "إجراءات عاجلة",
  "purchase-planning": "خطة الشراء",
  dormant: "المخزون الراكد",
  "supplier-returns": "إرجاع للمورد",
  "new-products": "منتجات جديدة",
  unlisted: "مراجعة مطلوبة",
  analysis: "التحليل الشامل",
  settings: "الإعدادات",
  users: "إدارة المستخدمين",
  profile: "الملف الشخصي",
  "system-setup": "إعداد النظام",
  auth: "تسجيل الدخول",
  mfa: "التحقق الثنائي",
  new: "إضافة جديد",
  edit: "تعديل",
  import: "استيراد",
};

function isUUID(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    s,
  );
}

export function AppBreadcrumb() {
  const location = useLocation();
  const pathSegments = location.pathname.split("/").filter(Boolean);

  if (pathSegments.length === 0) return null;

  const crumbs: { label: string; path: string }[] = [];

  pathSegments.forEach((segment, index) => {
    if (isUUID(segment)) {
      crumbs.push({
        label: "تفاصيل",
        path: "/" + pathSegments.slice(0, index + 1).join("/"),
      });
    } else {
      const label = routeLabels[segment] || segment;
      crumbs.push({
        label,
        path: "/" + pathSegments.slice(0, index + 1).join("/"),
      });
    }
  });

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link
              to="/"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" />
              <span className="sr-only">الرئيسية</span>
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {crumbs.map((crumb, index) => (
          <span key={crumb.path} className="contents">
            <BreadcrumbSeparator>
              <ChevronLeft className="h-3.5 w-3.5" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              {index === crumbs.length - 1 ? (
                <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link to={crumb.path}>{crumb.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </span>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
