CREATE OR REPLACE FUNCTION public.save_document_draft(p_kind text,p_id uuid,p_document jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE
 t text; it text; pk text; entity text; dt text; result_id uuid; state text; wh uuid; old_wh uuid; branch uuid;
 subtotal numeric:=0; net numeric:=0; line record; amount numeric; discount_amount numeric; tax_amount numeric; loyalty numeric;
 cols text; vals text; updates text;
BEGIN
 CASE p_kind
 WHEN 'sales_invoice' THEN t:='sales_invoices';it:='sales_invoice_items';entity:='customer_id';dt:='invoice_date';
 WHEN 'purchase_invoice' THEN t:='purchase_invoices';it:='purchase_invoice_items';entity:='supplier_id';dt:='invoice_date';
 WHEN 'sales_return' THEN t:='sales_returns';it:='sales_return_items';entity:='customer_id';dt:='return_date';
 WHEN 'purchase_return' THEN t:='purchase_returns';it:='purchase_return_items';entity:='supplier_id';dt:='return_date';
 ELSE RAISE EXCEPTION 'نوع المستند غير صالح'; END CASE;
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR(p_kind IN ('sales_invoice','sales_return') AND public.has_role(auth.uid(),'sales'))) THEN RAISE EXCEPTION 'غير مصرح بحفظ المستند' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_document) IS DISTINCT FROM 'object' OR jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'بيانات المستند غير صالحة'; END IF;
 IF jsonb_array_length(p_items)>2000 THEN RAISE EXCEPTION 'عدد البنود أكبر من المسموح'; END IF;
 IF NULLIF(p_document->>dt,'')::date IS NULL THEN RAISE EXCEPTION 'تاريخ المستند مطلوب'; END IF;
 IF p_id IS NOT NULL THEN
 EXECUTE format('SELECT status,warehouse_id FROM public.%I WHERE id=$1 FOR UPDATE',t) INTO state,old_wh USING p_id;
 IF state IS NULL OR state<>'draft' THEN RAISE EXCEPTION 'يمكن تعديل مسودة متاحة فقط'; END IF;
 IF old_wh IS NOT NULL AND COALESCE(auth.role(),'')<>'service_role' THEN
 SELECT branch_id INTO branch FROM public.warehouses WHERE id=old_wh;
 IF NOT public.user_can_access_branch(auth.uid(),branch) THEN RAISE EXCEPTION 'غير مصرح بمخزن المستند' USING ERRCODE='42501'; END IF; END IF; END IF;
 wh:=NULLIF(p_document->>'warehouse_id','')::uuid;
 IF wh IS NOT NULL THEN
 SELECT w.branch_id INTO branch FROM public.warehouses w JOIN public.branches b ON b.id=w.branch_id WHERE w.id=wh AND w.is_active AND b.is_active;
 IF branch IS NULL THEN RAISE EXCEPTION 'المخزن غير متاح'; END IF;
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT public.user_can_access_branch(auth.uid(),branch) THEN RAISE EXCEPTION 'غير مصرح بالمخزن المحدد' USING ERRCODE='42501'; END IF; END IF;
 IF p_id IS NULL AND p_kind IN ('sales_invoice','purchase_invoice') AND NULLIF(p_document->>entity,'') IS NULL AND jsonb_array_length(p_items)=0 THEN RAISE EXCEPTION 'لا يمكن حفظ فاتورة جديدة فارغة'; END IF;
 FOR line IN SELECT * FROM jsonb_to_recordset(p_items) AS x(product_id uuid,quantity numeric,unit_price numeric,discount numeric,total numeric,net_total numeric) LOOP
 IF line.product_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.products WHERE id=line.product_id) OR line.quantity IS NULL OR line.quantity<=0 OR line.unit_price IS NULL OR line.unit_price<0 OR COALESCE(line.discount,0)<0 THEN RAISE EXCEPTION 'قيم أحد البنود غير صالحة'; END IF;
 IF line.quantity::text IN ('NaN','Infinity','-Infinity') OR line.unit_price::text IN ('NaN','Infinity','-Infinity') OR COALESCE(line.discount,0)::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'قيم أحد البنود غير محدودة'; END IF;
 amount:=round(line.quantity*line.unit_price-COALESCE(line.discount,0),2);
 IF amount<0 OR line.total IS NULL OR line.total<>amount OR line.net_total IS NULL OR line.net_total<0 OR line.net_total>amount THEN RAISE EXCEPTION 'إجمالي أحد البنود غير مطابق'; END IF;
 subtotal:=subtotal+amount;net:=net+line.net_total;
 END LOOP;
 discount_amount:=COALESCE((p_document->>'discount')::numeric,0);tax_amount:=COALESCE((p_document->>'tax')::numeric,0);
 loyalty:=CASE WHEN p_kind='sales_invoice' THEN COALESCE((p_document->>'loyalty_discount')::numeric,0) ELSE 0 END;
 IF discount_amount<0 OR tax_amount<0 OR loyalty<0 OR discount_amount+loyalty>subtotal OR(p_document->>'subtotal')::numeric IS DISTINCT FROM subtotal OR(p_document->>'total')::numeric IS DISTINCT FROM round(subtotal-discount_amount-loyalty+tax_amount,2) OR round(net,2)<>round(subtotal-discount_amount-loyalty,2) THEN RAISE EXCEPTION 'إجماليات المستند غير مطابقة للبنود'; END IF;
 IF length(COALESCE(p_document->>'notes',''))>10000 OR length(COALESCE(p_document->>'reference',''))>1000 THEN RAISE EXCEPTION 'النص أطول من المسموح'; END IF;
 pk:=CASE WHEN p_kind IN ('sales_invoice','purchase_invoice') THEN 'invoice_id' ELSE 'return_id' END;
 cols:=format('%I,warehouse_id,%I,subtotal,discount,tax,total,notes,reference',entity,dt);
 vals:=format('r.%I,r.warehouse_id,r.%I,r.subtotal,r.discount,r.tax,r.total,r.notes,r.reference',entity,dt);
 updates:=format('%I=r.%I,warehouse_id=r.warehouse_id,%I=r.%I,subtotal=r.subtotal,discount=r.discount,tax=r.tax,total=r.total,notes=r.notes,reference=r.reference',entity,entity,dt,dt);
 IF p_kind='sales_invoice' THEN
 cols:=cols||',loyalty_points_redeemed,loyalty_discount';vals:=vals||',COALESCE(r.loyalty_points_redeemed,0),COALESCE(r.loyalty_discount,0)';updates:=updates||',loyalty_points_redeemed=COALESCE(r.loyalty_points_redeemed,0),loyalty_discount=COALESCE(r.loyalty_discount,0)'; END IF;
 IF p_id IS NULL THEN
 EXECUTE format('INSERT INTO public.%I (%s,status,created_by) SELECT %s,''draft'',auth.uid() FROM jsonb_populate_record(NULL::public.%I,$1) r RETURNING id',t,cols,vals,t) INTO result_id USING p_document;
 ELSE
 result_id:=p_id;
 EXECUTE format('UPDATE public.%I d SET %s FROM jsonb_populate_record(NULL::public.%I,$1) r WHERE d.id=$2',t,updates,t) USING p_document,p_id;
 EXECUTE format('DELETE FROM public.%I WHERE %I=$1',it,pk) USING result_id; END IF;
 EXECUTE format('INSERT INTO public.%I (%I,product_id,description,quantity,unit_price,discount,total,net_total,sort_order) SELECT $1,r.product_id,r.description,r.quantity,r.unit_price,COALESCE(r.discount,0),r.total,r.net_total,(x.ordinality-1)::integer FROM jsonb_array_elements($2) WITH ORDINALITY x(item,ordinality) CROSS JOIN LATERAL jsonb_populate_record(NULL::public.%I,x.item) r',it,pk,it) USING result_id,p_items;
 RETURN jsonb_build_object('success',true,'document_id',result_id,'invoice_id',result_id,'return_id',result_id);
END $$;
REVOKE ALL ON FUNCTION public.save_document_draft(text,uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_document_draft(text,uuid,jsonb,jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.save_sales_invoice_draft(p_invoice_id uuid,p_invoice jsonb,p_items jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=public,pg_temp AS $$ SELECT public.save_document_draft('sales_invoice',p_invoice_id,p_invoice,p_items) $$;
REVOKE ALL ON FUNCTION public.save_sales_invoice_draft(uuid,jsonb,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_sales_invoice_draft(uuid,jsonb,jsonb) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.delete_document_draft(p_table text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE state text;wh uuid;branch uuid;
BEGIN
 IF p_table NOT IN ('sales_invoices','purchase_invoices','sales_returns','purchase_returns') THEN RAISE EXCEPTION 'نوع المستند غير صالح'; END IF;
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'الحذف متاح للمدير فقط' USING ERRCODE='42501'; END IF;
 EXECUTE format('SELECT status,warehouse_id FROM public.%I WHERE id=$1 FOR UPDATE',p_table) INTO state,wh USING p_id;
 IF state IS NULL OR state<>'draft' THEN RAISE EXCEPTION 'يمكن حذف مسودة متاحة فقط'; END IF;
 IF wh IS NOT NULL AND COALESCE(auth.role(),'')<>'service_role' THEN
 SELECT branch_id INTO branch FROM public.warehouses WHERE id=wh;
 IF NOT public.user_can_access_branch(auth.uid(),branch) THEN RAISE EXCEPTION 'غير مصرح بمخزن المستند' USING ERRCODE='42501'; END IF; END IF;
 EXECUTE format('DELETE FROM public.%I WHERE id=$1',p_table) USING p_id;
 RETURN jsonb_build_object('success',true);
END $$;
REVOKE ALL ON FUNCTION public.delete_document_draft(text,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_document_draft(text,uuid) TO authenticated,service_role;