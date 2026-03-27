

# خطة تصحيح منطق تقرير دوران المخزون — معالجة الحالات الحدية

## المشكلة
التقرير الحالي يصنف المنتجات الجديدة (أُضيفت حديثاً أو اشتُريت حديثاً ولم تُباع) كـ "راكدة" ويطلق تنبيهات خاطئة، مما يفقد المستخدم الثقة في التقرير.

## التعديل المطلوب — ملف واحد: `InventoryTurnoverReport.tsx`

### 1. تحديث الأنواع
- إضافة `"new" | "new_unlisted"` إلى `TurnoverClass`
- إضافة `"excluded"` إلى `ABCClass`
- إضافة `DAYS_CONSIDERED_NEW = 30` كثابت
- تحديث `TURNOVER_LABELS` و `TURNOVER_COLORS` لتشمل الفئات الجديدة (جديد = رمادي، غير مُدرج = بنفسجي فاتح)

### 2. إعادة كتابة منطق الحساب في `allTurnoverData` (useMemo)
ترتيب المنطق الجديد لكل منتج:

**الخطوة أ — تصنيف المنتج الجديد أولاً:**
- حساب `daysSinceAdded` من `created_at`
- حساب `daysSinceLastPurchase` من آخر فاتورة شراء
- `isNeverPurchased`: لم يُشترَ قط ولم يُباع قط (lastPurchaseDate === null && soldQty === 0)
- `isNewProduct`: soldQty === 0 && !isNeverPurchased && daysSinceLastPurchase < 30
- `isRecentlyAdded`: soldQty === 0 && isNeverPurchased && daysSinceAdded < 30

إذا `isNeverPurchased && !isRecentlyAdded` → turnoverClass = "new_unlisted"
إذا `isNewProduct || isRecentlyAdded` → turnoverClass = "new"

المنتجات الجديدة/غير المُدرجة:
- abcClass = "excluded"
- coverageDays = null
- actionPriority = null
- actionLabel = null
- لا تُكمل باقي الحسابات

**الخطوة ب — حسابات المنتجات العادية:**
- نفس المنطق الحالي مع تحويل `coverageDays = Infinity` إلى `null` (لا مبيعات = لا نعرف التغطية)
- حالة نفاد المخزون (stock=0, sold>0): turnoverClass = "excellent", coverageDays = 0
- stockValue = lastPurchasePrice !== null ? currentStock * lastPurchasePrice : null (بدلاً من NaN)

### 3. تحديث حساب ABC
- استبعاد المنتجات ذات `abcClass === "excluded"` من ترتيب ABC
- المنتجات بدون مبيعات (عادية غير جديدة) تقع تلقائياً في C

### 4. تحديث حساب actionPriority
- تخطي المنتجات الجديدة (turnoverClass = "new" أو "new_unlisted")
- إضافة حالة نفاد المخزون لفئة A: actionPriority = 1 مع actionLabel يتضمن اسم آخر مورد
- استبدال شروط `coverageDays > 180` و `coverageDays < 15` بفحص `!== null` أولاً

### 5. تحديث الواجهة
- **أعمدة الجدول**: عرض "—" بدلاً من NaN/Infinity/∞ لـ coverageDays و stockValue و turnoverRate للمنتجات الجديدة
- **Badge فئة الدوران**: إضافة "جديد" (رمادي) و"غير مُدرج" (بنفسجي)
- **Badge ABC**: إضافة "مستبعد" (بنفسجي) للمنتجات الجديدة
- **تلوين الصفوف**: لا تلوين للمنتجات الجديدة (priority = null)
- **التنبيهات**: المنتجات الجديدة لا تظهر في أي قسم تنبيه
- **المصفوفة 3×3**: استبعاد المنتجات الجديدة + إضافة ملاحظة "لا تشمل المنتجات الجديدة (أقل من 30 يوم)"
- **الرسم الدائري**: إضافة فئة "جديد" بلون رمادي مع ملاحظة "المنتجات المستبعدة = X"
- **KPIs**: حساب المتوسط والقيمة الراكدة بدون المنتجات الجديدة
- **ChangeIndicator للقيمة الراكدة**: عكس اللون (↑ = أحمر لأنه تدهور، ↓ = أخضر لأنه تحسن) — هذا موجود بالفعل بشكل صحيح في الكود الحالي (السطر 561)
- **حالة "لا بيانات كافية"**: إذا كل المنتجات جديدة → رسالة خاصة بدلاً من جدول فارغ

### 6. جلب `created_at` من products
- إضافة `created_at` في select الاستعلام الأول (السطر 98) — موجود بالفعل في الجدول
- جلب `suppliers(name)` عبر join على purchase_invoices لعرض اسم آخر مورد في التنبيهات

---

## ملخص التغييرات التقنية

| البند | الحالي | الجديد |
|-------|--------|--------|
| TurnoverClass | 4 فئات | 6 فئات (+new, +new_unlisted) |
| ABCClass | 3 فئات | 4 فئات (+excluded) |
| coverageDays = Infinity | يُعرض كـ ∞ | يُحوَّل لـ null ويُعرض كـ "—" |
| stockValue عند null price | NaN | null → "—" |
| منتج جديد <30 يوم | راكد + تنبيه | "جديد" بدون تنبيه |
| منتج أُضيف بدون شراء >30 يوم | راكد | "غير مُدرج" |

ملف واحد يتأثر: `src/pages/reports/InventoryTurnoverReport.tsx`

