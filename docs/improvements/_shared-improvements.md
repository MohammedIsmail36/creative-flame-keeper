# التحسينات المشتركة — Shared Improvements

هذا الملف يوثّق التحسينات التي تؤثر على عدة شاشات ويجب تنفيذها **قبل** أو **بالتوازي مع** خطط الشاشات الفردية.

---

## S1: استخراج ثوابت الحالات والألوان المشتركة

**الملفات المتأثرة**: Sales, SalesReturns, Purchases, PurchaseReturns, SalesInvoiceForm, PurchaseInvoiceForm, SalesReturnForm, PurchaseReturnForm

- [ ] إنشاء `src/lib/constants.ts` يحتوي على:

  ```ts
  export const INVOICE_STATUS_LABELS: Record<string, string> = {
    draft: "مسودة",
    posted: "مرحّلة",
    partially_paid: "مدفوعة جزئياً",
    paid: "مدفوعة",
    cancelled: "ملغاة",
  };

  export const INVOICE_STATUS_COLORS: Record<string, string> = {
    draft: "bg-yellow-100 text-yellow-800",
    posted: "bg-blue-100 text-blue-800",
    // ...
  };
  ```

- [ ] استبدال كل التعريفات المحلية المكررة في الملفات الثمانية أعلاه بالاستيراد من `constants.ts`

---

## S2: استخراج ثوابت أنواع حركات المخزون

**الملفات المتأثرة**: ProductView, InventoryMovements, InventoryAdjustmentForm, ProductForm

- [ ] إضافة لـ `src/lib/constants.ts`:
  ```ts
  export const MOVEMENT_TYPE_LABELS: Record<string, string> = {
    purchase: "شراء",
    sale: "بيع",
    purchase_return: "مرتجع شراء",
    sale_return: "مرتجع بيع",
    adjustment_in: "تسوية إضافة",
    adjustment_out: "تسوية خصم",
  };
  ```
- [ ] استبدال التعريفات المحلية المكررة

---

## S3: استخراج أكواد الحسابات السحرية

**الملفات المتأثرة**: ProductForm, InventoryAdjustmentForm, SalesInvoiceForm, PurchaseInvoiceForm, SalesReturnForm, PurchaseReturnForm, Expenses, ExpenseForm

- [ ] إضافة لـ `src/lib/constants.ts`:
  ```ts
  export const ACCOUNT_CODES = {
    INVENTORY: "1104",
    COGS: "5201",
    SALES_REVENUE: "4201",
    RETAINED_EARNINGS: "3101",
    CASH: "1101",
    ACCOUNTS_RECEIVABLE: "1102",
    ACCOUNTS_PAYABLE: "2101",
  } as const;
  ```
- [ ] استبدال كل الأكواد النصية المكتوبة يدوياً (`"1104"`, `"5201"`, إلخ) بالثوابت

---

## S4: توحيد منطق إنشاء القيود المحاسبية

**الملفات المتأثرة**: JournalEntryForm, Expenses, ExpenseForm, FiscalYearClosing, SalesInvoiceForm, PurchaseInvoiceForm, CustomerPayments, SupplierPayments

- [ ] إنشاء `src/lib/journal-utils.ts`:
  ```ts
  export async function createJournalEntry(params: {
    date: string;
    description: string;
    lines: Array<{ account_id: string; debit: number; credit: number }>;
    reference_type?: string;
    reference_id?: string;
    posted_number?: number;
  }): Promise<{ id: string; posted_number: number }>;
  ```
- [ ] يشمل: التحقق من توازن المدين/الدائن، توليد `posted_number` بشكل آمن (atomic)، إدراج الرأس والبنود في عملية واحدة
- [ ] استبدال كل المنطق المكرر في الملفات أعلاه

---

## S5: إصلاح Race Condition في `posted_number`

**الملفات المتأثرة**: CustomerPayments, SupplierPayments, SalesInvoiceForm, PurchaseInvoiceForm, FiscalYearClosing, InventoryAdjustmentForm

- [ ] الطريقة الحالية: `SELECT MAX(posted_number) + 1` — غير آمنة عند استخدام متزامن
- [ ] الحل: استخدام Supabase RPC function مع `FOR UPDATE` lock أو sequence:
  ```sql
  CREATE OR REPLACE FUNCTION next_posted_number(p_table text)
  RETURNS integer AS $$
  DECLARE v_next integer;
  BEGIN
    EXECUTE format('SELECT COALESCE(MAX(posted_number), 0) + 1 FROM %I FOR UPDATE', p_table)
    INTO v_next;
    RETURN v_next;
  END; $$ LANGUAGE plpgsql;
  ```
- [ ] استدعاء هذه الدالة في `journal-utils.ts` بدلاً من `MAX + 1` في كل ملف

---

## S6: دعم المعاملات (Transactions) للعمليات متعددة الخطوات

**الملفات المتأثرة**: ProductForm, ProductImport, InventoryAdjustmentForm, SalesInvoiceForm, PurchaseInvoiceForm, FiscalYearClosing

- [ ] إنشاء Supabase Edge Function أو RPC لتغليف العمليات المتعددة في transaction واحدة
- [ ] أو استخدام `supabase.rpc('post_invoice', { ... })` لنقل المنطق الحرج للخادم
- [ ] كحد أدنى: إضافة rollback يدوي عند فشل أي خطوة (حذف ما تم إدراجه)

---

## S7: توحيد معالجة التواريخ

**الملفات المتأثرة**: Dashboard, Sales, Purchases, جميع التقارير

- [ ] استبدال كل استخدامات `.toISOString().slice(0, 10)` بـ `format(date, "yyyy-MM-dd")` من date-fns
- [ ] إنشاء helper في `src/lib/utils.ts`:
  ```ts
  export function toDateString(date: Date): string {
    return format(date, "yyyy-MM-dd");
  }
  ```
- [ ] استبدال مقارنات التواريخ النصية بمقارنات تاريخ حقيقية حيثما أمكن

---

## S8: توحيد نمط معالجة الأخطاء

**الملفات المتأثرة**: جميع الشاشات

- [ ] إنشاء error boundary عام في `src/components/ErrorBoundary.tsx`
- [ ] توحيد نمط toast الأخطاء:
  ```ts
  export function handleQueryError(error: Error, context: string) {
    toast({
      title: `خطأ في ${context}`,
      description: error.message,
      variant: "destructive",
    });
  }
  ```
- [ ] استبدال الأنماط المختلفة (silent fail, throw, .catch()) بنمط موحد

---

## S9: توحيد حالات التحميل (Loading States)

**الملفات المتأثرة**: جميع الشاشات

- [ ] إنشاء مكوّن `TableSkeleton` موحد بدلاً من العظام المختلفة في كل شاشة
- [ ] إنشاء مكوّن `PageLoading` للتحميل الكامل
- [ ] استخدام `isLoading` من react-query بشكل متسق

---

## S10: توحيد ثوابت الأدوار

**الملفات المتأثرة**: Profile, UserManagement, AuthContext

- [ ] نقل تعريفات `roleLabels`, `roleIcons`, `roleColors` إلى `src/lib/constants.ts`
- [ ] استيراد من مكان واحد في كل الملفات

---

## S11: توحيد تسامح النقطة العائمة

**الملفات المتأثرة**: TrialBalance, BalanceSheet, JournalEntryForm, IncomeStatement

- [ ] إضافة لـ `src/lib/constants.ts`:
  ```ts
  export const BALANCE_TOLERANCE = 0.01;
  ```
- [ ] إنشاء helper:
  ```ts
  export function isBalanced(debit: number, credit: number): boolean {
    return Math.abs(debit - credit) <= BALANCE_TOLERANCE;
  }
  ```
- [ ] استبدال كل `Math.abs(...) < 0.01` بالدالة المشتركة

---

## S12: استخراج منطق بناء شجرة الأصناف

**الملفات المتأثرة**: Products, CategoryManagement, ProductImport

- [ ] إنشاء `src/lib/category-utils.ts`:
  ```ts
  export interface CategoryNode {
    id: string;
    name: string;
    parent_id: string | null;
    children: CategoryNode[];
  }
  export function buildCategoryTree(categories: Category[]): CategoryNode[];
  export function flattenCategoryTree(tree: CategoryNode[]): Category[];
  ```
- [ ] استبدال المنطق المكرر في كل ملف

---

## S13: استخراج منطق توليد الأكواد

**الملفات المتأثرة**: Customers, Suppliers

- [ ] إنشاء helper في `src/lib/code-generation.ts`:
  ```ts
  export async function generateEntityCode(
    table: string,
    prefix: string,
  ): Promise<string>;
  ```
- [ ] استبدال المنطق المكرر في Customers و Suppliers

---

## ترتيب التنفيذ المقترح

1. **S3** (أكواد الحسابات) + **S1** (حالات الفواتير) + **S2** (أنواع الحركات) + **S10** (أدوار) + **S11** (تسامح) — ثوابت بسيطة
2. **S7** (تواريخ) + **S12** (شجرة أصناف) + **S13** (توليد أكواد) — أدوات مساعدة
3. **S5** (posted_number آمن) + **S4** (قيود محاسبية) — منطق أعمال حرج
4. **S6** (معاملات) — يتطلب تغييرات في الخادم
5. **S8** (أخطاء) + **S9** (تحميل) — تحسينات UX عامة
