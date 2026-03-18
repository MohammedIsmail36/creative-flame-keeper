

## خطة: إضافة زر التصدير لصفحة تسوية المخزون

### التغييرات المطلوبة

**ملف واحد**: `src/pages/InventoryAdjustments.tsx`

1. **استيراد** مكون `ExportMenu` و `useSettings`
2. **تجهيز بيانات التصدير**: تحويل بيانات الجدول إلى headers و rows متوافقة مع ExportMenu:
   - الأعمدة: رقم التسوية، التاريخ، الوصف، الحالة
   - الصفوف: بيانات التسويات مع ترجمة الحالة (مسودة/معتمد)
3. **إضافة زر ExportMenu** بجانب زر "تسوية جديدة" في منطقة الـ Header

### التفاصيل التقنية

```tsx
// إعداد التصدير
const exportConfig = {
  filenamePrefix: "inventory-adjustments",
  sheetName: "تسويات المخزون",
  pdfTitle: "تقرير تسويات المخزون",
  headers: ["رقم التسوية", "التاريخ", "الوصف", "الحالة"],
  rows: adjustments.map(a => [
    `ADJ-${a.adjustment_number}`,
    a.adjustment_date,
    a.description || "—",
    statusLabels[a.status] || a.status,
  ]),
  settings,
};
```

يتم وضع `ExportMenu` بجانب زر "تسوية جديدة" داخل `div` مع `gap` مناسب، ويكون معطلاً عند عدم وجود بيانات.

