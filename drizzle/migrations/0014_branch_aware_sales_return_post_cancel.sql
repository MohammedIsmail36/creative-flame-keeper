CREATE OR REPLACE FUNCTION public.recalculate_customer_balance_internal(p_customer_id uuid) RETURNS numeric LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v numeric;
BEGIN
 WITH allocations AS (SELECT payment_id,SUM(allocated_amount) amount FROM public.sales_return_payment_allocations GROUP BY payment_id)
 SELECT ROUND(c.opening_balance
 + COALESCE((SELECT SUM(total) FROM public.sales_invoices WHERE customer_id=c.id AND status='posted'),0)
 - COALESCE((SELECT SUM(total) FROM public.sales_returns WHERE customer_id=c.id AND status='posted'),0)
 - COALESCE((SELECT SUM(p.amount-2*LEAST(p.amount,GREATEST(0,COALESCE(a.amount,0)))) FROM public.customer_payments p LEFT JOIN allocations a ON a.payment_id=p.id WHERE p.customer_id=c.id AND p.status='posted'),0),2)
 INTO v FROM public.customers c WHERE c.id=p_customer_id;
 UPDATE public.customers SET balance=COALESCE(v,0) WHERE id=p_customer_id;
 RETURN COALESCE(v,0);
END $$;
REVOKE ALL ON FUNCTION public.recalculate_customer_balance_internal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_customer_balance_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.recalculate_customer_loyalty_internal(p_customer_id uuid) RETURNS integer LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v integer;
BEGIN
 SELECT GREATEST(COALESCE(SUM(points),0),0)::integer INTO v FROM public.loyalty_transactions WHERE customer_id=p_customer_id;
 UPDATE public.customers SET loyalty_points=v WHERE id=p_customer_id;
 RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.recalculate_customer_loyalty_internal(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recalculate_customer_loyalty_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.post_sales_return(p_return_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 r public.sales_returns%ROWTYPE; s public.company_settings%ROWTYPE; item record;
 wh uuid; br uuid; cost numeric; line_cost numeric; total_cost numeric:=0; sold numeric; returned numeric;
 costs jsonb:='{}'; lines jsonb:='[]'; ar uuid; rev uuid; inv uuid; cogs uuid;
 pn integer; jn integer; jid uuid; label text; source_qty numeric; source_value numeric;
 tax_value numeric; net_value numeric;
BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'sales')) THEN
  RETURN jsonb_build_object('success',false,'error','غير مصرح بترحيل مرتجع البيع'); END IF;
 SELECT * INTO r FROM public.sales_returns WHERE id=p_return_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','مرتجع البيع غير موجود'); END IF;
 IF r.status<>'draft' THEN RETURN jsonb_build_object('success',false,'error','يمكن ترحيل المسودة فقط'); END IF;
 SELECT * INTO s FROM public.company_settings LIMIT 1;
 IF s.locked_until_date IS NOT NULL AND r.return_date<=s.locked_until_date THEN RAISE EXCEPTION 'الفترة المحاسبية مقفلة'; END IF;
 wh:=COALESCE(r.warehouse_id,public.fn_main_warehouse_id());
 SELECT w.branch_id INTO br FROM public.warehouses w JOIN public.branches b ON b.id=w.branch_id WHERE w.id=wh AND w.is_active AND b.is_active;
 IF br IS NULL THEN RAISE EXCEPTION 'اختر مخزناً نشطاً تابعاً لفرع نشط'; END IF;
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT public.user_can_access_branch(auth.uid(),br) THEN RAISE EXCEPTION 'غير مصرح باستخدام فرع المخزن'; END IF;
 IF r.total<=0 OR NOT EXISTS(SELECT 1 FROM public.sales_return_items WHERE return_id=r.id) OR EXISTS(SELECT 1 FROM public.sales_return_items WHERE return_id=r.id AND (product_id IS NULL OR quantity<=0)) THEN RAISE EXCEPTION 'أضف أصنافاً بكميات وإجمالي أكبر من صفر'; END IF;
 IF r.sales_invoice_id IS NOT NULL THEN
  PERFORM 1 FROM public.sales_invoices WHERE id=r.sales_invoice_id AND status='posted' AND customer_id IS NOT DISTINCT FROM r.customer_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة الأصلية غير مرحّلة أو لا تخص العميل'; END IF;
  IF COALESCE(auth.role(),'')<>'service_role' AND EXISTS(SELECT 1 FROM public.sales_invoices i JOIN public.warehouses w ON w.id=i.warehouse_id WHERE i.id=r.sales_invoice_id AND NOT public.user_can_access_branch(auth.uid(),w.branch_id)) THEN RAISE EXCEPTION 'غير مصرح بالوصول إلى الفاتورة الأصلية'; END IF;
 END IF;
 FOR item IN SELECT product_id,SUM(quantity) quantity FROM public.sales_return_items WHERE return_id=r.id GROUP BY product_id ORDER BY product_id LOOP
  PERFORM 1 FROM public.products WHERE id=item.product_id FOR UPDATE;
  IF r.sales_invoice_id IS NOT NULL OR COALESCE(s.enable_return_days_limit,true) THEN
   SELECT COALESCE(SUM(it.quantity),0) INTO sold FROM public.sales_invoice_items it JOIN public.sales_invoices i ON i.id=it.invoice_id
    WHERE it.product_id=item.product_id AND i.status='posted' AND i.customer_id IS NOT DISTINCT FROM r.customer_id
    AND (r.sales_invoice_id IS NULL OR i.id=r.sales_invoice_id) AND i.invoice_date<=r.return_date
    AND (s.enable_return_days_limit IS NOT TRUE OR i.invoice_date>=r.return_date-COALESCE(s.return_days_limit,30));
   SELECT COALESCE(SUM(it.quantity),0) INTO returned FROM public.sales_return_items it JOIN public.sales_returns sr ON sr.id=it.return_id
    WHERE it.product_id=item.product_id AND sr.status='posted' AND sr.id<>r.id AND sr.customer_id IS NOT DISTINCT FROM r.customer_id
    AND (r.sales_invoice_id IS NULL OR sr.sales_invoice_id=r.sales_invoice_id);
   IF item.quantity>GREATEST(sold-returned,0) THEN RAISE EXCEPTION 'الكمية المرتجعة تتجاوز المتاح للإرجاع: %',GREATEST(sold-returned,0); END IF;
  END IF;
  IF r.sales_invoice_id IS NOT NULL THEN
   SELECT SUM(total_cost),SUM(quantity) INTO source_value,source_qty FROM public.inventory_movements WHERE reference_id=r.sales_invoice_id AND reference_type='sales_invoice' AND movement_type='sale' AND product_id=item.product_id;
   IF COALESCE(source_qty,0)<=0 THEN RAISE EXCEPTION 'تكلفة البيع الأصلية غير موجودة'; END IF;
   cost:=source_value/source_qty;
  ELSE
   cost:=public.fn_branch_wac(item.product_id,br);
   IF cost<=0 THEN SELECT purchase_price INTO cost FROM public.products WHERE id=item.product_id; END IF;
  END IF;
  line_cost:=ROUND(cost*item.quantity,2); total_cost:=total_cost+line_cost;
  costs:=costs||jsonb_build_object(item.product_id::text,cost);
 END LOOP;
 SELECT id INTO ar FROM public.accounts WHERE code='1103'; SELECT id INTO rev FROM public.accounts WHERE code='4101';
 SELECT id INTO inv FROM public.accounts WHERE code='1104'; SELECT id INTO cogs FROM public.accounts WHERE code='5101';
 IF ar IS NULL OR rev IS NULL OR (total_cost>0 AND (inv IS NULL OR cogs IS NULL)) THEN RAISE EXCEPTION 'حسابات العملاء والإيرادات والمخزون والتكلفة غير مكتملة'; END IF;
 tax_value:=ROUND(r.tax,2); net_value:=ROUND(r.total-tax_value,2);
 IF net_value<0 THEN RAISE EXCEPTION 'ضريبة المرتجع تتجاوز إجماليه'; END IF;
 IF tax_value>0 AND (s.enable_tax IS NOT TRUE OR s.sales_tax_account_id IS NULL) THEN RAISE EXCEPTION 'إعداد حساب ضريبة المبيعات غير مكتمل'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('sales_returns.posted_number'));
 SELECT COALESCE(r.posted_number,COALESCE(MAX(posted_number),0)+1) INTO pn FROM public.sales_returns;
 label:=COALESCE(NULLIF(s.sales_return_prefix,''),'SRN-')||LPAD(pn::text,4,'0');
 IF net_value>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account_id',rev,'branch_id',br,'debit',net_value,'credit',0)); END IF;
 IF tax_value>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account_id',s.sales_tax_account_id,'branch_id',br,'debit',tax_value,'credit',0)); END IF;
 lines:=lines||jsonb_build_array(jsonb_build_object('account_id',ar,'branch_id',br,'debit',0,'credit',ROUND(r.total,2)));
 IF total_cost>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account_id',inv,'branch_id',br,'debit',total_cost,'credit',0),jsonb_build_object('account_id',cogs,'branch_id',br,'debit',0,'credit',total_cost)); END IF;
 PERFORM pg_advisory_xact_lock(hashtext('journal_entries.posted_number'));
 SELECT COALESCE(MAX(posted_number),0)+1 INTO jn FROM public.journal_entries;
 jid:=public.create_journal_entry(r.return_date,'مرتجع بيع رقم '||label,lines,'posted',jn,'regular');
 UPDATE public.sales_returns SET warehouse_id=wh,status='posted',journal_entry_id=jid,posted_number=pn WHERE id=r.id;
 FOR item IN SELECT product_id,SUM(quantity) quantity FROM public.sales_return_items WHERE return_id=r.id GROUP BY product_id ORDER BY product_id LOOP
  cost:=(costs->>item.product_id::text)::numeric;
  UPDATE public.products SET quantity_on_hand=quantity_on_hand+item.quantity WHERE id=item.product_id;
  INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,reference_id,reference_type,movement_date,created_by)
   VALUES(item.product_id,wh,'sale_return',item.quantity,cost,ROUND(cost*item.quantity,2),r.id,'sales_return',r.return_date,auth.uid());
 END LOOP;
 IF r.customer_id IS NOT NULL THEN PERFORM public.recalculate_customer_balance_internal(r.customer_id); PERFORM public.recalculate_customer_loyalty_internal(r.customer_id); END IF;
 INSERT INTO public.audit_log(table_name,record_id,action,old_data,new_data,user_id) VALUES('sales_returns',r.id::text,'post',jsonb_build_object('status','draft'),jsonb_build_object('status','posted','journal_entry_id',jid,'warehouse_id',wh,'branch_id',br),auth.uid());
 RETURN jsonb_build_object('success',true,'posted_number',pn,'journal_entry_id',jid);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.post_sales_return(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.post_sales_return(uuid) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cancel_sales_return(p_return_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r public.sales_returns%ROWTYPE; item record; lines jsonb; jid uuid; jn integer; br uuid; points_earned integer; points_refunded integer;
BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant')) THEN RETURN jsonb_build_object('success',false,'error','الإلغاء متاح للمدير والمحاسب فقط'); END IF;
 SELECT * INTO r FROM public.sales_returns WHERE id=p_return_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'posted' THEN RETURN jsonb_build_object('success',false,'error','يمكن إلغاء مرتجع مرحّل فقط'); END IF;
 SELECT branch_id INTO br FROM public.warehouses WHERE id=r.warehouse_id;
 IF br IS NULL OR (COALESCE(auth.role(),'')<>'service_role' AND NOT public.user_can_access_branch(auth.uid(),br)) THEN RAISE EXCEPTION 'غير مصرح باستخدام مخزن المرتجع'; END IF;
 IF EXISTS(SELECT 1 FROM public.sales_invoice_return_settlements WHERE return_id=r.id) OR EXISTS(SELECT 1 FROM public.sales_return_payment_allocations WHERE return_id=r.id) THEN RAISE EXCEPTION 'ألغِ التسويات ومبالغ الرد المرتبطة أولاً'; END IF;
 IF EXISTS(WITH it AS(SELECT product_id,SUM(quantity) q FROM public.sales_return_items WHERE return_id=r.id GROUP BY product_id), mv AS(SELECT product_id,SUM(quantity_delta) q FROM public.inventory_movements WHERE reference_id=r.id AND reference_type='sales_return' GROUP BY product_id) SELECT 1 FROM it FULL JOIN mv USING(product_id) WHERE COALESCE(it.q,0)<>COALESCE(mv.q,0)) THEN RAISE EXCEPTION 'حركات مخزون المرتجع غير مطابقة لبنوده'; END IF;
 FOR item IN SELECT product_id,warehouse_id,SUM(quantity_delta) q FROM public.inventory_movements WHERE reference_id=r.id AND reference_type='sales_return' GROUP BY product_id,warehouse_id ORDER BY product_id,warehouse_id LOOP
  PERFORM 1 FROM public.products WHERE id=item.product_id FOR UPDATE;
  PERFORM 1 FROM public.warehouse_stock WHERE product_id=item.product_id AND warehouse_id=item.warehouse_id AND quantity>=item.q FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الكمية غير متاحة في مخزن المرتجع الأصلي'; END IF;
 END LOOP;
 SELECT jsonb_agg(jsonb_build_object('account_id',l.account_id,'branch_id',l.branch_id,'debit',l.credit,'credit',l.debit,'description','عكس - '||COALESCE(l.description,''))) INTO lines
  FROM public.journal_entry_lines l JOIN public.journal_entries e ON e.id=l.journal_entry_id WHERE e.id=r.journal_entry_id AND e.status='posted' AND NOT l.is_auto_balancing;
 IF lines IS NULL THEN RAISE EXCEPTION 'القيد الأصلي غير موجود'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('journal_entries.posted_number'));
 SELECT COALESCE(MAX(posted_number),0)+1 INTO jn FROM public.journal_entries;
 jid:=public.create_journal_entry(CURRENT_DATE,'عكس مرتجع بيع رقم '||COALESCE(r.posted_number,r.return_number),lines,'posted',jn,'reversal');
 FOR item IN SELECT product_id,warehouse_id,SUM(quantity_delta) q,SUM(value_delta) v FROM public.inventory_movements WHERE reference_id=r.id AND reference_type='sales_return' GROUP BY product_id,warehouse_id ORDER BY product_id,warehouse_id LOOP
  UPDATE public.products SET quantity_on_hand=quantity_on_hand-item.q WHERE id=item.product_id;
  INSERT INTO public.inventory_movements(product_id,warehouse_id,movement_type,quantity,unit_cost,total_cost,reference_id,reference_type,movement_date,created_by,notes)
  VALUES(item.product_id,item.warehouse_id,'adjustment',-item.q,item.v/item.q,item.v,r.id,'sales_return_cancel',CURRENT_DATE,auth.uid(),'عكس مرتجع البيع');
 END LOOP;
 UPDATE public.sales_returns SET status='cancelled' WHERE id=r.id;
 IF r.customer_id IS NOT NULL THEN
  SELECT ABS(COALESCE(SUM(points) FILTER(WHERE type='reversal'),0)),COALESCE(SUM(points) FILTER(WHERE type='redeem_reversal'),0) INTO points_earned,points_refunded FROM public.loyalty_transactions WHERE reference_type='sales_return' AND reference_id=r.id;
  IF points_earned>0 THEN INSERT INTO public.loyalty_transactions(customer_id,transaction_date,points,type,reference_type,reference_id,notes,created_by) VALUES(r.customer_id,CURRENT_DATE,points_earned,'earn','sales_return',r.id,'عكس نقاط المرتجع عند الإلغاء',auth.uid()); END IF;
  IF points_refunded>0 THEN INSERT INTO public.loyalty_transactions(customer_id,transaction_date,points,type,reference_type,reference_id,notes,created_by) VALUES(r.customer_id,CURRENT_DATE,-points_refunded,'reversal','sales_return',r.id,'عكس إعادة النقاط عند الإلغاء',auth.uid()); END IF;
  PERFORM public.recalculate_customer_balance_internal(r.customer_id); PERFORM public.recalculate_customer_loyalty_internal(r.customer_id);
 END IF;
 INSERT INTO public.audit_log(table_name,record_id,action,old_data,new_data,user_id) VALUES('sales_returns',r.id::text,'cancel',jsonb_build_object('status','posted'),jsonb_build_object('status','cancelled','reversal_journal_entry_id',jid),auth.uid());
 RETURN jsonb_build_object('success',true,'reversal_journal_entry_id',jid);
EXCEPTION WHEN OTHERS THEN RETURN jsonb_build_object('success',false,'error',SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.cancel_sales_return(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cancel_sales_return(uuid) TO authenticated,service_role;
COMMENT ON FUNCTION public.post_sales_return(uuid) IS 'Atomic branch-aware return: destination warehouse branch, original sale cost for linked returns, branch WAC otherwise.';
COMMENT ON FUNCTION public.cancel_sales_return(uuid) IS 'Finance-only atomic cancellation, preserving original journal branches and appending stock reversal movements.';