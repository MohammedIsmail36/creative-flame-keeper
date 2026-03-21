

# إنشاء دليلين للاستضافة الذاتية

## الملف الأول: `LOCAL_SETUP_GUIDE.md`
دليل التثبيت على البيئة المحلية (Windows/WSL) يشمل:
- تثبيت المتطلبات (Docker Desktop، WSL2، Node.js، Supabase CLI)
- إعداد Supabase Docker محلياً
- تطبيق الـ schema وإنشاء قاعدة البيانات
- تعديلات الكود (إزالة lovable-tagger، إعداد .env.local)
- نشر Edge Functions محلياً
- تهيئة النظام وتشغيله
- أوامر التطوير اليومية

## الملف الثاني: `PRODUCTION_DEPLOY_GUIDE.md`
دليل الرفع على سيرفر DigitalOcean يشمل:
- إنشاء Droplet مناسب (المواصفات الموصى بها)
- إعداد السيرفر (Docker، Firewall، مستخدم غير root)
- نشر Supabase Docker بإعدادات إنتاجية
- بناء الواجهة ورفعها
- إعداد Nginx + SSL (Let's Encrypt)
- نشر Edge Functions
- إعداد النسخ الاحتياطي التلقائي (pg_dump + cron)
- أوامر الصيانة والمراقبة
- قائمة فحص الأمان

كلا الملفين سيكونان بصيغة Markdown مع أوامر جاهزة للنسخ والتنفيذ، مخصصة لهذا المشروع تحديداً (أسماء الجداول، Edge Functions، الإعدادات).

