# دليل التثبيت على البيئة المحلية (Windows / WSL)

هذا الدليل يشرح كيفية تشغيل النظام المحاسبي بالكامل على جهازك المحلي، مستقلاً تماماً عن أي خدمة خارجية.

---

## جدول المحتويات

1. [المتطلبات](#المتطلبات)
2. [تفعيل WSL2 و Docker](#الخطوة-1-تفعيل-wsl2-و-docker)
3. [استنساخ المشروع](#الخطوة-2-استنساخ-المشروع)
4. [إعداد Supabase Docker محلياً](#الخطوة-3-إعداد-supabase-docker-محلياً)
5. [إنشاء قاعدة البيانات](#الخطوة-4-إنشاء-قاعدة-البيانات)
6. [تعديلات الكود](#الخطوة-5-تعديلات-الكود)
7. [نشر Edge Functions محلياً](#الخطوة-6-نشر-edge-functions-محلياً)
8. [تشغيل الواجهة](#الخطوة-7-تشغيل-الواجهة)
9. [تهيئة النظام](#الخطوة-8-تهيئة-النظام)
10. [أوامر التطوير اليومية](#أوامر-التطوير-اليومية)
11. [حل المشاكل الشائعة](#حل-المشاكل-الشائعة)
12. [هيكل المشروع](#هيكل-المشروع)

---

## المتطلبات

| المكون | الإصدار المطلوب | أمر التثبيت / الرابط |
|--------|----------------|---------------------|
| Windows 10/11 | 64-bit | — |
| WSL2 | Ubuntu 22.04+ | `wsl --install` |
| Docker Desktop | v4.25+ | [تحميل](https://docs.docker.com/desktop/install/windows-install/) |
| Node.js | v18+ (يُفضل v20 LTS) | [تحميل](https://nodejs.org/) |
| Git | أحدث إصدار | [تحميل](https://git-scm.com/download/win) |
| Supabase CLI | أحدث إصدار | `npm install -g supabase` |

> **ملاحظة**: جميع الأوامر التالية تُنفَّذ داخل WSL (Ubuntu terminal) ما لم يُذكر خلاف ذلك.

---

## الخطوة 1: تفعيل WSL2 و Docker

### 1.1 تثبيت WSL2

افتح **PowerShell كمسؤول** (Run as Administrator):

```powershell
wsl --install
```

أعد تشغيل الجهاز، ثم تأكد:

```powershell
wsl --list --verbose
```

يجب أن ترى:
```
  NAME      STATE    VERSION
* Ubuntu    Running  2
```

إذا كان VERSION يظهر 1، حوّله:
```powershell
wsl --set-version Ubuntu 2
```

### 1.2 تثبيت Docker Desktop

1. حمّل Docker Desktop من [الرابط الرسمي](https://docs.docker.com/desktop/install/windows-install/)
2. أثناء التثبيت، **فعّل خيار** `Use WSL 2 based engine`
3. بعد التثبيت:
   - افتح Docker Desktop
   - اذهب إلى **Settings → Resources → WSL Integration**
   - فعّل **Ubuntu**
   - اضغط **Apply & Restart**

تأكد من عمل Docker داخل WSL:

```bash
docker --version
# مثال: Docker version 27.x.x

docker compose version
# مثال: Docker Compose version v2.x.x
```

> ⚠️ **مهم**: استخدم `docker compose` (بمسافة) وليس `docker-compose` (بشرطة). الصيغة القديمة لم تعد مدعومة.

---

## الخطوة 2: استنساخ المشروع

```bash
cd ~
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

> استبدل `YOUR_USERNAME/YOUR_REPO` بالمسار الفعلي لمستودعك على GitHub.
> إذا لم تربط المشروع بـ GitHub بعد، افعل ذلك من إعدادات Lovable أولاً.

تحقق من وجود الملفات الأساسية:

```bash
ls public/full-schema.sql        # ملف بنية قاعدة البيانات
ls supabase/functions/            # Edge Functions
ls src/                           # كود الواجهة
```

---

## الخطوة 3: إعداد Supabase Docker محلياً

### 3.1 تحميل Supabase Docker

```bash
cd ~
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
```

### 3.2 إعداد متغيرات البيئة

```bash
cp .env.example .env
```

### 3.3 توليد مفاتيح JWT

أولاً، ثبّت أداة التوليد:

```bash
npm install -g jsonwebtoken
```

اختر **JWT_SECRET** عشوائي (64 حرف على الأقل):

```bash
# توليد سر عشوائي
openssl rand -base64 64 | tr -d '\n' ; echo
```

انسخ الناتج واحفظه — هذا هو `JWT_SECRET` الخاص بك.

الآن ولّد المفاتيح:

```bash
# توليد ANON_KEY
node -e "
const jwt = require('jsonwebtoken');
const SECRET = 'ضع_JWT_SECRET_هنا';
const payload = {
  role: 'anon',
  iss: 'supabase',
  iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000) + (10 * 365 * 24 * 60 * 60)
};
console.log(jwt.sign(payload, SECRET));
"
```

```bash
# توليد SERVICE_ROLE_KEY
node -e "
const jwt = require('jsonwebtoken');
const SECRET = 'ضع_JWT_SECRET_هنا';
const payload = {
  role: 'service_role',
  iss: 'supabase',
  iat: Math.floor(Date.now()/1000),
  exp: Math.floor(Date.now()/1000) + (10 * 365 * 24 * 60 * 60)
};
console.log(jwt.sign(payload, SECRET));
"
```

> **احفظ هذه القيم الثلاث** (JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY) — ستحتاجها في عدة أماكن.

### 3.4 تعديل ملف `.env`

افتح الملف `~/supabase/docker/.env` وعدّل القيم التالية:

```env
############
# Secrets — غيّر هذه القيم إلزامياً
############
POSTGRES_PASSWORD=كلمة_مرور_قوية_هنا
JWT_SECRET=المفتاح_العشوائي_الذي_ولّدته
ANON_KEY=eyJhbGciOiJIUzI1NiIs...
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIs...

############
# Dashboard — بيانات دخول لوحة تحكم Supabase Studio
############
DASHBOARD_USERNAME=admin
DASHBOARD_PASSWORD=كلمة_مرور_قوية

############
# General
############
SITE_URL=http://localhost:8080
STUDIO_DEFAULT_ORGANIZATION=شركتي
STUDIO_DEFAULT_PROJECT=النظام المحاسبي

############
# Auth — إعدادات المصادقة
############
GOTRUE_SITE_URL=http://localhost:8080
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
```

> **`GOTRUE_MAILER_AUTOCONFIRM=true`**: في البيئة المحلية نفعّل التأكيد التلقائي لأنه لا يوجد خادم بريد. في الإنتاج يجب تعطيله.

### 3.5 تشغيل Supabase

```bash
cd ~/supabase/docker
docker compose up -d
```

انتظر حتى تعمل جميع الحاويات (قد يستغرق 2-5 دقائق في المرة الأولى):

```bash
docker compose ps
```

يجب أن ترى هذه الخدمات بحالة `Up`:

| الخدمة | الوظيفة | المنفذ |
|--------|---------|--------|
| `supabase-db` | PostgreSQL | 5432 |
| `supabase-kong` | API Gateway | 8000 |
| `supabase-auth` | GoTrue (المصادقة) | 9999 |
| `supabase-rest` | PostgREST (API) | 3000 |
| `supabase-storage` | تخزين الملفات | 5000 |
| `supabase-studio` | لوحة التحكم | 8000 |

**اختبر الوصول**:
- لوحة التحكم: [http://localhost:8000](http://localhost:8000)
- API: `curl http://localhost:8000/rest/v1/ -H "apikey: ANON_KEY_هنا"`

---

## الخطوة 4: إنشاء قاعدة البيانات

### 4.1 تطبيق الـ Schema

```bash
cd ~/YOUR_REPO
psql -h localhost -p 5432 -U postgres -d postgres -f public/full-schema.sql
```

سيُطلب منك كلمة المرور — أدخل `POSTGRES_PASSWORD` الذي اخترته.

**أو** عبر Supabase Studio:
1. افتح [http://localhost:8000](http://localhost:8000)
2. سجّل الدخول بـ `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`
3. اذهب إلى **SQL Editor**
4. انسخ محتوى `public/full-schema.sql` والصقه
5. اضغط **Run**

### 4.2 التحقق من الجداول

```bash
psql -h localhost -p 5432 -U postgres -d postgres -c "\dt public.*"
```

يجب أن ترى **22+ جدول** تشمل:

```
accounts                              product_categories
company_settings                      product_brands
customers                             product_units
suppliers                             product_images
products                              profiles
sales_invoices                        user_roles
sales_invoice_items                   inventory_movements
purchase_invoices                     inventory_adjustments
purchase_invoice_items                inventory_adjustment_items
sales_returns                         expenses
sales_return_items                    expense_types
purchase_returns                      journal_entries
purchase_return_items                 journal_entry_lines
customer_payments                     customer_payment_allocations
supplier_payments                     supplier_payment_allocations
sales_invoice_return_settlements      purchase_invoice_return_settlements
sales_return_payment_allocations      purchase_return_payment_allocations
```

### 4.3 التحقق من الدوال والأنواع

```bash
# التحقق من الدوال
psql -h localhost -p 5432 -U postgres -d postgres -c "\df public.*"

# التحقق من الـ Enums
psql -h localhost -p 5432 -U postgres -d postgres -c "\dT+ public.*"
```

الدوال المتوقعة:
- `has_role(uuid, app_role)` — فحص صلاحيات المستخدم
- `get_user_role(uuid)` — جلب دور المستخدم
- `admin_insert_user_role(uuid, text)` — إسناد دور
- `admin_insert_profile(uuid, text)` — إنشاء ملف شخصي
- `get_avg_purchase_price(uuid)` — متوسط سعر الشراء
- `get_avg_selling_price(uuid)` — متوسط سعر البيع

---

## الخطوة 5: تعديلات الكود

### 5.1 إزالة lovable-tagger

```bash
cd ~/YOUR_REPO
npm uninstall lovable-tagger
```

### 5.2 تعديل `vite.config.ts`

افتح الملف واستبدل محتواه بالكامل:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

### 5.3 إنشاء ملف `.env.local`

أنشئ ملف `.env.local` في **جذر المشروع** (بجانب `package.json`):

```env
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=الـ_ANON_KEY_الذي_ولّدته_في_الخطوة_3.3
```

> ⚠️ **مهم**: لا تعدّل ملف `.env` الأصلي — ملف `.env.local` يأخذ الأولوية تلقائياً في Vite.

### 5.4 التحقق من ملف `src/integrations/supabase/client.ts`

تأكد أن الملف يقرأ من متغيرات البيئة (يجب أن يكون كذلك بالفعل):

```typescript
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
```

### 5.5 تثبيت التبعيات

```bash
npm install
```

---

## الخطوة 6: نشر Edge Functions محلياً

### 6.1 إعداد ملف بيئة الدوال

أنشئ ملف `supabase/.env.local`:

```env
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=الـ_SERVICE_ROLE_KEY_الذي_ولّدته
SUPABASE_ANON_KEY=الـ_ANON_KEY_الذي_ولّدته
```

### 6.2 تشغيل الدوال

```bash
cd ~/YOUR_REPO
supabase functions serve --env-file supabase/.env.local
```

> هذا يشغل جميع الدوال على المنفذ `54321`.

### 6.3 الدوال المتوفرة

| الدالة | الوظيفة | الاستدعاء |
|--------|---------|-----------|
| `seed-system` | تهيئة النظام (مدير + حسابات + إعدادات) | `POST /functions/v1/seed-system` |
| `database-backup` | تصفير وإعادة بناء قاعدة البيانات | `POST /functions/v1/database-backup` |

---

## الخطوة 7: تشغيل الواجهة

افتح **terminal جديد** (اترك Edge Functions تعمل في الأول):

```bash
cd ~/YOUR_REPO
npm run dev
```

الواجهة متاحة على: **[http://localhost:8080](http://localhost:8080)**

---

## الخطوة 8: تهيئة النظام

### الطريقة 1: عبر Edge Function (موصى بها)

```bash
curl -X POST http://localhost:54321/functions/v1/seed-system \
  -H "Authorization: Bearer SERVICE_ROLE_KEY_هنا" \
  -H "Content-Type: application/json"
```

هذا الأمر ينشئ تلقائياً:
- ✅ حساب المدير: `admin@system.com` / `admin123456`
- ✅ شجرة الحسابات المحاسبية الكاملة (29 حساب)
- ✅ إعدادات الشركة الافتراضية

### الطريقة 2: عبر الواجهة

1. افتح [http://localhost:8080](http://localhost:8080)
2. سجّل الدخول بـ: `admin@system.com` / `admin123456`
3. اذهب إلى **إعداد النظام** → **تهيئة البيانات الأساسية**

> ⚠️ **مهم**: غيّر كلمة مرور المدير بعد أول تسجيل دخول.

---

## أوامر التطوير اليومية

```bash
# ═══════════════════════════════════════
# 🟢 بدء العمل
# ═══════════════════════════════════════

# 1. تشغيل Supabase (إذا كان متوقفاً)
cd ~/supabase/docker && docker compose up -d

# 2. تشغيل Edge Functions (في terminal منفصل)
cd ~/YOUR_REPO && supabase functions serve --env-file supabase/.env.local

# 3. تشغيل الواجهة (في terminal آخر)
cd ~/YOUR_REPO && npm run dev

# ═══════════════════════════════════════
# 🔴 إنهاء العمل
# ═══════════════════════════════════════

# إيقاف Supabase
cd ~/supabase/docker && docker compose down

# ═══════════════════════════════════════
# 🔧 أوامر مفيدة
# ═══════════════════════════════════════

# إعادة تشغيل Supabase
cd ~/supabase/docker && docker compose restart

# مشاهدة سجلات قاعدة البيانات
cd ~/supabase/docker && docker compose logs -f supabase-db

# مشاهدة سجلات المصادقة
cd ~/supabase/docker && docker compose logs -f supabase-auth

# الدخول إلى PostgreSQL مباشرة
psql -h localhost -p 5432 -U postgres -d postgres

# نسخة احتياطية يدوية
pg_dump -h localhost -p 5432 -U postgres -Fc postgres > backup_$(date +%Y%m%d).dump

# استعادة نسخة احتياطية
pg_restore -h localhost -p 5432 -U postgres -d postgres --clean backup_YYYYMMDD.dump
```

---

## حل المشاكل الشائعة

### ❌ Docker Desktop لا يبدأ

**السبب**: Virtualization غير مفعّل في BIOS.

**الحل**:
1. أعد تشغيل الجهاز وادخل BIOS (عادةً F2 أو Del)
2. فعّل **Intel VT-x** أو **AMD-V**
3. تأكد من تفعيل WSL2:
   ```powershell
   wsl --set-default-version 2
   ```

---

### ❌ خطأ `connection refused` عند الاتصال بقاعدة البيانات

**الحل**:
```bash
# تأكد أن Docker يعمل
cd ~/supabase/docker && docker compose ps

# تأكد أن supabase-db بحالة Up
# إذا كان بحالة Exit، أعد التشغيل:
docker compose restart supabase-db

# انتظر 10 ثوانٍ ثم جرّب مرة أخرى
```

---

### ❌ Edge Functions لا تعمل

**الحل**:
```bash
# تأكد من تثبيت Supabase CLI
supabase --version

# تأكد من وجود ملف البيئة
cat supabase/.env.local

# تأكد من أن SERVICE_ROLE_KEY صحيح — جرّب:
curl http://localhost:8000/rest/v1/ \
  -H "apikey: ANON_KEY_هنا" \
  -H "Authorization: Bearer ANON_KEY_هنا"
# يجب أن يعود 200 OK
```

---

### ❌ الواجهة لا تتصل بالـ API

**الحل**:
```bash
# تأكد أن .env.local موجود في جذر المشروع
cat .env.local
# يجب أن يحتوي:
# VITE_SUPABASE_URL=http://localhost:8000
# VITE_SUPABASE_PUBLISHABLE_KEY=...

# تأكد أن Kong (API Gateway) يعمل
curl http://localhost:8000
# يجب أن يعود صفحة أو JSON

# أعد تشغيل الواجهة بعد تعديل .env.local
# (Vite يحتاج إعادة تشغيل لقراءة متغيرات البيئة الجديدة)
```

---

### ❌ خطأ `CORS` في المتصفح

**السبب**: عادةً لا يحدث في بيئة Docker المحلية لأن Supabase يسمح بجميع الأصول.

**الحل** إذا حدث:
1. تحقق من أن `SITE_URL` في `~/supabase/docker/.env` مضبوط على `http://localhost:8080`
2. أعد تشغيل Kong:
   ```bash
   cd ~/supabase/docker && docker compose restart supabase-kong
   ```

---

### ❌ تسجيل الدخول يفشل بعد seed-system

**السبب**: `GOTRUE_MAILER_AUTOCONFIRM` غير مفعّل.

**الحل**:
```bash
# تأكد من وجود هذا السطر في ~/supabase/docker/.env:
# GOTRUE_MAILER_AUTOCONFIRM=true

# ثم أعد تشغيل Auth:
cd ~/supabase/docker && docker compose restart supabase-auth
```

---

## هيكل المشروع

```
YOUR_REPO/
├── public/
│   └── full-schema.sql          # بنية قاعدة البيانات الكاملة
├── src/
│   ├── components/              # مكونات React
│   │   ├── auth/                # مكونات المصادقة (ProtectedRoute, RoleGuard)
│   │   ├── layout/              # التخطيط (Sidebar, Breadcrumb)
│   │   └── ui/                  # مكونات shadcn/ui
│   ├── contexts/                # AuthContext, SettingsContext
│   ├── hooks/                   # Custom hooks
│   ├── integrations/supabase/   # client.ts + types.ts (لا تعدّلهما يدوياً)
│   ├── lib/                     # أدوات مساعدة (export, pdf, utils)
│   └── pages/                   # صفحات التطبيق
│       └── reports/             # صفحات التقارير
├── supabase/
│   └── functions/
│       ├── seed-system/         # دالة تهيئة النظام
│       ├── database-backup/     # دالة النسخ الاحتياطي
│       └── _shared/             # ملفات مشتركة (CORS headers)
├── docs/
│   ├── LOCAL_SETUP_GUIDE.md     # ← أنت هنا
│   └── PRODUCTION_DEPLOY_GUIDE.md
├── .env                         # متغيرات Lovable (لا تُستخدم محلياً)
├── .env.local                   # متغيرات البيئة المحلية (أنت تنشئه)
├── package.json
├── vite.config.ts
└── tailwind.config.ts
```
