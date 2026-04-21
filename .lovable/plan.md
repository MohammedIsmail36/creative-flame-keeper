

## الخطة المصححة — متوسط سعر البيع باستخدام صافي المبيعات وصافي المرتجعات

### تصحيح الفهم
كنت محقاً تماماً. صافي المبيعات بعد الخصم هو الصحيح محاسبياً (لأن العميل دفع فعلياً 5850 وليس 5950). إذن:

- **النتيجة الحالية (97):** صحيحة من جانب المبيعات (تستخدم net_total) لكنها **غير متماثلة** لأن المرتجعات تستخدم `total` بدون خصم.
- **المشكلة الحقيقية:** عندما يكون للمرتجع نفسه خصم (سطر أو إجمالي)، الدالة تطرح المرتجع بقيمته الإجمالية بدل الصافي → نتيجة منحرفة لأعلى.

### الحل الاحترافي الصحيح
توحيد المنطق بحيث **يُحسب كل من المبيعات والمرتجعات على أساس الصافي بعد الخصم.**

---

## ما سيتم تنفيذه

### 1) Migration — قاعدة البيانات

**أ. إضافة عمود `net_total` لجداول المرتجعات** (لتطابق فواتير البيع/الشراء):
- `sales_return_items.net_total numeric NOT NULL DEFAULT 0`
- `purchase_return_items.net_total numeric NOT NULL DEFAULT 0` (للاتساق المستقبلي)

**ب. Backfill للبيانات الموجودة:**
لكل مرتجع موجود، يُحسب `net_total` لكل سطر بنفس قاعدة الفواتير:
```text
line.net_total = line.total − (line.total / sum(items.total)) × header.discount
```
في حالة عدم وجود خصم على المرتجع: `net_total = total`.

**ج. تحديث `get_avg_selling_price`:**
```sql
WITH sales AS (
  SELECT SUM(si.quantity) qty, SUM(si.net_total) amt
  FROM sales_invoice_items si
  JOIN sales_invoices s ON s.id = si.invoice_id
  WHERE si.product_id = _product_id AND s.status = 'posted'
),
rets AS (
  SELECT SUM(ri.quantity) qty, SUM(ri.net_total) amt   -- ← التغيير الوحيد
  FROM sales_return_items ri
  JOIN sales_returns r ON r.id = ri.return_id
  WHERE ri.product_id = _product_id AND r.status = 'posted'
)
SELECT (sales.amt - rets.amt) / NULLIF(sales.qty - rets.qty, 0)
FROM sales, rets;
```

### 2) كود التطبيق — تعبئة net_total عند إنشاء/ترحيل المرتجعات

**ملفات تحتاج تعديل:**
- `src/pages/SalesReturnForm.tsx` — حساب net_total لكل سطر عند الحفظ (نفس منطق `SalesInvoiceForm`).
- `src/pages/PurchaseReturnForm.tsx` — نفس الشيء.

**المنطق:**
عند الحفظ، توزيع `discount` العام للمرتجع نسبياً على أسطر الـ `total` لإنتاج `net_total` لكل سطر — مطابق 100% لمنطق الفواتير الموجود (`mem://features/sales-invoice-discount-logic`).

### 3) التقارير المتأثرة (تحقق فقط)
- `ProductView.tsx` — يستخدم RPC مباشرة، سيستفيد تلقائياً.
- تقارير المبيعات/التحليلات التي تستخدم `net_total` للمرتجعات (إن وُجدت) ستصبح أكثر دقة.

---

## التحقق بعد التنفيذ

| المنتج | قبل | بعد |
|--------|-----|-----|
| PRD-001 (مرتجع بدون خصم) | 97.00 | 97.00 ✅ (لا تغيير) |
| منتج بمرتجع فيه خصم 10% | منحرف لأعلى | يعكس الصافي الفعلي ✅ |

**استعلام تحقق:**
```sql
SELECT p.code,
  get_avg_selling_price(p.id) AS avg_price,
  -- مقارنة يدوية:
  (SELECT SUM(net_total) FROM sales_invoice_items si JOIN sales_invoices s ON s.id=si.invoice_id 
   WHERE si.product_id=p.id AND s.status='posted') AS sales_net,
  (SELECT SUM(net_total) FROM sales_return_items ri JOIN sales_returns r ON r.id=ri.return_id 
   WHERE ri.product_id=p.id AND r.status='posted') AS returns_net
FROM products p WHERE p.code='PRD-001';
```

---

## الملفات النهائية

**Migration جديدة (1):**
- إضافة `net_total` لـ `sales_return_items` + `purchase_return_items`
- Backfill للبيانات القديمة بالصيغة المتناسبة
- تحديث دالة `get_avg_selling_price`

**كود معدّل (2):**
- `src/pages/SalesReturnForm.tsx` — حساب net_total عند الحفظ
- `src/pages/PurchaseReturnForm.tsx` — حساب net_total عند الحفظ

**لا تعديل في:** `ProductView.tsx`، التقارير، أو منطق GL (لأن `net_total` المرتجع لا يؤثر على القيود — القيود تستخدم `total`).

---

## ضمان عدم الكسر
- الحقل الجديد NOT NULL DEFAULT 0 + Backfill فوري → لا أسطر بدون قيمة.
- المرتجعات التي بلا خصم: `net_total = total` → سلوك محاسبي مطابق للحالي.
- لا تغيير في القيود اليومية، الأرصدة، أو حسابات GL.
- التغيير الوحيد المرئي: متوسط سعر البيع يصبح **أكثر دقة** للمنتجات التي مرّت بمرتجع فيه خصم.

