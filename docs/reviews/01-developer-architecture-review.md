# مراجعة المبرمج: الأرشيتكتشر والأمان والأداء

## ملخص تنفيذي

النظام مبني على React/TypeScript/Vite مع Supabase. بنية أساسية جيدة لكن يوجد **ثغرات أمنية حرجة، مشاكل أداء، وفجوات في Type Safety**.

---

## 🔴 حرج — أمان

### 1. استخدام `as any` مع أسماء جداول من مدخلات المستخدم

- **الملف**: `src/components/ReturnSettlementsView.tsx` سطر 43
- `(supabase.from(settlementTable as any) as any)` — إذا جاء `settlementTable` من URL يمكن استعلام أي جدول
- **الحل**: استخدام enum/constant لأسماء الجداول

### 2. عدم كفاية التحقق من المدخلات في النماذج

- **الملفات**: `ProductForm.tsx`, `PurchaseInvoiceForm.tsx`, `SalesInvoiceForm.tsx`
- لا حدود على طول `name` أو `description`، لا تحقق من تنسيق `barcode`، الكميات يمكن أن تكون سالبة
- **الحل**: إضافة تحقق بسيط من المدخلات

### 3. فشل صامت في فحص MFA

- **الملف**: `src/contexts/AuthContext.tsx` سطر 48-58
- فحص MFA يفشل بصمت مما يسمح بتجاوز المصادقة الثنائية
- **الحل**: إعادة المحاولة مع فشل صريح

### 4. RLS يفتقر لتصفية على مستوى الصفوف

- سياسات RLS تعتمد على الأدوار فقط بدون تصفية `user_id`
- **الحل**: إضافة فلاتر مثل `settlement.user_id = auth.uid()`

### 5. لا يوجد سجل تدقيق (Audit Trail)

- لا سجلات لـ: تسجيل دخول/خروج، ترحيل فواتير، تعديلات مالية، تصدير بيانات
- **الحل**: إضافة جداول تدقيق في Supabase

### 6. XSS محتمل في chart.tsx

- **الملف**: `src/components/ui/chart.tsx` سطر 70
- `dangerouslySetInnerHTML` مع interpolation
- **الحل**: استخدام CSS-in-JS

---

## 🔴 حرج — أداء

### 1. نمط N+1 في استعلامات البيانات

- **الملف**: `src/pages/Ledger.tsx` سطر 70-90
- استعلامان منفصلان بدل JOIN واحد
- مشابه في `Sales.tsx` سطر 65-72

### 2. تحميل كل البيانات بدون Pagination

- **الملف**: `src/pages/Journal.tsx` سطر 45
- `select("*")` بدون LIMIT — 10K+ سجل = 10MB+ نقل
- **الحل**: تنفيذ pagination بـ `.range(0, 50)`

### 3. فهارس مفقودة في قاعدة البيانات

- `sales_invoices(customer_id)` — مستخدم في الفلاتر بدون فهرس
- `sales_invoices(status, invoice_date)` — فهرس مركب مطلوب
- `purchase_invoices(supplier_id)`
- `journal_entries(status, entry_date)`
- `inventory_movements(product_id, movement_date)`

### 4. تقارير تحمل بيانات مكررة

- **الملف**: `InventoryReport.tsx` سطر 149-185
- يحمل المنتجات ثم الحركات ثم الحركات مرة أخرى
- **الحل**: استخدام window functions في DB

---

## 🟡 مهم — جودة الكود

### 1. `as any` منتشر (+30 موقع)

- فقدان كامل لـ type safety وautocomplete
- **الحل**: إضافة قاعدة ESLint `no-explicit-any`

### 2. فشل صامت في العمليات المجمعة

- **الملف**: `InventoryAdjustmentForm.tsx` سطر 492
- `.catch(() => {})` — أخطاء مُهملة تماماً
- **الحل**: تسجيل الأخطاء وعرض toast

### 3. لا Error Boundaries على مستوى الصفحات

- ErrorBoundary موجود فقط على مستوى الجذر في App.tsx
- **الحل**: إضافة ErrorBoundary حول الأقسام الرئيسية

### 4. إدارة حالة غير متسقة

- مزيج من useState للبيانات المُحملة vs React Query
- **الحل**: ترحيل كل data fetching إلى React Query

### 5. لا retry logic عند فشل الشبكة

- **الملف**: `Sales.tsx` سطر 65-72
- Promise.all بدون معالجة فشل فردي
- **الحل**: React Query مع retry config

### 6. Race Conditions في حفظ النماذج

- **الملف**: `PurchaseInvoiceForm.tsx`
- لا فحص للنقر المزدوج على حفظ
- **الحل**: تعطيل الزر فوراً عند الحفظ

---

## 🟢 تحسينات مستقبلية

1. إضافة React Query لكل الاستعلامات
2. debouncing للفلاتر السريعة
3. lazy loading لمكتبات PDF/Excel
4. virtual scrolling للجداول الكبيرة (react-window)
5. Web Workers للحسابات الثقيلة
6. إضافة Sentry للتتبع
7. timeout 30 ثانية لكل الطلبات
8. تنظيم أنواع TypeScript في ملف مركزي
