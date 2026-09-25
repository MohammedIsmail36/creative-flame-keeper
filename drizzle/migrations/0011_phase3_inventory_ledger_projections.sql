ALTER TABLE public.inventory_movements
  ADD COLUMN IF NOT EXISTS warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS quantity_delta numeric,
  ADD COLUMN IF NOT EXISTS value_delta numeric;

CREATE OR REPLACE FUNCTION public.fn_main_warehouse_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT w.id FROM public.warehouses w
  WHERE w.branch_id = public.fn_main_branch_id() AND w.is_active
  ORDER BY w.is_main DESC, w.created_at LIMIT 1
$$;

UPDATE public.inventory_movements SET warehouse_id = public.fn_main_warehouse_id() WHERE warehouse_id IS NULL;
UPDATE public.inventory_movements m SET branch_id = w.branch_id FROM public.warehouses w WHERE w.id = m.warehouse_id AND m.branch_id IS NULL;
UPDATE public.inventory_movements SET
  quantity_delta = public.inventory_signed_quantity(movement_type::text, quantity),
  value_delta = CASE WHEN movement_type = 'adjustment' THEN sign(quantity) * abs(total_cost)
                     WHEN movement_type IN ('sale','purchase_return') THEN -abs(total_cost)
                     ELSE abs(total_cost) END
WHERE quantity_delta IS NULL;

CREATE INDEX IF NOT EXISTS idx_inv_mov_wh_product ON public.inventory_movements(warehouse_id, product_id);
CREATE INDEX IF NOT EXISTS idx_inv_mov_branch_product ON public.inventory_movements(branch_id, product_id);

CREATE TABLE public.warehouse_stock (
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (warehouse_id, product_id)
);
GRANT SELECT ON public.warehouse_stock TO authenticated;
GRANT ALL ON public.warehouse_stock TO service_role;
ALTER TABLE public.warehouse_stock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read warehouse stock" ON public.warehouse_stock FOR SELECT TO authenticated USING (true);

CREATE TABLE public.branch_inventory_valuation (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 0,
  inventory_value numeric NOT NULL DEFAULT 0,
  average_cost numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, branch_id)
);
GRANT SELECT ON public.branch_inventory_valuation TO authenticated;
GRANT ALL ON public.branch_inventory_valuation TO service_role;
ALTER TABLE public.branch_inventory_valuation ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read branch valuation" ON public.branch_inventory_valuation FOR SELECT TO authenticated USING (true);

-- Apply one movement delta to both projections (sign = +1 apply, -1 revert)
CREATE OR REPLACE FUNCTION public.fn_apply_movement_projection(
  p_warehouse_id uuid, p_branch_id uuid, p_product_id uuid, p_qty numeric, p_value numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_q numeric; v_v numeric;
BEGIN
  INSERT INTO warehouse_stock(warehouse_id, product_id, quantity) VALUES (p_warehouse_id, p_product_id, 0)
  ON CONFLICT DO NOTHING;
  UPDATE warehouse_stock SET quantity = quantity + p_qty, updated_at = now()
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id;

  INSERT INTO branch_inventory_valuation(product_id, branch_id) VALUES (p_product_id, p_branch_id)
  ON CONFLICT DO NOTHING;
  SELECT quantity, inventory_value INTO v_q, v_v FROM branch_inventory_valuation
  WHERE product_id = p_product_id AND branch_id = p_branch_id FOR UPDATE;
  v_q := v_q + p_qty; v_v := v_v + p_value;
  IF v_q = 0 THEN v_v := 0; END IF;  -- zero quantity = zero value
  UPDATE branch_inventory_valuation SET quantity = v_q, inventory_value = round(v_v, 4),
    average_cost = CASE WHEN v_q > 0 THEN round(v_v / v_q, 4) ELSE 0 END, updated_at = now()
  WHERE product_id = p_product_id AND branch_id = p_branch_id;
END $$;

CREATE OR REPLACE FUNCTION public.fn_inventory_movement_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_avail numeric;
BEGIN
  IF NEW.warehouse_id IS NULL THEN NEW.warehouse_id := public.fn_main_warehouse_id(); END IF;
  IF NEW.warehouse_id IS NULL THEN RAISE EXCEPTION 'لا يوجد مخزن نشط للحركة'; END IF;
  SELECT branch_id INTO NEW.branch_id FROM warehouses WHERE id = NEW.warehouse_id; -- branch derived from warehouse
  NEW.quantity_delta := public.inventory_signed_quantity(NEW.movement_type::text, NEW.quantity);
  NEW.value_delta := CASE WHEN NEW.movement_type = 'adjustment' THEN sign(NEW.quantity) * abs(NEW.total_cost)
                          WHEN NEW.movement_type IN ('sale','purchase_return') THEN -abs(NEW.total_cost)
                          ELSE abs(NEW.total_cost) END;
  IF NEW.quantity_delta < 0 THEN
    SELECT quantity INTO v_avail FROM warehouse_stock
    WHERE warehouse_id = NEW.warehouse_id AND product_id = NEW.product_id FOR UPDATE;
    IF COALESCE(v_avail, 0) + NEW.quantity_delta < 0 THEN
      RAISE EXCEPTION 'الكمية غير متاحة في المخزن: المتاح % والمطلوب %', COALESCE(v_avail,0), abs(NEW.quantity_delta)
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_inventory_movement_after() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('DELETE','UPDATE') THEN
    PERFORM public.fn_apply_movement_projection(OLD.warehouse_id, OLD.branch_id, OLD.product_id, -OLD.quantity_delta, -OLD.value_delta);
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') THEN
    PERFORM public.fn_apply_movement_projection(NEW.warehouse_id, NEW.branch_id, NEW.product_id, NEW.quantity_delta, NEW.value_delta);
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_inventory_movement_before BEFORE INSERT OR UPDATE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_inventory_movement_before();
CREATE TRIGGER trg_inventory_movement_after AFTER INSERT OR UPDATE OR DELETE ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.fn_inventory_movement_after();

CREATE OR REPLACE FUNCTION public.rebuild_inventory_projections() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; n int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;
  DELETE FROM warehouse_stock WHERE true;
  DELETE FROM branch_inventory_valuation WHERE true;
  FOR r IN SELECT * FROM inventory_movements ORDER BY movement_date, created_at, id LOOP
    PERFORM public.fn_apply_movement_projection(r.warehouse_id, r.branch_id, r.product_id, r.quantity_delta, r.value_delta);
    n := n + 1;
  END LOOP;
  RETURN jsonb_build_object('movements', n);
END $$;

CREATE OR REPLACE FUNCTION public.get_inventory_projection_check() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH m AS (SELECT warehouse_id, product_id, SUM(quantity_delta) q FROM inventory_movements GROUP BY 1,2),
  diff_wh AS (
    SELECT COUNT(*) c FROM m FULL JOIN warehouse_stock s USING (warehouse_id, product_id)
    WHERE COALESCE(m.q,0) <> COALESCE(s.quantity,0)),
  diff_prod AS (
    SELECT COUNT(*) c FROM products p
    LEFT JOIN (SELECT product_id, SUM(quantity) q FROM warehouse_stock GROUP BY 1) s ON s.product_id = p.id
    WHERE COALESCE(s.q,0) <> p.quantity_on_hand),
  neg AS (SELECT COUNT(*) c FROM warehouse_stock WHERE quantity < 0),
  val AS (SELECT b.id, b.name, COALESCE(SUM(v.inventory_value),0) inv FROM branches b
          LEFT JOIN branch_inventory_valuation v ON v.branch_id = b.id GROUP BY b.id, b.name)
  SELECT jsonb_build_object(
    'warehouse_mismatches', (SELECT c FROM diff_wh),
    'product_total_mismatches', (SELECT c FROM diff_prod),
    'negative_rows', (SELECT c FROM neg),
    'branches', (SELECT COALESCE(jsonb_agg(jsonb_build_object('branch_id', id, 'name', name, 'inventory_value', round(inv,2))), '[]') FROM val));
$$;

GRANT EXECUTE ON FUNCTION public.rebuild_inventory_projections() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_projection_check() TO authenticated;

SELECT public.rebuild_inventory_projections();