\set ON_ERROR_STOP on

DO $guard$
BEGIN
  IF current_database() <> 'codex_sales_atomic_test' THEN
    RAISE EXCEPTION 'هذا الاختبار يعمل فقط على قاعدة codex_sales_atomic_test المؤقتة';
  END IF;
END;
$guard$;

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', false);

DO $test$
DECLARE
  v_customer_id uuid;
  v_product_id uuid;
  v_invoice_id uuid;
  v_return_id uuid;
  v_result jsonb;
  v_original_journal_id uuid;
  v_reversal_journal_id uuid;
  v_value numeric;
BEGIN
  INSERT INTO public.company_settings (
    company_name,
    enable_return_days_limit,
    stock_enforcement_enabled,
    loyalty_enabled,
    locked_until_date
  ) VALUES ('Atomic sales test', false, true, true, NULL);

  INSERT INTO public.accounts (code, name, account_type) VALUES
    ('1103', 'Customers', 'asset'),
    ('1104', 'Inventory', 'asset'),
    ('4101', 'Sales revenue', 'revenue'),
    ('5101', 'Cost of goods sold', 'expense');

  INSERT INTO public.customers (code, name, opening_balance, balance, loyalty_points)
  VALUES ('AT-C1', 'Atomic customer', 0, 0, 50)
  RETURNING id INTO v_customer_id;

  INSERT INTO public.loyalty_transactions (
    customer_id, transaction_date, points, type, reference_type, notes
  ) VALUES (
    v_customer_id, CURRENT_DATE, 50, 'manual_adjust', 'test_opening', 'Opening test points'
  );

  INSERT INTO public.products (
    code,
    name,
    purchase_price,
    selling_price,
    quantity_on_hand
  ) VALUES ('AT-P1', 'Atomic product', 50, 100, 10)
  RETURNING id INTO v_product_id;

  INSERT INTO public.sales_invoices (
    invoice_number,
    customer_id,
    invoice_date,
    subtotal,
    tax,
    total,
    loyalty_points_redeemed,
    loyalty_discount,
    status
  ) VALUES (-900001, v_customer_id, CURRENT_DATE, 200, 0, 190, 10, 10, 'draft')
  RETURNING id INTO v_invoice_id;

  INSERT INTO public.sales_invoice_items (
    invoice_id,
    product_id,
    description,
    quantity,
    unit_price,
    total,
    net_total
  ) VALUES (v_invoice_id, v_product_id, 'Atomic product', 2, 100, 200, 190);

  v_result := public.post_sales_invoice(v_invoice_id);
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'invoice posting failed: %', v_result;
  END IF;
  v_original_journal_id := (v_result->>'journal_entry_id')::uuid;

  SELECT quantity_on_hand INTO v_value FROM public.products WHERE id = v_product_id;
  IF v_value <> 8 THEN
    RAISE EXCEPTION 'invoice stock expected 8, got %', v_value;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_movements
    WHERE reference_id = v_invoice_id
      AND reference_type = 'sales_invoice'
      AND movement_type = 'sale'
      AND unit_cost = 50
      AND total_cost = 100
  ) THEN
    RAISE EXCEPTION 'invoice purchase-price fallback cost movement is missing or incorrect';
  END IF;
  SELECT balance INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 190 THEN
    RAISE EXCEPTION 'customer balance after invoice expected 190, got %', v_value;
  END IF;
  SELECT loyalty_points INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 60 THEN
    RAISE EXCEPTION 'customer loyalty after invoice expected 60, got %', v_value;
  END IF;

  v_result := public.cancel_sales_invoice(v_invoice_id);
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'invoice cancellation failed: %', v_result;
  END IF;
  v_reversal_journal_id := (v_result->>'reversal_journal_entry_id')::uuid;

  SELECT quantity_on_hand INTO v_value FROM public.products WHERE id = v_product_id;
  IF v_value <> 10 THEN
    RAISE EXCEPTION 'invoice cancellation stock expected 10, got %', v_value;
  END IF;
  SELECT balance INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 0 THEN
    RAISE EXCEPTION 'customer balance after invoice cancellation expected 0, got %', v_value;
  END IF;
  SELECT loyalty_points INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 50 THEN
    RAISE EXCEPTION 'customer loyalty after invoice cancellation expected 50, got %', v_value;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.loyalty_transactions
    WHERE reference_id = v_invoice_id AND type = 'cancel_earn' AND points = -20
  ) OR NOT EXISTS (
    SELECT 1 FROM public.loyalty_transactions
    WHERE reference_id = v_invoice_id AND type = 'cancel_redeem' AND points = 10
  ) THEN
    RAISE EXCEPTION 'invoice loyalty cancellation ledger is incomplete';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE reference_id = v_invoice_id AND reference_type = 'sales_invoice'
  ) THEN
    RAISE EXCEPTION 'invoice movements were not removed';
  END IF;
  IF EXISTS (
    SELECT account_id
    FROM public.journal_entry_lines
    WHERE journal_entry_id IN (v_original_journal_id, v_reversal_journal_id)
    GROUP BY account_id
    HAVING ROUND(SUM(debit - credit), 2) <> 0
  ) THEN
    RAISE EXCEPTION 'invoice original and reversal entries do not net to zero';
  END IF;

  INSERT INTO public.sales_returns (
    return_number,
    customer_id,
    return_date,
    subtotal,
    tax,
    total,
    status
  ) VALUES (-900001, v_customer_id, CURRENT_DATE, 100, 0, 100, 'draft')
  RETURNING id INTO v_return_id;

  INSERT INTO public.sales_return_items (
    return_id,
    product_id,
    description,
    quantity,
    unit_price,
    total,
    net_total
  ) VALUES (v_return_id, v_product_id, 'Atomic product', 1, 100, 100, 100);

  v_result := public.post_sales_return(v_return_id);
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'return posting failed: %', v_result;
  END IF;
  v_original_journal_id := (v_result->>'journal_entry_id')::uuid;

  SELECT quantity_on_hand INTO v_value FROM public.products WHERE id = v_product_id;
  IF v_value <> 11 THEN
    RAISE EXCEPTION 'return stock expected 11, got %', v_value;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.inventory_movements
    WHERE reference_id = v_return_id
      AND reference_type = 'sales_return'
      AND movement_type = 'sale_return'
      AND unit_cost = 50
      AND total_cost = 50
  ) THEN
    RAISE EXCEPTION 'return cost movement is missing or incorrect';
  END IF;
  SELECT balance INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> -100 THEN
    RAISE EXCEPTION 'customer balance after return expected -100, got %', v_value;
  END IF;
  SELECT loyalty_points INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 40 THEN
    RAISE EXCEPTION 'customer loyalty after return expected 40, got %', v_value;
  END IF;

  v_result := public.cancel_sales_return(v_return_id);
  IF NOT COALESCE((v_result->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'return cancellation failed: %', v_result;
  END IF;
  v_reversal_journal_id := (v_result->>'reversal_journal_entry_id')::uuid;

  SELECT quantity_on_hand INTO v_value FROM public.products WHERE id = v_product_id;
  IF v_value <> 10 THEN
    RAISE EXCEPTION 'return cancellation stock expected 10, got %', v_value;
  END IF;
  SELECT balance INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 0 THEN
    RAISE EXCEPTION 'customer balance after return cancellation expected 0, got %', v_value;
  END IF;
  SELECT loyalty_points INTO v_value FROM public.customers WHERE id = v_customer_id;
  IF v_value <> 50 THEN
    RAISE EXCEPTION 'customer loyalty after return cancellation expected 50, got %', v_value;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.inventory_movements
    WHERE reference_id = v_return_id AND reference_type = 'sales_return'
  ) THEN
    RAISE EXCEPTION 'return movements were not removed';
  END IF;
  IF EXISTS (
    SELECT account_id
    FROM public.journal_entry_lines
    WHERE journal_entry_id IN (v_original_journal_id, v_reversal_journal_id)
    GROUP BY account_id
    HAVING ROUND(SUM(debit - credit), 2) <> 0
  ) THEN
    RAISE EXCEPTION 'return original and reversal entries do not net to zero';
  END IF;

  PERFORM set_config(
    'request.jwt.claims',
    '{"role":"authenticated","sub":"00000000-0000-0000-0000-000000000001"}',
    false
  );
  v_result := public.post_sales_return(gen_random_uuid());
  IF COALESCE((v_result->>'success')::boolean, false)
     OR v_result->>'error' NOT LIKE 'غير مصرح%' THEN
    RAISE EXCEPTION 'unauthorized identity was not rejected: %', v_result;
  END IF;

  IF has_function_privilege(
       'authenticated',
       'public.post_sales_invoice_atomic_internal(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.recalculate_customer_balance_internal(uuid)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'authenticated',
       'public.recalculate_customer_loyalty_internal(uuid)',
       'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'an internal sales function is still executable by authenticated';
  END IF;

  RAISE NOTICE 'atomic sales invoice and return lifecycle test passed';
END;
$test$;
