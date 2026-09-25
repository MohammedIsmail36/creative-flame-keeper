DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.post_purchase_invoice(uuid)'::regprocedure) INTO d;
  IF position('origin_branch_id' in d) = 0 THEN
    d := regexp_replace(d, '(\n  INSERT INTO journal_entry_lines)',
      E'\n  UPDATE journal_entries SET origin_branch_id = (SELECT w.branch_id FROM warehouses w WHERE w.id = COALESCE(v_invoice.warehouse_id, fn_main_warehouse_id())) WHERE id = v_je_id;\\1');
    EXECUTE d;
  END IF;
END $mig$;