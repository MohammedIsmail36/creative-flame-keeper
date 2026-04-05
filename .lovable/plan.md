

# إضافة خصم على مستوى الفاتورة (فواتير المبيعات فقط)

## ملخص
إضافة نوع ثاني من الخصم (خصم إجمالي على الفاتورة) مع قيد أنه لا يمكن الجمع بين خصم السطر وخصم الفاتورة في نفس الفاتورة. يتم حساب نسبة خصم الفاتورة تلقائياً وتخزينها في عمود `net_total` لكل سطر للاستفادة منها لاحقاً في المرتجعات.

## قاعدة أساسية
- إذا أدخل المستخدم خصم على أي سطر → يُقفل حقل خصم الفاتورة
- إذا أدخل المستخدم خصم فاتورة → تُقفل حقول خصم السطور
- لا يمكن الجمع بين النوعين في نفس الفاتورة

## التغييرات المطلوبة

### 1. Migration — إضافة عمود `net_total`
```sql
ALTER TABLE sales_invoice_items ADD COLUMN net_total numeric NOT NULL DEFAULT 0;
UPDATE sales_invoice_items SET net_total = total WHERE net_total = 0;
```
عمود `discount` موجود بالفعل في `sales_invoices` (حالياً يُحفظ دائماً 0) — سنستخدمه لخصم الفاتورة.

### 2. تحديث `SalesInvoiceForm.tsx`

**State جديد:**
- `invoiceDiscount` — قيمة الخصم الإجمالي (رقم)
- `discountMode` — محسوب تلقائياً: `'line'` إذا وُجد خصم سطر، `'invoice'` إذا وُجد خصم فاتورة، `'none'` إذا لا يوجد خصم

**حسابات:**
```text
subtotal       = Σ (quantity × unit_price - line_discount)   ← كما هو
afterDiscount  = subtotal - invoiceDiscount
taxAmount      = afterDiscount × taxRate (إذا مفعّل)
grandTotal     = afterDiscount + taxAmount
```

**حساب net_total لكل سطر (عند الحفظ):**
```text
إذا كان خصم فاتورة:
  discountPercent = invoiceDiscount / subtotal
  net_total = total - (total × discountPercent)    // = total × (1 - discountPercent)
إذا كان خصم سطر:
  net_total = total    // (الخصم مطبق بالفعل في total)
```

**واجهة المستخدم:**
- إضافة حقل "خصم إجمالي على الفاتورة" في قسم ملخص الفاتورة
- يُعطَّل إذا كان هناك أي خصم سطر > 0
- حقول خصم السطور تُعطَّل إذا كان خصم الفاتورة > 0
- عرض نسبة الخصم المحسوبة تلقائياً بجانب الحقل

**الحفظ:**
- حفظ `invoiceDiscount` في `sales_invoices.discount`
- حفظ `net_total` لكل سطر في `sales_invoice_items.net_total`

**التحميل:**
- قراءة `discount` من الفاتورة وتعيينه لـ `invoiceDiscount`

**الاعتماد (postInvoice):**
- `grandTotal` يُحسب بعد خصم الفاتورة — القيد المحاسبي يستخدمه تلقائياً
- COGS لا يتغير (يبقى = متوسط سعر الشراء × الكمية)

### 3. تحديث دالة `get_avg_selling_price`
```sql
CREATE OR REPLACE FUNCTION get_avg_selling_price(_product_id uuid)
RETURNS numeric AS $$
  SELECT COALESCE(
    CASE WHEN SUM(si.quantity) > 0 
    THEN SUM(si.net_total) / SUM(si.quantity) 
    ELSE 0 END, 0)
  FROM sales_invoice_items si
  JOIN sales_invoices s ON s.id = si.invoice_id
  WHERE si.product_id = _product_id AND s.status = 'posted'
$$ LANGUAGE sql STABLE;
```

### 4. تحديث طباعة PDF (`pdf-arabic.ts`)
- عرض سطر "خصم إجمالي" في ملخص الفاتورة إذا كانت قيمته > 0
- تمرير `invoiceDiscount` ضمن بيانات الطباعة

## ما لا يتغير
- المرتجعات (`SalesReturnForm.tsx`) — بدون أي تعديل
- فواتير المشتريات — مرحلة لاحقة
- COGS — يبقى = متوسط سعر الشراء × الكمية

## الملفات المتأثرة
| الملف | التعديل |
|---|---|
| Migration جديد | `net_total` + تحديث البيانات + تعديل الدالة |
| `SalesInvoiceForm.tsx` | خصم فاتورة + قفل متبادل + حساب net_total |
| `pdf-arabic.ts` | عرض خصم الفاتورة |

