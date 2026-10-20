"""POS role profiles: preconfigured jobs at the till (Waiter, Host, Cashier, Kitchen, Shift
Supervisor, Floor Manager, Branch Manager, Auditor) that a tenant administrator maps to staff
on their User record in the ERP (the POS Access panel).

How it fits the existing roles and rights:

* A profile has an **access level** — Kitchen, Waiter, Cashier or Supervisor — which is one
  of the four Frappe POS roles (`POS Kitchen` …). The person is given that role, so device
  rules (which devices a level may sign in on), read permissions and everything else keyed
  on the level keep working unchanged.
* A profile also has **rights**: a subset of the capabilities its level allows
  (`pos_core.CAPS`). When a person holds a profile, their capabilities are the profile's
  rights instead of the level's full set — so a Host is a waiter-level person who can't send
  to the kitchen, and an Auditor is a supervisor-level person who can only read reports.
* Someone with a POS role but no profile (staff set up before profiles existed) keeps the
  full rights of their level, exactly as before.

Every site gets the standard catalogue (`STANDARD`): new tenants at provisioning
(`provisioning.run_default_setup`), existing ones through a patch, and any site lazily the
first time staff access is managed. Seeding only adds what is missing — a tenant's own edits
to a standard profile are never overwritten (they can "reset to standard" themselves).
"""

import json

import frappe
from frappe.utils import cint

DOCTYPE = "XentraERP POS Role Profile"
USER_FIELD = "pos_role_profile"
LEVELS = ("kitchen", "waiter", "cashier", "supervisor")
LEVEL_ROLE = {"kitchen": "POS Kitchen", "waiter": "POS Waiter", "cashier": "POS Cashier", "supervisor": "POS Supervisor"}
ROLE_LEVEL = {v: k for k, v in LEVEL_ROLE.items()}

# Every right a profile can hold, in display order. "settings" is deliberately absent: it
# belongs to administrators (System Manager) only.
RIGHTS = (
	("view", "View floor, orders and menu", "See tables, open orders and the menu."),
	("kot", "Kitchen tickets", "Send orders to the kitchen and work the kitchen display."),
	("order", "Take orders", "Open orders and add items."),
	("reserve", "Reservations", "Book, edit and seat reservations."),
	("modify", "Change orders", "Reduce or remove items before they are billed."),
	("bill", "Bill and take payment", "Close bills, take payment and settle balances."),
	("shift", "Cash shift", "Open and close their own cash shift."),
	("supervise", "Supervise", "Void, re-open or close other people's bills and shifts."),
	("tables", "Manage tables", "Add, move and disable tables."),
	("menu", "Manage menu", "Add dishes, change prices and hide items."),
	("reports", "Reports", "See shift and end-of-day reports."),
)
RIGHT_KEYS = tuple(r[0] for r in RIGHTS)

_W = ("view", "kot", "order", "reserve")
_C = _W + ("modify", "bill", "shift")
STANDARD = (
	{"key": "waiter", "name": "Waiter", "level": "waiter", "rights": _W, "description": "Takes orders at the table on a handheld and sends them to the kitchen."},
	{"key": "host", "name": "Host", "level": "waiter", "rights": ("view", "order", "reserve"), "description": "Greets guests, manages reservations and seats tables."},
	{"key": "cashier", "name": "Cashier", "level": "cashier", "rights": _C, "description": "Runs a till: closes bills, takes payment, opens and closes a cash shift."},
	{"key": "kitchen", "name": "Kitchen", "level": "kitchen", "rights": ("view", "kot"), "description": "Works the kitchen display."},
	{"key": "shift_supervisor", "name": "Shift Supervisor", "level": "supervisor", "rights": _C + ("supervise",), "description": "Runs the shift: voids and re-opens bills and closes other people's shifts."},
	{"key": "floor_manager", "name": "Floor Manager", "level": "supervisor", "rights": _C + ("supervise", "tables"), "description": "Runs the floor: tables, plus everything a shift supervisor does."},
	{"key": "branch_manager", "name": "Branch Manager", "level": "supervisor", "rights": _C + ("supervise", "tables", "menu", "reports"), "description": "Store or branch manager: full control of the branch, including menu and reports."},
	{"key": "auditor", "name": "Auditor", "level": "supervisor", "rights": ("view", "reports"), "description": "Finance and audit: reads reports only — can't sell or change anything."},
)
STANDARD_BY_KEY = {p["key"]: p for p in STANDARD}
# Staff given one of the four plain roles before profiles existed map to these.
LEGACY_ROLE_PROFILE = {"POS Waiter": "waiter", "POS Cashier": "cashier", "POS Supervisor": "branch_manager", "POS Kitchen": "kitchen"}
SEED_FLAG = "xpos:role_profiles:v1"


def parse_rights(raw) -> list:
	if isinstance(raw, (list, tuple)):
		items = raw
	else:
		raw = (raw or "").strip()
		items = json.loads(raw) if raw.startswith("[") else raw.split(",")
	return [str(r).strip().lower() for r in items if str(r).strip()]


def _ordered(rights) -> list:
	have = set(rights)
	return [k for k in RIGHT_KEYS if k in have]


def level_rights(level: str) -> set:
	from custom_erp.api import pos_core

	return set(pos_core.CAPS.get(level, set())) - {"settings"}


# ------------------------------------------------------------------ seeding


def _ensure_user_field():
	if frappe.db.exists("Custom Field", {"dt": "User", "fieldname": USER_FIELD}):
		return
	from frappe.custom.doctype.custom_field.custom_field import create_custom_field

	# Hidden: it is managed from the POS Access panel, which also grants the matching POS role.
	create_custom_field(
		"User",
		{"fieldname": USER_FIELD, "label": "POS role profile", "fieldtype": "Link", "options": DOCTYPE, "insert_after": "enabled", "hidden": 1},
	)


def ensure_defaults(force: bool = False) -> int:
	"""Create the four POS roles, the User link field and any missing standard profile.
	Idempotent and cheap after the first call (flag in the site cache). Returns how many
	profiles were added."""
	if not force and frappe.cache().get_value(SEED_FLAG):
		return 0
	if not frappe.db.table_exists(DOCTYPE):
		return 0
	from custom_erp.api import pos

	for role in LEVEL_ROLE.values():
		pos.ensure_pos_role(role)
	_ensure_user_field()
	have = set(frappe.get_all(DOCTYPE, filters={"is_standard": 1}, pluck="standard_key"))
	added = 0
	for i, p in enumerate(STANDARD):
		# A tenant's own profile that already uses the name wins; the standard one is skipped.
		if p["key"] in have or frappe.db.exists(DOCTYPE, p["name"]):
			continue
		frappe.get_doc(
			{
				"doctype": DOCTYPE,
				"profile_name": p["name"],
				"access_level": p["level"].title(),
				"rights": ", ".join(p["rights"]),
				"description": p["description"],
				"is_standard": 1,
				"standard_key": p["key"],
				"sort_order": (i + 1) * 10,
			}
		).insert(ignore_permissions=True)
		added += 1
	frappe.cache().set_value(SEED_FLAG, 1, expires_in_sec=6 * 3600)
	return added


# ---------------------------------------------------------------- validation


def validate_profile(doc):
	"""Controller validate: a profile's rights must be known and within its access level."""
	level = (doc.access_level or "").lower()
	if level not in LEVELS:
		frappe.throw(f"Access level must be one of: {', '.join(l.title() for l in LEVELS)}.")
	rights = parse_rights(doc.rights)
	unknown = [r for r in rights if r not in RIGHT_KEYS]
	if unknown:
		frappe.throw(f"Unknown POS right: {', '.join(unknown)}")
	allowed = level_rights(level)
	too_high = [r for r in rights if r not in allowed]
	if too_high:
		labels = ", ".join(next(x[1] for x in RIGHTS if x[0] == r) for r in too_high)
		frappe.throw(f"{doc.access_level} access can't include: {labels}. Choose a higher access level.")
	# Every POS screen needs to see the floor/menu, so "view" is always on.
	doc.rights = ", ".join(_ordered(set(rights) | {"view"}))
	doc.profile_name = (doc.profile_name or "").strip()
	if not doc.profile_name:
		frappe.throw("Give the profile a name.")
	if "/" in doc.profile_name:
		frappe.throw("A profile name can't contain '/'.")


def _holders(name: str) -> list:
	if not frappe.get_meta("User").has_field(USER_FIELD):
		return []
	return frappe.get_all("User", filters={USER_FIELD: name}, pluck="name")


def check_can_delete(doc):
	if cint(doc.is_standard):
		frappe.throw("Standard profiles can't be deleted — disable it instead.")
	held = _holders(doc.name)
	if held:
		frappe.throw(f"{len(held)} staff member(s) still have this profile. Give them another profile first.")


# ------------------------------------------------------------- per-user rights


def profile_of(user: str):
	"""The person's profile document, or None (no field, none set, or it was removed)."""
	if not user or user == "Guest" or not frappe.get_meta("User").has_field(USER_FIELD):
		return None
	name = frappe.db.get_value("User", user, USER_FIELD)
	if not name or not frappe.db.exists(DOCTYPE, name):
		return None
	return frappe.get_cached_doc(DOCTYPE, name)


def _effective(user: str, level: str | None):
	"""(rights, label) for a person at `level`, cached per request."""
	cache = getattr(frappe.local, "xpos_profile_cache", None)
	if cache is None:
		cache = frappe.local.xpos_profile_cache = {}
	key = (user, level)
	if key in cache:
		return cache[key]
	from custom_erp.api import pos_core

	rights, label = set(pos_core.CAPS.get(level or "", set())), pos_core.LEVEL_LABEL.get(level or "", "")
	if level in LEVELS:
		p = profile_of(user)
		# A disabled profile, or one whose level no longer matches the person's POS role
		# (changed by hand in the ERP), falls back to the plain level.
		if p and not cint(p.disabled) and (p.access_level or "").lower() == level:
			rights, label = set(parse_rights(p.rights)) & level_rights(level), p.profile_name
	cache[key] = (rights, label)
	return cache[key]


def rights_for(user: str, level: str | None) -> set:
	return set(_effective(user, level)[0])


def label_for(user: str, level: str | None) -> str:
	return _effective(user, level)[1]


def clear_request_cache():
	frappe.local.xpos_profile_cache = {}


def assign(user: str, profile: str):
	"""Map a profile to a person: grant its level's POS role (replacing any other) and link it."""
	ensure_defaults()
	if not frappe.db.exists(DOCTYPE, profile):
		frappe.throw(f"No such POS role profile: {profile}")
	doc = frappe.get_doc(DOCTYPE, profile)
	if cint(doc.disabled):
		frappe.throw(f"The {profile} profile is disabled.")
	if "System Manager" in frappe.get_roles(user):
		frappe.throw("An administrator's access comes from their administrator role.")
	from custom_erp.api import pos

	pos._give_pos_role(user, LEVEL_ROLE[doc.access_level.lower()])
	frappe.db.set_value("User", user, USER_FIELD, doc.name, update_modified=False)
	clear_request_cache()


def keep_pos_role(doc, method=None):
	"""User validate hook: a save must not silently drop the person's POS role.

	POS roles have no desk access, so the ERP user form never lists them and rebuilds the
	roles table without them, and a Frappe Role Profile on the user replaces every role on
	each save. Either way the person fell back to Waiter while still linked to their POS
	role profile. A save that sets a POS role itself (`pos._give_pos_role`, via
	`doc.flags.pos_role`) gets exactly that role; otherwise the role comes back from the
	linked profile, else from before the save."""
	chosen = doc.flags.get("pos_role")
	if chosen:
		# A Frappe Role Profile may have just replaced the roles table again.
		doc.set("roles", [r for r in doc.roles if r.role not in ROLE_LEVEL])
		doc.append("roles", {"role": chosen})
		return
	if any(r.role in ROLE_LEVEL for r in doc.roles) or any(r.role == "System Manager" for r in doc.roles):
		return
	want = None
	name = doc.get(USER_FIELD) if doc.meta.has_field(USER_FIELD) else None
	if name and frappe.db.exists(DOCTYPE, name):
		level, disabled = frappe.db.get_value(DOCTYPE, name, ["access_level", "disabled"])
		if not cint(disabled):
			want = LEVEL_ROLE.get((level or "").lower())
	if not want:
		before = doc.get_doc_before_save()
		want = next((r.role for r in (before.roles if before else []) if r.role in ROLE_LEVEL), None)
	if want:
		doc.append("roles", {"role": want})


def profile_for_legacy_role(role: str | None) -> str | None:
	"""The standard profile that matches one of the four plain POS roles (old API callers)."""
	key = LEGACY_ROLE_PROFILE.get(role or "")
	if not key:
		return None
	ensure_defaults()
	return frappe.db.get_value(DOCTYPE, {"standard_key": key}, "name")


def summary(include_disabled: bool = True) -> list:
	"""Profiles as the ERP and POS screens show them."""
	ensure_defaults()
	filters = {} if include_disabled else {"disabled": 0}
	rows = frappe.get_all(
		DOCTYPE,
		filters=filters,
		fields=["name", "access_level", "rights", "description", "disabled", "is_standard", "standard_key", "sort_order"],
		order_by="sort_order asc, name asc",
	)
	counts = {}
	if frappe.get_meta("User").has_field(USER_FIELD):
		for r in frappe.get_all("User", filters={USER_FIELD: ["is", "set"]}, fields=[USER_FIELD]):
			counts[r[USER_FIELD]] = counts.get(r[USER_FIELD], 0) + 1
	out = []
	for r in rows:
		std = STANDARD_BY_KEY.get(r.standard_key or "")
		rights = _ordered(parse_rights(r.rights))
		out.append(
			{
				"name": r.name,
				"access_level": r.access_level,
				"rights": rights,
				"description": r.description or "",
				"disabled": cint(r.disabled),
				"is_standard": cint(r.is_standard),
				"modified_from_standard": bool(std and (rights != _ordered(std["rights"]) or r.access_level.lower() != std["level"])),
				"staff": counts.get(r.name, 0),
			}
		)
	return out


# ----------------------------------------------------------------------- API


def _require_admin():
	from custom_erp.api import pos_core

	pos_core.require_manager()


def _catalogue() -> dict:
	return {
		"rights": [{"key": k, "label": label, "description": desc} for k, label, desc in RIGHTS],
		"levels": [
			{
				"level": l.title(),
				"max_rights": _ordered(level_rights(l)),
				"devices": {"kitchen": "Kitchen display", "waiter": "Handheld (order taking); a till when allowed", "cashier": "Till or handheld", "supervisor": "Any device"}[l],
			}
			for l in LEVELS
		],
	}


@frappe.whitelist()
def list_role_profiles():
	"""Every POS role profile with its rights and how many staff hold it, plus the rights
	catalogue and the most each access level allows (administrator only)."""
	_require_admin()
	return {"profiles": summary(), **_catalogue()}


@frappe.whitelist()
def save_role_profile(profile_name: str, access_level: str, rights, description: str | None = None, disabled=0, name: str | None = None):
	"""Create a profile, or update one (`name`). Standard profiles keep their name. Changing
	the access level re-grants the matching POS role to everyone who holds the profile."""
	_require_admin()
	ensure_defaults()
	rights = parse_rights(rights)
	if name:
		doc = frappe.get_doc(DOCTYPE, name)
		before = (doc.access_level or "").lower()
		if (profile_name or "").strip() and profile_name.strip() != doc.name:
			frappe.throw("Profiles can't be renamed — create a new one instead.")
		doc.access_level = (access_level or "").title()
		doc.rights = ", ".join(rights)
		doc.description = description
		doc.disabled = cint(disabled)
		doc.save(ignore_permissions=True)
		if doc.access_level.lower() != before:
			from custom_erp.api import pos

			for user in _holders(doc.name):
				pos._give_pos_role(user, LEVEL_ROLE[doc.access_level.lower()])
		clear_request_cache()
	else:
		if frappe.db.exists(DOCTYPE, (profile_name or "").strip()):
			frappe.throw(f"A profile called {profile_name} already exists.")
		doc = frappe.get_doc(
			{"doctype": DOCTYPE, "profile_name": profile_name, "access_level": (access_level or "").title(), "rights": ", ".join(rights), "description": description, "disabled": cint(disabled), "sort_order": 500}
		).insert(ignore_permissions=True)
	frappe.db.commit()
	return list_role_profiles()


@frappe.whitelist()
def reset_role_profile(name: str):
	"""Put a standard profile back to its standard access level, rights and description."""
	_require_admin()
	doc = frappe.get_doc(DOCTYPE, name)
	std = STANDARD_BY_KEY.get(doc.standard_key or "")
	if not cint(doc.is_standard) or not std:
		frappe.throw("Only standard profiles can be reset.")
	return save_role_profile(doc.name, std["level"], list(std["rights"]), std["description"], doc.disabled, name=doc.name)


@frappe.whitelist()
def delete_role_profile(name: str):
	"""Delete a profile the tenant created (not a standard one, and only when no one holds it)."""
	_require_admin()
	frappe.delete_doc(DOCTYPE, name, ignore_permissions=True)
	frappe.db.commit()
	return list_role_profiles()
