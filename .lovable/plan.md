

# نتائج اختبار التقارير بعد تعديلات الخصومات

## البيانات الحية — التحقق الأساسي ✅

| الفحص | النتيجة | التفاصيل |
|---|---|---|
| توازن ميزان المراجعة | ✅ متوازن | مدين 128,035.25 = دائن 128,035.25 |
| رصيد العميل | ✅ صحيح | مسجل 3,250 = مجموع الفواتير 3,250 |
| رصيد المورد | ✅ صحيح | مسجل 122,925.25 = مجموع الفواتير 122,925.25 |
| كمية المخزون (منتج اختبار) | ✅ صحيح | مسجل 58 = محسوب 58 |
| `get_avg_selling_price` | ✅ صحيح | (1000+950+1300)/30 = 108.33 — يستخدم `net_total` |
| `get_avg_purchase_price` | ✅ صحيح | 62.00 — يستخدم `inventory_movements` |
| القيود المحاسبية | ✅ صحيحة | كل قيد متوازن، و`total` في header الفاتورة يعكس القيمة بعد الخصم |
| INV-0003 (خصم فاتورة 200) | ✅ صحيح | subtotal=1500, discount=200, total=1300, net_total مجموع=1300 |

---

## المشاكل المكتشفة — 5 مواقع تستخدم `item.total` بدلاً من `item.net_total`

عند التجميع بالمنتج، تجلب التقارير `total` من جدول البنود (القيمة **قبل** خصم الفاتورة) بدلاً من `net_total` (القيمة **بعد** الخصم). هذا يعني أن إيرادات المنتج تظهر أعلى من الواقع عند وجود خصم فاتورة.

| # | الملف | السطر | المشكلة | الأثر |
|---|---|---|---|---|
| 1 | `SalesReport.tsx` | 304 | `revenue += item.total` | تقرير المبيعات بالمنتج: إيرادات مبالغ فيها |
| 2 | `PurchasesReport.tsx` | 290 | `cost += item.total` | تقرير المشتريات بالمنتج: تكاليف مبالغ فيها |
| 3 | `ProductAnalytics.tsx` | 225 | `revenue += item.total` | تحليل المنتجات: إيرادات وأرباح خاطئة |
| 4 | `Dashboard.tsx` | 549, 656 | `amount += item.total` | لوحة التحكم: المنتجات/التصنيفات الأكثر مبيعاً |
| 5 | `GrowthAnalytics.tsx` | 289 | `total += item.total` | رسم pie chart للمنتجات غير دقيق |

ملاحظة: KPIs الرئيسية (إجمالي المبيعات، صافي المبيعات) في SalesReport و GrowthAnalytics **صحيحة** لأنها تستخدم `invoice.total` من header الفاتورة (وهو بالفعل بعد الخصم).

## خطة الإصلاح

### التعديل 1: إضافة `net_total` للاستعلامات
كل الاستعلامات التي تجلب `sales_invoice_items` أو `purchase_invoice_items` تحتاج إضافة `net_total` في select.

### التعديل 2: استبدال `item.total` بـ `item.net_total` في 5 مواقع

1. **`SalesReport.tsx`** — السطر 41: إضافة `net_total` للـ select، السطر 304: `revenue += Number(item.net_total || item.total)`
2. **`PurchasesReport.tsx`** — السطر 39: إضافة `net_total` للـ select، السطر 290: `cost += Number(item.net_total || item.total)`
3. **`ProductAnalytics.tsx`** — السطر 123: إضافة `net_total` للـ select، السطر 225: `revenue += Number(item.net_total || item.total)`
4. **`Dashboard.tsx`** — السطر 538: إضافة `net_total` للـ select، السطور 549 و 656: استخدام `net_total`
5. **`GrowthAnalytics.tsx`** — السطر 141: إضافة `net_total` للـ select، السطر 289: استخدام `net_total`

يُستخدم `|| item.total` كـ fallback للبيانات القديمة التي قد لا يكون فيها `net_total`.

### التعديل 3: تصحيح حساب الربح في Dashboard
السطر 657: `c.profit += Number(item.total) - Number(prod.purchase_price) * Number(item.quantity)` — يحسب الربح باستخدام `item.total` (خطأ). يجب أن يكون `item.net_total`.

## الملفات المتأثرة
| الملف | نوع التعديل |
|---|---|
| `src/pages/reports/SalesReport.tsx` | select + حساب revenue |
| `src/pages/reports/PurchasesReport.tsx` | select + حساب cost |
| `src/pages/reports/ProductAnalytics.tsx` | select + حساب revenue |
| `src/pages/Dashboard.tsx` | select + حساب amount + profit |
| `src/pages/reports/GrowthAnalytics.tsx` | select + حساب total |

لا حاجة لتعديل قاعدة البيانات — البيانات مخزنة بشكل صحيح.

