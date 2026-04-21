# تنفيذ Blockers ما قبل النشر — Sprint 1

## ✅ المُنجَز في هذه الجلسة

### 1. قفل الفترات في النماذج (LOGIC-001) — UI
- `src/pages/SalesInvoiceForm.tsx` — فحص `locked_until_date` قبل استدعاء RPC
- `src/pages/PurchaseInvoiceForm.tsx` — نفس الفحص
- `src/pages/InventoryAdjustmentForm.tsx` — فحص قبل اعتماد التسوية + إضافة `settings` من `useSettings()`
- ملاحظة: دوال DB `post_sales_invoice` / `post_purchase_invoice` تتحقق فعلاً من القفل أيضاً (طبقة دفاعية مزدوجة).

### 2. Concurrency Lock (LOGIC-002) — DB
- إعادة كتابة `adjust_product_quantity` لاستخدام `SELECT ... FOR UPDATE` على صف المنتج قبل الخصم/الإضافة، مما يسلسل الترحيلات المتزامنة على نفس المنتج.

### 3. حماية كميات المرتجعات (LOGIC-003) — DB
- Trigger `trg_check_sales_return_qty` على `sales_return_items`
- Trigger `trg_check_purchase_return_qty` على `purchase_return_items`
- يمنعان تجاوز الكمية الأصلية في الفاتورة المرجعية.

### 5. ErrorBoundary على الجذر (UX-001)
- `src/App.tsx` — لف `BrowserRouter` بـ `<ErrorBoundary>` لمنع الشاشة البيضاء.

### 7. تشديد RLS على audit_log (SEC-001)
- استبدال سياسة `audit_log_view` (أي authenticated) بسياسة جديدة محصورة على دور `admin`.

### إضافات أمنية مكمّلة
- CHECK constraints لمنع المبالغ السالبة على: المدفوعات، التخصيصات، التسويات، المصروفات.
- Trigger `protect_closing_entries` يمنع تعديل/حذف قيود الإقفال (`entry_type='closing'`).

---

## ✅ Sprint 2 — تحسينات UX (الجلسة الحالية)

### 8. wrapper موحد لرسائل أخطاء Supabase (UX-003)
- `src/lib/format-error.ts` — `formatSupabaseError(err)` يترجم: UNIQUE, CHECK, FK, NOT NULL, RLS, Auth, Network إلى رسائل عربية واضحة.
- يحترم الرسائل الخاصة من triggers (التي أصلاً عربية).

### 9. صفحة Forbidden + تحديث ProtectedRoute (UX-010)
- `src/pages/Forbidden.tsx` — صفحة 403 احترافية بالعربية.
- `ProtectedRoute` الآن يعرض `<Forbidden />` بدل التوجيه الصامت لـ `/`.

### 10. تحسين صفحة 404
- `NotFound.tsx` بالعربية مع تصميم متسق وأيقونة.

### 11. فحص window.confirm/alert (UX-008)
- ✅ نتيجة الفحص: لا توجد أي استخدامات. كل التأكيدات تستخدم AlertDialog.

---

## ⏸️ مؤجل (يحتاج جلسات مخصصة)

### 4. توحيد دقة الأعمدة النقدية (LOGIC-004)
- تحويل كل `numeric` إلى `numeric(18,2)` للنقدية و`numeric(18,3)` للكميات.
- مؤجل لأنه يتطلب migration كبيرة + باكب احترازي + اختبار كل ALTER COLUMN على بيانات حقيقية.

### 6. Pagination للصفحات الكبيرة (PERF-001) — قيد التنفيذ
- ✅ `Customers.tsx` — server-side pagination + search + balance filter
- ✅ `Suppliers.tsx` — نفس النمط
- ✅ `Expenses.tsx` — server-side pagination + status/type/date filters + stats منفصلة
- ⏸️ `Accounts.tsx` — مؤجل (شجرة هرمية، عدد الحسابات محدود <500)

---

## التحذيرات الأمنية الموجودة مسبقاً (ليست من هذه الجلسة)
- WARN: Extension in Public schema
- WARN: Public storage bucket allows listing

تتطلب قراراً منفصلاً من المسؤول.
