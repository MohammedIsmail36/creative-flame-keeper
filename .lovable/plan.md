

## تشخيص المشكلة: التسويات لا تُحدّث الفاتورة فوراً

### السبب

المكون `OutstandingCreditsSection` عند تطبيق تسوية أو إلغائها:
1. يُدخل/يحذف سجل التسوية في جدول `sales_invoice_return_settlements`
2. يستدعي `onSettlementChanged()` (وهي `loadData`) لإعادة تحميل بيانات الفاتورة

**المشكلة**: لا يتم استدعاء `recalculateInvoicePaidAmount()` لتحديث حقل `paid_amount` في جدول الفاتورة بقاعدة البيانات. لذلك عند إعادة تحميل البيانات، يظل `paid_amount` القديم كما هو حتى يتم عمل refresh كامل.

بالمقارنة، مكون `InvoicePaymentSection` يستورد هذه الدالة لكنه أيضاً لا يستخدمها بشكل صحيح في كل الحالات.

### الحل

تعديل `OutstandingCreditsSection.tsx` في دالتي `applyReturn` و `removeSettlement`:
- بعد إدخال/حذف التسوية، استدعاء `recalculateInvoicePaidAmount(type, invoiceId)` لتحديث `paid_amount` في قاعدة البيانات
- ثم استدعاء `fetchData()` و `onSettlementChanged()` كالمعتاد

### الملفات المتأثرة

| الملف | التغيير |
|-------|---------|
| `src/components/OutstandingCreditsSection.tsx` | إضافة استيراد `recalculateInvoicePaidAmount` واستدعائها بعد كل تسوية/إلغاء |

### التغيير المحدد

في دالة `applyReturn` بعد `supabase.insert(...)`:
```typescript
await recalculateInvoicePaidAmount(type, invoiceId);
```

في دالة `removeSettlement` بعد `supabase.delete(...)`:
```typescript
await recalculateInvoicePaidAmount(type, invoiceId);
```

تغيير بسيط جداً (سطرين + سطر import) يحل المشكلة بالكامل.

