#!/usr/bin/env bash
#
# migrate-company-to-site.sh — move an EXISTING company off the shared
# site onto its OWN dedicated Frappe site (site-per-tenant), by cloning
# the current site and splitting the copies.
#
# Strategy (whole-site clone, then split — Frappe backup/restore is
# site-level, not per-company):
#   1. Backup the SOURCE site (with files).
#   2. Create the NEW tenant site and restore the backup into it → an
#      exact copy of all ERP data.
#   3. Set the tenant admin password on the new site.
#   4. Drop the Xentra control-plane doctypes from the tenant copy (the
#      tenant must not see SaaS billing/admin data).
#   5. Register the new site in the frontend routing registry.
#
# The SOURCE site is left untouched and continues to serve as the
# control-plane / admin site. Run ON THE bench HOST as the frappe user.
#
# Usage:
#   ./migrate-company-to-site.sh \
#     --source erp.badmintonbooking.com \
#     --slug jjcompany \
#     --new-site jjcompany.badmintonbooking.com \
#     --company "JJ Consultancy and IT Services" \
#     --admin-password 'StrongPassphrase123!' \
#     --registry /home/xentraerp/erp-frontend/data/tenants.json \
#     [--mariadb-root-password 'xxxx'] [--backend-ip 127.0.0.1] [--backend-port 8001]

set -euo pipefail

SOURCE=""; SLUG=""; NEWSITE=""; COMPANY=""; ADMIN_PW=""; DB_ROOT_PW=""
REGISTRY="${XENTRA_TENANTS_FILE:-}"
BACKEND_IP="127.0.0.1"; BACKEND_PORT="8001"; PRODUCT_NAME="XentraERP"
# Control-plane doctypes to remove from the tenant copy.
XENTRA_DOCTYPES=("Xentra Receipt" "Xentra Invoice" "Xentra Subscription" \
  "Xentra Tenant" "Xentra Subscription Plan" "Xentra Module")

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2;;
    --slug) SLUG="$2"; shift 2;;
    --new-site) NEWSITE="$2"; shift 2;;
    --company) COMPANY="$2"; shift 2;;
    --admin-password) ADMIN_PW="$2"; shift 2;;
    --mariadb-root-password) DB_ROOT_PW="$2"; shift 2;;
    --registry) REGISTRY="$2"; shift 2;;
    --backend-ip) BACKEND_IP="$2"; shift 2;;
    --backend-port) BACKEND_PORT="$2"; shift 2;;
    *) echo "Unknown arg: $1" >&2; exit 2;;
  esac
done
for req in SOURCE SLUG NEWSITE COMPANY ADMIN_PW REGISTRY; do
  if [[ -z "${!req}" ]]; then echo "Missing required --${req,,}" >&2; exit 2; fi
done
command -v jq >/dev/null || { echo "jq required (apt-get install jq)." >&2; exit 3; }

echo "==> [1/5] Backing up source site: $SOURCE"
bench --site "$SOURCE" backup --with-files
# Resolve the newest backup files for the source site.
BK_DIR="sites/$SOURCE/private/backups"
DB_FILE=$(ls -t "$BK_DIR"/*-database.sql.gz | head -1)
PUB_FILE=$(ls -t "$BK_DIR"/*-files.tar 2>/dev/null | head -1 || true)
PRIV_FILE=$(ls -t "$BK_DIR"/*-private-files.tar 2>/dev/null | head -1 || true)
echo "    db=$DB_FILE"

echo "==> [2/5] Creating + restoring new site: $NEWSITE"
NEW_ARGS=(--admin-password "$ADMIN_PW")
[[ -n "$DB_ROOT_PW" ]] && NEW_ARGS+=(--mariadb-root-password "$DB_ROOT_PW")
bench new-site "$NEWSITE" "${NEW_ARGS[@]}"

RESTORE_ARGS=("$DB_FILE")
[[ -n "$PUB_FILE" ]] && RESTORE_ARGS+=(--with-public-files "$PUB_FILE")
[[ -n "$PRIV_FILE" ]] && RESTORE_ARGS+=(--with-private-files "$PRIV_FILE")
RA=(--force)
[[ -n "$DB_ROOT_PW" ]] && RA+=(--mariadb-root-password "$DB_ROOT_PW")
bench --site "$NEWSITE" restore "${RA[@]}" "${RESTORE_ARGS[@]}"
bench --site "$NEWSITE" migrate

echo "==> [3/5] Setting tenant admin password on $NEWSITE"
bench --site "$NEWSITE" set-admin-password "$ADMIN_PW"

echo "==> [4/5] Removing control-plane doctypes from the tenant copy"
for dt in "${XENTRA_DOCTYPES[@]}"; do
  # Delete all records, then the DocType itself. Ignore if absent.
  bench --site "$NEWSITE" execute frappe.db.delete --kwargs "{'doctype':'$dt'}" || true
  bench --site "$NEWSITE" execute frappe.delete_doc \
    --kwargs "{'doctype':'DocType','name':'$dt','force':1,'ignore_permissions':1}" || true
done
bench --site "$NEWSITE" clear-cache || true

echo "==> [5/5] Registering $SLUG → $NEWSITE in $REGISTRY"
mkdir -p "$(dirname "$REGISTRY")"; [[ -f "$REGISTRY" ]] || echo '[]' > "$REGISTRY"
ENTRY=$(jq -n --arg id "$SLUG" --arg code "$SLUG" --arg company "$COMPANY" \
  --arg host "$NEWSITE" --arg ip "$BACKEND_IP" --argjson port "$BACKEND_PORT" \
  --arg product "$PRODUCT_NAME" \
  '{id:$id, code:$code, companyName:$company, tenancyModel:"site",
    backend:{hostIp:$ip, port:$port, host:$host},
    branding:{productName:$product, theme:{}}}')
tmp=$(mktemp)
jq --arg code "$SLUG" --argjson entry "$ENTRY" \
   'map(select(.code != $code)) + [$entry]' "$REGISTRY" > "$tmp"; mv "$tmp" "$REGISTRY"

cat <<EOF

✓ Migrated '$COMPANY' to its own site.
  New tenant site:  $NEWSITE   (own DB — full data copy)
  Control plane:    $SOURCE    (unchanged, still the admin site)
  Admin login:      Administrator / (password you passed)  at  /$SLUG

Next:
  1. Add DNS / nginx server_name for '$NEWSITE' → this server; reload nginx.
  2. Verify /$SLUG loads the tenant's data and admin can open Settings.
  3. (Optional, later) On $SOURCE, remove the operational company data so it
     is purely the control plane — do this ONLY after verifying the copy.
EOF
