# مراجعة المبرمج: الواجهة الأمامية وتجربة المستخدم

---

## 🔴 حرج

### 1. تكرار ضخم في نماذج الفواتير (80% متشابه)

- `SalesInvoiceForm.tsx` (1200+ سطر)
- `PurchaseInvoiceForm.tsx` (1200+ سطر)
- `SalesReturnForm.tsx` و `PurchaseReturnForm.tsx`
- **الحل**: استخراج `InvoiceFormBase` component مشترك

### 2. لا تحذير عند مغادرة نموذج بتغييرات غير محفوظة

- كل النماذج: `ProductForm`, `SalesInvoiceForm`, `JournalEntryForm`
- **الحل**: إضافة `beforeunload` handler

### 3. الجداول غير متجاوبة للموبايل

- `DataTable` يعرض جدول كامل على الموبايل — لا عرض بطاقات بديل
- **الحل**: عرض card layout على الموبايل

---

## 🟡 مهم — اتساق الواجهة

### 1. حالات التحميل غير متسقة

- Dashboard يستخدم `Skeleton` components
- النماذج تستخدم `setLoading` بسيط بدون تغذية بصرية
- Dashboard لديه 5 حالات تحميل منفصلة!
- **الحل**: إنشاء `PageSkeleton` component موحد

### 2. مواضع الأزرار غير متسقة

- Save/Cancel بمواضع مختلفة — بعضها أسفل يمين، بعضها inline
- **الحل**: إنشاء `FormActions` component موحد

### 3. لا تحقق على مستوى الحقول (inline validation)

- كل الأخطاء تظهر كـ toast فقط
- لا رسائل خطأ تحت الحقول
- **الحل**: إنشاء `useFormValidation` hook مع رسائل عربية

### 4. `EmptyState` غير موحد

- كل صفحة تنفذ رسالة خاصة
- **الحل**: إنشاء `EmptyState` component مشترك

### 5. React Query غير متسق

- بعض الصفحات تستخدمه (InventoryReport, GrowthAnalytics)
- أخرى لا (PurchaseInvoiceForm, ProductForm, Customers)
- **الحل**: ترحيل الكل إلى React Query

---

## 🟡 مهم — تاريخ وتنسيق

### 1. تنسيق التاريخ العربي غير متسق

- Dashboard يعرّف `MONTH_NAMES` مصفوفة مشفرة
- InventoryReport يستخدم `date-fns format`
- **الحل**: إنشاء `useArabicDateFormat` hook

### 2. نصوص عربية مشفرة مباشرة (hardcoded)

- "جاري الحفظ..."، "يرجى اختيار..." في كل النماذج
- إذا أُضيفت لغة أخرى سيحتاج refactor ضخم
- **الحل**: ملف `translations.ts` مركزي

---

## 🟡 مهم — إمكانية الوصول (Accessibility)

### 1. ARIA labels شبه معدومة

- aria-label واحد فقط في النظام بأكمله (`PurchaseInvoiceForm.tsx`)
- **الحل**: إضافة aria-labels لكل الحقول والأزرار

### 2. لا مؤشرات تنقل لوحة المفاتيح

- **الحل**: إضافة `focus-visible:` classes

### 3. مشاكل تباين ألوان محتملة

- `text-muted-foreground` مستخدم 100+ مرة — تباين ضعيف محتمل
- **الحل**: تدقيق WCAG AA

---

## 🟡 مهم — التنقل والتوجيه

### 1. تنظيم Routes مسطح

- 50+ route على نفس المستوى في App.tsx
- **الحل**: تجميع حسب الأقسام:
  - `/accounting/*` (قيود، حسابات، دفاتر)
  - `/sales/*` (فواتير، مرتجعات، عملاء)
  - `/purchases/*` (فواتير، مرتجعات، موردين)
  - `/inventory/*` (منتجات، تسويات، حركات)
  - `/reports/*`
  - `/settings/*`

### 2. Breadcrumb لا يتحدث مع النماذج

- لا يعرض إنشاء/تعديل في مسار التنقل

---

## 🟡 مهم — معالجة النماذج

### 1. الحقول تبقى قابلة للتعديل أثناء الحفظ

- الأزرار تُعطّل لكن الحقول لا
- **الحل**: تعطيل كامل النموذج أثناء `saving`

### 2. Prop Drilling في نماذج الفواتير

- بيانات البنود تمر عبر مستويات متعددة
- **الحل**: Context لبيانات الفاتورة

### 3. `useCallback` مفقود في معالجات الأحداث

- `Customers.tsx` — `openAdd`, `openEdit`, `handleSave` تُنشأ كل render
- **الحل**: تغليف بـ `useCallback`

---

## 🟢 نقاط قوة

- ✅ دعم RTL ممتاز مع `dir="rtl"` صحيح
- ✅ تنسيق العملة مركزي عبر `useSettings().formatCurrency()`
- ✅ حماية Routes بـ `ProtectedRoute` مع فحص الأدوار
- ✅ PDF عربي مدعوم عبر `pdf-arabic.ts`
- ✅ lazy loading لكل الصفحات في App.tsx
