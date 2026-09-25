-- توسيع دوال التقارير بفلتر الفرع: NULL = الشركة المجمّعة
DROP FUNCTION IF EXISTS public.get_account_balances(date, date, boolean);

CREATE OR REPLACE FUNCTION public.get_account_balances(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_only_with_activity boolean DEFAULT false,
  p_branch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rows jsonb;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
BEGIN
  WITH agg AS (
    SELECT jel.account_id,
           COALESCE(SUM(jel.debit), 0)::numeric  AS debit,
           COALESCE(SUM(jel.credit), 0)::numeric AS credit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.status = 'posted'
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to   IS NULL OR je.entry_date <= p_date_to)
      AND (p_branch_id IS NULL OR jel.branch_id = p_branch_id)
    GROUP BY jel.account_id
  ),
  joined AS (
    SELECT a.id, a.code, a.name, a.account_type,
           COALESCE(g.debit, 0)  AS debit,
           COALESCE(g.credit, 0) AS credit,
           (COALESCE(g.debit, 0) - COALESCE(g.credit, 0)) AS balance
    FROM accounts a
    LEFT JOIN agg g ON g.account_id = a.id
    WHERE a.is_active = true
      AND a.is_parent = false
      AND (NOT p_only_with_activity OR g.account_id IS NOT NULL)
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.code),
         COALESCE(SUM(t.debit), 0),
         COALESCE(SUM(t.credit), 0)
  INTO v_rows, v_total_debit, v_total_credit
  FROM joined t;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'total_debit', v_total_debit,
    'total_credit', v_total_credit
  );
END;
$$;

DROP FUNCTION IF EXISTS public.get_ledger_lines(uuid, date, date, integer, integer);

CREATE OR REPLACE FUNCTION public.get_ledger_lines(
  p_account_id uuid DEFAULT NULL,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0,
  p_branch_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lines jsonb;
  v_total_count int := 0;
  v_total_debit numeric := 0;
  v_total_credit numeric := 0;
BEGIN
  WITH base AS (
    SELECT jel.debit::numeric AS debit, jel.credit::numeric AS credit
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.status = 'posted'
      AND (p_account_id IS NULL OR jel.account_id = p_account_id)
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
      AND (p_branch_id IS NULL OR jel.branch_id = p_branch_id)
  )
  SELECT COUNT(*)::int, COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
  INTO v_total_count, v_total_debit, v_total_credit
  FROM base;

  WITH base AS (
    SELECT jel.id, jel.journal_entry_id, jel.account_id,
           jel.debit::numeric, jel.credit::numeric, jel.description,
           jel.branch_id, br.name AS branch_name, jel.is_auto_balancing,
           je.entry_number, je.posted_number AS entry_posted_number,
           je.entry_date, je.description AS entry_description, je.status AS entry_status,
           a.code AS account_code, a.name AS account_name,
           jel.created_at
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    JOIN accounts a ON a.id = jel.account_id
    LEFT JOIN branches br ON br.id = jel.branch_id
    WHERE je.status = 'posted'
      AND (p_account_id IS NULL OR jel.account_id = p_account_id)
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to IS NULL OR je.entry_date <= p_date_to)
      AND (p_branch_id IS NULL OR jel.branch_id = p_branch_id)
  ),
  ordered AS (
    SELECT *,
      CASE WHEN p_account_id IS NOT NULL THEN
        SUM(debit - credit) OVER (
          ORDER BY entry_posted_number NULLS LAST, entry_date, created_at
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
        )
      ELSE 0 END AS running_balance
    FROM base
  )
  SELECT jsonb_agg(row_to_json(t))
  INTO v_lines
  FROM (
    SELECT * FROM ordered
    ORDER BY entry_posted_number NULLS LAST, entry_date, created_at
    OFFSET p_offset LIMIT p_limit
  ) t;

  RETURN jsonb_build_object(
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'total_count', v_total_count,
    'total_debit', v_total_debit,
    'total_credit', v_total_credit,
    'net_balance', v_total_debit - v_total_credit
  );
END;
$$;

-- تقرير تسوية بين الفروع: يجب أن يكون صفراً للشركة
CREATE OR REPLACE FUNCTION public.get_branch_clearing_report(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clearing uuid;
  v_rows jsonb;
  v_net numeric := 0;
BEGIN
  v_clearing := public.fn_branch_clearing_account_id();
  IF v_clearing IS NULL THEN
    RETURN jsonb_build_object('rows', '[]'::jsonb, 'company_net', 0, 'is_balanced', true);
  END IF;

  WITH agg AS (
    SELECT jel.branch_id,
           b.code AS branch_code,
           b.name AS branch_name,
           ROUND(COALESCE(SUM(jel.debit), 0), 2) AS debit,
           ROUND(COALESCE(SUM(jel.credit), 0), 2) AS credit,
           ROUND(COALESCE(SUM(jel.debit), 0) - COALESCE(SUM(jel.credit), 0), 2) AS balance
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    LEFT JOIN branches b ON b.id = jel.branch_id
    WHERE je.status = 'posted'
      AND jel.account_id = v_clearing
      AND (p_date_from IS NULL OR je.entry_date >= p_date_from)
      AND (p_date_to   IS NULL OR je.entry_date <= p_date_to)
    GROUP BY jel.branch_id, b.code, b.name
  )
  SELECT jsonb_agg(row_to_json(t) ORDER BY t.branch_code), COALESCE(SUM(t.balance), 0)
  INTO v_rows, v_net
  FROM agg t;

  RETURN jsonb_build_object(
    'rows', COALESCE(v_rows, '[]'::jsonb),
    'company_net', COALESCE(v_net, 0),
    'is_balanced', ROUND(COALESCE(v_net, 0), 2) = 0
  );
END;
$$;