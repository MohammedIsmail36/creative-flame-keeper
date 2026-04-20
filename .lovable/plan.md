
## الهدف
توحيد منطق "متوسط سعر الشراء" ليكون **Moving Weighted Average Cost (MWAC) حقيقي** يعكس القيمة الفعلية للمخزون، وتوضيح/توحيد منطق "متوسط سعر البيع".

---

## التحليل المحاسبي الحاسم

### 1) متوسط سعر الشراء (Moving WAC الصحيح)

**المعادلة الصحيحة عملياً:**
```
متوسط الشراء = (إجمالي تكلفة البضاعة الداخلة - إجمالي تكلفة البضاعة المرتجعة للمورد)
              ÷
              (إجمالي الكميات الداخلة - إجمالي الكميات المرتجعة للمورد)
```

**الحركات التي تدخل في الحساب:**
| الحركة | الكمية | التكلفة | يدخل؟ |
|---|---|---|---|
| `opening_balance` | + | + | ✅ نعم |
| `purchase` | + | + | ✅ نعم |
| `purchase_return` | − | − | ✅ نعم (يطرح من البسط والمقام) |
| `sale` | − | (تكلفة خروج) | ❌ لا (لا يغير المتوسط) |
| `sales_return` | + | (تكلفة دخول بنفس متوسط البيع الأصلي) | ❌ لا |
| `adjustment` | ± | ± | ❌ لا (تسوية فيزيائية، ليست شراء) |

**مثالك مطبّقاً:**
- شراء 100 × 50 = 5,000
- شراء 100 × 60 = 6,000 → المتوسط = 11,000 ÷ 200 = **55**
- مرتجع شراء 20 × 60 = 1,200 → المتوسط = 9,800 ÷ 180 = **54.444** ✅

### 2) تكلفة البضاعة المباعة (COGS) الصحيحة

عند ترحيل فاتورة بيع:
- يُحسب `avg_cost = get_avg_purchase_price(product_id)` في **اللحظة الحالية** (بعد كل المشتريات والمرتجعات السابقة).
- COGS للبند = `avg_cost × quantity_sold`
- يُسجَّل في `inventory_movements.unit_cost` كـ snapshot للسعر وقت البيع.

هذا يضمن:
- لو بعت بعد المرتجع في المثال أعلاه، تخرج البضاعة بتكلفة 54.444 وليس 55.
- قيمة المخزون الدفترية تبقى متسقة مع المتوسط.

### 3) مرتجع المبيعات (سياسة متسقة)

عند مرتجع البيع، يجب أن ترجع البضاعة للمخزون **بنفس تكلفة الخروج الأصلية** (من inventory_movements للفاتورة الأصلية)، لا بسعر البيع. هذا موجود تقريباً، لكن سنتأكد منه.

### 4) متوسط سعر البيع (Average Selling Price)

**لا يُحسب من `inventory_movements`** لأن الجدول يخزن **التكلفة** لا **الإيراد**.

المعادلة الصحيحة الموجودة فعلاً في `get_avg_selling_price`:
```sql
SUM(net_total) ÷ SUM(quantity)
FROM sales_invoice_items
WHERE invoice.status = 'posted'
```

**التحسين المطلوب:** خصم مرتجعات البيع لإظهار "صافي متوسط سعر البيع":
```
متوسط البيع الصافي = (Σ net_total الفواتير − Σ net_total المرتجعات)
                    ÷
                    (Σ quantity الفواتير − Σ quantity المرتجعات)
```

---

## التغييرات المطلوبة (Migration واحدة + تعديلات كود)

### A. Database Migration

**1) تحديث `get_avg_purchase_price`:**
```sql
CREATE OR REPLACE FUNCTION public.get_avg_purchase_price(_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT COALESCE(
    CASE 
      WHEN SUM(CASE 
        WHEN movement_type IN ('purchase','opening_balance') THEN quantity
        WHEN movement_type = 'purchase_return' THEN -quantity
        ELSE 0 END) > 0
      THEN SUM(CASE 
        WHEN movement_type IN ('purchase','opening_balance') THEN total_cost
        WHEN movement_type = 'purchase_return' THEN -total_cost
        ELSE 0 END)
        /
        SUM(CASE 
        WHEN movement_type IN ('purchase','opening_balance') THEN quantity
        WHEN movement_type = 'purchase_return' THEN -quantity
        ELSE 0 END)
      ELSE 0 END, 0)
  FROM public.inventory_movements
  WHERE product_id = _product_id
    AND movement_type IN ('purchase','opening_balance','purchase_return')
$$;
```

**2) تحديث `get_avg_selling_price` لخصم المرتجعات:**
```sql
CREATE OR REPLACE FUNCTION public.get_avg_selling_price(_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  WITH sales AS (
    SELECT SUM(si.quantity) AS qty, SUM(si.net_total) AS amt
    FROM sales_invoice_items si
    JOIN sales_invoices s ON s.id = si.invoice_id
    WHERE si.product_id = _product_id AND s.status = 'posted'
  ),
  rets AS (
    SELECT SUM(ri.quantity) AS qty, SUM(COALESCE(ri.total,0)) AS amt
    FROM sales_return_items ri
    JOIN sales_returns r ON r.id = ri.return_id
    WHERE ri.product_id = _product_id AND r.status = 'posted'
  )
  SELECT COALESCE(
    CASE WHEN (COALESCE(s.qty,0) - COALESCE(r.qty,0)) > 0
      THEN (COALESCE(s.amt,0) - COALESCE(r.amt,0)) / (COALESCE(s.qty,0) - COALESCE(r.qty,0))
      ELSE 0 END, 0)
  FROM sales s, rets r
$$;
```

**3) التأكد من ترحيل مرتجع الشراء يسجّل `purchase_return` في `inventory_movements`** (لو غير موجود أضفه — نتحقق أثناء التنفيذ من `post_purchase_return` إن وُجدت، وإلا من كود الواجهة).

### B. تعديلات الكود

**`src/lib/product-utils.ts`:**
- لو فيه دالة `calculateAvgPurchasePrice` تكرار في الواجهة، تتحدث بنفس المنطق (شراء + افتتاحي − مرتجع شراء) لتطابق DB.
- نفس الشيء لـ `calculateAvgSellingPrice`.

**`src/pages/ProductView.tsx`:**
- إضافة Tooltip بجانب بطاقتي "متوسط سعر الشراء" و"متوسط سعر البيع":
  - شراء: "صافي = (المشتريات + الافتتاحي − مرتجعات الشراء) ÷ صافي الكميات"
  - بيع: "صافي = (المبيعات − المرتجعات) ÷ صافي الكميات المباعة"

---

## التأثير على القيود الموجودة

- **القيود السابقة لا تتغير** — التغيير على *الدالة الحاسبة* فقط.
- الفواتير المستقبلية ستستخدم المتوسط الجديد الصحيح تلقائياً عند الترحيل.
- لا حاجة لإعادة احتساب أو ترحيل بأثر رجعي.

---

## ملفات ستُعدَّل

1. **Migration جديدة** — تحديث `get_avg_purchase_price` و `get_avg_selling_price`.
2. `src/lib/product-utils.ts` — مزامنة المنطق مع DB.
3. `src/pages/ProductView.tsx` — Tooltips توضيحية.

---

## ملاحظة مهمة قبل التنفيذ

`post_sales_invoice` يستدعي `get_avg_purchase_price` مرتين (لحساب COGS، ولـ inventory_movement). بعد Migration ستعمل تلقائياً بالمنطق الصحيح بدون تعديل الدالة نفسها — وهذا هو الجمال: تغيير دالة واحدة يُصلح كل سلسلة COGS.

<lov-actions>
<lov-suggestion message="نفّذ الخطة كاملة: Migration لتحديث get_avg_purchase_price و get_avg_selling_price لتأخذ المرتجعات في الحسبان، ومزامنة product-utils.ts وإضافة Tooltips في ProductView.">نفّذ الخطة</lov-suggestion>
<lov-suggestion message="نفّذ فقط تحديث get_avg_purchase_price ليشمل مرتجعات الشراء، واترك get_avg_selling_price كما هو.">نفّذ الجزء المحاسبي فقط (الشراء)</lov-suggestion>
<lov-suggestion message="بعد تنفيذ الخطة، اختبر سيناريو: شراء 100×50 ثم 100×60 ثم مرتجع 20×60 ثم بيع 10 وحدات، وتحقق أن COGS = 544.44 وأن المتوسط = 54.44.">اختبر السيناريو end-to-end</lov-suggestion>
</lov-actions>
