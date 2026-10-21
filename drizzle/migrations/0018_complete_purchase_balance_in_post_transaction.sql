CREATE OR REPLACE FUNCTION public.save_and_post_document(p_kind text,p_id uuid,p_document jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE saved jsonb;posted jsonb;doc_id uuid;supplier uuid;
BEGIN
 IF p_kind NOT IN ('sales_invoice','purchase_invoice','sales_return') THEN RAISE EXCEPTION 'هذا المسار غير متاح بعد'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('financial_document_posting'));
 saved:=public.save_document_draft(p_kind,p_id,p_document,p_items);doc_id:=(saved->>'document_id')::uuid;
 CASE p_kind WHEN 'sales_invoice' THEN posted:=public.post_sales_invoice(doc_id); WHEN 'purchase_invoice' THEN posted:=public.post_purchase_invoice(doc_id); WHEN 'sales_return' THEN posted:=public.post_sales_return(doc_id); END CASE;
 IF posted->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '%',COALESCE(posted->>'error','تعذر الترحيل'); END IF;
 IF p_kind='purchase_invoice' THEN
 supplier:=(p_document->>'supplier_id')::uuid;
 WITH refunds AS(SELECT payment_id,SUM(allocated_amount) amount FROM public.purchase_return_payment_allocations GROUP BY payment_id)
 UPDATE public.suppliers s SET balance=round(s.opening_balance
 +COALESCE((SELECT SUM(total) FROM public.purchase_invoices WHERE supplier_id=s.id AND status='posted'),0)
 -COALESCE((SELECT SUM(total) FROM public.purchase_returns WHERE supplier_id=s.id AND status='posted'),0)
 -COALESCE((SELECT SUM(p.amount-2*LEAST(p.amount,GREATEST(0,COALESCE(r.amount,0)))) FROM public.supplier_payments p LEFT JOIN refunds r ON r.payment_id=p.id WHERE p.supplier_id=s.id AND p.status='posted'),0),2) WHERE s.id=supplier;
 END IF;
 RETURN posted||jsonb_build_object('document_id',doc_id);
END $$;
REVOKE ALL ON FUNCTION public.save_and_post_document(text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_and_post_document(text,uuid,jsonb,jsonb) TO authenticated,service_role;