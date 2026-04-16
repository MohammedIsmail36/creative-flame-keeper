# التحسينات المتبقية — Remaining Improvements

> تم إنشاء هذا الملف بعد مراجعة شاملة لجميع ملفات `docs/notes/` و `docs/improvements/` مقابل الكود الفعلي.
> التاريخ: 2026-04-09
> آخر تحديث: 2026-04-09 (بعد تنفيذ الموجات 1-5 — جميع التحسينات المطلوبة مكتملة)

---

## ✅ تم تنفيذه في هذه الجلسة — FIXED THIS SESSION

### ~~C1.~~ ✅ إزالة `.limit(5000)` من Dashboard — تمت الإزالة

### ~~C2.~~ ✅ Database Functions للترحيل — تم إنشاء `post_sales_invoice` و `post_purchase_invoice` RPCs

### ~~C3.~~ ✅ حساب تكلفة الإلغاء — الآن يستخدم `unit_cost` الفعلي من `inventory_movements`

### ~~C4.~~ ✅ ملف `.env` — تمت إضافته إلى `.gitignore`

### ~~C5.~~ ✅ تصفية الفواتير غير المدفوعة — تم إنشاء `get_unpaid_invoices()` RPC (server-side)

### ~~C6.~~ ✅ تجميع المنتجات الأعلى مبيعاً — تم إنشاء `get_top_products()` RPC (server-side)

### ~~M1.~~ ✅ Error Boundaries — تم إنشاء `src/components/ErrorBoundary.tsx` ولفه حول Routes

### ~~M2.~~ ✅ Lazy Loading — تم تحويل جميع 60+ صفحة إلى `React.lazy()` مع `<Suspense>`

### ~~M3.~~ ✅ عمود `entry_type` — تم إنشاء migration لإضافة العمود وفهرسه مع backfill

### ~~M9.~~ ✅ التحقق من كمية المرتجع — تم التحقق مقابل إجمالي المشتراة والمرتجعة سابقاً

### ~~L2.~~ ✅ RLS — تم التأكد أن RLS مفعّل على جميع 34 جدول

### ~~L3.~~ ✅ GrowthAnalytics — تواريخ الشهر/السنة صحيحة بالفعل (startOfMonth/endOfMonth)

### ~~L4.~~ ✅ ProductAnalytics/InventoryTurnover — حد أدنى لعينة المرتجعات + تحسين كشف المنتجات الجديدة

### ~~L5.~~ ✅ ProductImport — المعاينة موجودة بالفعل (جدول يعرض الصفوف قبل الاستيراد)

### ~~L6.~~ ✅ ProductView — ألوان الحركات من MOVEMENT_TYPE_COLORS

---

## 🟠 متوسط — MEDIUM (متبقي)

### M4. Expenses: جلب مزدوج لأنواع المصروفات

- **الملف**: `src/pages/Expenses.tsx`
- **المشكلة**: يجلب المصروفات في استعلام ثم أنواع المصروفات في استعلام منفصل ويربطها في الذاكرة
- **ملاحظة**: يعمل بشكل صحيح حالياً وبالتوازي (Promise.all) — تحسين أداء طفيف فقط
- **الحل**: استخدام join: `.select("*, expense_types!inner(id, name, account_id)")`

### M5. تقسيم Dashboard.tsx (2143 سطر)

- **الملف**: `src/pages/Dashboard.tsx`
- **المشكلة**: 2143 سطر، 30+ useState، 7 دوال fetch — صعب الصيانة
- **الحل**: تقسيم إلى hooks مخصصة ومكونات فرعية

### M6. تقسيم SalesInvoiceForm.tsx

- **الملف**: `src/pages/SalesInvoiceForm.tsx`
- **المشكلة**: ملف كبير — لكن منطق الترحيل نُقل إلى RPC مما قلل حجم الكود
- **الحل**: استخراج الأقسام المتبقية (الفورم، التحقق، الحالة) إلى hooks

### M7. AccountStatement: لا يوجد رصيد افتتاحي

- **الملف**: `src/pages/CustomerStatement.tsx` / `src/pages/SupplierStatement.tsx` (عبر AccountStatement)
- **المشكلة**: لا يعرض سطر الرصيد الافتتاحي قبل الحركات
- **الحل**: حساب وإضافة سطر رصيد افتتاحي

### M8. AccountStatement: لا يدعم الحسابات الأب

- **الملف**: نفس ما أعلاه
- **المشكلة**: لا يجمع الحسابات الفرعية عند عرض كشف حساب أب
- **الحل**: جلب الحسابات الفرعية وتجميع حركاتها

### M9. PurchaseReturnForm: التحقق من الكمية المرتجعة

- **الملف**: `src/pages/PurchaseReturnForm.tsx`
- **المشكلة**: يتحقق فقط من `quantity_on_hand` الحالي وليس من كمية فاتورة الشراء الأصلية
- **مثال**: يمكن إرجاع 100 وحدة من فاتورة شراء كانت 50 وحدة فقط
- **الحل**: التحقق مقابل كمية الفاتورة الأصلية

---

## 🟡 منخفض — LOW

### L1. مؤجل — تحويل React Query لبقية الصفحات

- **الحالة**: ~40% من الصفحات تستخدم `useQuery`، والباقي يستخدم `useState + useEffect`
- **الصفحات المتبقية**: Dashboard, SalesInvoiceForm, PurchaseInvoiceForm, TrialBalance, IncomeStatement, BalanceSheet, Ledger, وغيرها
- **السبب**: تغيير كبير يؤثر على ~20 صفحة — يعمل حالياً بشكل صحيح
- **الأولوية**: يمكن تنفيذه تدريجياً — صفحة صفحة

### ~~L2.~~ ✅ تم التأكد — RLS مفعّل على جميع 34 جدول (لا يحتاج تعديل)

### ~~L3.~~ ✅ تم التأكد — GrowthAnalytics يستخدم startOfMonth/endOfMonth بالفعل (لا يحتاج تعديل)

### ~~L4.~~ ✅ تم التنفيذ — حد أدنى MIN_SOLD_FOR_RETURN_RATE=5 + effectiveAge للمنتجات الجديدة

### ~~L5.~~ ✅ تم التأكد — ProductImport يعرض جدول معاينة بالفعل قبل زر الاستيراد (لا يحتاج تعديل)

### ~~L6.~~ ✅ تم التنفيذ — ProductView يستخدم MOVEMENT_TYPE_COLORS من constants

### L7. مؤجل — ExpenseForm: استخراج منطق الترحيل

- **السبب**: نمط استخدام واحد، لا يبرر إنشاء utility مشترك حالياً
- **الأولوية**: يمكن تنفيذه لاحقاً عند إضافة أنواع مستندات جديدة تحتاج نفس المنطق

### L8. مؤجل — ProductForm: استخدام RPC عند الإنشاء

- **السبب**: الإنشاء الأولي لا يحتاج atomic update — لا يوجد بيانات سابقة تتعارض
- **الأولوية**: غير مطلوب حالياً

---

## ✅ تم تنفيذه — COMPLETED (ملخص)

### المكتبات المشتركة

- ✅ `constants.ts`: جميع الثوابت (ACCOUNT_CODES, STATUS_LABELS, COLORS, MOVEMENT_TYPES, BALANCE_TOLERANCE, FISCAL_CLOSING_PREFIX)
- ✅ `category-utils.ts`: بناء شجرة التصنيفات، كشف الحلقات الدائرية
- ✅ `code-generation.ts`: توليد أكواد الكيانات
- ✅ `utils.ts`: إضافة `toDateString()`

### المدفوعات

- ✅ CustomerPayments/SupplierPayments: فصل الحفظ عن الترحيل (منع التكرار)
- ✅ استخدام `getNextPostedNumber` بدلاً من MAX+1
- ✅ ACCOUNT_CODES من constants
- ✅ إعادة حساب رصيد الكيان بعد الترحيل

### الإقفال المالي

- ✅ فحص `isBalanced()` قبل الإقفال
- ✅ تأكيد متعدد الخطوات (step 0→1→2)
- ✅ تحذير من القيود المسودة
- ✅ استخدام `FISCAL_CLOSING_DESCRIPTION_PREFIX`

### التقارير المالية

- ✅ TrialBalance: FISCAL_CLOSING + BALANCE_TOLERANCE + تطبيع أنواع الحسابات
- ✅ IncomeStatement: فلتر "expense" صحيح + كشف قيود الإقفال + بدون limit(5000)
- ✅ BalanceSheet: تحذير عدم التوازن + كشف الإقفال + بدون limit(5000)
- ✅ Ledger: معالجة الأخطاء + ملخص KPI + بدون limit(5000)

### الفواتير

- ✅ SalesInvoiceForm: ACCOUNT_CODES, saving state, COGS calculation, quantity validation
- ✅ PurchaseInvoiceForm: إصلاح القسمة على صفر، ACCOUNT_CODES, saving state
- ✅ SalesReturnForm: التحقق من الكمية، عكس COGS، ACCOUNT_CODES
- ✅ PurchaseReturnForm: التحقق من الكمية مقابل المخزون، ACCOUNT_CODES

### القوائم

- ✅ Sales/Purchases/Returns: STATUS_LABELS/COLORS من constants, حالات فارغة, فلترة

### المنتجات والمخزون

- ✅ Products: إصلاح فلتر المخزون المنخفض (`<` بدلاً من `<=`)
- ✅ ProductView: MOVEMENT_TYPE_LABELS_DETAIL
- ✅ ProductImport: التحقق من الملف + إنشاء تصنيفات بالدفعة + ملخص النتائج
- ✅ InventoryAdjustmentForm: RPC atomic + rollback
- ✅ InventoryAdjustments: تسميات الحالة من constants
- ✅ InventoryMovements: MOVEMENT_TYPE_LABELS + REFERENCE_ROUTE_MAP
- ✅ CategoryManagement: wouldCreateCycle() + منع التعيين الذاتي

### المصروفات

- ✅ ExpenseForm: ACCOUNT_CODES, validation, فصل المسودة عن الترحيل
- ✅ ExpenseTypes: حوار تأكيد الحذف + فحص العناصر المرتبطة

### كشوف الحساب

- ✅ CustomerStatement/SupplierStatement: فلتر التاريخ + ملخص + تصدير Excel/PDF

---

## خطة التنفيذ المقترحة — Execution Waves

### الموجة 1: أمان وإصلاحات حرجة (C4, C1, C3)

1. **C4**: إضافة `.env` إلى `.gitignore` (فوري)
2. **C1**: إزالة `.limit(5000)` من Dashboard (سطرين)
3. **C3**: إصلاح حساب تكلفة الإلغاء (استعلام inventory_movements)

### الموجة 2: سلامة البيانات (C2, C5, C6, M9)

1. **C2**: إنشاء `post_sales_invoice` و `post_purchase_invoice` RPC
2. **C5**: فلتر الفواتير غير المدفوعة server-side
3. **C6**: Database function لتجميع المنتجات
4. **M9**: التحقق من كمية المرتجع مقابل الفاتورة الأصلية

### الموجة 3: بنية التطبيق (M1, M2, M3)

1. **M1**: إنشاء ErrorBoundary component
2. **M2**: Lazy Loading لجميع الصفحات
3. **M3**: إضافة عمود `entry_type` لـ journal_entries

### الموجة 4: تحسينات متوسطة (M4, M5, M6, M7, M8)

1. **M4**: إصلاح الجلب المزدوج في Expenses
2. **M5**: تقسيم Dashboard.tsx
3. **M6**: تقسيم SalesInvoiceForm.tsx
4. **M7-M8**: تحسين AccountStatement

### الموجة 5: تحسينات منخفضة الأولوية (L1-L8)

- تحويل React Query، RLS، التقارير التحليلية، UX improvements
