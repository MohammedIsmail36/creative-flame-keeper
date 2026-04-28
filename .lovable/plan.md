# خطة إصلاح 4 مشاكل جوهرية

## 1) إصلاح حساب رصيد المورد/العميل (تجاهل الرصيد الافتتاحي)

**المشكلة الجذرية:**
- عند إضافة مورد برصيد افتتاحي يتم إنشاء قيد يومية (3101 / 2101) وتحديث `suppliers.balance` مباشرة.
- لكن دالة `recalculateEntityBalance` في `src/lib/entity-balance.ts` تعيد الحساب من جدول الفواتير + المرتجعات + المدفوعات **فقط** — ولا تقرأ الرصيد الافتتاحي إطلاقاً.
- نتيجة: أي ترحيل لاحق لفاتورة يعيد كتابة `balance` ويُلغي الرصيد الافتتاحي.
- نفس المشكلة في `get_account_statement` (دالة DB) — لا تعرض سطر افتتاحي ولا يدخل في الرصيد المتجمع.

**الحل:**
- إضافة عمود `opening_balance numeric DEFAULT 0` على جدولي `customers` و `suppliers` (migration).
- تحديث `Customers.tsx` و `Suppliers.tsx` لتخزين الرصيد الافتتاحي في الحقل الجديد (مع إبقاء توليد القيد كما هو).
- تعديل `recalculateEntityBalance` لتُضيف `opening_balance` للمعادلة:
  `balance = opening_balance + invoices - returns - payments + refunds`
- تعديل دالة `get_account_statement` في DB لتُدرج سطراً افتتاحياً في بداية كشف الحساب (نوع `'opening'`) بقيمة `opening_balance` كمدين (للعميل) أو دائن (للمورد) — بحيث يدخل في `running_balance`.
- شاشتا كشف حساب العميل/المورد تستفيدان تلقائياً.

## 2) منع إنشاء فاتورة شراء فارغة عند الضغط على "حفظ وإصدار"

**المشكلة الجذرية:**
- الزر "حفظ وإصدار" يستدعي `handleSave` ثم `postInvoice`، لكن `handleSave` متساهل (يحفظ مسودة فارغة بدون مورد/بنود) لتمكين العمل التدريجي.
- إذا كانت الفاتورة جديدة + بدون بنود فعلية → يُنشأ سجل في `purchase_invoices` بـ `total=0` ثم `postInvoice` قد يفشل في التحقق لكن السجل الفارغ يبقى. وإذا مرّ بطريقة ما يُولّد قيد فارغ.
- ملف: `src/pages/PurchaseInvoiceForm.tsx` (سطور 231–427) ونفس النمط في `SalesInvoiceForm.tsx`.

**الحل:**
- في `postInvoice`: تشغيل تحقق صارم **قبل** أي حفظ:
  - وجود مورد (`supplierId`).
  - وجود بند واحد على الأقل بـ `product_id` و `quantity > 0` و `unit_price >= 0`.
- إذا كانت الفاتورة جديدة (`isNew`) ولم تجتز التحقق → لا نستدعي `handleSave` ولا ننشئ سجلاً.
- إضافة حماية على مستوى الـ DB في `post_purchase_invoice` و `post_sales_invoice`:
  - رفض إذا `total <= 0` أو لا توجد بنود في `*_items`.
- تطبيق نفس التحقق على فاتورة المبيعات (`SalesInvoiceForm.tsx`).
- (اختياري) Trigger `BEFORE INSERT` على `journal_entries` يمنع قيداً بـ `total_debit = 0`.

## 3) إصلاح منطق إقفال السنة المالية لاحتساب السنة الصحيحة

**المشكلة الجذرية:**
- في `FiscalYearClosing.tsx` (سطور 71–87): `fiscalYear` يُحسب دائماً بناءً على **التاريخ الحالي** (`new Date()`) — أي إذا اليوم 2026 فلن تستطيع إقفال 2025.
- المستخدم يدخل بيانات 2025 وفي نهايتها يريد إقفال **2025** (السنة المُغلقة فعلياً) ثم البدء في 2026.

**الحل:**
- إضافة Selector للسنة المالية (Dropdown) يعرض السنوات السابقة المتاحة (مثلاً آخر 5 سنوات + السنة الحالية).
- استبدال `fiscalYear` الـ `useMemo` ليعتمد على `selectedYear` (state) بدلاً من `now.getFullYear()`.
- منع الإقفال إذا كانت هناك بيانات `draft` ضمن نطاق السنة المُختارة (تحقق موجود لكن يجب ربطه بالسنة المختارة لا الحالية).
- التحقق من عدم وجود قيد إقفال سابق لنفس السنة المختارة (موجود via `like` على description).
- بعد الإقفال: تحديث `locked_until_date = fiscalYear.endDate` تلقائياً (اختياري بـ checkbox) لمنع التعديل على السنة المغلقة.

## 4) لوحة التحكم: عرض كل البيانات غير المُقفلة

**التحليل المحاسبي:**
- محاسبياً: الـ KPIs التشغيلية (مبيعات/مشتريات/أرباح فترة) عادة ضمن **السنة المالية الحالية** فقط بعد الإقفال.
- لكن قائمة المركز المالي (الأصول/الالتزامات/حقوق الملكية) **تراكمية** منذ التأسيس.
- أفضل ممارسة: **هجين** — عرض المؤشرات التشغيلية للفترة المفتوحة (آخر إقفال → اليوم)، والأرصدة (نقدية، مديونيات، مخزون) تراكمياً.

**الحل المقترح (هجين):**
- إضافة منطق `getOpenPeriod()` في `src/lib/utils.ts`:
  - يقرأ `company_settings.locked_until_date`.
  - الفترة المفتوحة = من `locked_until_date + 1` إلى اليوم (إذا غير موجود → منذ التأسيس).
- في `Dashboard.tsx`:
  - **مؤشرات الفترة (P&L)**: مبيعات، مشتريات، مصروفات، صافي ربح → فلتر بـ `getOpenPeriod()` بدلاً من السنة الميلادية الحالية.
  - **مؤشرات الأرصدة (Balance Sheet)**: المخزون، النقدية، إجمالي المديونيات، الموردين → **بدون فلتر تاريخ** (تراكمية).
  - إضافة Toggle بسيط أعلى لوحة التحكم: "الفترة المفتوحة | السنة الحالية | كل الفترات" يتيح للمستخدم التبديل.
- إضافة سطر صغير تحت العنوان يوضح: "الفترة المعروضة: [التاريخ] إلى اليوم — منذ آخر إقفال".

---

## التفاصيل التقنية

### Migration (مشكلة 1)
```sql
ALTER TABLE customers ADD COLUMN opening_balance numeric NOT NULL DEFAULT 0;
ALTER TABLE suppliers ADD COLUMN opening_balance numeric NOT NULL DEFAULT 0;
```
ثم تعديل `get_account_statement` لإضافة UNION لسطر افتتاحي.

### الملفات المتأثرة
- `src/lib/entity-balance.ts` — إضافة opening_balance للمعادلة
- `src/pages/Customers.tsx`, `src/pages/Suppliers.tsx` — حفظ في العمود الجديد
- `src/pages/PurchaseInvoiceForm.tsx`, `src/pages/SalesInvoiceForm.tsx` — تحقق صارم في `postInvoice`
- `src/pages/FiscalYearClosing.tsx` — Year selector
- `src/pages/Dashboard.tsx` + `src/lib/utils.ts` — فترة هجينة + Toggle
- DB Migration: عمود + تحديث دوال `get_account_statement`, `post_sales_invoice`, `post_purchase_invoice`
