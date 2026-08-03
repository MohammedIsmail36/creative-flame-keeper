#!/usr/bin/env bash
# ============================================================
#  سكربت النشر الشامل — Farida + Alibea
#  يسحب أي تعديلات من المستودع، يطبّق الميجريشن،
#  ينشر Edge Functions، ثم يبني وينشر الواجهة للشركتين.
#
#  الاستخدام:
#    cd /opt/accounting-app
#    chmod +x scripts/deploy-all.sh
#    ./scripts/deploy-all.sh                 # النشر الكامل
#    ./scripts/deploy-all.sh --skip-db       # بدون ميجريشن
#    ./scripts/deploy-all.sh --skip-functions
#    ./scripts/deploy-all.sh --only farida   # شركة واحدة فقط
#    ./scripts/deploy-all.sh --baseline-db   # أول مرة على قاعدة قائمة
#    ./scripts/deploy-all.sh --no-pull       # بدون git pull
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/accounting-app}"

# name : docker_dir : www_dir : api_url : anon_key
COMPANIES=(
  "farida:/opt/supabase-farida:/var/www/farida:https://farida.alibea2020.com/api:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3ODI3MzUzLCJleHAiOjE5MzU1MDczNTN9.GVy4C3BeFpkOt34tfqei-T0WksgRzHzpWJo1Arf3_8s"
  "alibea:/opt/supabase-alibea:/var/www/alibea:https://alibea.alibea2020.com/api:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3ODM0NTgyLCJleHAiOjE5MzU1MTQ1ODJ9.P4Rwco5JtcyiWy0CMhDQxXmQr2j-lqEg06bzLeuDmQk"
)

DO_PULL=true
DO_DB=true
DO_FUNCTIONS=true
DO_BUILD=true
BASELINE_DB=false
ONLY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --no-pull) DO_PULL=false ;;
    --skip-db) DO_DB=false ;;
    --skip-functions) DO_FUNCTIONS=false ;;
    --skip-build) DO_BUILD=false ;;
    --baseline-db) BASELINE_DB=true ;;
    --only) ONLY="${2:-}"; shift ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "❌ خيار غير معروف: $1" >&2; exit 1 ;;
  esac
  shift
done

log()  { echo -e "\n\033[1;36m▶ $*\033[0m"; }
ok()   { echo -e "\033[1;32m✅ $*\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $*\033[0m"; }
die()  { echo -e "\033[1;31m❌ $*\033[0m" >&2; exit 1; }

cd "$APP_DIR" || die "المجلد غير موجود: $APP_DIR"

# ------------------------------------------------------------
# 1) سحب التحديثات مع حفظ التعديلات المحلية
# ------------------------------------------------------------
BEFORE_SHA="$(git rev-parse HEAD)"

if [[ "$DO_PULL" == true ]]; then
  log "سحب التحديثات من المستودع"
  STASHED=false
  if [[ -n "$(git status --porcelain)" ]]; then
    warn "توجد تعديلات محلية — سيتم حفظها في stash"
    git add -A
    git stash push -m "auto-deploy-$(date +%F-%H%M%S)" >/dev/null
    STASHED=true
  fi

  git pull --rebase || die "فشل git pull — حُلّ المشكلة يدوياً ثم أعد التشغيل"

  if [[ "$STASHED" == true ]]; then
    if git stash pop; then
      ok "تم إعادة تطبيق التعديلات المحلية"
    else
      die "تعارض عند إعادة تطبيق التعديلات المحلية.
حُلّ التعارض يدوياً ثم: git add -A && git stash drop
أو للتخلي عن تعديلاتك المحلية: git checkout -- . && git stash drop"
    fi
  fi
  ok "الكود محدّث: $(git rev-parse --short HEAD)"
else
  warn "تم تخطي git pull"
fi

AFTER_SHA="$(git rev-parse HEAD)"

changed_files() {
  [[ "$BEFORE_SHA" == "$AFTER_SHA" ]] && return 0
  git diff --name-only "$BEFORE_SHA" "$AFTER_SHA"
}

# ------------------------------------------------------------
# 2) الميجريشن
# ------------------------------------------------------------
if [[ "$DO_DB" == true ]]; then
  log "تطبيق ميجريشن قواعد البيانات"
  chmod +x scripts/migrate-all-companies.sh
  if [[ "$BASELINE_DB" == true ]]; then
    ./scripts/migrate-all-companies.sh --baseline-current
  else
    ./scripts/migrate-all-companies.sh
  fi
  ok "الميجريشن انتهى"
else
  warn "تم تخطي الميجريشن"
fi

# ------------------------------------------------------------
# 3) نشر Edge Functions لكل شركة
# ------------------------------------------------------------
deploy_functions() {
  local name="$1" docker_dir="$2"
  local target="$docker_dir/volumes/functions"

  if [[ ! -d "$docker_dir" ]]; then
    warn "[$name] مجلد Supabase غير موجود: $docker_dir — تخطي الدوال"
    return 0
  fi

  sudo mkdir -p "$target"
  # نسخ كل الدوال + الملفات المشتركة (بدون حذف main إن كان مخصصاً)
  sudo cp -r supabase/functions/. "$target"/
  sudo chmod -R a+rX "$target"

  if [[ ! -f "$target/main/index.ts" ]]; then
    warn "[$name] لا يوجد main/index.ts في $target — الدوال لن تعمل في النسخة الذاتية.
انسخ راوتر الدوال الافتراضي من نسخة supabase docker الأصلية إلى $target/main/index.ts"
  fi

  ( cd "$docker_dir" && sudo docker compose restart functions >/dev/null ) \
    || warn "[$name] فشل إعادة تشغيل خدمة functions — تحقق: cd $docker_dir && docker compose logs functions"
  ok "[$name] Edge Functions محدّثة"
}

# ------------------------------------------------------------
# 4) البناء والنشر
# ------------------------------------------------------------
build_and_deploy() {
  local name="$1" www_dir="$2" api_url="$3" anon_key="$4"

  log "[$name] بناء الواجهة"
  VITE_SUPABASE_URL="$api_url" \
  VITE_SUPABASE_PUBLISHABLE_KEY="$anon_key" \
  npm run build || die "[$name] فشل البناء"

  [[ -f dist/index.html ]] || die "[$name] مجلد dist غير صالح"

  sudo mkdir -p "$www_dir"
  sudo rm -rf "${www_dir:?}"/*
  sudo cp -r dist/. "$www_dir"/
  sudo chown -R www-data:www-data "$www_dir"
  ok "[$name] تم النشر إلى $www_dir"
}

# تثبيت الحزم مرة واحدة
if [[ "$DO_BUILD" == true ]]; then
  log "تثبيت الحزم (npm ci)"
  if [[ -f package-lock.json ]]; then
    npm ci || die "فشل npm ci — تحقق من package-lock.json"
  else
    warn "package-lock.json غير موجود — استخدام npm install"
    npm install || die "فشل npm install"
  fi
  ok "الحزم جاهزة"
fi

for entry in "${COMPANIES[@]}"; do
  IFS=':' read -r name docker_dir www_dir api_scheme api_rest anon_key <<< "$entry"
  api_url="$api_scheme:$api_rest"

  if [[ -n "$ONLY" && "$ONLY" != "$name" ]]; then
    continue
  fi

  echo -e "\n\033[1;35m🏢 $name\033[0m"
  [[ "$DO_FUNCTIONS" == true ]] && deploy_functions "$name" "$docker_dir" || true
  [[ "$DO_BUILD" == true ]] && build_and_deploy "$name" "$www_dir" "$api_url" "$anon_key" || true
done

echo ""
ok "انتهى النشر بنجاح 🎉"
echo "افتح الموقعين واعمل Ctrl+F5 لتجاوز الكاش."
