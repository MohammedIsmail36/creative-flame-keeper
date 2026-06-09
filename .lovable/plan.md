## الخطة

**1. قاعدة البيانات**
- إضافة عمود `loyalty_enabled boolean NOT NULL DEFAULT true` على جدول `customers`.
- تعديل دالة `fn_loyalty_on_invoice_post()`: تتجاهل العميل تماماً (لا كسب ولا استبدال) إذا `loyalty_enabled = false`.
- **Trigger** على `customers` (BEFORE UPDATE): إذا تغيّر `loyalty_enabled` من `true` إلى `false` و `loyalty_points > 0` يرفع خطأ:
  > "لا يمكن إلغاء تفعيل الولاء — يجب تصفير رصيد النقاط أولاً (الرصيد الحالي: X نقطة)."

**2. شاشة العميل (`Customers.tsx`)**
- إضافة Switch "مشمول ببرنامج الولاء" في dialog الإضافة/التعديل (يظهر فقط إذا `settings.loyalty_enabled`).
- لا badge في الجدول، لا تغيير على الأعمدة.
- خطأ الترايجر يُعرض كما هو عبر `formatSupabaseError` في toast.

**3. شاشة فاتورة المبيعات (`SalesInvoiceForm.tsx`)**
- عند اختيار عميل `loyalty_enabled = false`: إخفاء قسم الولاء (الكسب/الاستبدال) فقط، بدون رسائل إضافية.

**4. توافق مع البيانات الحالية**
- الافتراضي `true` → كل العملاء الحاليين يبقون مشمولين، لا تأثير رجعي.
