# دليل التشغيل المحلي (Windows + WSL) — نسخة محدثة

هذا الدليل مخصص لهذا المشروع تحديدًا، ومبني على التشغيل الفعلي الذي نجح بدون الأخطاء التي واجهناها.

---

## جدول المحتويات

1. [المتطلبات](#المتطلبات)
2. [التحقق السريع](#التحقق-السريع)
3. [استخدام Supabase CLI الصحيح](#استخدام-supabase-cli-الصحيح)
4. [تهيئة `supabase/config.toml`](#تهيئة-supabaseconfigtoml)
5. [تشغيل Supabase محليًا](#تشغيل-supabase-محليًا)
6. [إعداد متغيرات البيئة](#إعداد-متغيرات-البيئة)
7. [تشغيل Edge Functions](#تشغيل-edge-functions)
8. [تشغيل الواجهة](#تشغيل-الواجهة)
9. [إنشاء حساب المدير المحلي](#إنشاء-حساب-المدير-المحلي)
10. [تهيئة النظام الأساسية](#تهيئة-النظام-الأساسية)
11. [أوامر العمل اليومية](#أوامر-العمل-اليومية)
12. [حل المشاكل الشائعة](#حل-المشاكل-الشائعة)

---

## المتطلبات

| المكون | المطلوب |
|---|---|
| Windows 10/11 | مع WSL2 |
| Ubuntu على WSL | 22.04+ |
| Docker Desktop | مفعّل معه WSL Integration |
| Node.js | 18+ (يفضل 20 LTS) |

> كل الأوامر في هذا الدليل تُنفّذ داخل WSL (Ubuntu terminal) ما لم يُذكر غير ذلك.

---

## التحقق السريع

```bash
docker --version
node -v
npm -v
```

إذا كان Docker يعمل داخل WSL، نكمل.

---

## استخدام Supabase CLI الصحيح

### مهم جدًا

إذا كان الأمر التالي يعرض نسخة قديمة (مثل `1.8.0`):

```bash
supabase --version
```

فلا تستخدمها مع Docker الحديث.

استخدم دائمًا نسخة حديثة عبر `npx`:

```bash
npx --yes supabase@latest --version
```

> هذا يتجنب خطأ:
> `client version 1.41 is too old. Minimum supported API version is 1.44`

اختياري (تنظيف):

```bash
# اختياري إذا كانت نسخة apt القديمة تسبب لخبطة
sudo apt remove -y supabase
```

---

## تهيئة `supabase/config.toml`

تأكد أن الملف `supabase/config.toml` يحتوي على هذا الهيكل (خصوصًا المنفذ `54322`):

```toml
project_id = "ejfoidwbeygzzkbonbmq"

# Required for supabase functions serve
[api]
port = 54321

[db]
port = 54322
major_version = 14

[auth]
site_url = "http://localhost:9999"

[studio]
port = 54323

[inbucket]
port = 9000
```

ملاحظات مهمة:
- لا تضف `auth.port` (غير مدعوم في CLI v2).
- استخدام `db.port = 54322` يمنع التعارض مع أي PostgreSQL آخر شغال على `5432`.

---

## تشغيل Supabase محليًا

من جذر المشروع:

```bash
cd ~/YOUR_REPO
npx --yes supabase@latest start
```

ثم تحقق من الحالة:

```bash
npx --yes supabase@latest status
```

ستحصل على:
- `Project URL` (عادة `http://127.0.0.1:54321`)
- `Publishable key` (`sb_publishable_...`)
- `Secret key` (`sb_secret_...`)
- `Database URL` (عادة على `54322`)

> انسخ مفاتيح `Publishable` و `Secret` لأننا سنستخدمها بعد قليل.

---

## إعداد متغيرات البيئة

### 1) ملف الواجهة: `.env.local` (في جذر المشروع)

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ضع_مفتاحك_هنا
```

### 2) ملف Edge Functions: `supabase/.env.local`

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_ضع_مفتاحك_هنا
```

ملاحظات:
- استخدم `127.0.0.1:54321` وليس `localhost:8000`.
- بعد تعديل `.env.local` يجب إعادة تشغيل `npm run dev`.

---

## تشغيل Edge Functions

في Terminal منفصل:

```bash
cd ~/YOUR_REPO
npx --yes supabase@latest functions serve --env-file supabase/.env.local
```

---

## تشغيل الواجهة

في Terminal منفصل:

```bash
cd ~/YOUR_REPO
npm install
npm run dev
```

الواجهة عادة على:

- `http://localhost:8080`

---

## إنشاء حساب المدير المحلي

بعد `supabase start` قاعدة البيانات تكون نظيفة غالبًا، لذلك تسجيل الدخول قد يفشل بـ `400` إذا لم يوجد مستخدم.

### الخطوة 1: إنشاء مستخدم الأدمن عبر Auth API

```bash
PUBLISHABLE_KEY="sb_publishable_ضع_مفتاحك_هنا"

cat > /tmp/admin-signup.json <<'JSON'
{
  "email": "admin@system.com",
  "password": "admin123456",
  "data": {
    "full_name": "System Admin"
  }
}
JSON

curl -sS -X POST "http://127.0.0.1:54321/auth/v1/signup" \
  -H "apikey: ${PUBLISHABLE_KEY}" \
  -H "Authorization: Bearer ${PUBLISHABLE_KEY}" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/admin-signup.json
```

### الخطوة 2: إسناد دور `admin` وإنشاء `profile`

افتح Supabase Studio:

- `http://127.0.0.1:54323`
- SQL Editor

ثم نفّذ:

```sql
insert into public.user_roles(user_id, role)
select id, 'admin'::app_role
from auth.users
where email = 'admin@system.com'
on conflict (user_id, role) do nothing;

insert into public.profiles(id, full_name)
select id, 'System Admin'
from auth.users
where email = 'admin@system.com'
on conflict (id) do update set full_name = excluded.full_name;
```

بيانات الدخول:
- البريد: `admin@system.com`
- كلمة المرور: `admin123456`

> غيّر كلمة المرور بعد أول دخول.

---

## تهيئة النظام الأساسية

إذا أردت تشغيل دالة التهيئة:

```bash
SERVICE_ROLE_KEY="sb_secret_ضع_مفتاحك_هنا"

curl -sS -X POST "http://127.0.0.1:54321/functions/v1/seed-system" \
  -H "apikey: ${SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -d '{}'
```

ملاحظة:
- دالة `seed-system` في هذا المشروع تُنشئ/تحدّث دور المدير والملف الشخصي مباشرة، لذلك لا تحتاج أي RPC إضافي.

---

## أوامر العمل اليومية

### بدء العمل

```bash
cd ~/YOUR_REPO
npx --yes supabase@latest start
npx --yes supabase@latest status
npx --yes supabase@latest functions serve --env-file supabase/.env.local
npm run dev
```

### إنهاء العمل

```bash
cd ~/YOUR_REPO
npx --yes supabase@latest stop
```

### إعادة تهيئة كاملة (تحذف بيانات Supabase المحلية)

```bash
cd ~/YOUR_REPO
npx --yes supabase@latest stop --all --no-backup --yes
npx --yes supabase@latest start
```

---

## حل المشاكل الشائعة

### ❌ `client version 1.41 is too old`

السبب: نسخة Supabase CLI قديمة (غالبًا من apt).

الحل:

```bash
npx --yes supabase@latest start
```

ولا تستخدم النسخة القديمة `supabase` مباشرة.

---

### ❌ `failed to parse config` و `auth has invalid keys: port`

السبب: وجود `auth.port` في `supabase/config.toml`.

الحل: احذف `auth.port`، واترك فقط:

```toml
[auth]
site_url = "http://localhost:9999"
```

---

### ❌ `FATAL: Tenant or user not found` عند تشغيل Supabase

السبب: تعارض على المنفذ `5432` مع خدمة أخرى.

الحل:
- اجعل `db.port = 54322` في `supabase/config.toml`.
- أعد التشغيل:

```bash
npx --yes supabase@latest stop --all --no-backup --yes
npx --yes supabase@latest start
```

---

### ❌ `POST http://localhost:8000/auth/v1/token 500`

السبب: الواجهة تتجه إلى عنوان قديم `localhost:8000`.

الحل في `.env.local`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

ثم:

```bash
npm run dev
```

---

### ❌ `POST .../auth/v1/token?grant_type=password 400`

السبب: لا يوجد مستخدم في `auth.users` بعد التهيئة.

الحل:
- أنشئ `admin@system.com` بخطوة "إنشاء حساب المدير المحلي".

---

### ❌ `Missing authorization header` عند استدعاء Function

الحل:
- تأكد من إرسال الهيدرَين معًا:
  - `apikey`
  - `Authorization: Bearer ...`
- وتأكد أن `SERVICE_ROLE_KEY` ليس فارغًا.

---

### ❌ `Unchecked runtime.lastError` في Console

غالبًا من إضافة متصفح (Extension) وليس من التطبيق.

الحل: اختبر في نافذة Incognito بدون إضافات أو تجاهل الرسالة إن كان التطبيق يعمل.

---

### ❌ تشوّه الأحرف العربية بعد `db reset` أو `seed`

السبب الأكثر شيوعًا:
- تعديل ملفات `supabase/functions` من PowerShell بأوامر تكتب بترميز غير UTF-8.
- أو وجود نسخة قديمة/معدلة من ملفات التهيئة العربية.

الحل المعتمد في هذا المشروع:
- ملفات التهيئة أصبحت موحّدة في:
  - `supabase/functions/_shared/system-defaults.ts`
- الدوال تستخدم استيراد محلي:
  - `npm:@supabase/supabase-js@2`
  - بدون `esm.sh`

تأكد من الترميز:

```bash
file -bi supabase/functions/_shared/system-defaults.ts
file -bi supabase/functions/seed-system/index.ts
file -bi supabase/functions/database-backup/index.ts
```

يجب أن يظهر `charset=utf-8`.

إذا عدّلت من PowerShell، استخدم دائمًا:

```powershell
Set-Content -Encoding utf8 ...
```

ثم أعد التصفير والتشغيل:

```bash
npx --yes supabase@latest db reset
npx --yes supabase@latest functions serve --env-file supabase/.env.local
```

---

## ملاحظات نهائية

- هذا المشروع يعتمد على `supabase/migrations`، لذا عادة لا تحتاج تطبيق `public/full-schema.sql` يدويًا عند استخدام `supabase start`.
- إذا عدّلت متغيرات البيئة (`.env.local`)، أعد تشغيل Vite دائمًا.

