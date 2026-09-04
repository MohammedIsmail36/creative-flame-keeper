#!/usr/bin/env bash

set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_CONTAINER="${SOURCE_CONTAINER:-farida-db}"
TEST_DB="codex_sales_atomic_test"
MIGRATION_FILE="$APP_DIR/supabase/migrations/20260904203000_atomic_sales_document_operations.sql"
DRAFT_SAVE_MIGRATION_FILE="$APP_DIR/supabase/migrations/20260904233000_atomic_sales_invoice_draft_save.sql"
TEST_FILE="$APP_DIR/supabase/tests/atomic_sales_document_operations.sql"
TEST_DB_CREATED=false

cleanup() {
  if [[ "$TEST_DB_CREATED" == "true" ]]; then
    docker exec "$SOURCE_CONTAINER" dropdb -U postgres --if-exists "$TEST_DB" >/dev/null
  fi
}

trap cleanup EXIT

if [[ ! -f "$MIGRATION_FILE" || ! -f "$DRAFT_SAVE_MIGRATION_FILE" || ! -f "$TEST_FILE" ]]; then
  echo "Atomic sales migration or test file is missing." >&2
  exit 1
fi

if [[ "$(docker exec "$SOURCE_CONTAINER" psql -U postgres -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$TEST_DB'")" == "1" ]]; then
  echo "Refusing to overwrite the existing database: $TEST_DB" >&2
  exit 1
fi

docker exec "$SOURCE_CONTAINER" createdb -U postgres -T template0 "$TEST_DB"
TEST_DB_CREATED=true

docker exec "$SOURCE_CONTAINER" pg_dump -U postgres --schema-only --no-owner --no-privileges postgres \
  | sed '/^[[:space:]]*SET log_min_messages TO/d' \
  | docker exec -i "$SOURCE_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$TEST_DB" >/dev/null

if [[ "$(docker exec "$SOURCE_CONTAINER" psql -U postgres -d "$TEST_DB" -tAc "SELECT to_regprocedure('public.post_sales_return(uuid)') IS NULL")" == "t" ]]; then
  docker exec -i "$SOURCE_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$TEST_DB" < "$MIGRATION_FILE" >/dev/null
else
  # A schema-only dump without ACLs gives PUBLIC execute on cloned functions.
  # Reproduce the migration's relevant boundary explicitly without replaying
  # its one-time function renames.
  docker exec -i "$SOURCE_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$TEST_DB" >/dev/null <<'SQL'
REVOKE ALL ON FUNCTION public.post_sales_invoice_atomic_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.unpost_sales_invoice_atomic_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recalculate_customer_balance_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.recalculate_customer_loyalty_internal(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_document_reversal_internal(uuid, date, text)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.post_sales_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unpost_sales_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.post_sales_return(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sales_invoice(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_sales_return(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.post_sales_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unpost_sales_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.post_sales_return(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_sales_invoice(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_sales_return(uuid) TO authenticated, service_role;
SQL
fi

if [[ "$(docker exec "$SOURCE_CONTAINER" psql -U postgres -d "$TEST_DB" -tAc "SELECT to_regprocedure('public.save_sales_invoice_draft(uuid,jsonb,jsonb)') IS NULL")" == "t" ]]; then
  docker exec -i "$SOURCE_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$TEST_DB" < "$DRAFT_SAVE_MIGRATION_FILE" >/dev/null
else
  docker exec -i "$SOURCE_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$TEST_DB" >/dev/null <<'SQL'
REVOKE ALL ON FUNCTION public.save_sales_invoice_draft(uuid, jsonb, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sales_invoice_draft(uuid, jsonb, jsonb)
  TO authenticated, service_role;
SQL
fi

docker exec -i "$SOURCE_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -d "$TEST_DB" < "$TEST_FILE"

echo "Atomic sales document database tests passed."
