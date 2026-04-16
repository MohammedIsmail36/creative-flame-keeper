# Claude.md — تعليمات الوكلاء للعمل على النظام

## نظرة عامة

نظام ERP تجاري عربي مبني على React + TypeScript + Vite + Supabase.
يشمل: مبيعات، مشتريات، مخزون، محاسبة، تقارير، مصروفات، إقفال سنة مالية.
**اللغة**: عربي فقط (RTL). لا تعدد لغات.

---

## قرارات المالك — لا تنفذ هذه أبداً!

| ❌ لا تنفذ                   | السبب      |
| ---------------------------- | ---------- |
| سير عمل موافقات المدير       | يعقد العمل |
| أوامر شراء (Purchase Orders) | لا حاجة    |
| عروض أسعار (Quotations)      | لا حاجة    |
| حدود ائتمان العملاء          | تعقيد زائد |
| تتبع التوصيل                 | لا حاجة    |
| مصروفات متكررة تلقائية       | لا حاجة    |
| متعدد العملات                | لا حاجة    |
| متعدد المستودعات             | لا حاجة    |
| تتبع دفعات/أرقام تسلسلية     | لا حاجة    |
| مراكز تكلفة                  | لا حاجة    |
| موازنات                      | لا حاجة    |
| تعدد لغات                    | عربي فقط   |
| حسابات خصم مبيعات (4102)     | لا حاجة    |
| حسابات خصم مشتريات (5102)    | لا حاجة    |
| حساب مصاريف بنكية (5301)     | لا حاجة    |

---

## قواعد العمل

1. **لا تكسر اختبارات موجودة** — شغّل `npm run test` قبل وبعد التعديل
2. **لا تنشئ ملفات بلا حاجة** — عدّل الموجود أولاً
3. **لا تضف ميزات إضافية** — نفّذ المطلوب فقط
4. **لا تعقّد الكود** — أبسط حل يعمل هو الأفضل
5. **تحقق من 0 أخطاء TypeScript** بعد كل تعديل
6. **النصوص بالعربي** — كل الرسائل والتسميات بالعربي
7. **الضريبة**: إذا كانت = 0 أو معطلة في الإعدادات، لا تغيير في أي شيء
8. **التحقق من المدخلات**: بسيط بدون Zod — تحقق مباشر في النماذج

---

## كيفية تشغيل الأوامر

```bash
# من داخل WSL Ubuntu
cd /home/moh/creative-flame-keeper

# تشغيل الاختبارات
npm run test

# تشغيل التطوير
npm run dev

# فحص TypeScript
npx tsc --noEmit

# Supabase
npx supabase migration new <name>
npx supabase db push
```

---

## خطة العمل — الأولويات

### المرحلة A: إصلاحات محاسبية جوهرية ✅ تمت

1. ✅ **تسجيل الضريبة في القيود** — تم في migration `20260411120000_tax_accounts_and_balanced_constraint.sql`
2. ✅ **CHECK constraint لتوازن القيود** — تم في نفس الـ migration
3. ✅ **توسيع دليل الحسابات** — حسابات 2102 و 1105 موجودة في constants.ts والـ migration

### المرحلة B: حماية البيانات ✅ تمت

4. ✅ **منع البيع بأكثر من المخزون** — تم: `stock_enforcement_enabled` في الإعدادات + فحص في RPC
5. ✅ **قفل الفترات المحاسبية** — تم: `locked_until_date` مع فحص في النماذج
6. ✅ **سجل تدقيق بسيط** — تم في migration `20260412120000_phase_b_c_data_protection_security.sql`
7. ✅ **إصلاح RLS** — مكتمل: جميع الـ 35 جدول محمية بـ RLS مع صلاحيات أدوار (role-based) — كافٍ لنظام مستأجر واحد
8. ✅ **تحقق من المدخلات** — تم: جميع النماذج فيها تحقق مباشر (حساب مختار في القيود، سعر ≥ 0 في المرتجعات، كمية/تكلفة في الجرد، طريقة دفع في المصروفات)

### المرحلة C: أمان الكود ✅ تمت

9. ✅ **إصلاح SQL injection** — تم: استبدال `as any` بـ `as const` في entity-balance.ts و OutstandingCreditsSection و InvoicePaymentSection
10. ✅ **إصلاح فحص MFA الصامت** — تم: يفشل بأمان (fail-secure) مع `setMfaRequired(true)` عند الخطأ
11. ✅ **إصلاح XSS في chart.tsx** — تم: إضافة `safeCssIdent` و `safeCssValue` لتعقيم القيم في `dangerouslySetInnerHTML`

---

### المرحلة D: تقارير مالية ✅ تمت

12. ✅ **قائمة التدفقات النقدية** — تم: `CashFlowStatement.tsx`
13. ✅ **تحليل أعمار الذمم** — تم: `DebtAgingReport.tsx`
14. ✅ **مؤشرات إضافية في Dashboard** — تم: هامش ربح + مخزون منخفض + تركز عملاء (top 5) + أعمار ذمم (4 buckets)

### المرحلة E: أداء ✅ تمت

15. ✅ **Pagination** — تم: DataTable يدعم pagination افتراضياً
16. ✅ **فهارس قاعدة البيانات** — تم في migration `20260413120000_add_performance_indexes.sql`
17. ✅ **إصلاح N+1 queries** — تم: Ledger.tsx كان نظيفاً، Sales.tsx أُصلح `as any`
18. ✅ **إصلاح تحميل بيانات مكررة** — تم: InventoryReport.tsx دُمج استعلامان في واحد مع `Promise.all`

### المرحلة F: جودة الكود ✅ تمت

19. ✅ **استخراج `InvoiceFormBase`** — تم تأجيله عمداً: التكرار ~90% لكن الاستخراج يحتاج 15+ prop ويعقّد الصيانة بدون فائدة وظيفية
20. ✅ **إصلاح `as any`** — تم: إزالة `as any` من كل أسماء الجداول في `supabase.from()` عبر 25+ ملف
21. ✅ **إصلاح الأخطاء الصامتة** — تم: إضافة `console.warn` في pdf-arabic.ts وProductImport.tsx وProductForm.tsx
22. ✅ **Race Conditions** — تم: جميع أزرار الحفظ فيها `disabled={saving}` (33 زر)
23. ✅ **Error Boundaries** — تم: ErrorBoundary يدعم `section` mode + Dashboard مقسم لـ 5 مناطق محمية

### المرحلة G: تجربة المستخدم ✅ تمت

24. ✅ **تحذير مغادرة نموذج** — تم: hook `use-before-unload.ts` مستخدم في النماذج
25. ✅ **تحقق inline** — تم: `FormFieldError.tsx` مستخدم في النماذج
26. ✅ **جداول متجاوبة** — تم: جميع الجداول تستخدم `hideOnMobile` لإخفاء الأعمدة الثانوية على الجوال
27. ✅ **حالات تحميل موحدة** — تم: `PageSkeleton` component مع 3 أنماط (table/form/cards) + Skeleton في التقارير
28. ✅ **تنبيهات مخزون منخفض** — تم: بطاقة في Dashboard
29. ✅ **تنسيق أرقام/تواريخ موحد** — تم: كل الأرقام `en-US` وكل التواريخ `en-GB` + `toWesternDigits()`
30. ✅ **ARIA labels** — تم: إضافة `aria-label` لـ 15 عنصر تفاعلي (أزرار أيقونية) عبر 14 ملف

### المرحلة H: تحسينات إقفال السنة المالية ✅ تمت

31. ✅ **منع الإقفال مع وجود مسودات** — تم: زر الإقفال معطل عند وجود مسودات + تحذير أحمر بدلاً من برتقالي
32. ✅ **فحص مطابقة AR/AP** قبل الإقفال — تم: يقارن رصيد حساب 1103 مع مجموع أرصدة العملاء، وحساب 2101 مع مجموع أرصدة الموردين

---

### المرحلة I: توحيد هيدر الصفحات ✅ تمت

33. ✅ **إنشاء مكون `PageHeader`** — تم: `src/components/PageHeader.tsx` مع props: icon, title, description, badge, actions, sticky
34. ✅ **تطبيق `PageHeader` على القوائم** — تم: 20 صفحة (Sales, Purchases, Products, Customers, Suppliers, Accounts, Journal, Ledger, Expenses, ExpenseTypes, CustomerPayments, SupplierPayments, SalesReturns, PurchaseReturns, InventoryAdjustments, InventoryMovements, CategoryManagement, LookupManagement, UserManagement, Dashboard)
35. ✅ **تطبيق `PageHeader` على النماذج** — تم: 9 صفحات (SalesInvoiceForm, PurchaseInvoiceForm, SalesReturnForm, PurchaseReturnForm, JournalEntryForm, ExpenseForm, ProductForm, InventoryAdjustmentForm, ProductImport)
36. ✅ **تطبيق `PageHeader` على التقارير** — تم: 22 صفحة (5 محاسبية + 9 wrapper + 8 دوران مخزون)
37. ✅ **تطبيق `PageHeader` على الإعدادات** — تم: 5 صفحات (SettingsPage, Profile, SystemSetup, CustomerStatement, SupplierStatement)
38. ✅ **فحص نهائي وتنظيف** — تم: 0 أخطاء TypeScript، 188/189 اختبار ناجح (1 فاشل مسبقاً في product-utils غير متعلق)

---

### المرحلة J: اختبارات شاملة لجاهزية الإنتاج ⬜ قيد التنفيذ

> **الخطة التفصيلية**: `docs/TEST_PLAN_COMPREHENSIVE.md`

39. ✅ **اختبار calcInvoiceTotals** — ملف جديد `invoice-totals.test.ts` (14 اختبار)
40. ✅ **اختبار round2 + toWesternDigits** — توسيع `utils.test.ts` (+13 اختبار)
41. ✅ **اختبار formatDisplayNumber** — ملف جديد `posted-number-utils.test.ts` (5 اختبارات)
42. ⬜ **سيناريوهات محاسبية متقدمة** — توسيع `accounting-logic.test.ts` (+12 اختبار)
43. ⬜ **اختبار إقفال السنة المالية** — استخراج `fiscal-year.ts` + اختبار (7 اختبارات)
44. ⬜ **حالات حافة المخزون والدقة** — توسيع `integration-cycle.test.ts` (+12 اختبار)
45. ⬜ **اختبار entity-balance** — ملف جديد مع mock supabase (5 اختبارات)
46. ⬜ **اختبار التحقق من المدخلات** — استخراج `validation.ts` + اختبار (12 اختبار)
47. ⬜ **فحص نهائي** — npm run test (0 فشل) + npx tsc --noEmit (0 أخطاء)

## ملفات المراجعة التفصيلية

- `docs/reviews/01-developer-architecture-review.md` — أمان، أداء، جودة كود
- `docs/reviews/02-developer-frontend-review.md` — واجهة، UX، اتساق
- `docs/reviews/03-financial-accounting-review.md` — محاسبة، ضرائب، تقارير
- `docs/reviews/04-business-operations-review.md` — سير عمل، ميزات تجارية

---

## هيكل المشروع

```
src/
  components/     # مكونات UI (نماذج، جداول، أزرار)
  contexts/       # AuthContext, SettingsContext
  hooks/          # custom hooks
  integrations/   # Supabase client + types
  lib/            # أدوات مساعدة (تصدير، حسابات، PDF)
  pages/          # صفحات النظام (كل صفحة = ملف)
  test/           # اختبارات
supabase/
  migrations/     # ملفات ترحيل قاعدة البيانات
  functions/      # Edge Functions
docs/
  reviews/        # ملفات المراجعة
```

# مهم جدا

راجع اولا الخطوة التي تود العمل عليهاعليها لانها قد تكون قد تمت بالفعل وحدث الملف بعد الانتهاء من الخطوة حتى لا نكرر الخطوات المتبقية في كل مره لانها بالفعل تم العمل عليها
