

# خطة التنفيذ الكاملة: إدارة نشاط المنتج + تقرير دوران المخزون

## المرحلة 1: إدارة حالة نشاط المنتج

### 1.1 `Products.tsx`
- إزالة `.eq("is_active", true)` من `fetchProducts` لجلب كل المنتجات
- إضافة state جديد `statusFilter` بثلاث قيم: `"active"` (افتراضي) / `"inactive"` / `"all"`
- إضافة Select ثالث في `toolbarContent` لفلترة الحالة
- تعديل `filteredProducts` لتضمين فلتر `is_active`
- إضافة عمود "الحالة" بعد عمود الاسم (Badge أخضر نشط / رمادي غير نشط)
- تحويل زر الحذف إلى زر تبديل حالة:
  - نشط → زر "تعطيل" (Archive icon) مع AlertDialog
  - غير نشط → زر "تفعيل" (CheckCircle2 icon) مع AlertDialog
- تعديل `stats` لإضافة عدد غير النشطة، وإظهار بطاقة خامسة إذا > 0
- تعديل `handleDelete` → `toggleProductStatus` يقلب `is_active`

### 1.2 `ProductForm.tsx`
- إضافة state `isActive` (افتراضي `true`)
- في وضع التعديل: إضافة Switch مع Label "حالة المنتج" ووصف تحته
- تضمين `is_active` في payload الحفظ عند التعديل

### 1.3 التقارير
- `InventoryReport.tsx`: الاستعلام الحالي يجلب الكل لكن KPI يفلتر `is_active` — مقبول
- التأكد من أن `ProductAnalytics` يفلتر النشطة فقط

---

## المرحلة 2: تقرير دوران المخزون

### 2.1 ملف جديد: `src/pages/reports/InventoryTurnoverReport.tsx`

**الاستعلامات (3 queries متوازية):**
1. `products` (is_active=true) مع joins على brands/categories
2. `sales_invoice_items` مع join على `sales_invoices` (status='posted') مفلترة بالفترة → تجميع soldQty و آخر بيع لكل product_id
3. `purchase_invoice_items` مع join على `purchase_invoices` (status='posted') → آخر شراء وسعر وsupplier_id + اسم المورد

**الفلاتر:**
- DatePickerInput (من/إلى) — افتراضي: أول الشهر → اليوم
- CategoryTreeSelect
- فئة الدوران (Select): الكل/ممتاز/جيد/بطيء/راكد
- فئة ABC (Select): الكل/A/B/C

**حسابات لكل منتج (useMemo):**
```
// حالة حدية: مخزون صفر
if currentStock === 0 && soldQty > 0 → turnoverClass = 'excellent' (نفد بسبب طلب عالٍ)
if currentStock === 0 && soldQty === 0 → turnoverRate = 0

// الحالة العادية
turnoverRate = soldQty / max(currentStock, 1)
avgDailySales = soldQty / periodDays
coverageDays = avgDailySales > 0 ? currentStock / avgDailySales : Infinity
annualizedRate = turnoverRate * (365 / periodDays)

turnoverClass: >=6 excellent, >=3 good, >=1 slow, <1 stagnant
(أو لم يُباع منذ 90+ يوم = stagnant)

ABC: ترتيب تنازلي بالإيراد، تراكمي <=80% = A, <=95% = B, باقي = C

actionPriority:
  1: coverageDays < 15 AND ABC in (A,B)
  2: stagnant AND stockValue > 1000, أو coverageDays > 180
  3: slow AND ABC = C, أو coverageDays > 180 AND ABC != A
```

**حساب نسبة التغير للـ KPI:**
- الفترة السابقة = (dateFrom - periodDays) → (dateFrom - 1 يوم)
- نسبة = ((حالية - سابقة) / سابقة) × 100
- يسري على بطاقتي "متوسط الدوران" و"قيمة الراكد" فقط

**4 بطاقات KPI:**
1. متوسط معدل الدوران + ↑↓ نسبة
2. قيمة المخزون الراكد + ↑↓ نسبة (أحمر > 10000، برتقالي > 5000)
3. أصناف تحتاج شراء عاجل (coverageDays < 15)
4. أصناف فئة A + نسبة الإيراد

**التنبيهات الذكية (Accordion):**
- أحمر: إجراء فوري (priority 1)
- برتقالي: متابعة (priority 2)
- أصفر: مراجعة (priority 3)
- كل قسم يختفي إذا فارغ

**مصفوفة القرار 3×3:**
- جدول HTML صغير فوق الجدول الرئيسي
- صفوف: A/B/C، أعمدة: سريع/متوسط/بطيء-راكد
- كل خلية: أيقونة + نص قرار + (عدد)
- الضغط على خلية يفلتر الجدول (toggle)

**الجدول الرئيسي — 11 عمود:**
الكود | المنتج | التصنيف | ABC | المخزون | القيمة (ج.م) | المباع | معدل الدوران | أيام التغطية | آخر بيع | فئة الدوران

- DataTable مع ترتيب وبحث وإخفاء أعمدة
- تلوين الصف أحمر فاتح إذا priority=1
- أيام التغطية: أحمر < 15، أخضر 15-90
- آخر بيع: تاريخ نسبي "منذ X يوم"

**رسم دائري:** توزيع فئات الدوران بالقيمة المالية (PieChart من recharts)

**التصدير:** ExportMenu الموحد

### 2.2 ملف جديد: `src/pages/reports/InventoryTurnoverPage.tsx`
- صفحة غلاف بنفس نمط InventoryReportPage (أيقونة + عنوان + وصف)

### 2.3 التكامل
- `App.tsx`: إضافة مسار `/reports/inventory-turnover`
- `AppSidebar.tsx`: إضافة "دوران المخزون" في قسم التقارير بأيقونة TrendingUp

---

## الملفات المتأثرة

| الملف | التعديل |
|-------|---------|
| `src/pages/Products.tsx` | فلتر نشاط + تبديل حالة + عمود حالة |
| `src/pages/ProductForm.tsx` | Switch نشاط في وضع التعديل |
| `src/pages/reports/InventoryTurnoverReport.tsx` | **جديد** — التقرير الكامل |
| `src/pages/reports/InventoryTurnoverPage.tsx` | **جديد** — صفحة الغلاف |
| `src/App.tsx` | مسار جديد |
| `src/components/layout/AppSidebar.tsx` | رابط جديد |

لا حاجة لتعديلات على قاعدة البيانات.

