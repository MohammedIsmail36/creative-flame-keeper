
## الهدف
حل المشاكل الحقيقية المكتشفة بالقياس: تقليل وقت التحميل الأولي من **8.4s → أقل من 2s**، وإلغاء الاستعلامات المكررة.

## النتائج المُقاسة (Baseline)
- DOM Content Loaded: **8410ms** ❌
- First Paint: **8396ms** ❌
- 108 ملف JS منفصل (code splitting لا يعمل بكفاءة في dev mode)
- `user_roles` يُجلب **3 مرات**، `profiles` **3 مرات** = 6 طلبات مكررة
- `supabase-js` يستغرق **3253ms** للتحميل
- بيانات DB قليلة جداً، فالمشكلة ليست في الجداول

## الخطة (3 محاور حقيقية)

### المحور 1: إلغاء الاستعلامات المكررة (الأثر الأكبر — Quick Win)
**المشكلة:** `AuthContext`, `ProtectedRoute`, `RoleGuard`, `AppSidebar` كلها تجلب `user_roles` و `profiles` بشكل منفصل.

**الحل:**
- إعداد **React Query** (موجود في dependencies) في `App.tsx`.
- إنشاء `useUserRole()` و `useProfile()` كـ hooks مع cache دائم (staleTime: Infinity للـ session).
- استبدال كل `supabase.from('user_roles')` بـ `useUserRole()`.

**الأثر المتوقع:** -6 طلبات شبكة، توفير ~2 ثانية من initial load.

### المحور 2: React Query للقوائم المرجعية + الجداول
- `useCustomers()`, `useSuppliers()`, `useProducts()`, `useAccounts()`, `useCompanySettings()` — staleTime 5 دقائق.
- استبدال `useEffect + useState` في صفحات القوائم بـ `useQuery` للحصول على cache بين الصفحات.
- Invalidation تلقائي بعد العمليات (mutations).

**الأثر:** فتح الصفحات الفرعية يصبح فورياً بعد أول زيارة.

### المحور 3: Server-side Pagination (للمستقبل عند تضخم البيانات)
- تعديل `DataTable` لدعم `manualPagination` + `manualFiltering`.
- تطبيقه على Sales, Purchases, Journal, InventoryMovements, Products.
- الفلاتر (تاريخ/حالة/بحث) تُنفّذ على الخادم عبر `.range()` و `.eq()` و `.ilike()`.

**ملاحظة:** هذا يفيد عند تجاوز 500+ صف. حالياً البيانات قليلة فلن يظهر فرق كبير، لكنه يضمن استمرار الأداء عند النمو.

### المحور 4 (إضافي): تنظيف Bundle
- التحقق من أن `recharts` لا يُستورد إلا في صفحات الرسوم (Dashboard + Reports).
- استبدال استيراد lucide-react الكامل باستيرادات محددة عند الحاجة.

## الأهداف المعدّلة (واقعية بناءً على الأرقام)
| المقياس | الحالي | الهدف |
|---|---|---|
| DOM Content Loaded | 8410ms | < 2500ms |
| First Paint | 8396ms | < 2000ms |
| استعلامات مكررة | 6 | 0 |
| فتح صفحة فرعية (بعد cache) | ~2s | < 200ms |

## ترتيب التنفيذ المقترح
1. **محور 1 + 2 معاً**: React Query لكل شيء (auth + lookups + lists). تأثير فوري وكبير.
2. **محور 4**: تنظيف الاستيرادات.
3. **محور 3**: Server-side pagination (لاحقاً عند الحاجة الفعلية).

## الملفات المتأثرة
- `src/App.tsx` — QueryClient config + QueryClientProvider.
- `src/contexts/AuthContext.tsx` — استخدام React Query للـ roles/profile.
- `src/components/auth/ProtectedRoute.tsx` و `RoleGuard.tsx` — استهلاك الـ hooks المشتركة.
- `src/components/layout/AppSidebar.tsx` — نفس الشيء.
- Hooks جديدة: `src/hooks/use-user-role.ts`, `use-profile.ts`, `use-customers.ts`, `use-suppliers.ts`, `use-products.ts`, `use-accounts.ts`, `use-company-settings.ts`.
- صفحات القوائم: تحويل `useEffect/useState` → `useQuery` (تدريجياً).
- `src/components/ui/data-table.tsx` — دعم `manualPagination` (للمحور 3).

## ملاحظة صادقة
**Server-side pagination وحده لن يحل مشكلتك** لأن البطء الفعلي في initial load وليس في الجداول. إذا نفّذنا فقط ما طلبته (محور 3) بدون 1 و 2، لن ترى تحسناً ملموساً في فتح الصفحات.

<lov-actions>
<lov-suggestion message="نفّذ المحور 1 و 2 معاً: React Query للـ auth (user_roles, profile) + lookups (customers, suppliers, products, accounts, company_settings) + تحويل صفحات القوائم لاستخدامها. هذا الذي سيحل البطء الفعلي.">نفّذ 1+2: React Query شامل (الأثر الأكبر)</lov-suggestion>
<lov-suggestion message="نفّذ المحاور الثلاثة كاملة: React Query شامل + تنظيف bundle (recharts/lucide) + Server-side pagination لجداول Sales/Purchases/Journal/Products/InventoryMovements.">نفّذ الخطة كاملة (1+2+3+4)</lov-suggestion>
<lov-suggestion message="نفّذ فقط المحور 3 كما طلبت أصلاً: Server-side pagination + manualFiltering لجداول Sales/Purchases/Journal/Products/InventoryMovements حتى لو لم يُحدث فرقاً كبيراً الآن.">نفّذ المحور 3 فقط (كما طلبت)</lov-suggestion>
<lov-suggestion message="قِس أداء صفحة Dashboard وصفحة تقرير ثقيل (مثل Inventory Turnover) وأعطني تقريراً تفصيلياً قبل أي تعديل إضافي.">قِس Dashboard والتقارير أولاً</lov-suggestion>
</lov-actions>
