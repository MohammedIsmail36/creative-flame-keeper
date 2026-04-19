

## الهدف
جعل بيئة Lovable (الفرع `main`) هي **المصدر الأساسي للحقيقة (SSOT)** بحيث تحتوي على كل التحسينات والتعديلات الموجودة في الفرع المحلي `local-selfhosted`.

## التحدي
الفرعان تطورا بشكل متوازٍ:
- **`main` (Lovable):** يستخدم Supabase السحابي + RPCs مُدارة عبر Migrations + كود TypeScript للترحيل المحاسبي.
- **`local-selfhosted`:** يستخدم Supabase Docker + ملفات SQL يدوية في `docs/local-*.sql` + قد يحتوي تعديلات لم تُنقل.

لا أستطيع رؤية محتوى الفرع `local-selfhosted` مباشرة من أدواتي (أدواتي تقرأ فقط الفرع الحالي `main`). لذلك الخطة تعتمد على **منهجية مقارنة منظمة**.

---

## الخطة الشاملة (5 مراحل)

### المرحلة 1: جرد التغييرات في الفرع المحلي (تحضير من جانبك)
نحتاج صورة دقيقة لما يختلف. شغّل على جهازك:

```bash
# 1. قائمة بكل الملفات المختلفة بين الفرعين
git fetch origin
git diff --name-status origin/main..local-selfhosted > /tmp/changed-files.txt

# 2. ملخص الفروقات الإحصائية
git diff --stat origin/main..local-selfhosted > /tmp/diff-stats.txt

# 3. الـ commits الموجودة في local فقط
git log origin/main..local-selfhosted --oneline > /tmp/local-only-commits.txt

# 4. الـ Patch الكامل (للملفات النصية فقط)
git diff origin/main..local-selfhosted -- ':!bun.lockb' ':!*.lock' > /tmp/full-diff.patch
```

ارفع لي الملفات الأربعة (أو الصق محتواها في الشات).

### المرحلة 2: التصنيف والفرز (من جانبي)
سأصنّف كل تغيير إلى واحدة من أربع فئات:

| الفئة | الإجراء |
|---|---|
| **A. تحسين عام** (UI، منطق، Bug fix) | يُنقل كما هو إلى `main` |
| **B. خاص بالبيئة المحلية** (Docker، self-host config، RPCs SQL) | يبقى في `docs/local-*.sql` فقط، **لا يُنقل** للكود |
| **C. مكافئ موجود بالفعل** في `main` بطريقة مختلفة (مثلاً RPC في local ↔ TypeScript في main) | يُتحقق من تطابق المنطق، تحديث إن لزم |
| **D. متعارض / يحتاج قرار** | أعرضه عليك للموافقة قبل التطبيق |

### المرحلة 3: المراجعة الشاملة للمجلدات (Checklist)
سأمرّ على هذه المجلدات بترتيب الأولوية وأقارن مع ما يصلني من الـ diff:

1. **`src/pages/`** — أهم مجلد، يحتوي منطق الفواتير والمرتجعات والتقارير
2. **`src/lib/`** — وحدات الحسابات (entity-balance، product-utils، إلخ)
3. **`src/components/`** — مكونات مشتركة
4. **`src/contexts/`** — السياقات (Auth, Settings)
5. **`docs/`** — ملفات SQL المحلية وأدلة التشغيل
6. **`supabase/functions/`** — Edge Functions
7. **`public/full-schema.sql`** — مخطط القاعدة الكامل
8. **`src/integrations/supabase/types.ts`** — يُولَّد آلياً، يُتجاهل
9. **ملفات الإعدادات** (`vite.config.ts`, `tsconfig.json`, `package.json`)

لكل ملف مختلف:
- أقرأ النسختين (الحالية + الـ patch)
- أحدد الفئة (A/B/C/D)
- أكتب ملاحظة واحدة عن التغيير

### المرحلة 4: التطبيق على `main`
بعد الموافقة على الفرز:
- أطبّق تغييرات الفئة A مباشرة
- أنشئ Migrations لأي تعديلات على القاعدة (لمعادلة ما في `docs/local-*.sql`)
- أُحدّث `docs/local-*.sql` لأي شيء جديد لازم يبقى للبيئة المحلية
- أحافظ على ملفات `.lovable/`, `src/integrations/supabase/client.ts` كما هي

### المرحلة 5: التحقق
- بناء المشروع (`npm run build`) للتأكد من خلوه من أخطاء TypeScript
- مراجعة بصرية للصفحات المتأثرة في الـ Preview
- كتابة ملخص نهائي بكل ما نُقل + ما تُرك في local عمداً + ما يحتاج اختبار يدوي

---

## ما أحتاجه منك للبدء
الملفات الأربعة من المرحلة 1 (`changed-files.txt`، `diff-stats.txt`، `local-only-commits.txt`، `full-diff.patch`).

إذا كان `full-diff.patch` كبيراً جداً (> 500KB)، اكتفِ بالثلاثة الأولى وسأطلب منك الـ patch لكل ملف على حدة.

## ملاحظات مهمة
- **الذاكرة الموجودة لديّ** (mem://) تعكس قرارات الفرعين معاً، لذا لن تتعارض.
- **لن أحذف** أي ملف `docs/local-*.sql` — هذه ملفات حيوية للبيئة المحلية.
- **لن ألمس** `src/integrations/supabase/client.ts` و `types.ts` و `.env` (مولّدة آلياً).
- بعد اكتمال النقل، الفرع `main` يصبح هو المرجع، والـ `local-selfhosted` يحتاج فقط `git merge origin/main` + إعادة تشغيل ملفات `docs/local-*.sql`.

