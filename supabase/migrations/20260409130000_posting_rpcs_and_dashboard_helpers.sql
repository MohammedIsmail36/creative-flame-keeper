-- =======================================================================
-- C5: Server-side unpaid invoices query
-- =======================================================================
CREATE OR REPLACE FUNCTION public.get_unpaid_invoices(p_limit int DEFAULT 10)
RETURNS TABLE(
  id uuid,
  invoice_number bigint,
  total numeric,
  paid_amount numeric,
  remaining numeric,
  customer_id uuid,
  customer_name text
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    si.id,
    si.invoice_number,
    si.total,
    si.paid_amount,
    (si.total - si.paid_amount) AS remaining,
    si.customer_id,
    COALESCE(c.name, 'عميل نقدي') AS customer_name
  FROM sales_invoices si
  LEFT JOIN customers c ON si.customer_id = c.id
  WHERE si.status = 'posted'
    AND si.paid_amount < si.total
  ORDER BY (si.total - si.paid_amount) DESC
  LIMIT p_limit;
$$;

-- =======================================================================
-- C6: Server-side top products aggregation
-- =======================================================================
CREATE OR REPLACE FUNCTION public.get_top_products(p_limit int DEFAULT 10)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  total_qty numeric,
  total_amount numeric
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    sii.product_id,
    CONCAT_WS(' - ',
      NULLIF(pb.name, ''),
      p.name,
      NULLIF(p.model_number, '')
    ) AS product_name,
    SUM(sii.quantity) AS total_qty,
    SUM(COALESCE(sii.net_total, sii.total)) AS total_amount
  FROM sales_invoice_items sii
  JOIN sales_invoices si ON sii.invoice_id = si.id
  JOIN products p ON sii.product_id = p.id
  LEFT JOIN product_brands pb ON p.brand_id = pb.id
  WHERE si.status = 'posted'
    AND sii.product_id IS NOT NULL
  GROUP BY sii.product_id, p.name, p.model_number, pb.name
  ORDER BY total_amount DESC
  LIMIT p_limit;
$$;

-- =======================================================================
-- C2: Atomic sales invoice posting (single transaction)
-- =======================================================================
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
  v_total_cost numeric := 0;
  v_avg_cost numeric;
  v_effective_cost numeric;
  v_je_id uuid;
  v_je_posted_num int;
  v_inv_posted_num int;
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

  IF v_customers_acc_id IS NULL OR v_revenue_acc_id IS NULL
     OR v_cogs_acc_id IS NULL OR v_inventory_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حسابات العملاء والإيرادات والتكلفة والمخزون');
  END IF;

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
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
    (v_je_id, v_customers_acc_id, v_invoice.total, 0,
      format('مبيعات - فاتورة %s', v_inv_posted_num)),
    (v_je_id, v_revenue_acc_id, 0, v_invoice.total,
      format('إيراد مبيعات - فاتورة %s', v_inv_posted_num));

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

-- =======================================================================
-- C2: Atomic purchase invoice posting (single transaction)
-- =======================================================================
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
  v_je_id uuid;
  v_je_posted_num int;
  v_inv_posted_num int;
  v_unit_cost numeric;
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

  IF v_inventory_acc_id IS NULL OR v_supplier_acc_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error',
      'تأكد من وجود حسابات المخزون والموردين في شجرة الحسابات');
  END IF;

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
    (v_je_id, v_inventory_acc_id, v_invoice.total, 0,
      format('مشتريات - فاتورة %s', v_inv_posted_num)),
    (v_je_id, v_supplier_acc_id, 0, v_invoice.total,
      format('مستحقات مورد - فاتورة %s', v_inv_posted_num));

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
