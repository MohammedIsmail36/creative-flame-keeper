CREATE OR REPLACE FUNCTION public.save_and_post_document(p_kind text,p_id uuid,p_document jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE saved jsonb; posted jsonb; doc_id uuid;
BEGIN
 IF p_kind NOT IN ('sales_invoice','purchase_invoice','sales_return') THEN RAISE EXCEPTION 'هذا المسار غير متاح بعد'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('financial_document_posting'));
 saved:=public.save_document_draft(p_kind,p_id,p_document,p_items);
 doc_id:=(saved->>'document_id')::uuid;
 CASE p_kind
 WHEN 'sales_invoice' THEN posted:=public.post_sales_invoice(doc_id);
 WHEN 'purchase_invoice' THEN posted:=public.post_purchase_invoice(doc_id);
 WHEN 'sales_return' THEN posted:=public.post_sales_return(doc_id);
 END CASE;
 IF posted->>'success' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '%',COALESCE(posted->>'error','تعذر الترحيل'); END IF;
 IF p_kind='purchase_invoice' THEN PERFORM public.recalculate_supplier_balance_internal((p_document->>'supplier_id')::uuid); END IF;
 RETURN posted||jsonb_build_object('document_id',doc_id);
END $$;
REVOKE ALL ON FUNCTION public.save_and_post_document(text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_and_post_document(text,uuid,jsonb,jsonb) TO authenticated,service_role;