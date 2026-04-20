

## خطة شاملة ودقيقة لتحسين تقارير دوران المخزون — مع احترام المنطق القائم

### أولاً: فهم عميق للوضع الحالي (ما تم بناؤه فعلياً)

بعد مراجعة كل ملفات `inventory-turnover/*` و`TurnoverDataContext.tsx`، النظام يميّز حالياً بين **5 فئات منتجات** عبر منطق مدروس:

| الفئة | الشرط | الصفحة المخصصة | الحالة |
|---|---|---|---|
| **منتجات جديدة (تحت الاختبار)** | `effectiveAge < 30 يوم` (بعد أول حركة شراء/افتتاحي) | `NewProductsPage` + `NewProductsTable` | ✅ مبنية وتحترم `DAYS_CONSIDERED_NEW` |
| **منتجات غير مدرجة (تحت المراجعة)** | لا توجد لها أي حركات شراء/افتتاحي إطلاقاً | `UnlistedProductsPage` | ✅ مبنية ومستثناة من ABC |
| **منتجات راكدة (Dormant)** | `lastSaleDate` قديم (>60 يوم) أو لا مبيعات + مخزون موجب | `DormantInventoryPage` + `DormantProductsTable` | ✅ مبنية |
| **منتجات نشطة (مصنفة A/B/C)** | باقي المنتجات بعد استبعاد الفئات أعلاه | `FullAnalysisPage` + ABC | ✅ مبنية |
| **مرتجعات للمورد** | منتجات ذات معدل دوران ضعيف ومخزون كبير | `SupplierReturnsPage` + `SupplierReturnTable` | ✅ مبنية |

**النقطة الحساسة**: هذه التصنيفات **تحمي المنتجات الجديدة من ظهورها كـ"راكدة"** أو "تحتاج مرتجع للمورد" — وهو منطق ذكي يجب **عدم كسره**.

---

### ثانياً: المشاكل الحقيقية المحددة (بعد المراجعة العميقة)

| # | المشكلة | الموقع الفعلي | لماذا تستحق الإصلاح |
|---|---|---|---|
| **1** | **ازدواجية بنية**: `InventoryTurnoverReport.tsx` (1452 سطر) يكرر منطق `TurnoverDataContext` بالكامل | `src/pages/reports/InventoryTurnoverReport.tsx` + `InventoryTurnoverPage.tsx` | تعديلات WAC الأخيرة طُبّقت في الملفين ⇒ خطر تباعد المنطقين مستقبلاً |
| **2** | **مقارنة الفترة السابقة بأساس مختلف** | `TurnoverDataContext.tsx` (prevCalc يستخدم `lastPrice` بينما الحالي يستخدم WAC) | يُظهر تغييرات وهمية في `turnoverChange` |
| **3** | **مرتجعات الفترة السابقة غير مخصومة** | `prevSalesByProduct` في `TurnoverDataContext` | تحريف اتجاه معدل الدوران |
| **4** | **حماية رياضية مفقودة لـ `coverageDays`** | لو `periodDays < 7` تصبح الأرقام متطرفة | تشوش قرارات الشراء |
| **5** | **استعلام `purchases` بلا فلترة فترة** | يجلب بيانات كاملة ⇒ حِمل شبكي | بطء + WAC غير محصور |
| **6** | **تكلفة الشراء المقترح تستخدم `lastPurchasePrice` فقط** | `PurchaseSuggestionsTable` | لا يعود لـ WAC عند غياب آخر سعر شراء |
| **7** | **شفافية WAC مفقودة في الجداول** | معظم الجداول تعرض القيمة دون عمود WAC ظاهر | المستخدم لا يرى أساس الحساب |
| **8** | **غياب ربط محاسبي مع GL في dashboard دوران المخزون** | `TurnoverDashboardPage` بلا شريط تطابق مع 1104 | عدم اتساق مع `InventoryReport` الجديد |
| **9** | **تنبيهات "شراء عاجل" مدمجة بلا تمييز** | `SmartAlertsSection` | صعوبة تمييز "نفد" عن "تحت الحد" عن "تغطية ضعيفة" |

---

### ثالثاً: ما لن نلمسه (حماية للمنطق القائم) ⚠️

- ❌ **لن نغيّر** منطق `effectiveAge` ولا `DAYS_CONSIDERED_NEW = 30` — هذا يحمي المنتجات الجديدة.
- ❌ **لن نغيّر** منطق `unlistedProducts` (المنتجات بدون حركات شراء) — هذا يحمي المنتجات تحت المراجعة.
- ❌ **لن نغيّر** منطق `dormantThresholdDays = 60` ولا معايير ABC.
- ❌ **لن نغيّر** منطق `supplierReturnCandidates`.
- ❌ **لن نغيّر** التصنيفات الموجودة في `TurnoverPieChart`.
- ❌ **لن نحذف** أي عمود من الجداول الموجودة.
- ❌ **لن نحذف** صفحات `NewProductsPage` / `UnlistedProductsPage` / `DormantInventoryPage`.

---

### رابعاً: المحاور المقترحة (4 محاور آمنة)

#### المحور 1: توحيد البنية (إزالة الازدواجية)
- حذف `InventoryTurnoverReport.tsx` (1452 سطر) و`InventoryTurnoverPage.tsx`.
- توجيه index route لـ `/reports/inventory-turnover` ⇒ `TurnoverDashboardPage` مباشرة عبر `Navigate`.
- **ضمان السلامة**: التحقق من أن جميع المسارات الفرعية (`/dashboard`, `/analysis`, `/new-products`, `/unlisted`, `/dormant`, `/purchase-planning`, `/supplier-returns`, `/urgent-actions`) تعمل بدون انقطاع.

#### المحور 2: الاتساق المحاسبي مع GL (نسخ نمط `InventoryReport`)
- إضافة استعلام رصيد `GL لحساب 1104` داخل `TurnoverDataContext`.
- إضافة في `kpis`:
  - `glInventoryBalance` (المصدر المحاسبي).
  - `operationalTotalValue = Σ stockValue للمنتجات الفعّالة` (WAC).
  - `inventoryDiff = operationalTotalValue − glInventoryBalance`.
- إضافة `ReconciliationBanner` بـ4 مستويات (مطابقاً لـ `InventoryReport`) أعلى `TurnoverDashboardPage`.
- **عدم تغيير** قيم الجداول الفردية — فقط إضافة شريط معلوماتي.

#### المحور 3: تصحيح حسابات WAC والمقارنة (دون تغيير التصنيفات)
- **(2)** تصحيح `prevCalc.stockValue` لاستخدام `wacMap` الحالي بدل `lastPrice` ⇒ مقارنة عادلة.
- **(3)** خصم مرتجعات الفترة السابقة من `prevSalesByProduct.soldQty`.
- **(4)** ضمان `Math.max(periodDays, 7)` في حسابات `avgDailySales` و`coverageDays`.
- **(5)** فلترة استعلام `purchases` بفترة (آخر سنة فقط لـ WAC + استعلام منفصل لـ "آخر سعر شراء" بحجم 1 لكل منتج).
- **(6)** حساب `totalSuggestedCost = Σ qty × (lastPurchasePrice ?? wac)` مع تظليل تنبيهي عند فرق > 20%.

#### المحور 4: تحسينات شفافية UX (إضافات فقط، بلا حذف)
- **(7)** إضافة عمود `WAC` ظاهر في:
  - `FullAnalysisPage` (للمنتجات النشطة)
  - `PurchasePlanningPage` (لقرارات الشراء)
  - `DormantProductsTable` (لتقدير الخسائر المحتملة)
  - مع `tooltip`: "محسوب من حركات المخزون (WAC)".
- **(9)** تقسيم تنبيهات `SmartAlertsSection` لثلاثة مستويات بصرية (مع الإبقاء على المنطق):
  - 🔴 **نفد** (`currentStock = 0`)
  - 🟠 **تغطية حرجة** (`coverageDays < 7`)
  - 🟡 **تحت الحد الأدنى** (`belowMinStock`)
- إضافة `MetricHelp` لكل KPI يوضح المصدر (WAC / GL / lastPurchasePrice).
- إضافة شارة "✓ متطابق محاسبياً" بجانب KPI قيمة المخزون عند تطابقه مع GL.

---

### خامساً: الملفات المُعدَّلة (نطاق محدود ومضبوط)

| الملف | نوع التعديل | الأثر |
|---|---|---|
| `src/App.tsx` | تعديل index route | توجيه لـ `TurnoverDashboardPage` |
| `src/pages/reports/InventoryTurnoverReport.tsx` | **حذف** | إزالة 1452 سطر مكرر |
| `src/pages/reports/InventoryTurnoverPage.tsx` | **حذف** | غلاف فارغ |
| `src/pages/reports/inventory-turnover/TurnoverDataContext.tsx` | تعديل منطقي محسوب | إضافة GL + تصحيح prevCalc + حماية periodDays + فلترة فترة + lastPrice ?? wac |
| `src/pages/reports/inventory-turnover/TurnoverKPIs.tsx` | إضافة بطاقة + شارة تطابق | إضافة معلوماتية |
| `src/pages/reports/inventory-turnover/TurnoverDashboardPage.tsx` | إضافة `ReconciliationBanner` | إضافة معلوماتية |
| `src/pages/reports/inventory-turnover/PurchaseSuggestionsTable.tsx` | عمود WAC + تظليل فرق + صيغة تكلفة محسّنة | تحسين دقة |
| `src/pages/reports/inventory-turnover/PurchasePlanningPage.tsx` | عمود WAC | شفافية |
| `src/pages/reports/inventory-turnover/FullAnalysisPage.tsx` | عمود WAC + tooltip | شفافية |
| `src/pages/reports/inventory-turnover/DormantProductsTable.tsx` | عمود WAC | شفافية |
| `src/pages/reports/inventory-turnover/SmartAlertsSection.tsx` | تقسيم بصري لـ urgent (3 مستويات) | UX |
| `mem://features/inventory-turnover-analytics` | تحديث | توثيق التغييرات |

**ملفات لن تُلمس**: `NewProductsTable`, `NewProductsPage`, `UnlistedProductsPage`, `DormantInventoryPage`, `SupplierReturnTable`, `SupplierReturnsPage`, `UrgentActionsPage`, `TurnoverPieChart`, `TurnoverFilterBar`, `TurnoverLayout`, `DecisionMatrix`, `InactiveProductsTable`, `types.tsx`.

---

### سادساً: ضمانات السلامة قبل وأثناء التنفيذ

1. **اختبار يدوي بعد كل محور** قبل الانتقال للتالي.
2. **التحقق من تصنيف المنتجات الجديدة/تحت المراجعة لم يتأثر** (`newProducts.length`, `unlistedProducts.length` كما هي).
3. **التحقق من `glInventoryBalance` لا يكسر باقي KPIs** عند فشل الاستعلام (استخدام `?? 0` آمن).
4. **اختبار المسارات الفرعية** بعد حذف المونوليث.
5. **مقارنة قيم قبل/بعد**: قيمة المخزون التشغيلية يجب أن تبقى ثابتة، فقط KPI الـ GL يُضاف.

---

### النتيجة المتوقعة

```text
┌─────────────────────────────────────┬─────────┬──────────────────────────┐
│ الجانب                               │ قبل      │ بعد                       │
├─────────────────────────────────────┼─────────┼──────────────────────────┤
│ تصنيف المنتجات الجديدة (30 يوم)      │ ✓ يعمل  │ ✓ يعمل (لم يُمس)           │
│ تصنيف المنتجات تحت المراجعة          │ ✓ يعمل  │ ✓ يعمل (لم يُمس)           │
│ تصنيف الراكدة (60 يوم)              │ ✓ يعمل  │ ✓ يعمل (لم يُمس)           │
│ تصنيف ABC                           │ ✓ يعمل  │ ✓ يعمل (لم يُمس)           │
│ ازدواجية الكود                       │ موجودة  │ محذوفة                    │
│ شريط تطابق GL                        │ غائب    │ موجود (4 مستويات)         │
│ مقارنة فترة سابقة                    │ مغلوطة  │ نفس الأساس (WAC)          │
│ شفافية WAC                          │ مخفية   │ عمود ظاهر في 4 جداول      │
│ تنبيهات urgent                       │ مدمجة   │ 3 مستويات بصرية           │
│ تكلفة الشراء المقترح                 │ lastPrice│ lastPrice ?? wac          │
│ حِمل استعلام WAC                     │ كامل    │ مفلتر بفترة                │
└─────────────────────────────────────┴─────────┴──────────────────────────┘
```

### مزايا الخطة

- **آمنة**: لا تكسر أي تصنيف أو منطق قائم لحماية المنتجات الجديدة/تحت المراجعة.
- **شاملة**: تعالج 9 مشاكل محددة بدقة.
- **متسقة**: تطبق نفس فلسفة `InventoryReport` (شفافية + تطابق GL + 4 مستويات بانر).
- **بدون تغييرات DB**: تعديلات منطق العرض فقط.
- **قابلة للتراجع**: كل محور مستقل يمكن إيقافه عند الحاجة.

