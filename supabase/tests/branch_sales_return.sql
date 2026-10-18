-- Integration regression tests. All fixtures and writes are rolled back.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
DO $test$
DECLARE
 p uuid; c uuid; wh uuid; br uuid; r uuid; i uuid; result jsonb; jid uuid;
 value numeric; before_value numeric; before_qty numeric; before_points integer;
BEGIN
 SELECT id,branch_id INTO wh,br FROM public.warehouses WHERE is_active ORDER BY is_main LIMIT 1;
 IF wh IS NULL THEN RAISE EXCEPTION 'Test requires an active warehouse'; END IF;
 INSERT INTO public.products(code,name,purchase_price,selling_price,quantity_on_hand)
 VALUES('TEST-RETURN-'||gen_random_uuid(),'Branch return integration fixture',50,300,10) RETURNING id INTO p;
 INSERT INTO public.customers(code,name) VALUES('TEST-RETURN-'||gen_random_uuid(),'Return fixture customer') RETURNING id INTO c;
 INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,movement_date,reference_type)
 VALUES(p,wh,'opening_balance',10,123,1230,CURRENT_DATE,'test_return');
 INSERT INTO public.sales_invoices(customer_id,warehouse_id,invoice_date,subtotal,total,status)
 VALUES(c,wh,'2026-08-01',600,600,'draft') RETURNING id INTO i;
 INSERT INTO public.sales_invoice_items(invoice_id,product_id,quantity,unit_price,total,net_total)
 VALUES(i,p,2,300,600,600);
 result:=public.post_sales_invoice(i);
 IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Initial source invoice failed: %',result; END IF;
 SELECT loyalty_points INTO before_points FROM public.customers WHERE id=c;
 INSERT INTO public.sales_returns(customer_id,warehouse_id,return_date,subtotal,total,status)
 VALUES(c,wh,'2026-08-01',600,600,'draft') RETURNING id INTO r;
 INSERT INTO public.sales_return_items(return_id,product_id,quantity,unit_price,total,net_total)
 VALUES(r,p,2,300,600,600);
 result:=public.post_sales_return(r);
 IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Post failed: %',result; END IF;
 jid:=(result->>'journal_entry_id')::uuid;
 -- WAC is 123 for the destination branch, not the product fallback of 50.
 SELECT SUM(total_cost) INTO value FROM public.inventory_movements WHERE reference_id=r AND reference_type='sales_return';
 IF value<>246 THEN RAISE EXCEPTION 'Expected return cost 246, got %',value; END IF;
 IF EXISTS(SELECT 1 FROM public.journal_entry_lines WHERE journal_entry_id=jid AND branch_id IS DISTINCT FROM br)
 OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=jid AND origin_branch_id=br)
 OR NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_id=r AND warehouse_id=wh AND branch_id=br) THEN
 RAISE EXCEPTION 'Return dimensions do not match destination warehouse'; END IF;
 SELECT quantity INTO value FROM public.warehouse_stock WHERE warehouse_id=wh AND product_id=p;
 IF value<>10 THEN RAISE EXCEPTION 'Expected destination stock 10, got %',value; END IF;
 SELECT balance INTO value FROM public.customers WHERE id=c;
 IF value<>0 THEN RAISE EXCEPTION 'Expected customer balance 0, got %',value; END IF;
 result:=public.post_sales_return(r);
 IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Duplicate posting was accepted'; END IF;
 IF (SELECT COUNT(*) FROM public.inventory_movements WHERE reference_id=r AND reference_type='sales_return')<>1 THEN RAISE EXCEPTION 'Duplicate stock movement'; END IF;
 result:=public.cancel_sales_return(r);
 IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Cancel failed: %',result; END IF;
 SELECT quantity INTO value FROM public.warehouse_stock WHERE warehouse_id=wh AND product_id=p;
 IF value<>8 THEN RAISE EXCEPTION 'Cancellation must restore quantity 8, got %',value; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_id=r AND reference_type='sales_return')
 OR NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_id=r AND reference_type='sales_return_cancel' AND quantity_delta=-2 AND value_delta=-246 AND warehouse_id=wh) THEN
 RAISE EXCEPTION 'Cancellation must append an inverse movement without deleting history'; END IF;
 SELECT balance INTO value FROM public.customers WHERE id=c;
 IF value<>600 THEN RAISE EXCEPTION 'Cancellation must restore customer balance to 600'; END IF;
 IF (SELECT loyalty_points FROM public.customers WHERE id=c)<>before_points THEN RAISE EXCEPTION 'Cancellation must restore loyalty'; END IF;
 -- Original sale cost stays 123 even after the destination WAC changes.
 INSERT INTO public.sales_invoices(customer_id,warehouse_id,invoice_date,subtotal,total,status)
 VALUES(c,wh,'2026-08-01',300,300,'draft') RETURNING id INTO i;
 INSERT INTO public.sales_invoice_items(invoice_id,product_id,quantity,unit_price,total,net_total)
 VALUES(i,p,1,300,300,300);
 result:=public.post_sales_invoice(i);
 IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Source invoice failed: %',result; END IF;
 INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,movement_date,reference_type)
 VALUES(p,wh,'purchase',1,200,200,CURRENT_DATE,'test_return');
 INSERT INTO public.sales_returns(customer_id,sales_invoice_id,warehouse_id,return_date,subtotal,total,status)
 VALUES(c,i,wh,'2026-08-01',300,300,'draft') RETURNING id INTO r;
 INSERT INTO public.sales_return_items(return_id,product_id,quantity,unit_price,total,net_total)
 VALUES(r,p,1,300,300,300);
 result:=public.post_sales_return(r);
 IF result->>'success'<>'true' THEN RAISE EXCEPTION 'Linked return failed: %',result; END IF;
 SELECT total_cost INTO value FROM public.inventory_movements WHERE reference_id=r AND reference_type='sales_return';
 IF value<>123 THEN RAISE EXCEPTION 'Linked return must use original cost 123, got %',value; END IF;
 -- Draining the original warehouse blocks cancellation and rolls back all effects.
 SELECT quantity,inventory_value INTO before_qty,before_value FROM public.branch_inventory_valuation WHERE product_id=p AND branch_id=br;
 INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,movement_date,reference_type)
 VALUES(p,wh,'adjustment',-before_qty,before_value/before_qty,before_value,CURRENT_DATE,'test_return');
 result:=public.cancel_sales_return(r);
 IF result->>'success'<>'false' THEN RAISE EXCEPTION 'Cancellation with unavailable stock accepted'; END IF;
 IF (SELECT status FROM public.sales_returns WHERE id=r)<>'posted'
 OR EXISTS(SELECT 1 FROM public.inventory_movements WHERE reference_id=r AND reference_type='sales_return_cancel') THEN RAISE EXCEPTION 'Failed cancellation left partial effects'; END IF;
 RAISE NOTICE 'Branch sales return: WAC, dimensions, balances, loyalty, idempotency, original cost, append-only cancellation, rollback passed';
END $test$;
ROLLBACK;