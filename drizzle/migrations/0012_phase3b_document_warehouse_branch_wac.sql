ALTER TABLE public.sales_invoices ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_invoices ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_returns ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.fn_document_warehouse_id(p_ref_type text, p_ref_id uuid) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE p_ref_type
    WHEN 'sales_invoice' THEN (SELECT warehouse_id FROM sales_invoices WHERE id = p_ref_id)
    WHEN 'purchase_invoice' THEN (SELECT warehouse_id FROM purchase_invoices WHERE id = p_ref_id)
    WHEN 'sales_return' THEN (SELECT warehouse_id FROM sales_returns WHERE id = p_ref_id)
    WHEN 'purchase_return' THEN (SELECT warehouse_id FROM purchase_returns WHERE id = p_ref_id)
  END
$$;
GRANT EXECUTE ON FUNCTION public.fn_document_warehouse_id(text, uuid) TO authenticated;

-- Branch WAC: branch value / branch qty; falls back to company average purchase price
CREATE OR REPLACE FUNCTION public.fn_branch_wac(p_product_id uuid, p_branch_id uuid) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT CASE WHEN quantity > 0 THEN inventory_value / quantity END
       FROM branch_inventory_valuation WHERE product_id = p_product_id AND branch_id = p_branch_id),
    NULLIF(public.get_avg_purchase_price(p_product_id), 0), 0)
$$;
GRANT EXECUTE ON FUNCTION public.fn_branch_wac(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.fn_inventory_movement_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avail numeric;
BEGIN
  IF NEW.warehouse_id IS NULL AND NEW.reference_id IS NOT NULL THEN
    NEW.warehouse_id := public.fn_document_warehouse_id(NEW.reference_type, NEW.reference_id);
  END IF;
  IF NEW.warehouse_id IS NULL THEN NEW.warehouse_id := public.fn_main_warehouse_id(); END IF;
  IF NEW.warehouse_id IS NULL THEN RAISE EXCEPTION 'لا يوجد مخزن نشط للحركة'; END IF;
  SELECT branch_id INTO NEW.branch_id FROM warehouses WHERE id = NEW.warehouse_id;
  NEW.quantity_delta := public.inventory_signed_quantity(NEW.movement_type::text, NEW.quantity);
  NEW.value_delta := CASE WHEN NEW.movement_type = 'adjustment' THEN sign(NEW.quantity) * abs(NEW.total_cost)
                          WHEN NEW.movement_type IN ('sale','purchase_return') THEN -abs(NEW.total_cost)
                          ELSE abs(NEW.total_cost) END;
  IF NEW.quantity_delta < 0 THEN
    SELECT quantity INTO v_avail FROM warehouse_stock
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id FOR UPDATE;
    IF COALESCE(v_avail, 0) + NEW.quantity_delta < 0 THEN
      RAISE EXCEPTION 'الكمية غير متاحة في المخزن: المتاح % والمطلوب %', COALESCE(v_avail,0), abs(NEW.quantity_delta)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.post_sales_invoice(p_invoice_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SET search_path TO 'public'
AS $function$
DECLARE
  v_invoice RECORD; v_item RECORD; v_product RECORD; v_settings RECORD;
  v_customers_acc_id uuid; v_revenue_acc_id uuid; v_cogs_acc_id uuid;
  v_inventory_acc_id uuid; v_sales_tax_acc_id uuid;
  v_total_cost numeric := 0; v_avg_cost numeric; v_effective_cost numeric;
  v_je_id uuid; v_je_posted_num int; v_inv_posted_num int;
  v_tax_amount numeric; v_net_revenue numeric;
  v_prefix text; v_doc_label text;
  v_item_count int; v_je_desc text; v_je_total numeric;
  v_wh uuid; v_branch uuid; v_avail numeric;
BEGIN
  SELECT * INTO v_invoice FROM sales_invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'الفاتورة غير موجودة'); END IF;
  IF v_invoice.status != 'draft' THEN RETURN jsonb_build_object('success', false, 'error', 'يمكن ترحيل الفواتير ذات حالة المسودة فقط'); END IF;

  v_wh := COALESCE(v_invoice.warehouse_id, fn_main_warehouse_id());
  SELECT branch_id INTO v_branch FROM warehouses WHERE id = v_wh;
  IF v_invoice.warehouse_id IS NULL THEN UPDATE sales_invoices SET warehouse_id = v_wh WHERE id = p_invoice_id; END IF;

  SELECT COUNT(*) INTO v_item_count FROM sales_invoice_items WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL;
  IF v_item_count = 0 OR COALESCE(v_invoice.total, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن ترحيل فاتورة فارغة - يجب إضافة بنود وإجمالي أكبر من صفر');
  END IF;

  SELECT locked_until_date, stock_enforcement_enabled, enable_tax, sales_tax_account_id, sales_invoice_prefix
    INTO v_settings FROM company_settings LIMIT 1;

  IF v_settings.locked_until_date IS NOT NULL AND v_invoice.invoice_date <= v_settings.locked_until_date THEN
    RETURN jsonb_build_object('success', false, 'error',
      format('لا يمكن ترحيل فاتورة بتاريخ %s — الفترة مقفلة حتى %s', v_invoice.invoice_date, v_settings.locked_until_date));
  END IF;

  SELECT id INTO v_customers_acc_id FROM accounts WHERE code = '1103' LIMIT 1;
  SELECT id INTO v_revenue_acc_id FROM accounts WHERE code = '4101' LIMIT 1;
  SELECT id INTO v_cogs_acc_id FROM accounts WHERE code = '5101' LIMIT 1;
  SELECT id INTO v_inventory_acc_id FROM accounts WHERE code = '1104' LIMIT 1;
  IF v_customers_acc_id IS NULL OR v_revenue_acc_id IS NULL OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'تأكد من وجود حسابات العملاء والإيرادات والتكلفة والمخزون');
  END IF;

  v_tax_amount := COALESCE(v_invoice.tax, 0);
  v_net_revenue := v_invoice.total - v_tax_amount;
  IF v_tax_amount > 0 THEN
    IF v_settings.enable_tax IS NOT TRUE OR v_settings.sales_tax_account_id IS NULL THEN
      RETURN jsonb_build_object('success', false, 'error',
        'الضريبة مطبقة على الفاتورة ولكنها غير مفعّلة في الإعدادات أو لم يتم تحديد حساب ضريبة المبيعات. يرجى ضبط ذلك من تبويب "الضريبة" في إعدادات الشركة');
    END IF;
    v_sales_tax_acc_id := v_settings.sales_tax_account_id;
    PERFORM 1 FROM accounts WHERE id = v_sales_tax_acc_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('success', false, 'error', 'حساب ضريبة المبيعات المحدد في الإعدادات غير موجود في شجرة الحسابات');
    END IF;
  END IF;

  FOR v_item IN SELECT product_id, MAX(description) description, SUM(quantity) quantity
                FROM sales_invoice_items WHERE invoice_id = p_invoice_id AND product_id IS NOT NULL GROUP BY product_id LOOP
    SELECT quantity INTO v_avail FROM warehouse_stock WHERE warehouse_id = v_wh AND product_id = v_item.product_id;
    IF COALESCE(v_avail, 0) < v_item.quantity THEN
      RETURN jsonb_build_object('success', false, 'error',
        format('الكمية المطلوبة من %s أكبر من المتاح في المخزن (%s)', v_item.description, COALESCE(v_avail, 0)));
    END IF;
  END LOOP;

  FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
    IF v_item.product_id IS NOT NULL THEN
      SELECT * INTO v_product FROM products WHERE id = v_item.product_id;
      v_avg_cost := fn_branch_wac(v_item.product_id, v_branch);
      v_effective_cost := CASE WHEN v_avg_cost > 0 THEN v_avg_cost ELSE COALESCE(v_product.purchase_price, 0) END;
      v_total_cost := v_total_cost + ROUND(v_effective_cost * v_item.quantity, 2);
    END IF;
  END LOOP;

  v_inv_posted_num := v_invoice.posted_number;
  IF v_inv_posted_num IS NULL THEN
    SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_inv_posted_num FROM sales_invoices WHERE posted_number IS NOT NULL;
  END IF;

  v_prefix := COALESCE(NULLIF(v_settings.sales_invoice_prefix, ''), 'INV-');
  v_doc_label := v_prefix || LPAD(v_inv_posted_num::text, 4, '0');
  v_je_desc := format('فاتورة بيع رقم %s', v_doc_label);
  v_je_total := v_invoice.total + v_total_cost;

  IF v_invoice.journal_entry_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM journal_entries WHERE id = v_invoice.journal_entry_id) THEN
    v_je_id := v_invoice.journal_entry_id;
    DELETE FROM journal_entry_lines WHERE journal_entry_id = v_je_id;
    UPDATE journal_entries
       SET description = v_je_desc, entry_date = v_invoice.invoice_date,
           total_debit = v_je_total, total_credit = v_je_total, origin_branch_id = v_branch
     WHERE id = v_je_id;
  ELSE
    SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_je_posted_num FROM journal_entries WHERE posted_number IS NOT NULL;
    INSERT INTO journal_entries (description, entry_date, total_debit, total_credit, status, posted_number, origin_branch_id)
    VALUES (v_je_desc, v_invoice.invoice_date, v_je_total, v_je_total, 'draft', v_je_posted_num, v_branch)
    RETURNING id INTO v_je_id;
  END IF;

  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id) VALUES
    (v_je_id, v_customers_acc_id, v_invoice.total, 0, format('مبيعات - فاتورة %s', v_doc_label), v_branch),
    (v_je_id, v_revenue_acc_id, 0, v_net_revenue, format('إيراد مبيعات - فاتورة %s', v_doc_label), v_branch);
  IF v_tax_amount > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id) VALUES
      (v_je_id, v_sales_tax_acc_id, 0, v_tax_amount, format('ضريبة مبيعات - فاتورة %s', v_doc_label), v_branch);
  END IF;
  IF v_total_cost > 0 THEN
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description, branch_id) VALUES
      (v_je_id, v_cogs_acc_id, v_total_cost, 0, format('تكلفة بضاعة مباعة - فاتورة %s', v_doc_label), v_branch),
      (v_je_id, v_inventory_acc_id, 0, v_total_cost, format('خصم مخزون - فاتورة %s', v_doc_label), v_branch);
  END IF;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_je_id;
  UPDATE sales_invoices SET status = 'posted', journal_entry_id = v_je_id, posted_number = v_inv_posted_num WHERE id = p_invoice_id;

  FOR v_item IN SELECT * FROM sales_invoice_items WHERE invoice_id = p_invoice_id LOOP
    IF v_item.product_id IS NOT NULL THEN
      v_avg_cost := fn_branch_wac(v_item.product_id, v_branch);
      v_effective_cost := CASE WHEN v_avg_cost > 0 THEN v_avg_cost ELSE 0 END;
      UPDATE products SET quantity_on_hand = quantity_on_hand - v_item.quantity WHERE id = v_item.product_id;
      INSERT INTO inventory_movements (product_id, movement_type, quantity, unit_cost, total_cost, reference_id, reference_type, movement_date, warehouse_id)
      VALUES (v_item.product_id, 'sale', v_item.quantity, v_effective_cost,
        ROUND(v_effective_cost * v_item.quantity, 2), p_invoice_id, 'sales_invoice', v_invoice.invoice_date, v_wh);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'posted_number', v_inv_posted_num, 'journal_entry_id', v_je_id);
END;
$function$;

-- Branch inventory value vs inventory account (1104) per branch
CREATE OR REPLACE FUNCTION public.get_branch_inventory_reconciliation() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH inv AS (SELECT branch_id, SUM(inventory_value) v FROM branch_inventory_valuation GROUP BY 1),
  gl AS (
    SELECT l.branch_id, SUM(l.debit - l.credit) v
    FROM journal_entry_lines l JOIN journal_entries e ON e.id = l.journal_entry_id
    JOIN accounts a ON a.id = l.account_id
    WHERE e.status = 'posted' AND a.code = '1104' GROUP BY 1)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'branch_id', b.id, 'branch_name', b.name,
    'stock_value', ROUND(COALESCE(inv.v,0),2), 'gl_value', ROUND(COALESCE(gl.v,0),2),
    'difference', ROUND(COALESCE(inv.v,0) - COALESCE(gl.v,0),2)) ORDER BY b.is_main DESC, b.code), '[]'::jsonb)
  FROM branches b LEFT JOIN inv ON inv.branch_id = b.id LEFT JOIN gl ON gl.branch_id = b.id
$$;
GRANT EXECUTE ON FUNCTION public.get_branch_inventory_reconciliation() TO authenticated;