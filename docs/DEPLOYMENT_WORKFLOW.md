# خطة النشر (Deployment Workflow)

دليل موحّد لسحب تعديلات Lovable ودمجها مع التعديلات اليدوية على السيرفير، ثم البناء والنشر لكل من **Farida** و **Alibea**، وتطبيق ميجريشن قواعد البيانات.

---

## 1) قبل البدء — تحقق سريع

```bash
cd /opt/accounting-app
git status
```

- إن كانت هناك ملفات معدّلة يدوياً: تابع الخطوة 2.
- إن لم توجد تعديلات محلية: انتقل مباشرة إلى الخطوة 3.

---

## 2) حفظ التعديلات المحلية ثم سحب تعديلات Lovable

يحفظ تعديلاتك في `stash`، يزيل الملفات المؤقتة التي قد تسبب تعارضاً (`.lovable/`)، يسحب آخر تحديث، ثم يعيد تطبيق تعديلاتك.

```bash
cd /opt/accounting-app && \
git add -A && \
git stash push -m "local-$(date +%F-%H%M)" && \
rm -rf .lovable && \
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

### `untracked files would be overwritten` (مثل `.lovable/plan.md`)
```bash
cd /opt/accounting-app && rm -rf .lovable && git stash pop && git pull
```

### `npm ci` يفشل بسبب اختلاف `package-lock.json`
- تأكد أن الـ pull تم بنجاح.
- لا تعدّل `package.json` يدوياً على السيرفير — التعديلات تأتي من Lovable مع `package-lock.json` متطابق.

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
