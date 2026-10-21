-- Financial fixtures never remain: run using a privileged test connection.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE kind text; header jsonb; items jsonb; saved jsonb; doc_id uuid;
 product uuid; wh uuid; party uuid; before_header jsonb; after_header jsonb;
 before_lines jsonb; after_lines jsonb; tbl text; item_tbl text; pk text;
BEGIN
 SELECT id INTO product FROM public.products ORDER BY id LIMIT 1;
 SELECT id INTO wh FROM public.warehouses WHERE is_active ORDER BY id LIMIT 1;
 IF product IS NULL OR wh IS NULL THEN RAISE EXCEPTION 'Test requires a product and warehouse'; END IF;
 FOREACH kind IN ARRAY ARRAY['sales_invoice','purchase_invoice','sales_return','purchase_return'] LOOP
  tbl:=CASE kind WHEN 'sales_invoice' THEN 'sales_invoices' WHEN 'purchase_invoice' THEN 'purchase_invoices' WHEN 'sales_return' THEN 'sales_returns' ELSE 'purchase_returns' END;
  item_tbl:=CASE kind WHEN 'sales_invoice' THEN 'sales_invoice_items' WHEN 'purchase_invoice' THEN 'purchase_invoice_items' WHEN 'sales_return' THEN 'sales_return_items' ELSE 'purchase_return_items' END;
  pk:=CASE WHEN kind IN ('sales_invoice','purchase_invoice') THEN 'invoice_id' ELSE 'return_id' END;
  IF kind IN ('sales_invoice','sales_return') THEN SELECT id INTO party FROM public.customers ORDER BY id LIMIT 1;
  ELSE SELECT id INTO party FROM public.suppliers ORDER BY id LIMIT 1; END IF;
  header:=jsonb_build_object(CASE WHEN kind IN ('sales_invoice','sales_return') THEN 'customer_id' ELSE 'supplier_id' END,party,
    CASE WHEN pk='invoice_id' THEN 'invoice_date' ELSE 'return_date' END,'2026-10-20',
    'warehouse_id',wh,'subtotal',300,'discount',0,'tax',0,'total',300);
  items:=jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1,'unit_price',300,'discount',0,'total',300,'net_total',300));
  saved:=public.save_document_draft(kind,NULL,header,items); doc_id:=(saved->>'document_id')::uuid;
  IF saved->>'success'<>'true' OR doc_id IS NULL THEN RAISE EXCEPTION 'Create failed: %',kind; END IF;
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',tbl) INTO before_header USING doc_id;
  IF before_header->>'warehouse_id'<>wh::text THEN RAISE EXCEPTION 'Warehouse lost: %',kind; END IF;
  EXECUTE format('SELECT jsonb_agg(to_jsonb(d) ORDER BY sort_order) FROM public.%I d WHERE %I=$1',item_tbl,pk) INTO before_lines USING doc_id;
  -- Late failure after header update and child deletion: invalid sort_order cast
  -- occurs during insertion, after all arithmetic validation has succeeded.
  BEGIN
   PERFORM public.save_document_draft(kind,doc_id,header||'{"reference":"must-rollback"}',
    jsonb_build_array(items->0||'{"sort_order":"invalid-integer"}'));
   RAISE EXCEPTION 'Expected insert failure did not occur';
  EXCEPTION WHEN invalid_text_representation THEN NULL;
  END;
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',tbl) INTO after_header USING doc_id;
  EXECUTE format('SELECT jsonb_agg(to_jsonb(d) ORDER BY sort_order) FROM public.%I d WHERE %I=$1',item_tbl,pk) INTO after_lines USING doc_id;
  IF after_header IS DISTINCT FROM before_header OR after_lines IS DISTINCT FROM before_lines THEN RAISE EXCEPTION 'Partial save: %',kind; END IF;
  PERFORM public.delete_document_draft(tbl,doc_id);
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',tbl) INTO after_header USING doc_id;
  IF after_header IS NOT NULL THEN RAISE EXCEPTION 'Draft not deleted: %',kind; END IF;
  EXECUTE format('SELECT jsonb_agg(to_jsonb(d)) FROM public.%I d WHERE %I=$1',item_tbl,pk) INTO after_lines USING doc_id;
  IF after_lines IS NOT NULL THEN RAISE EXCEPTION 'Orphan items: %',kind; END IF;
 END LOOP;
END $$;
ROLLBACK;