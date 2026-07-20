## المشكلة

على السيرفير الخاص بك، بعد الضغط على "حفظ" تظهر رسالة النجاح، ولكن عند إعادة تحميل الصفحة تعود القيم إلى الافتراضية (الهدف=0، اسم الشركة/الشعار فارغ). في معاينة Lovable الحفظ يعمل بشكل صحيح لأن سطر الإعدادات واحد فقط.

## السبب المرجّح (يحتاج تأكيد بخطوة تشخيص)

1. **صفوف متعددة في `company_settings`**: عمليات سابقة (تصفير/seed) أنتجت أكثر من صف. الاستعلام `.limit(1).maybeSingle()` بدون ترتيب يجلب صفاً عشوائياً، فتُحرّر صفاً وتحفظ عليه، ثم عند إعادة التحميل يُقرأ صف آخر (فيه القيم الافتراضية).
2. **فشل صامت للـ PATCH**: `supabase.from("company_settings").update(...).eq("id", id)` يعود بـ 204 حتى لو لم يُحدَّث أي صف (بسبب RLS أو `id` لا يطابق). الكود لا يرصد هذه الحالة ويعرض رسالة النجاح.
3. **إرسال حقول مُدارة**: الطلب الحالي يرسل `created_at` و`updated_at` مع الجسم — هذا ليس سبب "العودة للافتراضي" لكنه ممارسة سيئة قد تُربك التريجرز.

## الخطة (بسيطة، تُصلح الجذر ولا تُغيّر منطق الأعمال)

### 1) قيد قاعدة بيانات: صف واحد فقط في `company_settings`
- ميجريشن يحذف الصفوف المكرّرة ويُبقي الأقدم (بحسب `created_at`)، ويُضيف قيد فريد يمنع التكرار مستقبلاً:
  - إنشاء عمود مُساعد ثابت `singleton boolean GENERATED ALWAYS AS (true) STORED` مع `UNIQUE (singleton)` — الطريقة القياسية لضمان صف واحد فقط.
- قبل الحذف: نقل أي مراجع من الصفوف الأخرى إلى الصف المحفوظ (لا يوجد جداول تشير إلى `company_settings.id` من ما رأيت، فسيكون الحذف آمناً).

### 2) قراءة موثوقة للإعدادات
تحديث كل من `src/hooks/use-company-settings.ts` و`fetchSettings` في `src/pages/SettingsPage.tsx`:
- إضافة `.order("created_at", { ascending: true }).limit(1)` لضمان قراءة نفس الصف دائماً حتى قبل تطبيق ميجريشن التنظيف.

### 3) كتابة موثوقة (رصد الفشل الصامت) في `SettingsPage.tsx`
- استبدال `.update(updateData).eq("id", id)` بـ:
  ```ts
  const { id, created_at, updated_at, ...updateData } = settings;
  const { data, error } = await supabase
    .from("company_settings")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();
  ```
  إذا رجعت `error` (بما فيها "no rows returned") أو `data` غير موجود → إظهار رسالة خطأ حقيقية بدلاً من "تم الحفظ بنجاح".
- بعد النجاح: `setSettings(data)` لمزامنة الحالة المحلية مع ما حُفظ فعلياً (يحل مشكلة أن أي تريجر قاعدة بيانات يعدّل قيمة، فتظهر مباشرة في الواجهة).

### 4) استبعاد الحقول المُدارة من جسم الـ PATCH
- إزالة `id`, `created_at`, `updated_at` من `updateData` (كما في المقتطف أعلاه).

## سكربت تشخيص سريع (قبل تطبيق الإصلاح على سيرفيرك)
شغّل على قاعدة بياناتك:
```sql
SELECT count(*) FROM public.company_settings;
SELECT id, company_name, monthly_sales_target, created_at, updated_at
FROM public.company_settings ORDER BY created_at;
```
- إذا كان العدد > 1 → السبب مؤكّد (صفوف مكرّرة). الميجريشن سيحلّها.
- إذا كان = 1 وقيمها افتراضية رغم أنك حفظت → السبب RLS/الصلاحيات، وسيكشفه إصلاح رقم 3 بإظهار رسالة الخطأ الفعلية.

## الملفات المتأثرة
- `supabase/migrations/<new>.sql` — تنظيف + قيد singleton.
- `src/hooks/use-company-settings.ts` — إضافة `order/limit`.
- `src/pages/SettingsPage.tsx` — `.select().single()`, إزالة الحقول المُدارة, مزامنة الحالة بعد الحفظ.
- `public/full-schema.sql` — تحديث ليشمل قيد singleton (لتوافق أي إعادة بناء لاحقة).

## خارج النطاق
- لن أعدّل منطق التريجرز الحالية (`fn_sync_tax_display_setting`).
- لن أغيّر شكل الصفحة أو منطق حقول محددة.
