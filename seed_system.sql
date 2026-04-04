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
) ON CONFLICT (email) DO NOTHING;

-- إنشاء الملف الشخصي
INSERT INTO public.profiles (id, full_name)
SELECT id, 'مدير النظام' FROM auth.users WHERE email = 'admin@system.com'
ON CONFLICT (id) DO UPDATE SET full_name = 'مدير النظام';

-- إسناد دور المدير
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'admin@system.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- إضافة الحسابات المحاسبية (نموذج)
INSERT INTO accounts (code, name, account_type, is_parent, is_system)
SELECT code, name, account_type, is_parent, 
       code IN ('1101','1102','1103','1104','2101','3101','3102','4101','5101') as is_system
FROM (VALUES 
  ('1', 'الأصول', 'asset', true),
  ('11', 'الأصول المتداولة', 'asset', true),
  ('1101', 'الصندوق (النقدية)', 'asset', false),
  ('1102', 'البنك', 'asset', false),
  ('1103', 'العملاء (المدينون)', 'asset', false),
  ('1104', 'المخزون', 'asset', false),
  ('2', 'الخصوم', 'liability', true),
  ('2101', 'الموردون (الدائنون)', 'liability', false),
  ('3', 'حقوق الملكية', 'equity', true),
  ('3101', 'رأس المال', 'equity', false),
  ('3102', 'الأرباح المحتجزة', 'equity', false),
  ('4', 'الإيرادات', 'revenue', true),
  ('4101', 'إيرادات المبيعات', 'revenue', false),
  ('5', 'المصروفات', 'expense', true),
  ('5101', 'تكلفة البضاعة المباعة', 'expense', false)
) AS v(code, name, account_type, is_parent)
ON CONFLICT (code) DO NOTHING;

-- إعدادات الشركة
INSERT INTO company_settings (company_name)
SELECT 'شركتي' WHERE NOT EXISTS (SELECT 1 FROM company_settings);
