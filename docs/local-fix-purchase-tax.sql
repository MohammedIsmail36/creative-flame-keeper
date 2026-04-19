-- =======================================================================
-- إصلاح post_purchase_invoice & post_purchase_return لفصل الضريبة بشكل صحيح
-- يطبَّق على الفرع المحلي local-selfhosted (Self-hosted Supabase)
--
-- المشكلة:
--   النسخة السابقة كانت تستخدم v_invoice.total (شامل الضريبة) في كلا
--   جانبي القيد، فيتضخم حساب المخزون 1104 بقيمة الضريبة، ولا تُسجَّل
--   الضريبة كأصل مستردّ في حساب 1105.
--
-- الإصلاح:
--   - فصل الضريبة في سطر مستقل على حساب 1105 (ضريبة المدخلات)
--   - تحميل المخزون بالقيمة الصافية فقط (total - tax)
--   - دائن المورد بالإجمالي الكامل (total)
--   - رفض الترحيل بخطأ واضح إذا الضريبة > 0 وحساب 1105 مفقود
--   - تطبيق نفس المعالجة على المرتجع بالاتجاه المعاكس
-- =======================================================================

-- 1) ضمان وجود حساب 1105 (ضريبة المدخلات) — idempotent
INSERT INTO public.accounts (code, name, account_type, parent_id, is_system, is_active)
VALUES (
  '1105',
  'ضريبة القيمة المضافة للمدخلات',
  'asset',
  COALESCE(
    (SELECT id FROM public.accounts WHERE code = '11' LIMIT 1),
    (SELECT id FROM public.accounts WHERE code = '1' LIMIT 1)
  ),
  true, true
)
ON CONFLICT (code) DO NOTHING;


-- 2) إعادة تعريف post_purchase_invoice مع فصل الضريبة
CREATE OR REPLACE FUNCTION public.post_purchase_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_inventory_acc_id uuid;
  v_supplier_acc_id  uuid;
  v_tax_input_acc_id uuid;
  v_je_id uuid;
  v_je_posted_num int;
  v_inv_posted_num int;
  v_unit_cost numeric;
  v_tax_amount numeric;
  v_net_inventory numeric;
BEGIN
  -- 1. Fetch & validate
  SELECT * INTO v_invoice FROM purchase_invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'الفاتورة غير موجودة');
  END IF;
  IF v_invoice.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يمكن ترحيل الفواتير ذات حالة المسودة فقط');
  END IF;

  -- 2. Look up accounts
  SELECT id INTO v_inventory_acc_id FROM accounts WHERE code = '1104' LIMIT 1;
  SELECT id INTO v_supplier_acc_id  FROM accounts WHERE code = '2101' LIMIT 1;
  SELECT id INTO v_tax_input_acc_id FROM accounts WHERE code = '1105' LIMIT 1;

  IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حسابات المخزون (1104) والموردين (2101) في شجرة الحسابات');
  END IF;

  v_tax_amount := COALESCE(v_invoice.tax, 0);

  -- إذا فيه ضريبة لازم يكون فيه حساب لها — لا نتجاهلها بصمت
  IF v_tax_amount > 0 AND v_tax_input_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حساب ضريبة القيمة المضافة للمدخلات (1105) قبل ترحيل فاتورة بضريبة');
  END IF;

  v_net_inventory := ROUND(v_invoice.total - v_tax_amount, 2);

  -- 3. Posted numbers
  SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_je_posted_num
    FROM journal_entries WHERE posted_number IS NOT NULL;
  SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_inv_posted_num
    FROM purchase_invoices WHERE posted_number IS NOT NULL;

  -- 4. Journal entry
  INSERT INTO journal_entries (description, entry_date, total_debit, total_credit, status, posted_number)
  VALUES (
    format('فاتورة شراء رقم %s', v_inv_posted_num),
    v_invoice.invoice_date,
    v_invoice.total, v_invoice.total,
    'posted', v_je_posted_num
  ) RETURNING id INTO v_je_id;

  -- 5. JE lines: المخزون (الصافي) + ضريبة المدخلات (إن وُجدت) + المورد (الإجمالي)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_je_id, v_inventory_acc_id, v_net_inventory, 0,
          format('مشتريات - فاتورة %s', v_inv_posted_num));

  IF v_tax_amount > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_je_id, v_tax_input_acc_id, v_tax_amount, 0,
            format('ضريبة مدخلات - فاتورة %s', v_inv_posted_num));
  END IF;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_je_id, v_supplier_acc_id, 0, v_invoice.total,
          format('مستحقات مورد - فاتورة %s', v_inv_posted_num));

  -- 6. Update invoice
  UPDATE purchase_invoices
  SET status = 'posted', journal_entry_id = v_je_id, posted_number = v_inv_posted_num
  WHERE id = p_invoice_id;

  -- 7. Inventory + movements (تكلفة المخزون = net_total / quantity، بدون الضريبة)
  FOR v_item IN SELECT * FROM purchase_invoice_items WHERE invoice_id = p_invoice_id LOOP
    IF v_item.product_id IS NOT NULL THEN
      v_unit_cost := CASE WHEN v_item.quantity > 0
                          THEN ROUND(v_item.net_total / v_item.quantity, 2) ELSE 0 END;

      UPDATE products SET quantity_on_hand = quantity_on_hand + v_item.quantity
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


-- 3) إعادة تعريف post_purchase_return بنفس المنطق (عكسي)
CREATE OR REPLACE FUNCTION public.post_purchase_return(p_return_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_return RECORD;
  v_item RECORD;
  v_inventory_acc_id uuid;
  v_supplier_acc_id  uuid;
  v_tax_input_acc_id uuid;
  v_je_id uuid;
  v_je_posted_num int;
  v_ret_posted_num int;
  v_tax_amount numeric;
  v_net_inventory numeric;
BEGIN
  SELECT * INTO v_return FROM purchase_returns WHERE id = p_return_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'المرتجع غير موجود');
  END IF;
  IF v_return.status != 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'يمكن ترحيل المرتجعات ذات حالة المسودة فقط');
  END IF;

  SELECT id INTO v_inventory_acc_id FROM accounts WHERE code = '1104' LIMIT 1;
  SELECT id INTO v_supplier_acc_id  FROM accounts WHERE code = '2101' LIMIT 1;
  SELECT id INTO v_tax_input_acc_id FROM accounts WHERE code = '1105' LIMIT 1;

  IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حسابات المخزون (1104) والموردين (2101)');
  END IF;

  v_tax_amount := COALESCE(v_return.tax, 0);

  IF v_tax_amount > 0 AND v_tax_input_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حساب ضريبة القيمة المضافة للمدخلات (1105) قبل ترحيل مرتجع بضريبة');
  END IF;

  v_net_inventory := ROUND(v_return.total - v_tax_amount, 2);

  SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_je_posted_num
    FROM journal_entries WHERE posted_number IS NOT NULL;
  SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_ret_posted_num
    FROM purchase_returns WHERE posted_number IS NOT NULL;

  INSERT INTO journal_entries (description, entry_date, total_debit, total_credit, status, posted_number)
  VALUES (
    format('مرتجع شراء رقم %s', v_ret_posted_num),
    v_return.return_date,
    v_return.total, v_return.total,
    'posted', v_je_posted_num
  ) RETURNING id INTO v_je_id;

  -- DR: المورد (الإجمالي) | CR: المخزون (الصافي) + CR: ضريبة المدخلات (إن وُجدت)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_je_id, v_supplier_acc_id, v_return.total, 0,
          format('مرتجع شراء - %s', v_ret_posted_num));

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
  VALUES (v_je_id, v_inventory_acc_id, 0, v_net_inventory,
          format('خصم مخزون مرتجع - %s', v_ret_posted_num));

  IF v_tax_amount > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description)
    VALUES (v_je_id, v_tax_input_acc_id, 0, v_tax_amount,
            format('عكس ضريبة مدخلات - %s', v_ret_posted_num));
  END IF;

  UPDATE purchase_returns
  SET status = 'posted', journal_entry_id = v_je_id, posted_number = v_ret_posted_num
  WHERE id = p_return_id;

  -- خصم المخزون
  FOR v_item IN SELECT * FROM purchase_return_items WHERE return_id = p_return_id LOOP
    IF v_item.product_id IS NOT NULL THEN
      UPDATE products SET quantity_on_hand = quantity_on_hand - v_item.quantity
      WHERE id = v_item.product_id;

      INSERT INTO inventory_movements
        (product_id, movement_type, quantity, unit_cost, total_cost,
         reference_id, reference_type, movement_date)
      VALUES
        (v_item.product_id, 'purchase_return', v_item.quantity,
         CASE WHEN v_item.quantity > 0 THEN ROUND(v_item.total / v_item.quantity, 2) ELSE 0 END,
         v_item.total, p_return_id, 'purchase_return', v_return.return_date);
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'posted_number', v_ret_posted_num,
    'journal_entry_id', v_je_id
  );
END;
$$;
