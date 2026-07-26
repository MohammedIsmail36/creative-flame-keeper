
## المشكلة
في صفحة `/reports/inventory-turnover/analysis` عمود "المنتج" في الجدول يستخدم:
```
truncate max-w-[160px] block
```
مما يقصّ الأسماء الطويلة ويعرضها بنقاط `...`.

## الحل (تغيير بصري بسيط فقط)

في `src/pages/reports/inventory-turnover/FullAnalysisPage.tsx` عمود `productName`:

- إزالة `truncate` و `max-w-[160px]` وإبدالها بحدّ أدنى مريح للقراءة مع السماح بلفّ النص عند الحاجة:
  - استبدال الـcell بـ:
    ```tsx
    <span className="text-xs font-medium whitespace-normal break-words leading-snug block min-w-[220px] max-w-[320px]">
      {getValue() as string}
    </span>
    ```
- هذا يجعل الاسم يظهر كاملاً، ويلتفّ على سطرين إذا كان طويلاً جداً بدلاً من قصّه، مع إبقاء عرض العمود ضمن حدود معقولة حتى لا يخلّ ببقية الأعمدة.

لا تغييرات على أي شاشة أخرى ولا على منطق البيانات أو التصدير.
