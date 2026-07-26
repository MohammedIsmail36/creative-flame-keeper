## الهدف
حل مشكلة عدم إغلاق نافذة الطباعة تلقائياً بعد إعطاء الأمر، وتحسين تجربة الطباعة لتكون أكثر احترافية.

## التغيير الرئيسي: iframe مخفي بدل نافذة منبثقة

بدلاً من فتح `window.open` (والذي قد يحجبه المتصفح ولا يُغلق دائماً)، سنطبع من خلال `<iframe>` مخفي داخل الصفحة الحالية.

### الملف المعدل الوحيد: `src/lib/barcode-label.ts`

استبدال دالة `openPrintWindow(html)` بدالة جديدة `printLabels(html)`:

```
- ينشئ iframe بـ style: position:fixed; width:0; height:0; border:0; visibility:hidden
- يضيفه للـ document.body
- يكتب HTML داخل iframe.contentDocument
- ينتظر load + fonts.ready
- يستدعي iframe.contentWindow.print()
- يستمع لـ afterprint (أو timeout كـ fallback بعد 60 ثانية) → يحذف iframe
```

### تعديل بسيط في `buildPrintHtml`

إزالة `<script>` الذي يستدعي `window.print()` تلقائياً (لأن الاستدعاء سيصبح من الـ iframe الأب).

### تعديل استدعاء واحد في `BarcodePrintDialog.tsx`

تغيير `openPrintWindow(html)` إلى `printLabels(html)` — نفس التوقيع.

## النتيجة

- ✅ لا تفتح نافذة جديدة (لا مشاكل مع مانع النوافذ المنبثقة).
- ✅ لا وميض / تنقل مرئي للمستخدم.
- ✅ إغلاق تلقائي مضمون بعد الطباعة أو الإلغاء.
- ✅ يعمل مع Chrome / Edge / Firefox / Safari.
- ✅ لا تبعيات جديدة، لا تغيير في التصميم.

## خارج النطاق

- تصدير PDF للطابعات الحرارية عبر الموبايل (Phomemo M110) — يمكن إضافته لاحقاً كتحسين منفصل عند الحاجة.
- أي تغيير في تصميم الملصق نفسه.
