-- ═══════════════════════════════════════════════════════════
-- المرحلة 2: بُعد الفرع على سطور القيود + محرّك موازنة الفروع
-- ═══════════════════════════════════════════════════════════

-- 1) الأعمدة الجديدة
ALTER TABLE public.journal_entry_lines
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS is_auto_balancing boolean NOT NULL DEFAULT false;

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS origin_branch_id uuid REFERENCES public.branches(id);

CREATE INDEX IF NOT EXISTS idx_jel_branch ON public.journal_entry_lines(branch_id);
CREATE INDEX IF NOT EXISTS idx_je_origin_branch ON public.journal_entries(origin_branch_id);

-- أدوار الحسابات النظامية (Defaults لا Hard-coded)
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS branch_clearing_account_id uuid REFERENCES public.accounts(id),
  ADD COLUMN IF NOT EXISTS goods_in_transit_account_id uuid REFERENCES public.accounts(id);

-- 2) دوال مساعدة
CREATE OR REPLACE FUNCTION public.fn_main_branch_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM public.branches
   WHERE is_active
   ORDER BY is_main DESC, created_at ASC
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.fn_branch_clearing_account_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT cs.branch_clearing_account_id FROM public.company_settings cs LIMIT 1),
    (SELECT a.id FROM public.accounts a WHERE a.code = '1107' LIMIT 1)
  )
$$;

-- 3) اشتقاق فرع السطر عند عدم تمريره (توافق كامل مع المسارات الحالية)
CREATE OR REPLACE FUNCTION public.fn_default_journal_line_branch()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.branch_id IS NULL THEN
    NEW.branch_id := COALESCE(
      (SELECT je.origin_branch_id FROM public.journal_entries je WHERE je.id = NEW.journal_entry_id),
      public.fn_main_branch_id()
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_default_journal_line_branch ON public.journal_entry_lines;
CREATE TRIGGER trg_default_journal_line_branch
  BEFORE INSERT OR UPDATE OF branch_id ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_default_journal_line_branch();

-- 4) منع الكتابة اليدوية على حساب تسوية الفروع
CREATE OR REPLACE FUNCTION public.fn_guard_branch_clearing_manual()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clearing uuid;
BEGIN
  v_clearing := public.fn_branch_clearing_account_id();
  IF v_clearing IS NOT NULL AND NEW.account_id = v_clearing AND NOT COALESCE(NEW.is_auto_balancing, false) THEN
    RAISE EXCEPTION 'حساب تسوية بين الفروع يُكتب آليًا فقط ولا يقبل الترحيل اليدوي';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_branch_clearing_manual ON public.journal_entry_lines;
CREATE TRIGGER trg_guard_branch_clearing_manual
  BEFORE INSERT OR UPDATE ON public.journal_entry_lines
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_branch_clearing_manual();

-- 5) محرّك الموازنة — السلطة الوحيدة
CREATE OR REPLACE FUNCTION public.fn_apply_branch_balancing(p_entry_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clearing uuid;
  v_total numeric;
  r RECORD;
BEGIN
  -- إزالة سطور الموازنة السابقة ثم إعادة توليدها
  DELETE FROM public.journal_entry_lines
   WHERE journal_entry_id = p_entry_id AND is_auto_balancing = true;

  v_clearing := public.fn_branch_clearing_account_id();

  IF v_clearing IS NOT NULL THEN
    FOR r IN
      SELECT branch_id,
             ROUND(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0), 2) AS net
        FROM public.journal_entry_lines
       WHERE journal_entry_id = p_entry_id
       GROUP BY branch_id
      HAVING ROUND(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0), 2) <> 0
    LOOP
      INSERT INTO public.journal_entry_lines
        (journal_entry_id, account_id, branch_id, debit, credit, description, is_auto_balancing)
      VALUES (
        p_entry_id, v_clearing, r.branch_id,
        CASE WHEN r.net < 0 THEN ABS(r.net) ELSE 0 END,
        CASE WHEN r.net > 0 THEN r.net ELSE 0 END,
        'تسوية بين الفروع (آلي)', true
      );
    END LOOP;
  END IF;

  SELECT ROUND(COALESCE(SUM(debit), 0), 2) INTO v_total
    FROM public.journal_entry_lines WHERE journal_entry_id = p_entry_id;

  UPDATE public.journal_entries
     SET total_debit = v_total, total_credit = v_total, updated_at = now()
   WHERE id = p_entry_id;
END;
$$;

-- 6) بوابتا كتابة القيود: قراءة الفرع من السطور + تطبيق المحرّك
CREATE OR REPLACE FUNCTION public.create_journal_entry(
  p_entry_date date, p_description text, p_lines jsonb,
  p_status text DEFAULT 'posted', p_posted_number integer DEFAULT NULL,
  p_entry_type text DEFAULT 'regular')
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_total numeric;
  v_id uuid;
  v_origin uuid;
BEGIN
  IF p_description IS NULL OR btrim(p_description) = '' THEN
    RAISE EXCEPTION 'وصف القيد مطلوب';
  END IF;

  v_total := public.fn_validate_journal_lines_json(p_lines);

  SELECT COALESCE(
    (SELECT (l->>'branch_id')::uuid FROM jsonb_array_elements(p_lines) AS l
      WHERE NULLIF(l->>'branch_id','') IS NOT NULL LIMIT 1),
    public.fn_main_branch_id()
  ) INTO v_origin;

  INSERT INTO public.journal_entries (
    entry_date, description, status, total_debit, total_credit, posted_number,
    entry_type, created_by, origin_branch_id
  ) VALUES (
    p_entry_date, p_description, COALESCE(p_status, 'posted'), v_total, v_total, p_posted_number,
    COALESCE(p_entry_type, 'regular'), auth.uid(), v_origin
  )
  RETURNING id INTO v_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit, credit, description)
  SELECT v_id,
         (l->>'account_id')::uuid,
         NULLIF(l->>'branch_id','')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         COALESCE(l->>'description', p_description)
  FROM jsonb_array_elements(p_lines) AS l;

  PERFORM public.fn_apply_branch_balancing(v_id);

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_journal_entry_lines(
  p_entry_id uuid, p_lines jsonb, p_entry_date date DEFAULT NULL,
  p_description text DEFAULT NULL, p_status text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_total numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries WHERE id = p_entry_id) THEN
    RAISE EXCEPTION 'القيد غير موجود';
  END IF;

  v_total := public.fn_validate_journal_lines_json(p_lines);

  DELETE FROM public.journal_entry_lines WHERE journal_entry_id = p_entry_id;

  INSERT INTO public.journal_entry_lines (journal_entry_id, account_id, branch_id, debit, credit, description)
  SELECT p_entry_id,
         (l->>'account_id')::uuid,
         NULLIF(l->>'branch_id','')::uuid,
         COALESCE((l->>'debit')::numeric, 0),
         COALESCE((l->>'credit')::numeric, 0),
         COALESCE(l->>'description', p_description)
  FROM jsonb_array_elements(p_lines) AS l;

  UPDATE public.journal_entries je
     SET entry_date = COALESCE(p_entry_date, je.entry_date),
         description = COALESCE(p_description, je.description),
         status = COALESCE(p_status, je.status),
         posted_number = CASE
           WHEN COALESCE(p_status, je.status) = 'posted' AND je.posted_number IS NULL
             THEN (SELECT COALESCE(MAX(x.posted_number), 0) + 1 FROM public.journal_entries x)
           ELSE je.posted_number
         END,
         updated_at = now()
   WHERE je.id = p_entry_id;

  PERFORM public.fn_apply_branch_balancing(p_entry_id);

  RETURN p_entry_id;
END;
$$;

-- 7) التحقق: توازن كل فرع + وجود الفرع على كل سطر
CREATE OR REPLACE FUNCTION public.fn_assert_journal_entry_integrity()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_entry_id uuid;
  v_status text;
  v_sd numeric; v_sc numeric; v_n integer; v_td numeric; v_tc numeric;
  v_no_branch integer;
  v_unbalanced_branch text;
BEGIN
  v_entry_id := COALESCE(NEW.id, OLD.id);

  SELECT status, ROUND(total_debit, 2), ROUND(total_credit, 2)
    INTO v_status, v_td, v_tc
  FROM public.journal_entries WHERE id = v_entry_id;

  IF v_status IS NULL THEN RETURN NULL; END IF;
  IF v_status <> 'posted' THEN RETURN NULL; END IF;

  SELECT COUNT(*), ROUND(COALESCE(SUM(debit), 0), 2), ROUND(COALESCE(SUM(credit), 0), 2),
         COUNT(*) FILTER (WHERE branch_id IS NULL)
    INTO v_n, v_sd, v_sc, v_no_branch
  FROM public.journal_entry_lines WHERE journal_entry_id = v_entry_id;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'لا يمكن ترحيل قيد بلا سطور (القيد %)', v_entry_id;
  END IF;
  IF v_n < 2 THEN
    RAISE EXCEPTION 'القيد يجب أن يحتوي سطرين على الأقل (القيد %)', v_entry_id;
  END IF;
  IF v_no_branch > 0 THEN
    RAISE EXCEPTION 'كل سطر قيد يجب أن يحمل فرعًا (القيد %)', v_entry_id;
  END IF;
  IF v_sd <> v_sc THEN
    RAISE EXCEPTION 'القيد غير متوازن: مدين % ودائن % (القيد %)', v_sd, v_sc, v_entry_id;
  END IF;
  IF v_td <> v_sd OR v_tc <> v_sc THEN
    RAISE EXCEPTION 'إجمالي رأس القيد لا يطابق مجموع سطوره (رأس % / % ، سطور % / %)', v_td, v_tc, v_sd, v_sc;
  END IF;

  SELECT string_agg(format('%s: مدين %s / دائن %s', COALESCE(b.name, '—'), x.d, x.c), ' | ')
    INTO v_unbalanced_branch
  FROM (
    SELECT branch_id, ROUND(COALESCE(SUM(debit),0),2) AS d, ROUND(COALESCE(SUM(credit),0),2) AS c
      FROM public.journal_entry_lines WHERE journal_entry_id = v_entry_id
     GROUP BY branch_id
    HAVING ROUND(COALESCE(SUM(debit),0),2) <> ROUND(COALESCE(SUM(credit),0),2)
  ) x LEFT JOIN public.branches b ON b.id = x.branch_id;

  IF v_unbalanced_branch IS NOT NULL THEN
    RAISE EXCEPTION 'القيد غير متوازن على مستوى الفرع (%)', v_unbalanced_branch;
  END IF;

  RETURN NULL;
END;
$$;

-- 8) ترحيل البيانات القائمة إلى الفرع الرئيسي (إضافي)
UPDATE public.journal_entries
   SET origin_branch_id = public.fn_main_branch_id()
 WHERE origin_branch_id IS NULL;

UPDATE public.journal_entry_lines
   SET branch_id = public.fn_main_branch_id()
 WHERE branch_id IS NULL;