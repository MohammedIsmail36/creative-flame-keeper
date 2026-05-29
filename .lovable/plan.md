## المشكلة المؤكدة بعد فحص الكود

نعم — يوجد **تسرّب فعلي** للصور في bucket التخزين. الإزالة من الواجهة تحذف فقط المرجع من قاعدة البيانات، أمّا الملف نفسه في `storage.product-images` فيظل موجوداً للأبد:

| الحالة | السلوك الحالي | النتيجة |
|---|---|---|
| إزالة صورة من معرض المنتج | حذف من state فقط، ثم عند الحفظ تُحذف صفوف `product_images` وتُعاد كتابتها | الملف الأصلي يبقى في bucket |
| استبدال الصورة الرئيسية للمنتج | تحديث `main_image_url` فقط | الصورة القديمة تبقى في bucket |
| إزالة/استبدال شعار الشركة (`SettingsPage` → `removeLogo`) | `updateField("logo_url", "")` فقط | الشعار القديم يبقى في bucket |
| حذف منتج (`Products.tsx` line 338, `ProductForm` rollback line 351) | حذف صف المنتج فقط | كل صور المنتج (رئيسية + معرض) تبقى في bucket |

ملاحظة جانبية: شعار الشركة يُرفع حالياً في bucket `product-images` بدلاً من bucket مخصّص.

## الخطة

### 1. دالة مساعدة موحّدة `src/lib/storage-cleanup.ts`
- `deleteStorageFile(publicUrl: string)` — تستخرج المسار من الـ public URL وتستدعي `supabase.storage.from("product-images").remove([path])`.
- `deleteStorageFiles(urls: string[])` — حذف دفعة واحدة، يتجاهل الأخطاء بصمت (لا نوقف العملية الأساسية إذا فشل حذف ملف).
- آمنة من URLs الخارجية: تتحقق أن الـ URL يخص bucket المشروع قبل الحذف.

### 2. `src/pages/ProductForm.tsx`
- `removeGalleryImage`: حذف الملف من Storage فوراً بعد إزالته من state.
- `handleMainImage`: قبل استبدال `mainImageUrl` بصورة جديدة، حذف الصورة القديمة من Storage.
- زر إزالة الصورة الرئيسية (إن وُجد) → حذف من Storage.
- عند الحفظ في وضع التعديل: قبل `delete().eq("product_id", productId)`، جلب الصفوف القديمة ومقارنتها بـ `galleryImages` الحالية وحذف الـ URLs المحذوفة من Storage (بدل الاعتماد على state فقط، لتغطية أي حالة سباق).

### 3. `src/pages/Products.tsx` — حذف منتج
قبل `supabase.from("products").delete()`:
1. جلب `main_image_url` من المنتج.
2. جلب كل `image_url` من `product_images` للمنتج.
3. حذف كل هذه الملفات من Storage عبر `deleteStorageFiles`.
4. ثم تنفيذ الحذف من DB (سيحذف صفوف `product_images` تلقائياً عبر CASCADE إن وُجد، وإلا نحذفها يدوياً).

نفس المعالجة في rollback داخل `ProductForm.tsx` (line 351) عند فشل الرصيد الافتتاحي.

### 4. `src/pages/SettingsPage.tsx` — شعار الشركة
- `removeLogo`: حذف الملف القديم من Storage قبل تفريغ `logo_url`.
- رفع شعار جديد: حذف القديم قبل تحديث الحقل بالـ URL الجديد.

### 5. (اختياري — للنظافة لاحقاً) سكربت تنظيف الصور اليتيمة
سكربت SQL/edge-function يقارن ملفات `storage.objects` في bucket `product-images` بكل الـ URLs المستخدمة في `products.main_image_url` + `product_images.image_url` + `company_settings.logo_url` ويحذف الباقي. يُشغَّل يدوياً عند الحاجة. **لن يُنفّذ إلا بطلب صريح منك.**

## ملاحظات تقنية
- لا حاجة لتغييرات في قاعدة البيانات أو RLS — bucket `product-images` عام والـ remove يعمل بصلاحيات المستخدم الحالي.
- لا حاجة لتعديل دالة `database-backup` لأنها لا تتعامل مع Storage أصلاً (وهذا تسرّب آخر منفصل — يمكن معالجته لاحقاً عند الطلب).
- لن أغيّر أيّ منطق وظيفي آخر للمنتجات أو الإعدادات.

هل أبدأ التنفيذ؟