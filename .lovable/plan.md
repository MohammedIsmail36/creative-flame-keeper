
# خطة: حماية حسابات النظام + توافقها مع إعادة التهيئة/التصفير

## القاعدة النهائية

على حسابات النظام (`is_system = true`):

| الحقل | الحالة |
|---|---|
| `code`, `account_type`, `is_parent`, `parent_id` | **مقفل** — الترحيل التلقائي والتقارير تعتمد عليها |
| `is_system` | **مقفل ضد التخفيض فقط** (لا يمكن إزالتها، لكن يمكن إضافتها لأغراض الإصلاح والتهيئة) |
| `name`, `description`, `is_active` | **قابل للتعديل** |

**إضافة أبناء**: مسموحة تحت حسابات النظام **الرئيسية** (`1`, `11`, `5`…). **ممنوعة** تحت حسابات ترحيل النظام (`1101`, `4101`…) لأنها ستكسر الترحيل التلقائي.

## التغييرات

### 1) هجرة قاعدة البيانات — الحماية الجوهرية

**Trigger A** — `BEFORE UPDATE` على `public.accounts`:
```sql
IF OLD.is_system = true THEN
  IF NEW.code <> OLD.code
     OR NEW.account_type <> OLD.account_type
     OR NEW.is_parent <> OLD.is_parent
     OR NEW.parent_id IS DISTINCT FROM OLD.parent_id
     OR (NEW.is_system = false)   -- ممنوع إزالة صفة النظام
  THEN
    RAISE EXCEPTION 'لا يمكن تعديل رمز/نوع/موقع/طبيعة حساب النظام.';
  END IF;
END IF;
```
> ملاحظة: السماح بالتحويل من `is_system = false` → `true` يسمح لـ seed/backup بإصلاح أي حساب فقد صفته سابقاً.

**Trigger B** — `BEFORE INSERT` على `public.accounts`:
```sql
IF NEW.parent_id IS NOT NULL THEN
  SELECT is_system, is_parent INTO v_sys, v_isp
  FROM accounts WHERE id = NEW.parent_id;
  IF v_sys = true AND v_isp = false THEN
    RAISE EXCEPTION 'لا يمكن إضافة حساب فرعي تحت حساب ترحيل نظام.';
  END IF;
END IF;
```

### 2) توافق مع Edge Functions للتهيئة والتصفير

**`supabase/functions/seed-system/index.ts`** و **`supabase/functions/database-backup/index.ts`**:
- الإدراج القائم يستخدم `is_system: SYSTEM_CODES.includes(acc.code)` — سليم ولن يتعارض مع Trigger B (كل الأبناء يُدرجون تحت حسابات رئيسية غير-Leaf).
- **إضافة خطوة إصلاح ذاتي (self-heal)** بعد الإدراج: تشغيل `UPDATE` واحد يضبط `is_system = true` على أي حساب رمزه ضمن `SYSTEM_CODES` لكن قيمته حالياً `false` (يتوافق مع Trigger A لأنه رفع صفة، لا خفض).
- بدون تغيير في ترتيب الإدراج (الآباء قبل الأبناء — يعمل حالياً).

### 3) واجهة `src/pages/Accounts.tsx` — تجربة مستخدم واضحة

- في نموذج التعديل عند `editingAccount.is_system === true`:
  - تعطيل الحقول: «الرمز»، «نوع الحساب»، «الحساب الأب»، مفتاح «حساب رئيسي».
  - شارة أعلى النموذج: «حساب نظام — التعديل مقصور على الاسم والوصف والحالة».
  - `handleSave` يُرسل فقط `name`, `description`, `is_active` لحسابات النظام (تجاهل تلاعب DevTools).
- زر «إضافة حساب فرعي» (سطر 402): يظهر فقط إذا `!(account.is_system && !account.is_parent)`.

## ما هو خارج النطاق

- لا تغيير على منطق الحذف (يعمل بالفعل).
- لا تعديل على قائمة `SYSTEM_CODES` أو الأكواد نفسها.
- لا تعديل على `DEFAULT_ACCOUNTS`.

## ترتيب التنفيذ

1. **هجرة قاعدة البيانات** (Trigger A + Trigger B) — بعد موافقتك.
2. تعديل `seed-system/index.ts` و`database-backup/index.ts` — إضافة self-heal بعد الإدراج.
3. تعديل `src/pages/Accounts.tsx` — قفل الحقول وإخفاء زر الإضافة على أوراق النظام.
4. اختبار: محاولة تعديل كود `1101` من الواجهة → مرفوض. تشغيل «إعادة تهيئة» → يعمل. محاولة إضافة ابن تحت `1101` → مرفوض. إضافة ابن تحت `5` → مقبول.

هل توافق؟
