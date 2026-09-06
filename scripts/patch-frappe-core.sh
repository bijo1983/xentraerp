#!/bin/bash
# Apply patches to Frappe core files on the droplet.
# Run as the frappe user from the bench directory.
# Usage: bash scripts/patch-frappe-core.sh [bench-dir]

set -euo pipefail

BENCH_DIR="${1:-/home/frappe/innovegic-bench}"
FRAPPE_APPS="$BENCH_DIR/apps/frappe"

echo "=== Patching Frappe core files in $FRAPPE_APPS ==="

# ── 1. linked_with.py — add @frappe.whitelist() to get_linked_docs ───────────
LINKED_WITH="$FRAPPE_APPS/frappe/desk/form/linked_with.py"

if grep -q "@frappe.whitelist()" "$LINKED_WITH" 2>/dev/null; then
    echo "[SKIP] get_linked_docs already whitelisted in linked_with.py"
else
    echo "[PATCH] Whitelisting get_linked_docs in linked_with.py"
    python3 - "$LINKED_WITH" <<'PYEOF'
import sys, re

path = sys.argv[1]
with open(path) as f:
    src = f.read()

# Add @frappe.whitelist() before the function and accept both name= and docname=
old = 'def get_linked_docs(doctype: str, name: str = None, linkinfo: dict | None = None) -> dict[str, list]:'
new = (
    '@frappe.whitelist()\n'
    'def get_linked_docs(doctype: str, name: str = None, linkinfo: dict | None = None, docname: str = None) -> dict[str, list]:\n'
    '\tname = name or docname'
)

if old in src:
    src = src.replace(old, new)
    with open(path, 'w') as f:
        f.write(src)
    print("  ✅ linked_with.py patched")
else:
    # Try variant without type hints
    old2 = 'def get_linked_docs('
    lines = src.splitlines()
    for i, line in enumerate(lines):
        if old2 in line and 'linkinfo' in line:
            indent = len(line) - len(line.lstrip())
            lines.insert(i, ' ' * indent + '@frappe.whitelist()')
            break
    with open(path, 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print("  ⚠️  Applied fallback patch to linked_with.py — verify manually")
PYEOF
fi

# ── 2. document.py — replace __user inside _validate_links ──────────────────
DOCUMENT_PY="$FRAPPE_APPS/frappe/model/document.py"

if grep -q "__user.*frappe.session.user" "$DOCUMENT_PY" 2>/dev/null; then
    echo "[SKIP] __user replacement already in document.py"
else
    echo "[PATCH] Adding __user replacement inside _validate_links in document.py"
    python3 - "$DOCUMENT_PY" <<'PYEOF'
import sys

path = sys.argv[1]
with open(path) as f:
    lines = f.readlines()

target = 'def _validate_links(self):'
insert_block = (
    '\t\tfor __f in self.meta.fields:\n'
    '\t\t\tif self.get(__f.fieldname) == "__user":\n'
    '\t\t\t\tself.set(__f.fieldname, frappe.session.user)\n'
)

patched = []
i = 0
while i < len(lines):
    patched.append(lines[i])
    if target in lines[i]:
        # Insert after the def line
        patched.append(insert_block)
    i += 1

with open(path, 'w') as f:
    f.writelines(patched)
print("  ✅ document.py patched")
PYEOF
fi

echo ""
echo "=== Restarting bench ==="
cd "$BENCH_DIR"
sudo supervisorctl restart all 2>/dev/null || bench restart 2>/dev/null || true

echo ""
echo "=== Done. Verify with: bench --site <site> console ==="
echo "    >>> frappe.whitelist_map.get('frappe.desk.form.linked_with.get_linked_docs')"
