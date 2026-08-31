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
# يبحث عن مجلد يحتوي ملف compose فعلي (قد يكون داخل docker/ أو supabase/docker/)
find_compose_dir() {
  local base="$1" d
  for d in "$base" "$base/docker" "$base/supabase/docker" "$base/supabase"; do
    for f in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
      [[ -f "$d/$f" ]] && { echo "$d"; return 0; }
    done
  done
  return 1
}

# يجد حاوية الدوال: أولاً عبر compose، وإن تعذّر فعبر اسم الحاوية
find_functions_container() {
  local compose_dir="$1" base="$2" cid=""
  if [[ -n "$compose_dir" ]]; then
    cid="$(cd "$compose_dir" && sudo docker compose ps -q functions 2>/dev/null | head -1)"
  fi
  if [[ -z "$cid" ]]; then
    local pat
    pat="$(basename "$base")"
    cid="$(sudo docker ps -q --filter "name=functions" 2>/dev/null | while read -r c; do
      n="$(sudo docker inspect --format '{{.Name}}' "$c")"
      case "$n" in *"$pat"*) echo "$c";; esac
    done | head -1)"
  fi
  if [[ -z "$cid" ]]; then
    cid="$(sudo docker ps -q --filter "name=edge-functions" 2>/dev/null | head -1)"
  fi
  echo "$cid"
}

deploy_functions() {
  local name="$1" docker_dir="$2"
  local target container_id mounted_target compose_dir=""

  if [[ ! -d "$docker_dir" ]]; then
    warn "[$name] مجلد Supabase غير موجود: $docker_dir — تخطي الدوال"
    return 0
  fi

  compose_dir="$(find_compose_dir "$docker_dir" || true)"
  [[ -n "$compose_dir" ]] && log "[$name] ملف compose في: $compose_dir" \
    || warn "[$name] لم أجد ملف compose — سأتعامل مع الحاوية مباشرة"

  container_id="$(find_functions_container "$compose_dir" "$docker_dir")"
  [[ -n "$container_id" ]] || die "[$name] حاوية functions غير موجودة أو متوقفة.
تحقق: sudo docker ps --format '{{.Names}}' | grep -i function"

  mounted_target="$(sudo docker inspect --format '{{range .Mounts}}{{if eq .Destination "/home/deno/functions"}}{{.Source}}{{end}}{{end}}' "$container_id")"
  [[ -n "$mounted_target" ]] || die "[$name] لا يوجد volume مربوط إلى /home/deno/functions داخل حاوية functions"
  target="$mounted_target"

  log "[$name] نسخ الدوال إلى المسار الفعلي: $target"
  sudo mkdir -p "$target"
  # main/index.ts موجود في المستودع وهو الراوتر المطلوب لتشغيل الدوال الذاتية.
  sudo cp -r supabase/functions/. "$target"/
  sudo chmod -R a+rX "$target"

  [[ -f "$target/main/index.ts" ]] \
    || die "[$name] فشل نسخ راوتر الدوال main/index.ts"
  [[ -f "$target/telegram-publish/index.ts" ]] \
    || die "[$name] فشل نسخ telegram-publish/index.ts"

  if [[ -n "$compose_dir" ]]; then
    ( cd "$compose_dir" && sudo docker compose restart functions >/dev/null ) \
      || die "[$name] فشل إعادة تشغيل خدمة functions — تحقق: cd $compose_dir && docker compose logs functions"
    container_id="$(find_functions_container "$compose_dir" "$docker_dir")"
  else
    sudo docker restart "$container_id" >/dev/null \
      || die "[$name] فشل إعادة تشغيل حاوية functions"
  fi

  for _ in {1..20}; do
    if sudo docker inspect --format '{{.State.Running}}' "$container_id" 2>/dev/null | grep -q true; then
      break
    fi
    sleep 1
  done

  sudo docker exec "$container_id" test -f /home/deno/functions/main/index.ts \
    || die "[$name] main/index.ts غير ظاهر داخل الحاوية"
  sudo docker exec "$container_id" test -f /home/deno/functions/telegram-publish/index.ts \
    || die "[$name] telegram-publish/index.ts غير ظاهر داخل الحاوية"
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
  log "تثبيت الحزم"
  if [[ -f package-lock.json ]] && npm ci; then
    ok "الحزم جاهزة (npm ci)"
  else
    warn "npm ci غير ممكن أو الـ lock غير متزامن — التحويل إلى npm install"
    npm install || die "فشل npm install"
    ok "الحزم جاهزة (npm install)"
  fi
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
