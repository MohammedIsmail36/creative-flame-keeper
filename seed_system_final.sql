-- حذف السجلات القديمة للمستخدم
DELETE FROM public.user_roles WHERE user_id IN (SELECT id FROM auth.users WHERE email = 'admin@system.com');
DELETE FROM public.profiles WHERE id IN (SELECT id FROM auth.users WHERE email = 'admin@system.com');
DELETE FROM auth.users WHERE email = 'admin@system.com';

-- إنشاء حساب المدير
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  confirmation_sent_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, role, aud, confirmation_token
) VALUES (
  gen_random_uuid(), '00000000-0000-0000-0000-000000000000', 'admin@system.com',
  crypt('admin123456', gen_salt('bf')), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"مدير النظام"}', now(), now(), 'authenticated', 'authenticated', ''
);

-- إنشاء الملف الشخصي
INSERT INTO public.profiles (id, full_name)
SELECT id, 'مدير النظام' FROM auth.users WHERE email = 'admin@system.com';

-- إسناد دور المدير
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'admin@system.com';

-- إضافة الحسابات المحاسبية (حذف الموجود أولاً)
DELETE FROM accounts WHERE code IN ('1','11','1101','1102','1103','1104','2','2101','3','3101','3102','4','4101','5','5101');

INSERT INTO accounts (code, name, account_type, is_parent, parent_id) VALUES
  ('1', 'الأصول', 'asset', true, NULL),
  ('11', 'الأصول المتداولة', 'asset', true, (SELECT id FROM accounts WHERE code = '1')),
  ('1101', 'الصندوق (النقدية)', 'asset', false, (SELECT id FROM accounts WHERE code = '11')),
  ('1102', 'البنك', 'asset', false, (SELECT id FROM accounts WHERE code = '11')),
  ('1103', 'العملاء (المدينون)', 'asset', false, (SELECT id FROM accounts WHERE code = '11')),
  ('1104', 'المخزون', 'asset', false, (SELECT id FROM accounts WHERE code = '11')),
  ('2', 'الخصوم', 'liability', true, NULL),
  ('2101', 'الموردون (الدائنون)', 'liability', false, (SELECT id FROM accounts WHERE code = '2')),
  ('3', 'حقوق الملكية', 'equity', true, NULL),
  ('3101', 'رأس المال', 'equity', false, (SELECT id FROM accounts WHERE code = '3')),
  ('3102', 'الأرباح المحتجزة', 'equity', false, (SELECT id FROM accounts WHERE code = '3')),
  ('4', 'الإيرادات', 'revenue', true, NULL),
  ('4101', 'إيرادات المبيعات', 'revenue', false, (SELECT id FROM accounts WHERE code = '4')),
  ('5', 'المصروفات', 'expense', true, NULL),
  ('5101', 'تكلفة البضاعة المباعة', 'expense', false, (SELECT id FROM accounts WHERE code = '5'));

-- إعدادات الشركة
DELETE FROM company_settings;
INSERT INTO company_settings (company_name) VALUES ('شركتي');

-- عرض النتيجة
SELECT '✅ تم تهيئة النظام بنجاح' as status;
