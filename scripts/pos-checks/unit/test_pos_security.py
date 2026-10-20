"""Pure-Python unit tests for custom_erp.api.pos_security (no Frappe, no bench).

Run from the repo root:  python3 -m unittest discover -s scripts/pos-checks/unit -v
"""

import importlib.util
import os
import random
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "..", "..", "custom_erp_app", "custom_erp", "api", "pos_security.py")
spec = importlib.util.spec_from_file_location("pos_security", SRC)
sec = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sec)


class Lockout(unittest.TestCase):
	def test_free_attempts_have_no_delay(self):
		for n in range(0, sec.USER_FREE_ATTEMPTS + 1):
			self.assertEqual(sec.lockout_seconds(n), 0)

	def test_progressive_doubling(self):
		f = sec.USER_FREE_ATTEMPTS
		self.assertEqual(sec.lockout_seconds(f + 1), 30)
		self.assertEqual(sec.lockout_seconds(f + 2), 60)
		self.assertEqual(sec.lockout_seconds(f + 3), 120)

	def test_capped(self):
		self.assertEqual(sec.lockout_seconds(50), sec.MAX_DELAY_SECONDS)

	def test_ip_threshold_is_separate(self):
		self.assertEqual(sec.lockout_seconds(sec.IP_FREE_ATTEMPTS, free=sec.IP_FREE_ATTEMPTS), 0)
		self.assertEqual(sec.lockout_seconds(sec.IP_FREE_ATTEMPTS + 1, free=sec.IP_FREE_ATTEMPTS), 30)

	def test_hard_lock(self):
		self.assertFalse(sec.is_hard_locked(sec.USER_HARD_LOCK_AT - 1))
		self.assertTrue(sec.is_hard_locked(sec.USER_HARD_LOCK_AT))


class DevicesAndRoles(unittest.TestCase):
	def test_till(self):
		T = sec.DEVICE_TILL
		self.assertTrue(sec.allowed_on_device("cashier", T))
		self.assertTrue(sec.allowed_on_device("supervisor", T))
		self.assertTrue(sec.allowed_on_device("waiter", T, allow_waiter_on_till=True))
		self.assertFalse(sec.allowed_on_device("waiter", T, allow_waiter_on_till=False))
		self.assertFalse(sec.allowed_on_device("kitchen", T))

	def test_order_taking(self):
		O = sec.DEVICE_ORDER
		for lvl in ("waiter", "cashier", "supervisor"):
			self.assertTrue(sec.allowed_on_device(lvl, O), lvl)
		self.assertFalse(sec.allowed_on_device("kitchen", O))

	def test_kitchen_display(self):
		K = sec.DEVICE_KITCHEN
		self.assertTrue(sec.allowed_on_device("kitchen", K))
		self.assertTrue(sec.allowed_on_device("supervisor", K))
		self.assertFalse(sec.allowed_on_device("waiter", K))
		self.assertFalse(sec.allowed_on_device("cashier", K))

	def test_no_device_type_is_unrestricted_and_no_role_denied(self):
		self.assertTrue(sec.allowed_on_device("waiter", None))
		self.assertFalse(sec.allowed_on_device(None, sec.DEVICE_TILL))

	def test_masks(self):
		self.assertIsNone(sec.device_cap_mask("cashier", sec.DEVICE_TILL))
		self.assertIsNone(sec.device_cap_mask("supervisor", sec.DEVICE_ORDER))
		m = sec.device_cap_mask("cashier", sec.DEVICE_ORDER)
		self.assertNotIn("bill", m)
		self.assertNotIn("shift", m)
		self.assertIn("order", m)
		self.assertEqual(set(sec.device_cap_mask("waiter", sec.DEVICE_KITCHEN)), {"view", "kot"})
		cashier = {"view", "kot", "order", "reserve", "modify", "bill", "shift"}
		self.assertEqual(sec.mask_caps(cashier, m), sorted({"view", "kot", "order", "reserve", "modify"}))
		self.assertEqual(sec.mask_caps(cashier, None), sorted(cashier))

	def test_session_modes(self):
		self.assertEqual(sec.session_mode("waiter", sec.DEVICE_TILL), "order")
		self.assertEqual(sec.session_mode("waiter", None), "order")
		self.assertEqual(sec.session_mode("cashier", sec.DEVICE_TILL), "till")
		self.assertEqual(sec.session_mode("cashier", sec.DEVICE_ORDER), "order")
		self.assertEqual(sec.session_mode("supervisor", sec.DEVICE_ORDER), "till")
		self.assertEqual(sec.session_mode("kitchen", None), "kitchen")
		self.assertEqual(sec.session_mode("supervisor", sec.DEVICE_KITCHEN), "kitchen")
		self.assertEqual(sec.session_mode("admin", sec.DEVICE_ORDER), "manager")


class Identifiers(unittest.TestCase):
	def test_staff_codes(self):
		self.assertEqual(sec.normalize_staff_code(" 12-34 "), "1234")
		self.assertEqual(sec.normalize_staff_code("ab12"), "AB12")
		self.assertIsNone(sec.normalize_staff_code("1"))
		self.assertIsNone(sec.normalize_staff_code("12;drop"))
		self.assertIsNone(sec.normalize_staff_code(None))

	def test_approval_codes(self):
		rng = random.Random(7)
		code = sec.generate_approval_code(rng.choice)
		self.assertEqual(len(code), sec.APPROVAL_LENGTH)
		self.assertEqual(sec.normalize_approval_code(sec.format_approval_code(code).lower()), code)
		self.assertIsNone(sec.normalize_approval_code("ABCD-EFG0"))  # 0 is not in the alphabet
		self.assertIsNone(sec.normalize_approval_code("SHORT"))

	def test_tenant_codes(self):
		self.assertTrue(sec.valid_tenant_code("197349"))
		self.assertTrue(sec.valid_tenant_code("jjc"))
		for bad in ("", "a", "UPPER", "a.b", "../x", "x" * 11, "197349.xentraerp.local"):
			self.assertFalse(sec.valid_tenant_code(bad), bad)

	def test_device_cookie(self):
		tok = sec.new_token()
		self.assertEqual(sec.split_device_cookie(f"DEV-00001.{tok}"), ("DEV-00001", tok))
		self.assertEqual(sec.split_device_cookie("nodot"), (None, None))
		self.assertEqual(sec.split_device_cookie("DEV 1.short"), (None, None))

	def test_display_names(self):
		self.assertEqual(sec.display_name("Aisha Khalid Al Mansoori"), "Aisha M.")
		self.assertEqual(sec.display_name("Ravi"), "Ravi")
		self.assertEqual(sec.display_name(""), "Staff")
		self.assertEqual(sec.initials("Aisha Khalid"), "AK")

	def test_constant_time_equal(self):
		self.assertTrue(sec.constant_time_equal("abc", "abc"))
		self.assertFalse(sec.constant_time_equal("abc", "abd"))
		self.assertFalse(sec.constant_time_equal(None, None))
		self.assertFalse(sec.constant_time_equal("", ""))


class Sessions(unittest.TestCase):
	def test_age_and_idle(self):
		self.assertFalse(sec.session_too_old(0, 3600 * 12, 12))
		self.assertTrue(sec.session_too_old(0, 3600 * 12 + 1, 12))
		self.assertFalse(sec.session_too_old(0, 10**9, 0))
		self.assertTrue(sec.idle_exceeded(0, 301, 5))
		self.assertFalse(sec.idle_exceeded(0, 10**9, 0))

	def test_locked_allow_list(self):
		self.assertEqual(sec.method_from_path("/api/method/custom_erp.api.pos_auth.unlock_session"), "custom_erp.api.pos_auth.unlock_session")
		self.assertIn(sec.method_from_path("/api/method/logout"), sec.LOCKED_ALLOWED_METHODS)
		self.assertNotIn(sec.method_from_path("/api/method/custom_erp.api.pos_fnb.bill_order"), sec.LOCKED_ALLOWED_METHODS)
		self.assertIsNone(sec.method_from_path("/api/resource/Customer"))


class TenantLookup(unittest.TestCase):
	def test_outcomes_do_not_distinguish_unavailable_states(self):
		for status in ("Pending Approval", "Rejected", "Suspended", "Cancelled", "Expired", None):
			self.assertEqual(sec.lookup_outcome(status, "Completed", "x.site"), "unavailable", status)
		self.assertEqual(sec.lookup_outcome("Active", "Pending", None), "setup")
		self.assertEqual(sec.lookup_outcome("Trial", "Completed", "197349.xentraerp.local"), "ok")

	def test_rate_limit(self):
		self.assertFalse(sec.over_limit(sec.LOOKUP_LIMIT - 1, sec.LOOKUP_LIMIT))
		self.assertTrue(sec.over_limit(sec.LOOKUP_LIMIT, sec.LOOKUP_LIMIT))


class Entitlements(unittest.TestCase):
	def test_fail_closed(self):
		self.assertFalse(sec.module_allowed(None, "pos"))
		self.assertTrue(sec.module_allowed(None, "pos", "open"))
		self.assertTrue(sec.module_allowed(None, "pos", "off"))
		self.assertTrue(sec.module_allowed(["pos"], "pos"))
		self.assertFalse(sec.module_allowed(["accounting"], "pos"))

	def test_last_known_good(self):
		self.assertEqual(sec.effective_modules(None, ["pos"]), ["pos"])
		self.assertEqual(sec.effective_modules([], ["pos"]), [])
		self.assertIsNone(sec.effective_modules(None, None))

	def test_totp_format(self):
		self.assertTrue(sec.totp_window_ok("123456"))
		self.assertFalse(sec.totp_window_ok("12345"))
		self.assertFalse(sec.totp_window_ok("12345a"))


if __name__ == "__main__":
	unittest.main()
