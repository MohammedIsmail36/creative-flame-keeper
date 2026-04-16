-- =============================================
-- فهارس الأداء — تسريع الاستعلامات الأكثر استخداماً
-- =============================================

-- فواتير المبيعات
CREATE INDEX IF NOT EXISTS idx_sales_invoices_customer_id
  ON public.sales_invoices (customer_id);

CREATE INDEX IF NOT EXISTS idx_sales_invoices_status_date
  ON public.sales_invoices (status, invoice_date);

-- فواتير المشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_invoices_supplier_id
  ON public.purchase_invoices (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoices_status_date
  ON public.purchase_invoices (status, invoice_date);

-- مرتجعات المبيعات
CREATE INDEX IF NOT EXISTS idx_sales_returns_customer_id
  ON public.sales_returns (customer_id);

CREATE INDEX IF NOT EXISTS idx_sales_returns_status
  ON public.sales_returns (status);

-- مرتجعات المشتريات
CREATE INDEX IF NOT EXISTS idx_purchase_returns_supplier_id
  ON public.purchase_returns (supplier_id);

CREATE INDEX IF NOT EXISTS idx_purchase_returns_status
  ON public.purchase_returns (status);

-- المصروفات
CREATE INDEX IF NOT EXISTS idx_expenses_expense_type_id
  ON public.expenses (expense_type_id);

CREATE INDEX IF NOT EXISTS idx_expenses_status
  ON public.expenses (status);

-- حركات المخزون — composite لتقارير المنتجات
CREATE INDEX IF NOT EXISTS idx_inventory_movements_product_date
  ON public.inventory_movements (product_id, movement_date);

-- بنود الفواتير والمرتجعات — FK lookups
CREATE INDEX IF NOT EXISTS idx_sales_invoice_items_invoice_id
  ON public.sales_invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice_id
  ON public.purchase_invoice_items (invoice_id);

CREATE INDEX IF NOT EXISTS idx_sales_return_items_return_id
  ON public.sales_return_items (return_id);

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_return_id
  ON public.purchase_return_items (return_id);

-- القيود المحاسبية — composite للتقارير
CREATE INDEX IF NOT EXISTS idx_journal_entries_status_date
  ON public.journal_entries (status, entry_date);
