
## الهدف
عند الرجوع من شاشة تعديل/عرض المنتج إلى `Products.tsx`، الحفاظ على:
- البحث (`search`)
- فلاتر التصنيف، المخزون، الحالة
- رقم الصفحة الحالية (`pageIndex`)
- عدد الصفوف بالصفحة (`pageSize`)
- تحديث القائمة تلقائياً بدون Reload يدوي

## التشخيص
حالياً في `src/pages/Products.tsx` كل الحالات (`search`, `categoryFilter`, `stockFilter`, `statusFilter`, `pagination`) مخزنة في `useState` محلي فقط، فتُفقد عند مغادرة الصفحة. كذلك `pageSize` ثابت `PAGE_SIZE = 20` بدون واجهة لتغييره. بعد الحفظ في `ProductForm.tsx` يتم `navigate("/products")` مما يُعيد بناء المكوّن من الصفر.

## خطة التنفيذ (Frontend فقط)

### 1) تخزين حالة القائمة في URL Query Params
تعديل `src/pages/Products.tsx` لاستخدام `useSearchParams` من `react-router-dom` كمصدر واحد للحقيقة:
- `q` = نص البحث
- `cat` = معرف التصنيف
- `stock` = all/low/out
- `status` = active/inactive/all
- `page` = رقم الصفحة (1-based في الـURL)
- `size` = عدد الصفوف

المزايا:
- الحالة تبقى تلقائياً عند الرجوع (المتصفح يحفظ الـURL في history)
- قابلة للمشاركة/الحفظ في المفضلة
- بسيط بدون مكتبات إضافية

بديل (إذا فضّل المستخدم عدم إظهار الحالة في الـURL): استخدام `sessionStorage` بمفتاح `products-list-state`. سأذهب مع Query Params لأنها الأنسب والأكثر موثوقية.

### 2) اختيار عدد الصفوف بالصفحة
إضافة `Select` صغير بجانب Pagination لعدد الصفوف: 10 / 20 / 50 / 100، متزامن مع `size` في الـURL ومطبّق على وضعَي List و Grid.

### 3) تحديث القائمة تلقائياً بعد التعديل
- استخدام `useQuery` الموجود مع تفعيل `refetchOnMount: "always"` لاستعلام `products-list` (وحالياً هو ضمن `usePagedQuery`).
- بديل أدق: بعد الحفظ في `ProductForm.tsx`، إبطال الـcache قبل التنقل:
  ```
  queryClient.invalidateQueries({ queryKey: ["products-list"] });
  queryClient.invalidateQueries({ queryKey: ["products-summary"] });
  ```
  ثم `navigate(-1)` أو `navigate("/products" + savedSearch)`.

### 4) العودة لنفس الـURL بعد الحفظ
تعديل `ProductForm.tsx`:
- عند الدخول لتعديل منتج، حفظ `location.state.returnTo` = الـURL الحالي للقائمة (من `Products.tsx` عبر `navigate(\`/products/${id}/edit\`, { state: { returnTo: location.search } })`).
- بعد الحفظ، الرجوع لـ `/products${returnTo || ""}` بدلاً من `/products` فقط.
- كذلك للأزرار "عرض" في `ProductCard` والـDataTable.

### 5) Reset صفحة عند تغيير الفلاتر
الإبقاء على المنطق الحالي (`useEffect` يعيد `pageIndex=0` عند تغيير الفلاتر/البحث)، ولكن تجاوزه عند القراءة الأولية من الـURL.

## الملفات المتأثرة
- `src/pages/Products.tsx` — استبدال `useState` بـ `useSearchParams` + إضافة Page Size selector + `refetchOnMount: "always"`.
- `src/components/products/ProductsGrid.tsx` — تمرير `pageSize` وعرض الـSelector (أو إضافته في `Products.tsx` كمكوّن مشترك بين الوضعين).
- `src/pages/ProductForm.tsx` — قراءة `location.state.returnTo` والعودة إليه، وإبطال الـcache قبل التنقل.
- `src/pages/ProductView.tsx` — نفس منطق `returnTo` عند وجود زر "رجوع".

## ما لن يتغير
- منطق الجلب/الفلترة على السيرفر كما هو.
- لا تغييرات في قاعدة البيانات.
- لا تغييرات في وضع العرض (List/Grid) — يبقى في `localStorage` كما هو الآن.
