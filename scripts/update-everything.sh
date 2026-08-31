#!/usr/bin/env bash
# ============================================================
#  سكربت واحد ينفذ كل شيء بعد التعديلات الأخيرة:
#   1) سحب التحديثات (مع حفظ تعديلاتك المحلية)
#   2) تنظيف أي سجل ميجريشن فاشل
#   3) تطبيق الميجريشن على كل الشركات
#   4) التحقق من الدوال والأعمدة الجديدة
#   5) نشر Edge Functions + بناء ونشر الواجهة للشركتين
#
#  الاستخدام:
#    cd /opt/accounting-app
#    chmod +x scripts/update-everything.sh
#    ./scripts/update-everything.sh
#
#  خيارات:
#    --no-pull        بدون git pull
#    --only farida    شركة واحدة فقط في مرحلة النشر
#    --baseline-db    أول مرة على قاعدة قائمة بدون سجل ميجريشن
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/accounting-app}"
DB_CONTAINERS=("farida-db" "alibea-db")
TRACKING_TABLE="public.lovable_schema_migrations"

DO_PULL=true
BASELINE_DB=false
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) DO_PULL=false ;;
    --baseline-db) BASELINE_DB=true ;;
    --only) ONLY="${2:-}"; shift ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    *) echo "❌ خيار غير معروف: $1" >&2; exit 1 ;;
  esac
  shift
done

log()  { echo -e "\n\033[1;36m▶ $*\033[0m"; }
ok()   { echo -e "\033[1;32m✅ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $*\033[0m"; }
die()  { echo -e "\033[1;31m❌ $*\033[0m" >&2; exit 1; }

cd "$APP_DIR" || die "المجلد غير موجود: $APP_DIR"

psql_c() { docker exec -i "$1" psql -U postgres -d postgres -v ON_ERROR_STOP=1 "${@:2}"; }

# ------------------------------------------------------------
# 1) سحب التحديثات
# ------------------------------------------------------------
if [[ "$DO_PULL" == true ]]; then
  log "سحب التحديثات من المستودع"
  STASHED=false
  if [[ -n "$(git status --porcelain)" ]]; then
    warn "توجد تعديلات محلية — سيتم حفظها في stash"
    git add -A
    git stash push -m "auto-update-$(date +%F-%H%M%S)" >/dev/null
    STASHED=true
  fi
  git pull --rebase || die "فشل git pull — حُلّ المشكلة يدوياً ثم أعد التشغيل"
  if [[ "$STASHED" == true ]]; then
    git stash pop || die "تعارض عند إعادة تطبيق تعديلاتك المحلية.
حُلّه ثم: git add -A && git stash drop
أو للتخلي عنها: git checkout -- . && git stash drop"
    ok "تم إعادة تطبيق التعديلات المحلية"
  fi
  ok "الكود محدّث: $(git rev-parse --short HEAD)"
else
  warn "تم تخطي git pull"
fi

# ------------------------------------------------------------
# 2) تنظيف أي سجل ميجريشن فاشل (الميجريشن التجميعي للمخزون)
# ------------------------------------------------------------
log "تنظيف سجلات الميجريشن الفاشلة (إن وُجدت)"
for c in "${DB_CONTAINERS[@]}"; do
  if ! docker ps --format '{{.Names}}' | grep -qx "$c"; then
    warn "حاوية قاعدة البيانات غير موجودة: $c — تخطي"
    continue
  fi
  psql_c "$c" -tAc "
    DO \$\$
    BEGIN
      IF to_regclass('$TRACKING_TABLE') IS NOT NULL
         AND to_regprocedure('public.inventory_signed_quantity(text,numeric)') IS NULL THEN
        DELETE FROM $TRACKING_TABLE
        WHERE version = '20260831190000_inventory_reports_catchup';
      END IF;
    END
    \$\$;" >/dev/null
  ok "[$c] جاهزة"
done

# ------------------------------------------------------------
# 3) الميجريشن
# ------------------------------------------------------------
log "تطبيق الميجريشن على كل الشركات"
chmod +x scripts/migrate-all-companies.sh
if [[ "$BASELINE_DB" == true ]]; then
  ./scripts/migrate-all-companies.sh --baseline-current
fi
./scripts/migrate-all-companies.sh || die "فشل الميجريشن — راجع الخطأ أعلاه"
ok "الميجريشن انتهى"

# ------------------------------------------------------------
# 4) التحقق
# ------------------------------------------------------------
log "التحقق من الدوال والأعمدة الجديدة"
EXPECTED_FUNCS=8
VERIFY_FAILED=false
for c in "${DB_CONTAINERS[@]}"; do
  docker ps --format '{{.Names}}' | grep -qx "$c" || continue
  funcs=$(psql_c "$c" -tAc "
    SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN (
      'get_inventory_valuation','get_inventory_aging','get_inventory_reorder',
      'get_inventory_kpis','inventory_product_state','inventory_signed_quantity',
      'get_account_balances','get_ledger_lines');")
  cols=$(psql_c "$c" -tAc "
    SELECT count(*) FROM information_schema.columns
    WHERE table_name='company_settings' AND column_name LIKE 'inventory%';")
  echo "   [$c] functions=$funcs/$EXPECTED_FUNCS  inventory_settings_columns=$cols/5"
  if [[ "$funcs" -lt "$EXPECTED_FUNCS" || "$cols" -lt 5 ]]; then
    VERIFY_FAILED=true
  fi
done
[[ "$VERIFY_FAILED" == true ]] && die "التحقق فشل — لم تُطبّق كل التغييرات على قاعدة/قواعد البيانات"
ok "التحقق ناجح"

# ------------------------------------------------------------
# 5) نشر Edge Functions + بناء ونشر الواجهة
# ------------------------------------------------------------
log "نشر Edge Functions والواجهة"
chmod +x scripts/deploy-all.sh
if [[ -n "$ONLY" ]]; then
  ./scripts/deploy-all.sh --no-pull --skip-db --only "$ONLY"
else
  ./scripts/deploy-all.sh --no-pull --skip-db
fi

echo ""
ok "تم كل شيء بنجاح 🎉  افتح الموقعين واعمل Ctrl+F5"
