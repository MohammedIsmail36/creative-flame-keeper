# خطة مراجعة المنطق الشاملة - النظام المحاسبي (creative-flame-keeper)

> **ملف جاهز للتسليم لوكيل AI آخر لتنفيذه على مشروع `creative-flame-keeper`**
> **تاريخ الإعداد**: 2026-04-09

---

## المرحلة 1: إصلاح أخطاء منطقية حرجة (Critical Logic Bugs)

### المهمة 1.1: إزالة حد `.limit(5000)` في استعلامات القيود المحاسبية
- **الملفات**: `Dashboard.tsx` (سطر 399، 582)، `TrialBalance.tsx`، `IncomeStatement.tsx`، `BalanceSheet.tsx`، `Ledger.tsx`
- **المشكلة**: استعلام `journal_entry_lines` يستخدم `.limit(5000)` مما يعني أن أي شركة لديها أكثر من 5000 سطر قيد ستحصل على أرصدة خاطئة في كل التقارير المالية
- **الحل**: إنشاء Database Functions في Supabase تحسب الأرصدة على مستوى قاعدة البيانات:
  - `get_account_balances(date_from, date_to)` - أرصدة الحسابات
  - `get_trial_balance(date_from, date_to)` - ميزان المراجعة
  - `get_income_statement(date_from, date_to)` - قائمة الدخل
  - `get_liquidity_summary()` - ملخص السيولة
- **التعليمات**: أنشئ migration في Supabase لكل دالة، ثم استبدل الاستعلامات المباشرة بـ `supabase.rpc()`

### المهمة 1.2: إصلاح Race Condition في ترحيل الفاتورة (postInvoice)
- **الملف**: `SalesInvoiceForm.tsx` (سطر 310-447)، `PurchaseInvoiceForm.tsx`
- **المشكلة**: عملية الترحيل تتم في 6+ خطوات متتالية بدون transaction:
  1. فحص الكمية المتاحة
  2. إنشاء القيد المحاسبي
  3. إنشاء سطور القيد
  4. تحديث حالة الفاتورة
  5. تحديث كمية كل منتج (حلقة for)
  6. إنشاء حركات المخزون
  - إذا فشلت أي خطوة بعد الثانية، تبقى البيانات في حالة غير متسقة
- **الحل**: إنشاء Database Function واحدة `post_sales_invoice(invoice_id)` تنفذ كل الخطوات في transaction واحد، وكذلك `post_purchase_invoice(invoice_id)`

### المهمة 1.3: إصلاح Race Condition في تحديث المخزون
- **الملف**: `SalesInvoiceForm.tsx` (سطر 414-438)
- **المشكلة**: تحديث الكمية يتم بـ `read → subtract → write` بدون قفل، مما يسمح بسباق بين مستخدمين (overselling)
- **الحل**: استخدام `UPDATE products SET quantity_on_hand = quantity_on_hand - $qty WHERE id = $id AND quantity_on_hand >= $qty` داخل الـ database function

### المهمة 1.4: إصلاح حساب تكلفة الإلغاء
- **الملف**: `SalesInvoiceForm.tsx` (سطر 460-528) - دالة `handleCancelPosted`
- **المشكلة**: عند إلغاء فاتورة مرحّلة، يستخدم `purchase_price` الحالي للمنتج لحساب التكلفة المرتجعة بدلاً من التكلفة الفعلية المسجلة في `inventory_movements`
- **الحل**: جلب `unit_cost` من `inventory_movements` المرتبطة بالفاتورة بدلاً من `products.purchase_price`

---

## المرحلة 2: إصلاح مشاكل منطقية متوسطة

### المهمة 2.1: إصلاح فلتر الفواتير غير المدفوعة
- **الملف**: `Dashboard.tsx` (سطر 493-517) - دالة `fetchUnpaidInvoices`
- **المشكلة**: يجلب فقط آخر 100 فاتورة ثم يفلتر غير المدفوعة منها على الـ client. إذا كانت آخر 100 فاتورة كلها مدفوعة، لن تظهر الفواتير غير المدفوعة الأقدم
- **الحل**: إضافة فلتر على مستوى DB أو إنشاء view/rpc يجلب فقط الفواتير غير المسددة

### المهمة 2.2: إصلاح حساب المنتجات الأكثر مبيعاً
- **الملف**: `Dashboard.tsx` (سطر 519-553) - دالة `fetchTopProducts`
- **المشكلة**: يجلب جميع `sales_invoice_items` بدون أي حد أو فلتر تاريخ، ثم يفلتر على الـ client. مع نمو البيانات سيصبح بطيئاً جداً
- **الحل**: إنشاء database function `get_top_products(year, limit)` تقوم بالتجميع على مستوى DB

### المهمة 2.3: إصلاح حساب أعلى التصنيفات
- **الملف**: `Dashboard.tsx` (سطر 607-649) - دالة `fetchTopCategories`
- **المشكلة**: نفس مشكلة 2.2 + حساب الربح يستخدم `purchase_price` الحالي وليس التكلفة الفعلية وقت البيع
- **الحل**: database function تحسب بناءً على `inventory_movements.unit_cost`

### المهمة 2.4: إصلاح IncomeStatement - لا تفرق بين "expense" و "expenses"
- **الملف**: `IncomeStatement.tsx` (سطر 97-98)
- **المشكلة**: يتحقق فقط من `account_type === "expense"` بينما `TrialBalance.tsx` يستخدم `["revenue", "expense", "expenses"]`
- **الحل**: توحيد النوع في قاعدة البيانات أو التحقق من كلا القيمتين

### المهمة 2.5: إصلاح فلتر إقفال السنة المالية
- **الملفات**: `TrialBalance.tsx` (سطر 49)، `IncomeStatement.tsx` (سطر 55)
- **المشكلة**: البحث عن قيد الإقفال بالنص العربي الحرفي `"قيد إقفال السنة المالية"` - أي تغيير طفيف في النص يكسر الفلتر
- **الحل**: إضافة عمود `entry_type` في جدول `journal_entries` بقيم مثل `'closing'`, `'regular'`, `'reversal'`

---

## المرحلة 3: تحسين بنية الكود (Refactoring)

### المهمة 3.1: تقسيم Dashboard.tsx (1,429 سطر)
تقسيم إلى:
- `hooks/useDashboardKPIs.ts`
- `hooks/useDashboardCharts.ts`
- `hooks/useDashboardTables.ts`
- `components/dashboard/KPICards.tsx`
- `components/dashboard/SalesChart.tsx`
- `components/dashboard/ExpenseChart.tsx`
- `components/dashboard/UnpaidInvoicesTable.tsx`
- `components/dashboard/TopProductsTable.tsx`
- `components/dashboard/LowStockTable.tsx`
- `components/dashboard/LiquidityCard.tsx`
- `components/dashboard/RecentActivities.tsx`
- `components/dashboard/Last7DaysSales.tsx`

جميع الـ hooks تستخدم `useQuery` من React Query.

### المهمة 3.2: تقسيم SalesInvoiceForm.tsx (814 سطر)
تقسيم إلى:
- `hooks/useSalesInvoice.ts`
- `hooks/useInvoicePosting.ts`
- `components/invoice/InvoiceHeader.tsx`
- `components/invoice/InvoiceItemsTable.tsx`
- `components/invoice/InvoiceTotals.tsx`
- `components/invoice/InvoiceActions.tsx`

### المهمة 3.3: تحويل جميع الاستعلامات إلى React Query
إنشاء hooks مشتركة:
- `hooks/queries/useCustomers.ts`
- `hooks/queries/useProducts.ts`
- `hooks/queries/useInvoices.ts`
- `hooks/queries/useAccounts.ts`

### المهمة 3.4: تطبيق Lazy Loading للصفحات
- تحويل 60+ import في `App.tsx` إلى `React.lazy()` مع `Suspense`
- فصل المسارات في ملف `routes.tsx`

---

## المرحلة 4: الأمان

### المهمة 4.1: إزالة `.env` من Git
- إضافة `.env` إلى `.gitignore`
- حذف الملف من تاريخ Git باستخدام `git filter-branch` أو `BFG`
- تدوير مفاتيح Supabase (anon key + URL) فوراً

### المهمة 4.2: إضافة RLS Policies
- تفعيل RLS على جميع الجداول
- الحد الأدنى: `auth.uid() IS NOT NULL`
- الأفضل: ربط البيانات بـ organization/tenant

### المهمة 4.3: نقل العمليات الحساسة إلى Database Functions
- ترحيل الفواتير، الإلغاء، إعادة حساب الأرصدة كـ `SECURITY DEFINER` functions

---

## المرحلة 5: معالجة الأخطاء والاستقرار

### المهمة 5.1: إضافة Error Boundaries
- إنشاء `components/ErrorBoundary.tsx` عام
- تغليف كل صفحة رئيسية به

### المهمة 5.2: معالجة أخطاء الاستعلامات
- إضافة toast للأخطاء + retry logic عبر React Query

### المهمة 5.3: إضافة اختبارات للمنطق المحاسبي
- حساب إجمالي الفاتورة (خصم سطر vs خصم فاتورة vs ضريبة)
- حساب رصيد العميل/المورد (`recalculateEntityBalance`)
- حساب المبلغ المدفوع (`recalculateInvoicePaidAmount`)
- حساب تكلفة البضاعة المباعة

---

## ملخص الأولويات

| الأولوية | المهمة | السبب |
|----------|--------|-------|
| 🔴 1 | 1.1 - إزالة limit(5000) | أرصدة خاطئة في الإنتاج |
| 🔴 2 | 1.2 - Transaction للترحيل | بيانات غير متسقة |
| 🔴 3 | 1.3 - Race condition المخزون | بيع أكثر من المتاح |
| 🔴 4 | 1.4 - تكلفة الإلغاء | أرقام محاسبية خاطئة |
| 🟠 5 | 4.1 - إزالة .env | ثغرة أمنية |
| 🟡 6 | 2.1-2.5 - إصلاحات متوسطة | دقة البيانات |
| 🟢 7 | 3.1-3.4 - إعادة هيكلة | صيانة وأداء |
| 🔵 8 | 5.1-5.3 - استقرار | جودة |

---

## تعليمات للوكيل المنفذ

1. **ابدأ بالمرحلة 1** - الأخطاء الحرجة أولاً
2. **أنشئ Database Functions كـ migrations** في مجلد `supabase/migrations/`
3. **لا تلمس المشروع الأصلي** - اعمل على نسخة منفصلة (`erp-accounting-system`)
4. **اختبر كل تغيير** - خاصة الحسابات المالية
5. **استخدم React Query** في كل استعلام جديد
6. **وثّق التغييرات** في commit messages واضحة

