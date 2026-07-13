## الحل الدائم

### الإجراءات

**1) حذف ملفَّي الهجرة الوهميَّين نهائياً**
- `supabase/migrations/20260420160915_85378f56-7fa7-4195-8c87-631c23971ea9.sql`
- `supabase/migrations/20260420162600_42ae13d5-20f3-454d-b9f0-74874574a61a.sql`

بذلك لن يُدرَج القيد الوهمي (100 ج.م) في أي قاعدة بيانات جديدة مستقبلاً. القواعد التي شغّلت هاتين الهجرتين مسبقاً لن تعيد تشغيلهما (Supabase يُسجِّل الهجرات المنفَّذة).

**2) هجرة تنظيف واحدة دائمة وآمنة (idempotent)**
تعمل على قاعدتك الحالية وأي بيئة موجودة:
- تحذف أي قيد يوميّة وصفه = `'قيد تصحيح فرق مرتجع شراء (WAC) - تسوية لمرة واحدة'` (سطوره ثم رأسه).
- تضمن أن حساب `5103` اسمه `'إيجار'` مع `is_system=false` (استعادة دوره الأصلي).
- تضمن أن حساب `5108` موجود باسم `'فروقات أسعار مرتجعات الشراء'` مع `is_system=true, is_active=true` — لأن التطبيق يعتمد عليه فعلياً في `PurchaseReturnForm.tsx` و `constants.ts` و `Dashboard.tsx` و `system-defaults.ts`.
- **لا** تُدرج أي قيد يوميّة إطلاقاً.

```sql
-- (أ) حذف القيد الوهمي إن وُجد
DO $$
DECLARE v_je uuid;
BEGIN
  FOR v_je IN
    SELECT id FROM public.journal_entries
    WHERE description = 'قيد تصحيح فرق مرتجع شراء (WAC) - تسوية لمرة واحدة'
  LOOP
    DELETE FROM public.journal_entry_lines WHERE journal_entry_id = v_je;
    DELETE FROM public.journal_entries WHERE id = v_je;
  END LOOP;
END $$;

-- (ب) استعادة 5103 كإيجار في حال بيئة قديمة غيّرته
UPDATE public.accounts
SET name = 'إيجار', is_system = false
WHERE code = '5103';

-- (ج) ضمان وجود 5108 صحيحاً (يستخدمه التطبيق)
DO $$
DECLARE v_parent uuid;
BEGIN
  SELECT id INTO v_parent FROM public.accounts WHERE code = '5' LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '5108') THEN
    INSERT INTO public.accounts (code, name, account_type, is_parent, is_system, parent_id, is_active)
    VALUES ('5108', 'فروقات أسعار مرتجعات الشراء', 'expense', false, true, v_parent, true);
  ELSE
    UPDATE public.accounts
    SET name = 'فروقات أسعار مرتجعات الشراء', is_system = true, is_active = true
    WHERE code = '5108';
  END IF;
END $$;
```

**3) فحص `public/full-schema.sql`**
إذا احتوى على نفس الـ INSERT للقيد الوهمي أُزيله منه أيضاً ليبقى مخطط إعادة البناء نظيفاً (يُتحقَّق أثناء التنفيذ).

---

### النتيجة
- القيد الوهمي يُحذف من قاعدتك فوراً ولا يعود يظهر مجدداً في أي بيئة.
- المصدر الأصلي للمشكلة (ملفَّا الهجرة) يختفيان نهائياً من المشروع.
- الوظائف المحاسبية السليمة (حساب 5108 لمرتجعات الشراء بسعر ≠ WAC) تبقى كما هي.

هل توافق على التنفيذ؟
