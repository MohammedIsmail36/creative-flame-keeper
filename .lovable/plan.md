
# خطة نهائية: نظام نقاط الولاء (MVP)

ملاحظتاك الجديدتان مقبولتان ومدمجتان.

## الفكرة
كل عملية بيع تكسب العميل نقاطاً، والنقاط تُستبدل كخصم تناسبي على فاتورة لاحقة.

## مثال
- كل **10 ج.م** مبيعات = **1 نقطة**
- كل **100 نقطة** = **5 ج.م** → قيمة النقطة = **0.05 ج.م**

---

## القرارات المضافة في هذه النسخة

### ١) الاكتساب على القيمة **قبل** خصم الولاء ✅
السلوك المعتمد: العميل يكسب نقاطاً على ما دفعه فعلياً (شامل قيمة النقاط المستبدلة، لأنها كانت مكسباً سابقاً).

```
earning_base = net_total + loyalty_discount
points_earned = floor(earning_base / loyalty_egp_per_point)
```

**مثال:** فاتورة قيمتها 200، استُبدل 50 نقطة (2.50 ج.م خصم) → `net_total = 197.50`
- earning_base = 197.50 + 2.50 = 200
- points_earned = floor(200 / 10) = **20 نقطة** ✅

هذا يطبَّق أيضاً على الخصومات الأخرى؟ **لا** — فقط `loyalty_discount` يُضاف للقاعدة. الخصم اليدوي (سطر أو إجمالي) يبقى مخفّضاً للقاعدة كالمعتاد، لأن العميل لم يدفعه فعلياً.

### ٢) سقف الاستبدال لا يتجاوز قيمة الفاتورة ✅
في حوار الاستبدال:
```
point_value = loyalty_redeem_value / loyalty_points_per_redeem
max_by_invoice = floor(invoice_total_before_loyalty / point_value)
max_redeemable = min(customer_points, max_by_invoice)
```
الشريط المنزلق والحقل الرقمي يحترمان `max_redeemable`.

**مثال:** عميل 10,000 نقطة، فاتورة 50 ج.م → max_by_invoice = floor(50 / 0.05) = 1000 → max_redeemable = **1000 نقطة فقط** (= 50 ج.م خصم كامل).

كذلك validation في الـ RPC يرفض الترحيل إذا `loyalty_discount > invoice_total_before_loyalty`.

---

## القرارات السابقة المثبّتة
- **استبدال تناسبي**: أي عدد نقاط من 1 إلى max، القيمة = `points × point_value`.
- **مرتجع جزئي**: `points_to_reverse = floor(returned_net / egp_per_point)`.
- **إعادة النقاط المستبدلة عند المرتجع**: تناسبية مع نسبة المرتجع.
- **فلتر تاريخ** في صفحة `/loyalty`.

---

## ملخص معادلات الترحيل (مرجع سريع)

```text
عند ترحيل فاتورة مبيعات:
  loyalty_discount        = points_redeemed × point_value
  net_total               = pre-loyalty totals − loyalty_discount
  earning_base            = net_total + loyalty_discount
  points_earned           = floor(earning_base / egp_per_point)
  customer.points        += points_earned − points_redeemed

عند ترحيل مرتجع مبيعات:
  points_reversed         = floor(returned_net / egp_per_point)
  points_redeem_refunded  = round(invoice.points_redeemed × returned_net / invoice.net_total)
  customer.points        += points_redeem_refunded − points_reversed
```

---

## التغييرات على القاعدة (بدون تعديل)

- `company_settings`: 4 أعمدة جديدة.
- `customers`: عمود `loyalty_points`.
- `sales_invoices`: عمودا `loyalty_points_redeemed` و `loyalty_discount`.
- جدول جديد `loyalty_transactions` + RLS + GRANTs.
- تحديث `post_sales_invoice` و `post_sales_return` بالمعادلات أعلاه.

---

## واجهة المستخدم (بدون تعديل)

- فاتورة المبيعات: بطاقة نقاط + حوار استبدال (شريط منزلق محدود بـ `max_redeemable`).
- بطاقة العميل: KPI + آخر الحركات + تعديل يدوي (Admin).
- صفحة `/loyalty`: فلتر تاريخ + 4 KPIs + جدول Top 20 + تصدير CSV.
- Sidebar: عنصر "ولاء العملاء" تحت المبيعات.

---

## خطوات التنفيذ
1. Migration: أعمدة + جدول + RLS + GRANTs.
2. تبويب "الولاء" في الإعدادات.
3. `SalesInvoiceForm`: بطاقة + حوار استبدال (بسقف `max_redeemable`).
4. RPCs: `post_sales_invoice` و `post_sales_return` بالمعادلات أعلاه.
5. بطاقة العميل + حوار التعديل اليدوي.
6. صفحة `/loyalty` + فلتر التاريخ + رابط الـ Sidebar.

**الوقت التقديري:** نصف يوم → يوم عمل.

جاهز للتنفيذ؟
