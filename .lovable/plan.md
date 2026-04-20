
## الهدف
خطة عمل لرفع أداء الصفحات (خاصة الجداول الكبيرة) وضمان استجابة سريعة حتى مع آلاف الصفوف.

## التشخيص الأولي (نقاط الضعف المتوقعة)

من قراءة بنية المشروع:
- معظم الصفحات تستخدم `DataTable` (TanStack Table) مع تحميل **كل البيانات دفعة واحدة** ثم فلترة في الذاكرة → بطء مع 1000+ صف.
- `select("*")` في كثير من الصفحات (Sales, Purchases, ProductView, Journal…) يجلب أعمدة غير مستخدمة + JOINs ثقيلة.
- لا يوجد **Pagination على مستوى الخادم** — الكل client-side.
- لا يوجد **Virtualization** للصفوف → DOM ضخم في الجداول الطويلة.
- استخدام كثيف لـ `useMemo` لكن بدون قياس فعلي.
- إعادة جلب البيانات عند كل mount (`useEffect([])`) بدون cache → لا يوجد React Query أو SWR.
- صور المنتجات بدون lazy-load أو أحجام محسّنة.
- bundle size غير مُراقب (الكثير من `recharts`, `jspdf`, `xlsx` تُحمَّل حتى في صفحات لا تحتاجها).

## خطة الاختبار والتحسين (5 محاور)

### المحور 1: قياس الأداء (Baseline)
قبل أي تحسين، نقيس الوضع الحالي:
- **Lighthouse / Web Vitals**: LCP, INP, TBT, CLS لكل صفحة رئيسية.
- **React DevTools Profiler**: تحديد المكونات التي تُعاد رسمها بلا داعٍ.
- **Browser Performance Profile**: long tasks، scripting time.
- **Network**: حجم الاستعلامات (KB)، عدد الطلبات، مدة كل query.
- **DB**: تحليل بطء الاستعلامات عبر Supabase logs.

**صفحات الأولوية للقياس:**
1. `/products` — جدول المنتجات
2. `/sales` و `/purchases` — جداول الفواتير
3. `/journal` — جدول القيود
4. `/products/:id` — صفحة المنتج (سجل حركات + إحصائيات)
5. `/dashboard` — KPIs + رسوم بيانية
6. تقارير `/reports/*`

### المحور 2: تحسينات قاعدة البيانات
- إضافة **فهارس (indexes)** على الأعمدة الأكثر استخداماً في الفلاتر/الفرز:
  - `inventory_movements(product_id, movement_date)`
  - `sales_invoices(invoice_date, status, customer_id)`
  - `purchase_invoices(invoice_date, status, supplier_id)`
  - `journal_entries(entry_date, status)`
- استبدال `select("*")` بأعمدة محددة فقط في كل صفحة قائمة.
- استخدام **RPC functions** للاستعلامات المعقدة بدلاً من JOINs متعددة من الواجهة.
- إضافة `count: 'exact'` فقط عند الحاجة (مكلف).

### المحور 3: Pagination على مستوى الخادم
للجداول التي قد تتجاوز 500 صف:
- تحويل `Sales`, `Purchases`, `Journal`, `InventoryMovements`, `Products` إلى **server-side pagination** عبر `range()` في Supabase.
- نقل الفلاتر (تاريخ/حالة/بحث) لتُنفّذ على الخادم (`.eq()`, `.gte()`, `.ilike()`).
- تعديل `DataTable` لدعم وضع `manualPagination` + `manualFiltering`.
- إبقاء client-side للجداول الصغيرة (<200 صف) كما هي.

### المحور 4: تحسينات الواجهة (Frontend)
- **React Query (TanStack Query)** — موجود في dependencies، يجب استخدامه فعلياً:
  - Cache للقوائم المرجعية (Customers, Suppliers, Products, Accounts) لمدة 5 دقائق.
  - Invalidate تلقائي بعد العمليات (إنشاء فاتورة → invalidate قائمة الفواتير).
  - يلغي fetch مكرر بين الصفحات.
- **Code Splitting**: `React.lazy()` لكل صفحة Reports + صفحات الفواتير الثقيلة.
- **Lazy load** لمكتبات ثقيلة:
  - `jspdf` و `xlsx` تُحمَّل فقط عند الضغط على ExportMenu.
  - `recharts` تُحمَّل فقط في صفحات الرسوم.
- **React.memo** للصفوف المعقدة + `useCallback` لـ event handlers في الجداول.
- **Virtualization** (اختياري للجداول التي تبقى client-side وتتجاوز 500 صف): `@tanstack/react-virtual`.
- **Debounce** لحقول البحث (300ms).
- **Image optimization**: lazy loading + `loading="lazy"` لصور المنتجات.

### المحور 5: مراقبة مستمرة
- إضافة `performance.mark()` في النقاط الحرجة (load, filter, render) للقياس الدوري.
- توثيق Baseline vs After في `docs/PERFORMANCE.md`.

## أهداف القياس (Targets)
| المقياس | الهدف |
|---|---|
| LCP | < 2.5s |
| INP (تفاعل) | < 200ms |
| فتح صفحة جدول 1000 صف | < 1s |
| تطبيق فلتر | < 100ms |
| تنقّل صفحة في pagination | < 300ms |
| Bundle initial | < 500KB |

## مراحل التنفيذ المقترحة (Phased)

**المرحلة 1 — قياس + Quick Wins (آمن، بدون كسر)**
- قياس Baseline للصفحات الست الأولوية.
- إضافة الفهارس في DB (Migration).
- تحويل `select("*")` إلى أعمدة محددة في صفحات القوائم.
- Lazy load لـ jspdf/xlsx/recharts.
- Code splitting للتقارير.

**المرحلة 2 — React Query + Caching**
- إعداد QueryClient (موجود في App.tsx؟ نتحقق).
- تحويل الـ lookups (Customers, Suppliers, Products, Accounts) إلى `useQuery` مع cache.
- Invalidation strategy موحّدة.

**المرحلة 3 — Server-side Pagination للجداول الكبيرة**
- Sales, Purchases, Journal, InventoryMovements, Products.
- تعديل DataTable لدعم `manualPagination`.
- نقل الفلاتر للخادم.

**المرحلة 4 — Virtualization + Memoization (عند الحاجة)**
- فقط للجداول التي تبقى client-side وتُظهر بطء.

**المرحلة 5 — مراقبة**
- توثيق نتائج After.
- إعداد ملف `docs/PERFORMANCE.md`.

## الملفات المتوقع تعديلها
- `supabase/migrations/*` — فهارس جديدة.
- `src/App.tsx` — Code splitting + QueryClient config.
- `src/components/ui/data-table.tsx` — دعم `manualPagination`.
- صفحات القوائم: `Sales.tsx`, `Purchases.tsx`, `Journal.tsx`, `Products.tsx`, `InventoryMovements.tsx`.
- `src/components/ExportMenu.tsx` — Dynamic import لـ jspdf/xlsx.
- `src/lib/report-pdf.ts` — Dynamic import.
- Hooks جديدة: `src/hooks/use-customers.ts`, `use-suppliers.ts`, `use-products.ts` (React Query).

## ملاحظة
هذه خطة شاملة. يمكن البدء بالمرحلة 1 فقط (آمنة وسريعة الأثر) ثم نقيّم الحاجة للباقي بناءً على أرقام Baseline الفعلية.

<lov-actions>
<lov-suggestion message="نفّذ المرحلة 1 فقط: قياس Baseline للصفحات الرئيسية + إضافة فهارس DB + تحويل select(*) لأعمدة محددة + Lazy load لـ jspdf/xlsx/recharts + Code splitting للتقارير.">نفّذ المرحلة 1 (Quick Wins)</lov-suggestion>
<lov-suggestion message="نفّذ المراحل 1 و 2 و 3: Quick wins + React Query caching للـ lookups + Server-side pagination لجداول Sales/Purchases/Journal/Products/InventoryMovements.">نفّذ المراحل 1+2+3</lov-suggestion>
<lov-suggestion message="ابدأ بقياس Baseline فقط: شغّل Lighthouse و Performance Profile على صفحات Products, Sales, Purchases, Journal, Dashboard وأعطني تقريراً بنقاط الضعف الفعلية قبل أي تعديل.">قياس Baseline أولاً</lov-suggestion>
<lov-suggestion message="نفّذ الخطة كاملة بكل مراحلها الخمس مع توثيق النتائج في docs/PERFORMANCE.md.">نفّذ الخطة كاملة</lov-suggestion>
</lov-actions>
