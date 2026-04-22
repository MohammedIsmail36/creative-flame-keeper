

## توحيد نظام التنبيهات (Toaster)

### الوضع الحالي
النظام يحتوي فعلياً على **مكوّنين منفصلين** للتنبيهات يعملان في نفس الوقت:

1. **Sonner** (`@/components/ui/sonner`) — يستخدمه 3 ملفات فقط (`SettingsPage`, `FiscalYearClosing`, إلخ).
2. **Legacy Radix Toast** (`@/hooks/use-toast` + `@/components/ui/toaster`) — يستخدمه **42 ملف** (Products, Customers, Suppliers, Expenses... إلخ).

كلاهما مُسجَّل في `src/App.tsx`:
```tsx
<Toaster />        // legacy radix
<Sonner />         // sonner
```

**سبب بقاء بعض التنبيهات لا تختفي:** ملف `src/hooks/use-toast.ts` يُعرّف:
```ts
const TOAST_REMOVE_DELAY = 1000000; // ≈ 16 دقيقة!
```
أي أن أي تنبيه عبر النظام القديم لا يختفي تلقائياً — يجب إغلاقه يدوياً. هذا هو السبب الحقيقي لما تراه، وليس وجود مكونات متعددة في صفحات مختلفة.

---

### الخطة المقترحة

#### 1) اعتماد Sonner كمكوّن واحد للنظام بأكمله
- إزالة `<Toaster />` (الـ legacy radix) من `src/App.tsx` والإبقاء على `<Sonner />` فقط.
- تخصيص `src/components/ui/sonner.tsx` ليكون موحّداً:
  - `position="top-center"` — أعلى منتصف الصفحة.
  - `duration={3000}` — يختفي تلقائياً بعد 3 ثواني.
  - `dir="rtl"` — لدعم اللغة العربية.
  - `richColors` + `closeButton` — ألوان واضحة للنجاح/الفشل/التحذير + زر إغلاق يدوي اختياري.
  - حد أقصى للتنبيهات المتراكمة (`visibleToasts={3}`).

#### 2) إنشاء جسر توافقي (Compatibility Shim)
بدل تعديل 42 ملفاً يدوياً، سأعيد كتابة `src/hooks/use-toast.ts` كغلاف رفيع حول `sonner`:
- `toast({ title, description, variant })` → ينادي `sonner.toast.success/error/...` تلقائياً حسب `variant`.
- `useToast()` يُعيد نفس الواجهة (`{ toast, dismiss }`) لكن تحت الغطاء يستخدم Sonner.
- النتيجة: كل الكود الموجود يعمل بدون تعديل، ويُعرض عبر مكوّن واحد فقط.

#### 3) تنظيف
- حذف `src/components/ui/toaster.tsx` (لم يعد مستخدماً).
- حذف `src/components/ui/use-toast.ts` (re-export قديم) أو إبقاؤه كـ re-export للجسر الجديد.
- الإبقاء على `src/components/ui/toast.tsx` (مكوّنات Radix) فقط إذا احتاجها أي مكان آخر؛ وإلا يُحذف.

---

### تخصيص الأنواع (موحّد للنظام)

| النوع | الاستخدام | اللون | المدة |
|---|---|---|---|
| `toast.success` | عمليات ناجحة (حفظ، حذف، ترحيل) | أخضر | 3s |
| `toast.error` | فشل/أخطاء (variant: destructive) | أحمر | 4s (أطول للقراءة) |
| `toast.warning` | تحذيرات (مخزون منخفض، تكرار) | أصفر | 3s |
| `toast.info` | معلومات عامة | أزرق | 3s |

الموقع: `top-center`، اتجاه RTL، حد أقصى 3 تنبيهات مرئية، زر إغلاق ظاهر.

---

### الملفات المتأثرة
- ✏️ `src/App.tsx` — إزالة `<Toaster />` legacy.
- ✏️ `src/components/ui/sonner.tsx` — إعدادات `position`, `duration`, `dir`, `richColors`.
- ✏️ `src/hooks/use-toast.ts` — إعادة كتابة كاملة كغلاف لـ sonner (الإصلاح الأساسي لمشكلة عدم الاختفاء).
- 🗑️ `src/components/ui/toaster.tsx` — حذف.
- ✅ 42 ملف يستخدم `useToast`/`toast` — **لا تحتاج أي تعديل** بفضل الجسر التوافقي.

### النتيجة المتوقعة
- مصدر واحد للتنبيهات في كل النظام.
- كل تنبيه يظهر أعلى منتصف الشاشة ويختفي تلقائياً بعد 3 ثواني.
- لا مزيد من التنبيهات "العالقة" التي تتطلب إغلاقاً يدوياً.
- ألوان موحّدة وواضحة لكل نوع (نجاح/خطأ/تحذير).

