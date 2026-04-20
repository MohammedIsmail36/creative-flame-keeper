-- Create PPV account 5103 under parent 5
DO $$
DECLARE
  v_parent_id uuid;
  v_ppv_id uuid;
  v_inv_id uuid;
  v_je_id uuid;
  v_next_posted int;
BEGIN
  SELECT id INTO v_parent_id FROM public.accounts WHERE code = '5' LIMIT 1;

  -- Insert account if not exists
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE code = '5103') THEN
    INSERT INTO public.accounts (code, name, account_type, is_parent, is_system, parent_id, is_active)
    VALUES ('5103', 'فروقات أسعار مرتجعات الشراء', 'expense', false, true, v_parent_id, true)
    RETURNING id INTO v_ppv_id;
  ELSE
    SELECT id INTO v_ppv_id FROM public.accounts WHERE code = '5103';
    UPDATE public.accounts SET is_system = true WHERE id = v_ppv_id;
  END IF;

  -- One-time correction entry for the existing 100 EGP gap
  SELECT id INTO v_inv_id FROM public.accounts WHERE code = '1104' LIMIT 1;

  IF v_ppv_id IS NOT NULL AND v_inv_id IS NOT NULL THEN
    -- Only insert if no prior correction exists
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entries
      WHERE description = 'قيد تصحيح فرق مرتجع شراء (WAC) - تسوية لمرة واحدة'
    ) THEN
      SELECT COALESCE(MAX(posted_number), 0) + 1 INTO v_next_posted FROM public.journal_entries;

      INSERT INTO public.journal_entries (description, entry_date, total_debit, total_credit, status, posted_number, entry_type)
      VALUES (
        'قيد تصحيح فرق مرتجع شراء (WAC) - تسوية لمرة واحدة',
        CURRENT_DATE,
        100,
        100,
        'posted',
        v_next_posted,
        'regular'
      )
      RETURNING id INTO v_je_id;

      INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, debit, credit, description) VALUES
        (v_je_id, v_inv_id, 100, 0, 'تصحيح قيمة المخزون - فرق WAC مرتجع شراء'),
        (v_je_id, v_ppv_id, 0, 100, 'فرق سعر مرتجع شراء (سعر الفاتورة أعلى من WAC)');
    END IF;
  END IF;
END $$;