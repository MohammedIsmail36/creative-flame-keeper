

## تحديث عنوان التبويب ديناميكياً (Dynamic Tab Title)

### المشكلة
كل التبويبات في المتصفح تعرض نفس الاسم `Lovable App`، فلا يستطيع المستخدم التمييز بين الشاشات المفتوحة.

### الحل
إنشاء **Hook موحّد** (`usePageTitle`) يستخدم `routeLabels` الموجودة في `AppBreadcrumb.tsx` ويُحدّث `document.title` تلقائياً عند تغيير المسار، بصيغة:

```
اسم الشاشة • نظام الباقي
```

أمثلة:
- `/sales` → `فواتير البيع • نظام الباقي`
- `/products/new` → `إضافة منتج جديد • نظام الباقي`
- `/profile` → `الملف الشخصي • نظام الباقي`
- `/` → `لوحة التحكم • نظام الباقي`

### الخطوات

1. **استخراج `routeLabels` إلى ملف مشترك** (`src/lib/route-labels.ts`):
   - نقل الخريطة من `AppBreadcrumb.tsx` لتُستخدم في مكانين (Breadcrumb + Title) بدون تكرار.
   - `AppBreadcrumb.tsx` يستوردها بدلاً من تعريفها داخلياً.

2. **إنشاء Hook جديد** (`src/hooks/use-page-title.ts`):
   - يقرأ `location.pathname`.
   - يبني العنوان من آخر segment ذو معنى (متجاهلاً الـ UUIDs).
   - يدعم دمج الـ segments الخاصة مثل `new` / `edit` / `import` مع السياق (مثل: `إضافة منتج جديد` بدل `إضافة جديد` فقط).
   - يُحدّث `document.title` عبر `useEffect`.
   - يُعيد العنوان أيضاً للقراءة عند الحاجة.

3. **تركيب الـ Hook في `AppLayout.tsx`**:
   - استدعاء `usePageTitle()` مرة واحدة داخل `AppLayout` ليعمل على كل الصفحات المحمية.
   - لصفحات خارج الـ Layout (`/auth`, `/auth/mfa`, `/forbidden`, `/404`) يُستدعى الـ Hook داخلها مباشرة، أو يُضاف على مستوى `App.tsx` ضمن `BrowserRouter` ليغطّي كل المسارات.

4. **تحديث `index.html`**:
   - تغيير `<title>Lovable App</title>` إلى `<title>نظام الباقي</title>` كقيمة افتراضية أثناء التحميل الأولي.
   - تحديث `<meta name="description">` و `og:title` لتعكس اسم النظام بدل الاسم الافتراضي.
   - تغيير `<html lang="en">` إلى `<html lang="ar" dir="rtl">`.

### الملفات المتأثرة
- ✏️ `index.html` — تحديث العنوان الافتراضي و lang/dir.
- 🆕 `src/lib/route-labels.ts` — مصدر موحّد لتسميات المسارات.
- 🆕 `src/hooks/use-page-title.ts` — Hook لتحديث `document.title`.
- ✏️ `src/components/layout/AppBreadcrumb.tsx` — استيراد `routeLabels` من الملف المشترك.
- ✏️ `src/components/layout/AppLayout.tsx` — تركيب الـ Hook.
- ✏️ `src/App.tsx` — (اختياري) تركيب الـ Hook على مستوى أعلى ليشمل صفحات خارج Layout.

### النتيجة
كل تبويب في المتصفح يعرض اسم الشاشة الفعلية، فيستطيع المستخدم التنقل بين عشرات التبويبات والتعرّف على كل شاشة من شريط العنوان مباشرة.

