# دليل التثبيت على البيئة المحلية (Windows / WSL)

هذا الدليل يشرح كيفية تشغيل النظام المحاسبي بالكامل على جهازك المحلي للتطوير والاختبار.

---

## المتطلبات

| المكون | الإصدار المطلوب | رابط التحميل |
|--------|----------------|-------------|
| Windows 10/11 | 64-bit | — |
| WSL2 | Ubuntu 22.04+ | `wsl --install` |
| Docker Desktop | v4.25+ | https://docs.docker.com/desktop/install/windows-install/ |
| Node.js | v18+ (يفضل v20 LTS) | https://nodejs.org/ |
| Git | أحدث إصدار | https://git-scm.com/download/win |
| Supabase CLI | أحدث إصدار | `npm install -g supabase` |

---

## الخطوة 1: تفعيل WSL2 و Docker

### 1.1 تثبيت WSL2

افتح PowerShell كمسؤول:

```powershell
wsl --install
```

بعد إعادة التشغيل، تأكد من التثبيت:

```powershell
wsl --list --verbose
```

يجب أن ترى Ubuntu بإصدار WSL 2.

### 1.2 تثبيت Docker Desktop

1. حمّل Docker Desktop من الرابط أعلاه
2. أثناء التثبيت، فعّل خيار **"Use WSL 2 based engine"**
3. بعد التثبيت، افتح Docker Desktop → Settings → Resources → WSL Integration
4. فعّل Ubuntu

تأكد من عمل Docker:

```bash
docker --version
docker compose version
```

---

## الخطوة 2: استنساخ المشروع

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

> **ملاحظة**: استبدل `YOUR_USERNAME/YOUR_REPO` باسم المستودع الفعلي من GitHub.

---

## الخطوة 3: إعداد Supabase Docker محلياً

### 3.1 تحميل Supabase Docker

```bash
# في مجلد منفصل عن المشروع
cd ~
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
```

### 3.2 إعداد متغيرات البيئة

```bash
cp .env.example .env
```

افتح الملف `.env` وعدّل القيم التالية:

```env
############
# Secrets
############
POSTGRES_PASSWORD=your_strong_password_here
JWT_SECRET=your-super-secret-jwt-token-with-at-least-32-characters-long
ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

############
# General
############
SITE_URL=http://localhost:8080
STUDIO_DEFAULT_ORGANIZATION=My Company
STUDIO_DEFAULT_PROJECT=Accounting System
```

### 3.3 توليد مفاتيح JWT

استخدم الأداة على https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys

أو عبر الأمر (يحتاج Node.js):

```bash
# توليد ANON_KEY
node -e "
const jwt = require('jsonwebtoken');
const payload = { role: 'anon', iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + (10*365*24*60*60) };
console.log(jwt.sign(payload, 'YOUR_JWT_SECRET'));
"

# توليد SERVICE_ROLE_KEY
node -e "
const jwt = require('jsonwebtoken');
const payload = { role: 'service_role', iss: 'supabase', iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000) + (10*365*24*60*60) };
console.log(jwt.sign(payload, 'YOUR_JWT_SECRET'));
"
```

> **ملاحظة**: ثبّت jsonwebtoken أولاً: `npm install -g jsonwebtoken`

### 3.4 تشغيل Supabase

```bash
docker compose up -d
```

تأكد من تشغيل جميع الحاويات:

```bash
docker compose ps
```

يجب أن ترى الخدمات التالية تعمل:
- `supabase-db` (PostgreSQL) — المنفذ 5432
- `supabase-kong` (API Gateway) — المنفذ 8000
- `supabase-auth` (GoTrue) — المنفذ 9999
- `supabase-rest` (PostgREST)
- `supabase-storage`
- `supabase-studio` — المنفذ 8000 (لوحة التحكم)

**الوصول إلى لوحة التحكم**: http://localhost:8000

---

## الخطوة 4: إنشاء قاعدة البيانات

### 4.1 تطبيق الـ Schema

```bash
# من مجلد المشروع الأصلي
psql -h localhost -p 5432 -U postgres -d postgres -f public/full-schema.sql
```

أو عبر Supabase Studio:
1. افتح http://localhost:8000
2. اذهب إلى SQL Editor
3. انسخ محتوى `public/full-schema.sql` وقم بتنفيذه

### 4.2 التحقق من الجداول

```bash
psql -h localhost -p 5432 -U postgres -d postgres -c "\dt public.*"
```

يجب أن ترى 22+ جدول تشمل:

```
accounts, company_settings, customers, suppliers, products,
sales_invoices, sales_invoice_items, purchase_invoices, purchase_invoice_items,
sales_returns, sales_return_items, purchase_returns, purchase_return_items,
customer_payments, supplier_payments, customer_payment_allocations,
supplier_payment_allocations, journal_entries, journal_entry_lines,
expenses, expense_types, inventory_movements, inventory_adjustments,
inventory_adjustment_items, product_categories, product_brands,
product_units, product_images, profiles, user_roles,
sales_invoice_return_settlements, purchase_invoice_return_settlements,
sales_return_payment_allocations, purchase_return_payment_allocations
```

---

## الخطوة 5: تعديلات الكود

### 5.1 إزالة lovable-tagger

```bash
cd ~/YOUR_REPO
npm uninstall lovable-tagger
```

### 5.2 تعديل `vite.config.ts`

استبدل المحتوى بـ:

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

أنشئ ملف `.env.local` في جذر المشروع:

```env
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=<ANON_KEY الذي ولّدته في الخطوة 3.3>
```

### 5.4 تثبيت التبعيات

```bash
npm install
```

---

## الخطوة 6: نشر Edge Functions محلياً

### 6.1 إعداد ملف بيئة الدوال

أنشئ ملف `supabase/.env.local`:

```env
SUPABASE_URL=http://localhost:8000
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY الذي ولّدته في الخطوة 3.3>
SUPABASE_ANON_KEY=<ANON_KEY الذي ولّدته في الخطوة 3.3>
```

### 6.2 تشغيل الدوال

```bash
supabase functions serve --env-file supabase/.env.local
```

الدوال المتوفرة:
- `seed-system` — تهيئة النظام (إنشاء المدير + شجرة الحسابات + إعدادات الشركة)
- `database-backup` — تصفير قاعدة البيانات وإعادة البناء

---

## الخطوة 7: تشغيل الواجهة

```bash
npm run dev
```

الواجهة متاحة على: **http://localhost:8080**

---

## الخطوة 8: تهيئة النظام

### الطريقة 1: عبر الواجهة

1. افتح http://localhost:8080
2. سجّل الدخول بـ: `admin@system.com` / `admin123456`
3. اذهب إلى **إعداد النظام** → **تهيئة البيانات الأساسية**

### الطريقة 2: عبر سطر الأوامر

```bash
curl -X POST http://localhost:54321/functions/v1/seed-system \
  -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
  -H "Content-Type: application/json"
```

---

## أوامر التطوير اليومية

```bash
# تشغيل Supabase (إذا كان متوقفاً)
cd ~/supabase/docker && docker compose up -d

# تشغيل Edge Functions
cd ~/YOUR_REPO && supabase functions serve --env-file supabase/.env.local

# تشغيل الواجهة (في terminal منفصل)
cd ~/YOUR_REPO && npm run dev

# إيقاف Supabase
cd ~/supabase/docker && docker compose down

# إعادة تشغيل Supabase
cd ~/supabase/docker && docker compose restart

# مشاهدة logs
cd ~/supabase/docker && docker compose logs -f supabase-db
```

---

## حل المشاكل الشائعة

### Docker Desktop لا يبدأ
- تأكد من تفعيل **Virtualization** في BIOS
- تأكد من تفعيل WSL2: `wsl --set-default-version 2`

### خطأ في الاتصال بقاعدة البيانات
- تأكد من أن Docker يعمل: `docker compose ps`
- تأكد من صحة `POSTGRES_PASSWORD` في `.env`

### Edge Functions لا تعمل
- تأكد من تثبيت Supabase CLI: `supabase --version`
- تأكد من صحة `SERVICE_ROLE_KEY` في `supabase/.env.local`

### الواجهة لا تتصل بالـ API
- تأكد من أن `VITE_SUPABASE_URL` في `.env.local` يشير إلى `http://localhost:8000`
- تأكد من أن Supabase يعمل على المنفذ 8000

### مشكلة CORS
- Supabase Docker يسمح بجميع الأصول افتراضياً في بيئة التطوير
- إذا واجهت مشكلة، تحقق من إعدادات Kong في `docker/volumes/api/kong.yml`
