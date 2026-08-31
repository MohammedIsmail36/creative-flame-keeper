# خطة النشر (Deployment Workflow)

دليل موحّد لسحب تعديلات المستودع ودمجها مع التعديلات اليدوية على السيرفير، ثم البناء والنشر لكل من **Farida** و **Alibea**، وتطبيق ميجريشن قواعد البيانات.

---

## 0) الطريقة السريعة — سكربت واحد لكل شيء ⭐

يقوم بكل الخطوات أدناه تلقائياً: سحب التحديثات (مع حفظ تعديلاتك المحلية)، الميجريشن، نشر Edge Functions لكل شركة، ثم البناء والنشر للشركتين.

```bash
cd /opt/accounting-app
git pull                                  # أول مرة فقط لجلب السكربت
chmod +x scripts/deploy-all.sh
./scripts/deploy-all.sh
```

خيارات:

```bash
./scripts/deploy-all.sh --baseline-db        # أول مرة على قاعدة بيانات قائمة
./scripts/deploy-all.sh --skip-db            # بدون ميجريشن
./scripts/deploy-all.sh --skip-functions     # بدون نشر Edge Functions
./scripts/deploy-all.sh --only farida        # شركة واحدة فقط (farida | alibea)
./scripts/deploy-all.sh --no-pull            # بناء ونشر بدون سحب تحديثات
```

ملاحظات:
- إن حدث تعارض عند إعادة تطبيق تعديلاتك المحلية، يتوقف السكربت ويطبع الأوامر اللازمة لحلّه.
- مسارات Supabase المستخدمة: `/opt/supabase-farida` و `/opt/supabase-alibea`. يكتشف السكربت تلقائياً مسار الـ volume المركّب فعلياً على `/home/deno/functions`، ثم ينسخ الدوال ويعيد تشغيل خدمة `functions`.
- يتضمن المستودع `main/index.ts` الخاص براوتر الدوال، ويتحقق السكربت من ظهوره وظهور `telegram-publish/index.ts` داخل الحاوية قبل إعلان نجاح النشر.

باقي الملف يشرح نفس الخطوات يدوياً إن أردت التحكم خطوة بخطوة.

---

## 1) قبل البدء — تحقق سريع

```bash
cd /opt/accounting-app
git status
```

- إن كانت هناك ملفات معدّلة يدوياً: تابع الخطوة 2.
- إن لم توجد تعديلات محلية: انتقل مباشرة إلى الخطوة 3.

---

## 2) حفظ التعديلات المحلية ثم سحب آخر التحديثات

يحفظ تعديلاتك في `stash`، يسحب آخر تحديث، ثم يعيد تطبيق تعديلاتك.

```bash
cd /opt/accounting-app && \
git add -A && \
git stash push -m "local-$(date +%F-%H%M)" && \
git pull --rebase && \
(git stash list | grep -q "local-" && git stash pop || echo "لا توجد تعديلات محلية")
```

### في حالة تعارض بعد `stash pop`
1. افتح الملفات المتعارضة وحُلّ التعارض يدوياً.
2. ثم:
   ```bash
   git add -A
   git stash drop   # لإزالة الـ stash بعد التأكد من الدمج
   ```

---

## 3) تطبيق ميجريشن قواعد البيانات (إن وُجدت)

```bash
cd /opt/accounting-app
chmod +x scripts/migrate-all-companies.sh

# أول مرة فقط بعد استعادة قاعدة قائمة (baseline):
./scripts/migrate-all-companies.sh --baseline-current

# مع كل pull جديد فيه ميجريشن:
./scripts/migrate-all-companies.sh
```

> يطبق السكربت الميجريشن على كل الشركات (Farida و Alibea) تلقائياً.

---

## 4) البناء والنشر

بعد الخطوة 2 لا حاجة لتكرار `git pull` داخل أوامر البناء.

### Farida

```bash
cd /opt/accounting-app && npm ci && \
VITE_SUPABASE_URL=https://farida.alibea2020.com/api \
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3ODI3MzUzLCJleHAiOjE5MzU1MDczNTN9.GVy4C3BeFpkOt34tfqei-T0WksgRzHzpWJo1Arf3_8s \
npm run build && \
sudo rm -rf /var/www/farida/* && \
sudo cp -r dist/* /var/www/farida/ && \
sudo chown -R www-data:www-data /var/www/farida && \
echo "✅ Farida deployed"
```

### Alibea

```bash
cd /opt/accounting-app && npm ci && \
VITE_SUPABASE_URL=https://alibea.alibea2020.com/api \
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3ODM0NTgyLCJleHAiOjE5MzU1MTQ1ODJ9.P4Rwco5JtcyiWy0CMhDQxXmQr2j-lqEg06bzLeuDmQk \
npm run build && \
sudo rm -rf /var/www/alibea/* && \
sudo cp -r dist/* /var/www/alibea/ && \
sudo chown -R www-data:www-data /var/www/alibea && \
echo "✅ Alibea deployed"
```

> يمكن نشر الاثنين بالتتابع في نفس الجلسة. `npm ci` في الأمر الثاني سريع لأن الحزم مثبتة سلفاً.

---

## 5) تسلسل النشر الكامل (Checklist)

1. `git status` — رؤية الحالة.
2. أمر الحفظ + السحب (الخطوة 2).
3. تشغيل الميجريشن (الخطوة 3) — فقط إن كان الـ pull أضاف ملفات ميجريشن جديدة.
4. بناء ونشر Farida.
5. بناء ونشر Alibea.
6. فتح الموقعين والتأكد من ظهور التحديثات (Ctrl+F5 لتجاوز الكاش).

---

## 6) مشاكل شائعة وحلولها

### `npm ci` يفشل بسبب `package-lock.json`
- تأكد أن الملف `package-lock.json` موجود في المستودع بعد الـ pull.
- هذا المشروع يعتمد على `npm ci` في السيرفير، لذلك لا تعتمد على `bun.lock` في النشر.
- لا تعدّل `package.json` يدوياً على السيرفير — استخدم `npm install <pkg>` محلياً وارفع `package-lock.json` مع التغيير.

### VS Code لا يتعرف على أنواع TypeScript الجديدة بعد الميجريشن
```
Ctrl+Shift+P → TypeScript: Restart TS Server
```

### تعارض في `git stash pop`
- حل التعارض يدوياً في المحرر.
- `git add -A` ثم `git stash drop`.

---

## 7) ملاحظات أمان

- لا تشارك `VITE_SUPABASE_PUBLISHABLE_KEY` خارج هذا الملف علناً — رغم أنه مفتاح عام (anon) إلا أن الأفضل بقاؤه ضمن أدوات النشر فقط.
- `service_role key` لا يوضع أبداً في أوامر البناء أو الواجهة الأمامية.
- الحماية الفعلية للبيانات تعتمد على **RLS Policies** في قاعدة البيانات.

---

## 8) تحقق بعد الميجريشن (مهم للتحديث الأخير)

التحديث الأخير أضاف دوال تقارير المخزون وإعدادات المخزون. بعد تشغيل الميجريشن تأكد من وجودها في كل شركة:

```bash
for c in farida-db alibea-db; do
  echo "== $c"
  docker exec -i $c psql -U postgres -d postgres -tAc "
    SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND proname IN (
      'get_inventory_valuation','get_inventory_aging','get_inventory_reorder',
      'get_inventory_kpis','inventory_product_state','inventory_signed_quantity',
      'get_account_balances','get_ledger_lines'
    ) ORDER BY 1;"
  docker exec -i $c psql -U postgres -d postgres -tAc "
    SELECT count(*) AS inventory_settings_columns FROM information_schema.columns
    WHERE table_name='company_settings' AND column_name LIKE 'inventory%';"
done
```

المتوقع: ظهور الدوال الثمانية، والعدد `5` لأعمدة إعدادات المخزون.

> ملف الميجريشن `20260831190000_inventory_reports_catchup.sql` **آمن للتكرار** (Idempotent): يستخدم
> `ADD COLUMN IF NOT EXISTS` و `DROP FUNCTION IF EXISTS` قبل إعادة الإنشاء، ويعيد ضبط صلاحيات
> التنفيذ (`authenticated`, `service_role` فقط) بعد الإنشاء.

### إن ظهرت أخطاء RPC في الشاشات (404 / function does not exist)
معناها أن الميجريشن لم يُطبّق على تلك الشركة:

```bash
cd /opt/accounting-app
./scripts/migrate-all-companies.sh
```
