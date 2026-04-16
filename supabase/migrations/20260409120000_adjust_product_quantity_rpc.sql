-- Atomic product quantity adjustment to prevent race conditions
-- from concurrent SELECT → UPDATE patterns
CREATE OR REPLACE FUNCTION public.adjust_product_quantity(
  p_product_id UUID,
  p_delta NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_qty NUMERIC;
BEGIN
  UPDATE products
  SET quantity_on_hand = quantity_on_hand + p_delta
  WHERE id = p_product_id
  RETURNING quantity_on_hand INTO v_new_qty;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product not found: %', p_product_id;
  END IF;

  RETURN v_new_qty;
END;
$$;
