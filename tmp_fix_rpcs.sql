-- Drop and recreate get_unpaid_invoices with posted_number column
DROP FUNCTION IF EXISTS public.get_unpaid_invoices(int) CASCADE;

CREATE OR REPLACE FUNCTION public.get_unpaid_invoices(p_limit int DEFAULT 10)
RETURNS TABLE(
  id uuid,
  invoice_number bigint,
  posted_number bigint,
  total numeric,
  paid_amount numeric,
  remaining numeric,
  customer_id uuid,
  customer_name text
)
LANGUAGE sql STABLE
SET search_path TO 'public'
AS $$
  SELECT
    si.id,
    si.invoice_number,
    si.posted_number::bigint,
    si.total,
    si.paid_amount,
    (si.total - si.paid_amount) AS remaining,
    si.customer_id,
    COALESCE(c.name, 'عميل نقدي') AS customer_name
  FROM sales_invoices si
  LEFT JOIN customers c ON si.customer_id = c.id
  WHERE si.status = 'posted'
    AND si.paid_amount < si.total
  ORDER BY (si.total - si.paid_amount) DESC
  LIMIT p_limit;
$$;
