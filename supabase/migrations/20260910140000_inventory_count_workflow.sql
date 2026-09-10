-- Inventory count (stock-take) workflow: draft -> counting -> review -> approved

ALTER TABLE public.inventory_adjustments
  ADD COLUMN IF NOT EXISTS count_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS counted_by uuid,
  ADD COLUMN IF NOT EXISTS counted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS counted_by_name text;

ALTER TABLE public.inventory_adjustment_items
  ADD COLUMN IF NOT EXISTS counted_quantity numeric,
  ADD COLUMN IF NOT EXISTS is_extra boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_inv_adj_items_adjustment
  ON public.inventory_adjustment_items (adjustment_id);

-- Generate the snapshot lines for a count document
CREATE OR REPLACE FUNCTION public.start_inventory_count(p_adjustment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_count integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')) THEN
    RAISE EXCEPTION 'غير مصرح ببدء الجرد';
  END IF;

  SELECT status INTO v_status
  FROM public.inventory_adjustments
  WHERE id = p_adjustment_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'مستند الجرد غير موجود';
  END IF;
  IF v_status <> 'draft' THEN
    RAISE EXCEPTION 'لا يمكن بدء الجرد إلا من حالة المسودة';
  END IF;

  DELETE FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id;

  INSERT INTO public.inventory_adjustment_items (
    adjustment_id, product_id, system_quantity, actual_quantity,
    difference, unit_cost, total_cost, counted_quantity, is_extra
  )
  SELECT
    p_adjustment_id,
    p.id,
    p.quantity_on_hand,
    p.quantity_on_hand,
    0,
    COALESCE(NULLIF(public.get_avg_purchase_price(p.id), 0), p.purchase_price, 0),
    0,
    NULL,
    false
  FROM public.products p
  WHERE p.is_active = true
    AND p.quantity_on_hand > 0;

  SELECT count(*) INTO v_count
  FROM public.inventory_adjustment_items
  WHERE adjustment_id = p_adjustment_id;

  UPDATE public.inventory_adjustments
  SET status = 'counting',
      count_started_at = now()
  WHERE id = p_adjustment_id;

  RETURN v_count;
END;
$$;

-- Add a product that physically exists but is not part of the snapshot
CREATE OR REPLACE FUNCTION public.add_inventory_count_extra_item(
  p_adjustment_id uuid,
  p_product_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_id uuid;
  v_qty numeric;
  v_cost numeric;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')) THEN
    RAISE EXCEPTION 'غير مصرح بتعديل الجرد';
  END IF;

  SELECT status INTO v_status FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_status NOT IN ('counting', 'review') THEN
    RAISE EXCEPTION 'لا يمكن إضافة صنف في هذه الحالة';
  END IF;

  SELECT id INTO v_id
  FROM public.inventory_adjustment_items
  WHERE adjustment_id = p_adjustment_id AND product_id = p_product_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT quantity_on_hand,
         COALESCE(NULLIF(public.get_avg_purchase_price(id), 0), purchase_price, 0)
    INTO v_qty, v_cost
  FROM public.products WHERE id = p_product_id;

  IF v_qty IS NULL THEN
    RAISE EXCEPTION 'المنتج غير موجود';
  END IF;

  INSERT INTO public.inventory_adjustment_items (
    adjustment_id, product_id, system_quantity, actual_quantity,
    difference, unit_cost, total_cost, counted_quantity, is_extra
  ) VALUES (
    p_adjustment_id, p_product_id, v_qty, v_qty, 0, v_cost, 0, NULL, true
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Treat every not-counted line as matching the system quantity
CREATE OR REPLACE FUNCTION public.mark_uncounted_as_matching(p_adjustment_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_rows integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')) THEN
    RAISE EXCEPTION 'غير مصرح بتعديل الجرد';
  END IF;

  SELECT status INTO v_status FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_status NOT IN ('counting', 'review') THEN
    RAISE EXCEPTION 'لا يمكن تعديل الجرد في هذه الحالة';
  END IF;

  UPDATE public.inventory_adjustment_items
  SET counted_quantity = system_quantity,
      actual_quantity = system_quantity,
      difference = 0,
      total_cost = 0,
      counted_at = now()
  WHERE adjustment_id = p_adjustment_id
    AND counted_quantity IS NULL;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$$;

-- Close the counting stage and compute differences
CREATE OR REPLACE FUNCTION public.finish_inventory_count(p_adjustment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_counted integer;
  v_total integer;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')) THEN
    RAISE EXCEPTION 'غير مصرح بإنهاء الجرد';
  END IF;

  SELECT status INTO v_status FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_status <> 'counting' THEN
    RAISE EXCEPTION 'لا يمكن إنهاء العد إلا أثناء الجرد';
  END IF;

  UPDATE public.inventory_adjustment_items
  SET actual_quantity = COALESCE(counted_quantity, system_quantity),
      difference = COALESCE(counted_quantity, system_quantity) - system_quantity,
      total_cost = abs(COALESCE(counted_quantity, system_quantity) - system_quantity) * unit_cost
  WHERE adjustment_id = p_adjustment_id;

  SELECT count(*) FILTER (WHERE counted_quantity IS NOT NULL), count(*)
    INTO v_counted, v_total
  FROM public.inventory_adjustment_items
  WHERE adjustment_id = p_adjustment_id;

  UPDATE public.inventory_adjustments
  SET status = 'review',
      counted_by = COALESCE(counted_by, auth.uid()),
      counted_at = now(),
      reviewed_at = now()
  WHERE id = p_adjustment_id;

  RETURN jsonb_build_object('counted', v_counted, 'total', v_total);
END;
$$;

-- Back to counting from review
CREATE OR REPLACE FUNCTION public.reopen_inventory_count(p_adjustment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'accountant')) THEN
    RAISE EXCEPTION 'غير مصرح بتعديل الجرد';
  END IF;

  SELECT status INTO v_status FROM public.inventory_adjustments WHERE id = p_adjustment_id;
  IF v_status <> 'review' THEN
    RAISE EXCEPTION 'لا يمكن الرجوع للعد في هذه الحالة';
  END IF;

  UPDATE public.inventory_adjustments SET status = 'counting' WHERE id = p_adjustment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.start_inventory_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finish_inventory_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_inventory_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_uncounted_as_matching(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_inventory_count_extra_item(uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.start_inventory_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finish_inventory_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_inventory_count(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_uncounted_as_matching(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_inventory_count_extra_item(uuid, uuid) TO authenticated, service_role;