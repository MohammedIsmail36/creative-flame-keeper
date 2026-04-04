# النظام المحاسبي - تشغيل محلي بالكامل

هذا المشروع مهيأ ليعمل محليًا بالكامل داخل `Windows + WSL` بدون الاعتماد على أي منصة سحابية أثناء التشغيل.

## تشغيل سريع

1. تشغيل Supabase المحلي:

```bash
cd ~/creative-flame-keeper
npx --yes supabase@latest start
```

2. إعداد متغيرات البيئة المحلية:

- `.env.local`

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_ضع_المفتاح_المحلي_هنا
```

- `supabase/.env.local`

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=sb_secret_ضع_المفتاح_المحلي_هنا
```

3. تشغيل Edge Functions (عند الحاجة):

```bash
npx --yes supabase@latest functions serve --env-file supabase/.env.local
```

4. تشغيل الواجهة:

```bash
npm install
npm run dev
```

## التوثيق المحلي

- [LOCAL_SETUP_GUIDE.md](docs/LOCAL_SETUP_GUIDE.md)

## ملاحظة للعمل بدون إنترنت

بعد تنزيل الاعتمادات والصور لأول مرة (`node_modules` و Docker images)، يمكن تشغيل النظام محليًا بدون إنترنت.