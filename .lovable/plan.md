

## خطة: فصل التقارير إلى صفحات مستقلة وإعادة تنظيم القائمة الجانبية

### الوضع الحالي
صفحة `/reports` تجمع 8 تقارير في تبويبات (Tabs): تحليلات النمو، تحليل المنتجات، كشف حساب، أرصدة الحسابات، المبيعات، المشتريات، المخزون، أعمار الديون. هذا يجعل التنقل بطيئاً والبيانات مزدحمة.

### التغييرات المطلوبة

#### 1. إنشاء صفحات مستقلة لكل تقرير (wrapper pages)

| المسار الجديد | الملف | المكون الداخلي |
|---|---|---|
| `/reports/sales` | `src/pages/reports/SalesReportPage.tsx` | `SalesReport` |
| `/reports/purchases` | `src/pages/reports/PurchasesReportPage.tsx` | `PurchasesReport` |
| `/reports/inventory` | `src/pages/reports/InventoryReportPage.tsx` | `InventoryReport` |
| `/reports/aging` | `src/pages/reports/DebtAgingReportPage.tsx` | `DebtAgingReport` |
| `/reports/growth` | `src/pages/reports/GrowthAnalyticsPage.tsx` | `GrowthAnalytics` |
| `/reports/products` | `src/pages/reports/ProductAnalyticsPage.tsx` | `ProductAnalytics` |
| `/reports/balances` | `src/pages/reports/AccountBalancesPage.tsx` | `AccountBalancesReport` |

كل wrapper يضيف عنوان ووصف عربي ثم يعرض المكون الموجود.

#### 2. نقل كشوف الحسابات

- **كشف حساب العميل** (`/customer-statement/:id`): يبقى كما هو لكن يُنقل رابطه من التقارير إلى قسم **المبيعات** في القائمة الجانبية
- **كشف حساب المورد** (`/supplier-statement/:id`): يُنقل رابطه إلى قسم **المشتريات**
- إزالة تبويب "كشف حساب" من صفحة التقارير المجمعة

#### 3. تحديث القائمة الجانبية (`AppSidebar.tsx`)

```text
المبيعات:
  ├── فاتورة مبيعات
  ├── مرتجع مبيعات
  ├── مدفوعات عملاء
  ├── العملاء
  └── كشف حساب عميل  ← جديد

المشتريات:
  ├── فاتورة مشتريات
  ├── مرتجع مشتريات
  ├── مدفوعات موردين
  ├── الموردين
  └── كشف حساب مورد  ← جديد

التقارير:
  ├── ميزان المراجعة (موجود)
  ├── قائمة الدخل (موجود)
  ├── الميزانية العمومية (موجود)
  ├── تحليلات النمو  ← جديد
  ├── تحليل المنتجات  ← جديد
  ├── تقرير المبيعات  ← جديد
  ├── تقرير المشتريات  ← جديد
  ├── تقرير المخزون  ← جديد
  ├── أعمار الديون  ← جديد
  ├── أرصدة الحسابات  ← جديد
  ├── حركة المخزون (موجود)
  └── تسوية المخزون (موجود)
```

إزالة رابط `/reports` القديم (صفحة التبويبات).

#### 4. تحديث `App.tsx`
- إضافة 7 routes جديدة (`/reports/*`)
- إضافة routes لكشف حساب عميل/مورد بدون `:id` (اختياري — للوصول من القائمة الجانبية مع اختيار الجهة من الصفحة)

#### 5. حذف أو إبقاء `Reports.tsx`
حذف صفحة التبويبات `/reports` بالكامل لأن كل تقرير أصبح مستقلاً.

#### 6. تحديث Breadcrumb labels
إضافة المسارات الجديدة إلى خريطة `routeLabels` في `AppBreadcrumb.tsx`.

### الملفات المتأثرة
- **إنشاء**: 7 wrapper pages جديدة + صفحتا كشف حساب (عميل/مورد بدون id)
- **تعديل**: `App.tsx`, `AppSidebar.tsx`, `AppBreadcrumb.tsx`
- **حذف**: `src/pages/Reports.tsx` (اختياري — يمكن إبقاؤه كـ redirect)

