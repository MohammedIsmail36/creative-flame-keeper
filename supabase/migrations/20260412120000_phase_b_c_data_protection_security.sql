-- =======================================================================
-- المرحلة B+C: حماية البيانات + أمان الكود
-- =======================================================================

-- ─── 1. إضافة أعمدة الإعدادات الجديدة ───
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS stock_enforcement_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS locked_until_date date DEFAULT NULL;


-- ─── 2. جدول سجل التدقيق ───
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  user_id uuid DEFAULT auth.uid(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_view" ON public.audit_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_audit_log_table ON public.audit_log (table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON public.audit_log (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON public.audit_log (record_id);


-- ─── 3. دالة التدقيق العامة ───
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (table_name, record_id, action, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'INSERT', to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id::text, 'UPDATE', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (table_name, record_id, action, old_data)
    VALUES (TG_TABLE_NAME, OLD.id::text, 'DELETE', to_jsonb(OLD));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;


-- ─── 4. ربط التدقيق بالجداول الحساسة ───
CREATE TRIGGER trg_audit_journal_entries
  AFTER INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_sales_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_purchase_invoices
  AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoices
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_expenses
  AFTER INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_customer_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_supplier_payments
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

CREATE TRIGGER trg_audit_products
  AFTER UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();


-- ─── 5. فحص قفل الفترة المحاسبية على journal_entries ───
CREATE OR REPLACE FUNCTION public.fn_check_period_lock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_locked_date date;
BEGIN
  SELECT locked_until_date INTO v_locked_date
    FROM company_settings LIMIT 1;

  IF v_locked_date IS NOT NULL THEN
    IF TG_OP = 'DELETE' THEN
      IF OLD.entry_date <= v_locked_date THEN
        RAISE EXCEPTION 'لا يمكن حذف قيود في فترة محاسبية مقفلة (قبل %)', v_locked_date;
      END IF;
    ELSE
      IF NEW.entry_date <= v_locked_date THEN
        RAISE EXCEPTION 'لا يمكن إنشاء أو تعديل قيود في فترة محاسبية مقفلة (قبل %)', v_locked_date;
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_check_period_lock
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.fn_check_period_lock();


-- ─── 6. تحديث post_sales_invoice — فحص قفل الفترة + خيار المخزون ───
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product RECORD;
  v_settings RECORD;
  v_customers_acc_id uuid;
  v_revenue_acc_id uuid;
  v_cogs_acc_id uuid;
  v_inventory_acc_id uuid;
  v_sales_tax_acc_id uuid;
  v_total_cost numeric := 0;
  v_avg_cost numeric;
  v_effective_cost numeric;
  v_je_id uuid;
  v_je_posted_num int;
  v_inv_posted_num int;
  v_tax_amount numeric;
  v_net_revenue numeric;
BEGIN
  -- 1. Fetch and validate invoice
  SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة غير موجودة');
  END IF;
  IF v_invoice.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يمكن ترحيل الفواتير ذات حالة المسودة فقط');
  END IF;

  -- Fetch settings for period lock + stock enforcement
  SELECT locked_until_date, stock_enforcement_enabled
    INTO v_settings FROM company_settings LIMIT 1;

  -- Period lock check
  IF v_settings.locked_until_date IS NOT NULL
     AND v_invoice.invoice_date <= v_settings.locked_until_date THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('لا يمكن ترحيل فاتورة بتاريخ %s — الفترة مقفلة حتى %s',
        v_invoice.invoice_date, v_settings.locked_until_date));
  END IF;

  -- 2. Look up accounts
  SELECT id INTO v_customers_acc_id FROM accounts WHERE code = '1103' LIMIT 1;
  SELECT id INTO v_revenue_acc_id FROM accounts WHERE code = '4101' LIMIT 1;
  SELECT id INTO v_cogs_acc_id FROM accounts WHERE code = '5101' LIMIT 1;
  SELECT id INTO v_inventory_acc_id FROM accounts WHERE code = '1104' LIMIT 1;
  SELECT id INTO v_sales_tax_acc_id FROM accounts WHERE code = '2102' LIMIT 1;

  IF v_customers_acc_id IS NULL OR v_revenue_acc_id IS NULL
     OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حسابات العملاء والإيرادات والتكلفة والمخزون');
  END IF;

  -- Calculate tax and net revenue
  v_tax_amount := COALESCE(v_invoice.tax, 0);
  v_net_revenue := v_invoice.total - v_tax_amount;

  -- 3. Validate stock and calculate COGS
  FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id = v_item.product_id;

      -- Stock enforcement (conditional based on settings)
      IF COALESCE(v_settings.stock_enforcement_enabled, true)
         AND v_product.quantity_on_hand < v_item.quantity THEN
        RETURN jsonb_build_object('success', false, 'error',
          format('الكمية المطلوبة من %s أكبر من المتاح (%s)',
            v_item.description, v_product.quantity_on_hand));
      END IF;

      v_avg_cost := get_avg_purchase_price(v_item.product_id);
      v_effective_cost := CASE
        WHEN v_avg_cost > 0 THEN v_avg_cost
        ELSE COALESCE(v_product.purchase_price, 0)
      END;
      v_total_cost := v_total_cost + ROUND(v_effective_cost * v_item.quantity, 2);
    END IF;
  END LOOP;

  -- 4. Generate posted numbers
  SELECT COALESCE(MAX(posted_number), 0) + 1
    INTO v_je_posted_num FROM journal_entries WHERE posted_number IS NOT NULL;
  SELECT COALESCE(MAX(posted_number), 0) + 1
    INTO v_inv_posted_num FROM sales_invoices WHERE posted_number IS NOT NULL;

  -- 5. Create journal entry
  INSERT INTO journal_entries (description, entry_date, total_debit, total_credit, status, posted_number)
  VALUES (
    format('فاتورة بيع رقم %s', v_inv_posted_num),
    v_invoice.invoice_date,
    v_invoice.total + v_total_cost,
    v_invoice.total + v_total_cost,
    'posted',
    v_je_posted_num
  ) RETURNING id INTO v_je_id;

  -- 6. Create JE lines
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_customers_acc_id, v_invoice.total, 0,
      format('مبيعات - فاتورة %s', v_inv_posted_num)),
    (v_je_id, v_revenue_acc_id, 0, v_net_revenue,
      format('إيراد مبيعات - فاتورة %s', v_inv_posted_num));

  -- Tax line (only if tax > 0 and tax account exists)
  IF v_tax_amount > 0 AND v_sales_tax_acc_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
      (v_je_id, v_sales_tax_acc_id, 0, v_tax_amount,
        format('ضريبة مبيعات - فاتورة %s', v_inv_posted_num));
  END IF;

  -- COGS lines (only if there's cost)
  IF v_total_cost > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
      (v_je_id, v_cogs_acc_id, v_total_cost, 0,
        format('تكلفة بضاعة مباعة - فاتورة %s', v_inv_posted_num)),
      (v_je_id, v_inventory_acc_id, 0, v_total_cost,
        format('خصم مخزون - فاتورة %s', v_inv_posted_num));
  END IF;

  -- 7. Update invoice status
  UPDATE sales_invoices
  SET status = 'posted',
      journal_entry_id = v_je_id,
      posted_number = v_inv_posted_num
  WHERE id = p_invoice_id;

  -- 8. Update inventory and create movements
  FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      v_avg_cost := get_avg_purchase_price(v_item.product_id);
      v_effective_cost := CASE WHEN v_avg_cost > 0 THEN v_avg_cost ELSE 0 END;

      UPDATE products
      SET quantity_on_hand = quantity_on_hand - v_item.quantity
      WHERE id = v_item.product_id;

      INSERT INTO inventory_movements
        (product_id, movement_type, quantity, unit_cost, total_cost,
         reference_id, reference_type, movement_date)
      VALUES
        (v_item.product_id, 'sale', v_item.quantity, v_effective_cost,
         ROUND(v_effective_cost * v_item.quantity, 2),
         p_invoice_id, 'sales_invoice', v_invoice.invoice_date);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'posted_number', v_inv_posted_num,
    'journal_entry_id', v_je_id
  );
END;
$$;


-- ─── 7. تحديث post_purchase_invoice — فحص قفل الفترة ───
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product RECORD;
  v_locked_date date;
  v_inventory_acc_id uuid;
  v_supplier_acc_id uuid;
  v_input_vat_acc_id uuid;
  v_je_id uuid;
  v_je_posted_num int;
  v_inv_posted_num int;
  v_unit_cost numeric;
  v_tax_amount numeric;
  v_net_cost numeric;
BEGIN
  -- 1. Fetch and validate invoice
  SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة غير موجودة');
  END IF;
  IF v_invoice.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يمكن ترحيل الفواتير ذات حالة المسودة فقط');
  END IF;

  -- Period lock check
  SELECT locked_until_date INTO v_locked_date FROM company_settings LIMIT 1;
  IF v_locked_date IS NOT NULL AND v_invoice.invoice_date <= v_locked_date THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('لا يمكن ترحيل فاتورة بتاريخ %s — الفترة مقفلة حتى %s',
        v_invoice.invoice_date, v_locked_date));
  END IF;

  -- 2. Look up accounts
  SELECT id INTO v_inventory_acc_id FROM accounts WHERE code = '1104' LIMIT 1;
  SELECT id INTO v_supplier_acc_id FROM accounts WHERE code = '2101' LIMIT 1;
  SELECT id INTO v_input_vat_acc_id FROM accounts WHERE code = '1105' LIMIT 1;

  IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حسابات المخزون والموردين في شجرة الحسابات');
  END IF;

  -- Calculate tax and net cost
  v_tax_amount := COALESCE(v_invoice.tax, 0);
  v_net_cost := v_invoice.total - v_tax_amount;

  -- 3. Generate posted numbers
  SELECT COALESCE(MAX(posted_number), 0) + 1
    INTO v_je_posted_num FROM journal_entries WHERE posted_number IS NOT NULL;
  SELECT COALESCE(MAX(posted_number), 0) + 1
    INTO v_inv_posted_num FROM purchase_invoices WHERE posted_number IS NOT NULL;

  -- 4. Create journal entry
  INSERT INTO journal_entries (description, entry_date, total_debit, total_credit, status, posted_number)
  VALUES (
    format('فاتورة شراء رقم %s', v_inv_posted_num),
    v_invoice.invoice_date,
    v_invoice.total,
    v_invoice.total,
    'posted',
    v_je_posted_num
  ) RETURNING id INTO v_je_id;

  -- 5. Create JE lines
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_inventory_acc_id, v_net_cost, 0,
      format('مشتريات - فاتورة %s', v_inv_posted_num)),
    (v_je_id, v_supplier_acc_id, 0, v_invoice.total,
      format('مستحقات مورد - فاتورة %s', v_inv_posted_num));

  -- VAT input line (only if tax > 0 and tax account exists)
  IF v_tax_amount > 0 AND v_input_vat_acc_id IS NOT NULL THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
      (v_je_id, v_input_vat_acc_id, v_tax_amount, 0,
        format('ضريبة مدخلات - فاتورة %s', v_inv_posted_num));
  END IF;

  -- 6. Update invoice status
  UPDATE purchase_invoices
  SET status = 'posted',
      journal_entry_id = v_je_id,
      posted_number = v_inv_posted_num
  WHERE id = p_invoice_id;

  -- 7. Update inventory and create movements
  FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id
  LOOP
    IF v_item.product_id IS NOT NULL THEN
      v_unit_cost := CASE
        WHEN v_item.quantity > 0 THEN ROUND(v_item.net_total / v_item.quantity, 2)
        ELSE 0
      END;

      UPDATE products
      SET quantity_on_hand = quantity_on_hand + v_item.quantity
      WHERE id = v_item.product_id;

      INSERT INTO inventory_movements
        (product_id, movement_type, quantity, unit_cost, total_cost,
         reference_id, reference_type, movement_date)
      VALUES
        (v_item.product_id, 'purchase', v_item.quantity, v_unit_cost,
         v_item.net_total, p_invoice_id, 'purchase_invoice', v_invoice.invoice_date);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'posted_number', v_inv_posted_num,
    'journal_entry_id', v_je_id
  );
END;
$$;
