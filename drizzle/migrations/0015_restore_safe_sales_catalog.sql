CREATE OR REPLACE FUNCTION public.get_sales_product_catalog()
RETURNS TABLE(id uuid,code text,name text,barcode text,model_number text,selling_price numeric,quantity_on_hand numeric,is_active boolean,product_brands jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF COALESCE(auth.role(),'')<>'service_role' AND NOT(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'accountant') OR public.has_role(auth.uid(),'sales')) THEN RAISE EXCEPTION 'غير مصرح بقراءة كتالوج البيع' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT p.id,p.code,p.name,p.barcode,p.model_number,p.selling_price,p.quantity_on_hand,p.is_active,CASE WHEN b.id IS NULL THEN NULL ELSE jsonb_build_object('name',b.name) END FROM public.products p LEFT JOIN public.product_brands b ON b.id=p.brand_id ORDER BY p.name,p.code,p.id;
END $$;
REVOKE ALL ON FUNCTION public.get_sales_product_catalog() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_sales_product_catalog() TO authenticated,service_role;
COMMENT ON FUNCTION public.get_sales_product_catalog() IS 'Shared role-checked sales catalog; deliberately excludes purchase and inventory costs.';