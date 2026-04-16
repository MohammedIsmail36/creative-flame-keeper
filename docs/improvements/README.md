# خطط تحسين النظام — System Improvement Plans

## نظرة عامة

يحتوي هذا المجلد على خطط تحسين مفصّلة لكل شاشة في النظام. كل ملف مستقل ويمكن تسليمه لوكيل (Agent) للعمل عليه بشكل منفرد.

## مستويات الخطورة

| الرمز | المستوى  | الوصف                              |
| ----- | -------- | ---------------------------------- |
| 🔴    | Critical | فقدان/تلف بيانات، أخطاء أمنية      |
| 🟠    | High     | أخطاء منطقية تؤثر على صحة الحسابات |
| 🟡    | Medium   | مشاكل تجربة المستخدم والصيانة      |
| 🟢    | Low      | تحسينات شكلية واتساق               |

---

## مصفوفة الأولويات

### 🔴 Critical — يجب إصلاحها فوراً

| الملف                                                                    | المشكلة                                            |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| [CustomerPayments](customers/CustomerPayments.md)                        | تعديل+ترحيل ينشئ دفعة مكررة                        |
| [SupplierPayments](suppliers/SupplierPayments.md)                        | نفس خطأ الدفعة المكررة                             |
| [ProductForm](products-inventory/ProductForm.md)                         | Race condition عند تحديث الكميات                   |
| [InventoryAdjustmentForm](products-inventory/InventoryAdjustmentForm.md) | Race condition + عدم التراجع عند فشل جزئي          |
| [ProductImport](products-inventory/ProductImport.md)                     | Race condition في إنشاء الأصناف + لا تحقق من الملف |
| [FiscalYearClosing](accounting/FiscalYearClosing.md)                     | لا يتحقق من توازن المدين/الدائن قبل قيد الإقفال    |

### 🟠 High — أخطاء منطقية مؤثرة

| الملف                                                   | المشكلة                                         |
| ------------------------------------------------------- | ----------------------------------------------- |
| [SalesInvoiceForm](sales/SalesInvoiceForm.md)           | 138 سطر من منطق الترحيل مختلط مع UI             |
| [PurchaseInvoiceForm](purchases/PurchaseInvoiceForm.md) | قسمة على صفر + عدم اتساق وضع الخصم              |
| [SalesReturnForm](sales/SalesReturnForm.md)             | عدم توازن COGS/الاسترداد مع فاتورة البيع        |
| [PurchaseReturnForm](purchases/PurchaseReturnForm.md)   | نفس مشكلة COGS                                  |
| [Customers](customers/Customers.md)                     | لا يوجد تأكيد حذف                               |
| [Suppliers](suppliers/Suppliers.md)                     | نفس مشكلة الحذف                                 |
| [JournalEntryForm](accounting/JournalEntryForm.md)      | منطق إنشاء القيد مكرر في 4+ ملفات               |
| [Expenses](accounting/Expenses.md)                      | جلب مزدوج لأنواع المصروفات + تكرار منطق الترحيل |
| [Sales](sales/Sales.md)                                 | لا يوجد معالجة أخطاء، تسميات حالات مكررة        |
| [Purchases](purchases/Purchases.md)                     | فحص صلاحيات مفقود                               |
| [SalesReturns](sales/SalesReturns.md)                   | تكرار تسميات الحالات                            |
| [PurchaseReturns](purchases/PurchaseReturns.md)         | انعكاس لمشاكل SalesReturns                      |

### 🟡 Medium — تجربة مستخدم وصيانة

| الملف                                                              | المشكلة الرئيسية                              |
| ------------------------------------------------------------------ | --------------------------------------------- |
| [Products](products-inventory/Products.md)                         | فلتر المخزون المنخفض يستخدم `<=` بدلاً من `<` |
| [ProductView](products-inventory/ProductView.md)                   | ثوابت أنواع الحركات مكررة                     |
| [CategoryManagement](products-inventory/CategoryManagement.md)     | لا يكشف الدورات غير المباشرة (A→B→C→A)        |
| [InventoryMovements](products-inventory/InventoryMovements.md)     | حساب الرصيد التراكمي خاطئ للتسويات            |
| [InventoryAdjustments](products-inventory/InventoryAdjustments.md) | —                                             |
| [Accounts](accounting/Accounts.md)                                 | استعلام الحسابات الطرفية مكرر في 6+ ملفات     |
| [Journal](accounting/Journal.md)                                   | منطق إنشاء القيد مشترك                        |
| [Ledger](accounting/Ledger.md)                                     | —                                             |
| [ExpenseForm](accounting/ExpenseForm.md)                           | منطق ترحيل مكرر من Expenses.tsx               |
| [ExpenseTypes](accounting/ExpenseTypes.md)                         | —                                             |
| [TrialBalance](accounting/TrialBalance.md)                         | تسامح 0.01 مكتوب يدوياً                       |
| [BalanceSheet](accounting/BalanceSheet.md)                         | عدم تطابق فترة صافي الدخل                     |
| [IncomeStatement](accounting/IncomeStatement.md)                   | استبعاد قيود الإقفال غير متسق                 |
| [CustomerStatement](customers/CustomerStatement.md)                | —                                             |
| [SupplierStatement](suppliers/SupplierStatement.md)                | —                                             |

### 🟢 Low — تقارير وإعدادات

| الملف                                                         | المشكلة الرئيسية                   |
| ------------------------------------------------------------- | ---------------------------------- |
| [Dashboard](reports/Dashboard.md)                             | 30+ useState، أرقام سحرية          |
| [SalesReport](reports/SalesReport.md)                         | معالجة منتج محذوف NULL             |
| [PurchasesReport](reports/PurchasesReport.md)                 | نفس مشاكل SalesReport              |
| [InventoryReport](reports/InventoryReport.md)                 | انتشار NULL في قيمة المخزون        |
| [InventoryTurnoverReport](reports/InventoryTurnoverReport.md) | كشف منتج جديد معيب                 |
| [ProductAnalytics](reports/ProductAnalytics.md)               | قسمة على صفر في ABC                |
| [GrowthAnalytics](reports/GrowthAnalytics.md)                 | أخطاء حدود نطاق التاريخ            |
| [DebtAgingReport](reports/DebtAgingReport.md)                 | معالجة due_date = NULL             |
| [AccountBalancesReport](reports/AccountBalancesReport.md)     | الفلاتر لا تُحفظ عند التحديث       |
| [ProfitLossReport](reports/ProfitLossReport.md)               | —                                  |
| [AccountStatement](reports/AccountStatement.md)               | —                                  |
| [SettingsPage](settings-system/SettingsPage.md)               | لا تحقق من حجم/نوع الملف           |
| [SystemSetup](settings-system/SystemSetup.md)                 | لا نسخة احتياطية قبل إعادة التعيين |
| [LookupManagement](settings-system/LookupManagement.md)       | لا يعالج البيانات اليتيمة          |
| [Profile](settings-system/Profile.md)                         | سياسة كلمة مرور ضعيفة              |
| [UserManagement](settings-system/UserManagement.md)           | لا تأكيد حذف، يمكن خفض رتبة النفس  |

---

## التحسينات المشتركة

قبل العمل على أي ملف فردي، راجع [التحسينات المشتركة](_shared-improvements.md) — تحتوي على الثوابت والأدوات المشتركة التي تؤثر على عدة شاشات.

---

## كيفية الاستخدام

1. اختر ملفاً من المصفوفة أعلاه (الأولوية حسب القسم)
2. راجع `_shared-improvements.md` أولاً إذا كان الملف يعتمد على تحسينات مشتركة
3. نفّذ التحسينات المُعلّمة بـ `- [ ]` واحداً تلو الآخر
4. عند الانتهاء أعد علامة `- [x]` على كل بند
5. تأكد من عدم وجود أخطاء TypeScript بعد كل تعديل
