#!/usr/bin/env bash
#
# provision-tenant.sh — create a dedicated ERPNext SITE for one tenant
# (the "site-per-tenant" model) and register its backend binding so the
# XentraERP frontend routes /<slug> to it immediately.
#
# Run this ON THE ERPNext/bench HOST (as the frappe/bench user, NOT root).
# It performs the operations the browser cannot: bench new-site, install
# erpnext, set the tenant admin password, then append the routing entry
# to the frontend's tenants.json registry.
#
# Usage:
#   ./provision-tenant.sh \
#       --slug jjcompany \
#       --site jjcompany.badmintonbooking.com \
#       --company "JJ Consultancy and IT Services" \
#       --admin-password 'StrongPassphrase123!' \
#       [--mariadb-root-password 'xxxx'] \
#       [--registry /home/xentraerp/erp-frontend/data/tenants.json] \
#       [--backend-ip 127.0.0.1] [--backend-port 8001]
#
# After it runs: add a DNS record (or nginx server_name) for the --site
# host pointing at this server, and reload nginx. The tenant admin then
# signs in at https://<frontend>/<slug> as the site Administrator with
# the --admin-password, with FULL control of their own isolated site.

set -euo pipefail

SLUG=""; SITE=""; COMPANY=""; ADMIN_PW=""; DB_ROOT_PW=""
REGISTRY="${XENTRA_TENANTS_FILE:-}"
BACKEND_IP="127.0.0.1"; BACKEND_PORT="8001"
PRODUCT_NAME="XentraERP"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --slug) SLUG="$2"; shift 2;;
    --site) SITE="$2"; shift 2;;
    --company) COMPANY="$2"; shift 2;;
    --admin-password) ADMIN_PW="$2"; shift 2;;
    --mariadb-root-password) DB_ROOT_PW="$2"; shift 2;;
    --registry) REGISTRY="$2"; shift 2;;
    --backend-ip) BACKEND_IP="$2"; shift 2;;
    --backend-port) BACKEND_PORT="$2"; shift 2;;
    --product-name) PRODUCT_NAME="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done

for req in SLUG SITE COMPANY ADMIN_PW; do
  if [[ -z "${!req}" ]]; then echo "Missing required --${req,,}" >&2; exit 2; fi
done
if [[ -z "$REGISTRY" ]]; then
  echo "Set --registry <path to tenants.json> (or XENTRA_TENANTS_FILE)." >&2; exit 2
fi
command -v jq >/dev/null || { echo "jq is required (apt-get install jq)." >&2; exit 3; }

echo "==> Creating Frappe site: $SITE"
NEWSITE_ARGS=(--admin-password "$ADMIN_PW")
[[ -n "$DB_ROOT_PW" ]] && NEWSITE_ARGS+=(--mariadb-root-password "$DB_ROOT_PW")
bench new-site "$SITE" "${NEWSITE_ARGS[@]}"

echo "==> Installing ERPNext on $SITE"
bench --site "$SITE" install-app erpnext

echo "==> Ensuring admin password is set"
bench --site "$SITE" set-admin-password "$ADMIN_PW"

echo "==> Registering tenant in $REGISTRY"
mkdir -p "$(dirname "$REGISTRY")"
[[ -f "$REGISTRY" ]] || echo '[]' > "$REGISTRY"

ENTRY=$(jq -n \
  --arg id "$SLUG" --arg code "$SLUG" --arg company "$COMPANY" \
  --arg host "$SITE" --arg ip "$BACKEND_IP" --argjson port "$BACKEND_PORT" \
  --arg product "$PRODUCT_NAME" \
  '{id:$id, code:$code, companyName:$company, tenancyModel:"site",
    backend:{hostIp:$ip, port:$port, host:$host},
    branding:{productName:$product, theme:{}}}')

# Upsert by code (replace an existing entry with the same slug).
tmp=$(mktemp)
jq --arg code "$SLUG" --argjson entry "$ENTRY" \
   'map(select(.code != $code)) + [$entry]' "$REGISTRY" > "$tmp"
mv "$tmp" "$REGISTRY"

cat <<EOF

✓ Tenant '$SLUG' provisioned.
  Site (own DB/env):  $SITE
  Backend:            $BACKEND_IP:$BACKEND_PORT (Host: $SITE)
  Company:            $COMPANY
  Admin login:        Administrator / (the password you passed)

Next steps:
  1. Point DNS / nginx server_name for '$SITE' at this server, reload nginx.
  2. The registry ($REGISTRY) is picked up by the frontend within seconds
     (no redeploy). Tenant admin signs in at /$SLUG with full control.
EOF
