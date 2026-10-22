-- Every fixture and every successful financial write is rolled back.
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
DO $$
DECLARE kind text; tbl text; doc uuid; party uuid; wh uuid; header jsonb;
 before_state jsonb; after_state jsonb; failed boolean;
BEGIN
 SELECT id INTO wh FROM public.warehouses WHERE is_active ORDER BY id LIMIT 1;
 FOREACH kind IN ARRAY ARRAY['sales_invoice','purchase_invoice','sales_return'] LOOP
  tbl:=CASE kind WHEN 'sales_invoice' THEN 'sales_invoices' WHEN 'purchase_invoice' THEN 'purchase_invoices' ELSE 'sales_returns' END;
  IF kind='purchase_invoice' THEN SELECT id INTO party FROM public.suppliers ORDER BY id LIMIT 1;
  ELSE SELECT id INTO party FROM public.customers ORDER BY id LIMIT 1; END IF;
  header:=jsonb_build_object(CASE WHEN kind='purchase_invoice' THEN 'supplier_id' ELSE 'customer_id' END,party,
   CASE WHEN kind='sales_return' THEN 'return_date' ELSE 'invoice_date' END,CURRENT_DATE,
   'warehouse_id',wh,'subtotal',0,'discount',0,'tax',0,'total',0,'reference','before-failed-post');
  doc:=(public.save_document_draft(kind,NULL,header,'[]')->>'document_id')::uuid;
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',tbl) INTO before_state USING doc;
  failed:=false;
  BEGIN
   PERFORM public.save_and_post_document(kind,doc,header||'{"reference":"must-not-save"}','[]');
  EXCEPTION WHEN OTHERS THEN failed:=true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'Empty posting unexpectedly succeeded: %',kind; END IF;
  EXECUTE format('SELECT to_jsonb(d) FROM public.%I d WHERE id=$1',tbl) INTO after_state USING doc;
  IF before_state IS DISTINCT FROM after_state THEN RAISE EXCEPTION 'Failed posting persisted edits: %',kind; END IF;
 END LOOP;
END $$;
ROLLBACK;