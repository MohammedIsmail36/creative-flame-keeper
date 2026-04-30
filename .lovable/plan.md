## الخطة: إضافة عرض شبكي (كروت) لقائمة المنتجات

إضافة محوّل عرض (List / Grid) في صفحة المنتجات، مع الحفاظ على كل الفلاتر، البحث، الترقيم، والـ KPIs الحالية. الكروت ستكون بحجم متوازن (ليست كبيرة) وتعرض أهم البيانات فقط.

### مكان التحويل
- شريط أعلى الجدول/الشبكة، بجانب الفلاتر الحالية في `Products.tsx`.
- زرّان أيقونيّان (List / LayoutGrid) باستخدام `ToggleGroup` من shadcn، الوضع الافتراضي: List.
- حفظ التفضيل في `localStorage` بمفتاح `products-view-mode` ليبقى عبر الجلسات.

### تصميم الكارت (مدمج، ~260px ارتفاع)
- صورة المنتج (`main_image_url`) بنسبة 4:3 في الأعلى مع fallback لأيقونة `Package` على خلفية `bg-muted`.
- شارة حالة المخزون أعلى الصورة (متوفر / منخفض / نفذ) — نفس ألوان `getStockBadge`.
- شارة "غير نشط" تظهر فقط للمنتجات المعطّلة.
- العنوان: اسم المنتج (سطر واحد مع truncate) — bold.
- سطر فرعي صغير: الماركة • الموديل (muted-foreground).
- سطر الكود + التصنيف (نص رمادي صغير).
- صف سفلي بثلاث قيم مدمجة:
  - الكمية (مع وحدة القياس)
  - سعر البيع (بارز بـ primary color)
  - سعر الشراء (مكتوم وأصغر)
- عند hover: ظل خفيف + scale بسيط؛ النقر على الكارت يفتح صفحة عرض المنتج (نفس سلوك الجدول).
- زر إجراءات صغير (⋮) في أعلى يسار الكارت يفتح dropdown يحتوي: عرض، تعديل (إن كان `canEdit`)، تفعيل/تعطيل، حذف نهائي (نفس منطق الجدول).

### التخطيط
- شبكة responsive: `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4`.
- الكارت يستخدم `Card` من shadcn مع `rounded-xl overflow-hidden border`.

### الترقيم والفلاتر
- نفس `pagination` و`PAGE_SIZE = 20` المستخدم حاليًا — تطبيقه على الشبكة كذلك.
- يتم استخدام نفس `products` array الناتج من `usePagedQuery`.
- شريط الترقيم يظهر أسفل الشبكة (مكوّن مبسّط يستخدم نفس `pagination` state).
- البحث في الشبكة يستخدم نفس حقل البحث الحالي (يُنقل من toolbar الجدول إلى أعلى المنطقة المشتركة، فوق الـ DataTable/Grid).

### المكوّنات الجديدة
1. **`src/components/products/ProductCard.tsx`** — كارت منتج واحد، يستقبل: `product`, `usageCount`, `canEdit`, `onView`, `onToggleStatus`, `onDelete`.
2. **`src/components/products/ProductsGrid.tsx`** — يعرض الشبكة + شريط ترقيم بسيط + حالة فارغة + skeleton للتحميل.

### تعديلات على `Products.tsx`
- إضافة state: `viewMode: "list" | "grid"` مع تحميل/حفظ من localStorage.
- إضافة `ToggleGroup` في شريط الأدوات (يُعرض في الحالتين).
- نقل البحث وفلاتر التصنيف/المخزون إلى شريط مشترك خارج `DataTable` ليعمل في كلا العرضين.
- شرط رندر:
  - `viewMode === "list"` → `DataTable` الحالي.
  - `viewMode === "grid"` → `ProductsGrid`.

### تفاصيل تقنية
- صورة المنتج: `<img loading="lazy" />` + `onError` للسقوط لأيقونة افتراضية.
- استخدام `formatProductDisplay` من `src/lib/product-utils.ts` لاتساق العرض.
- الـ skeleton للشبكة: 10 كروت رمادية (`Skeleton`) أثناء `isLoading`.
- لا حاجة لتغييرات على قاعدة البيانات أو الفهارس — كل الحقول المطلوبة موجودة بالفعل في الاستعلام.

### ملفات سيتم لمسها
- `src/pages/Products.tsx` (تعديل)
- `src/components/products/ProductCard.tsx` (إنشاء)
- `src/components/products/ProductsGrid.tsx` (إنشاء)
