# خطة صيانة صفحة إعداد النظام

## المشاكل المكتشفة

### 1. التهيئة لا تعمل (خطأ حرج)

صفحة `SystemSetup` ترسل `body: {}` إلى `seed-system`، لكن الدالة تحاول قراءة `action` من الـ body. بما أن `action` يكون `undefined`، الدالة تُرجع خطأ `"Unknown action"` (400). **هذا هو السبب الرئيسي لعدم عمل التهيئة.**

### 2. التصفير يفشل بسبب جداول مفقودة

قائمة الجداول المحذوفة عند التصفير لا تشمل 4 جداول موجودة فعلياً في قاعدة البيانات:

- `sales_invoice_return_settlements`
- `purchase_invoice_return_settlements`
- `sales_return_payment_allocations`
- `purchase_return_payment_allocations`

هذه الجداول لها foreign keys تمنع حذف الجداول الأخرى، مما يسبب أخطاء متسلسلة.

### 3. تكرار الكود

ملفا `seed-system` و `database-backup` يحتويان على نفس الكود بالكامل وهذا غير ضروري.

### 4. النسخ الاحتياطي JSON غير مجدي

النسخ بصيغة JSON لا يشمل بنية الجداول ولا sequences ولا يمكن استعادته مباشرة. البديل الأفضل هو **تصدير SQL dump** عبر أدوات Lovable Cloud مباشرة.  
وماذا عن اذا قمت بفصل النظام عن lovable نهائيا كيف سيعمل النسخ لاحتياطي مستقبلا؟

---

## الحل المقترح

### الملفات المتأثرة


| الملف                                         | التغيير                                          |
| --------------------------------------------- | ------------------------------------------------ |
| `supabase/functions/seed-system/index.ts`     | إعادة كتابة — تهيئة فقط (بدون action)            |
| `supabase/functions/database-backup/index.ts` | إعادة كتابة — تصفير فقط + إضافة الجداول المفقودة |
| `src/pages/SystemSetup.tsx`                   | إزالة قسم النسخ الاحتياطي/الاستعادة + تبسيط      |


### 1. إصلاح `seed-system/index.ts`

- إزالة منطق backup/reset/action parsing بالكامل
- الدالة تعمل مباشرة عند الاستدعاء: إنشاء المدير + شجرة الحسابات + إعدادات الشركة
- **بدون حاجة لـ action** — هي دالة تهيئة فقط

### 2. إصلاح `database-backup/index.ts`

- إزالة منطق backup بالكامل
- الإبقاء على reset فقط
- إضافة الجداول الـ 4 المفقودة في أول قائمة الحذف (لأنها child tables):
  - `sales_invoice_return_settlements`
  - `purchase_invoice_return_settlements`
  - `sales_return_payment_allocations`
  - `purchase_return_payment_allocations`
- تغيير اسمها المنطقي (تبقى `database-backup` كاسم الدالة لتجنب تغيير المسارات)

### 3. تحديث `SystemSetup.tsx`

- إزالة قسم "النسخ الاحتياطي والاستعادة" بالكامل (الكارد + الدوال + المتغيرات)
- الإبقاء على قسمين فقط:
  - **تهيئة البيانات الأساسية** (يستدعي `seed-system`)
  - **تصفير قاعدة البيانات** (يستدعي `database-backup` مع `action: "reset"`)
- تبسيط الكود وإزالة imports غير المستخدمة

### 4. إصلاح CORS headers

إضافة headers المطلوبة للعمل السليم مع Lovable Cloud:

```
x-supabase-client-platform, x-supabase-client-platform-version,
x-supabase-client-runtime, x-supabase-client-runtime-version
```

---

## التفاصيل التقنية

ترتيب الحذف الصحيح عند التصفير (child-first):

```text
1. sales_invoice_return_settlements     (NEW)
2. purchase_invoice_return_settlements  (NEW)
3. sales_return_payment_allocations     (NEW)
4. purchase_return_payment_allocations  (NEW)
5. customer_payment_allocations
6. supplier_payment_allocations
7. inventory_adjustment_items
8. inventory_movements
9. sales_return_items
10. purchase_return_items
11. sales_invoice_items
12. purchase_invoice_items
... (باقي الجداول بنفس الترتيب الحالي)
```