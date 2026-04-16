-- =======================================================================
-- المرحلة A: إصلاحات محاسبية — حسابات ضريبية + فصل الضريبة في القيود
-- =======================================================================

-- 1. إضافة حسابات ضريبية
-- ضريبة القيمة المضافة للمدخلات (أصل — ضريبة مستردة من المشتريات)
INSERT INTO public.accounts (code, name, account_type, parent_id, is_system)
VALUES (
  '1105',
  'ضريبة القيمة المضافة للمدخلات',
  'asset',
  (SELECT id FROM public.accounts WHERE code = '11' LIMIT 1),
  true
)
ON CONFLICT (code) DO NOTHING;

-- مستحقات ضريبة المبيعات (التزام — ضريبة مستحقة على المبيعات)
INSERT INTO public.accounts (code, name, account_type, parent_id, is_system)
VALUES (
  '2102',
  'مستحقات ضريبة المبيعات',
  'liability',
  COALESCE(
    (SELECT id FROM public.accounts WHERE code = '21' LIMIT 1),
    (SELECT id FROM public.accounts WHERE code = '2' LIMIT 1)
  ),
  true
)
ON CONFLICT (code) DO NOTHING;


-- 2. CHECK constraint لضمان توازن القيود المحاسبية
ALTER TABLE public.journal_entries
  ADD CONSTRAINT jentry_balanced CHECK (total_debit = total_credit);


-- 3. تعديل post_sales_invoice لفصل الضريبة عن الإيراد
CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product RECORD;
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
      IF v_product.quantity_on_hand < v_item.quantity THEN
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

  -- 6. Create JE lines (AR + Revenue)
  --    DR: العملاء (المبلغ الكامل شامل الضريبة)
  --    CR: الإيرادات (المبلغ بدون الضريبة)
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


-- 4. تعديل post_purchase_invoice لفصل الضريبة عن تكلفة المخزون
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_product RECORD;
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
  --    DR: المخزون (المبلغ بدون الضريبة — التكلفة الفعلية)
  --    CR: الموردون (المبلغ الكامل شامل الضريبة)
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
