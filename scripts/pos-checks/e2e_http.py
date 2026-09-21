import json, requests, datetime
B = "https://pos.xentraerp.net"; P = "custom_erp.api."
OK, BAD = [], []
def check(n, c, d=""): (OK if c else BAD).append(n); print(("  PASS " if c else "  FAIL ") + n + (f"  [{d}]" if d and not c else ""))
def sess():
    s = requests.Session(); s.cookies.set("xentra_tenant", "197349", domain="pos.xentraerp.net"); return s
def call(s, m, **a):
    r = s.post(f"{B}/api/method/{m}", json=a, headers={"Accept": "application/json"}, timeout=90)
    try: j = r.json()
    except Exception: j = {}
    return r.status_code, j
def msg(j):
    try: return json.loads(json.loads(j["_server_messages"])[0])["message"]
    except Exception: return str(j)[:160]
def login(pin):
    s = sess(); c, j = call(s, P + "pos.pin_login", pin=pin); return s, c, j
def still_in(s, who): c, j = call(s, "xentraerp.auth.get_logged_user"); return c == 200 and j.get("message") == who

print("== the site")
s0 = requests.Session(); r = s0.get(B + "/")
check("index over HTTPS", r.status_code == 200 and 'id="app"' in r.text)
check("SPA deep links work", s0.get(B + "/floor").status_code == 200 and s0.get(B + "/order/POSORD-00001").status_code == 200)
check("HTTP redirects to HTTPS", requests.get("http://pos.xentraerp.net/", allow_redirects=False).status_code == 301)

print("== sign in, one person per role")
W, cw, jw = login("246810"); C, cc, jc = login("357911"); S_, cs, js = login("468022"); K, ck, jk = login("579133"); M, cm, jm = login("680244")
check("all five sign in with their PINs", all(x == 200 for x in (cw, cc, cs, ck, cm)), (cw, cc, cs, ck, cm))
def st(s): c, j = call(s, P + "pos_core.get_pos_settings"); return j.get("message", {})
sw, sc, ss, sk, sm = st(W), st(C), st(S_), st(K), st(M)
check("each sees their own role", (sw["level"], sc["level"], ss["level"], sk["level"], sm["level"]) == ("waiter", "cashier", "supervisor", "kitchen", "admin"), (sw.get("level"), sc.get("level"), ss.get("level"), sk.get("level"), sm.get("level")))
check("capabilities follow the role", "bill" not in sw["caps"] and "bill" in sc["caps"] and "tables" in ss["caps"] and "tables" not in sc["caps"] and sk["caps"] == ["kot", "view"] and "settings" in sm["caps"], (sw["caps"], sk["caps"]))
orig = {k: sm[k] for k in ("pos_mode", "checkout_document", "auto_kot", "item_notes_prompt")}
print("   (tenant settings before this run:", orig, ")")
if orig["pos_mode"] != "F&B":
    c, j = call(M, P + "pos_core.set_pos_mode", mode="F&B"); check("admin switches to F&B", c == 200, msg(j))

print("== supervisors run the room; waiters can't")
c, j = call(W, P + "pos_fnb.save_table", table_name="ZZE1", zone="ZZ Zone", seats=4); check("waiter can't add a table (403)", c == 403 and "can't do this" in msg(j), msg(j))
check("…and stays signed in after a refusal", still_in(W, "zz.e2e.waiter@example.com"))
for t, seats in (("ZZE1", 4), ("ZZE2", 2), ("ZZE3", 6)):
    c, j = call(S_, P + "pos_fnb.save_table", table_name=t, zone="ZZ Zone", seats=seats)
check("supervisor adds tables", c == 200, msg(j))
c, j = call(W, P + "pos_fnb.list_tables", pos_profile="ZZ E2E Register"); names = {t["name"] for t in j["message"]}; check("waiter sees them on the floor (and the real table too)", {"ZZE1", "ZZE2", "ZZE3"} <= names, sorted(names))

print("== dine in: saving sends the KOT")
c, j = call(W, P + "pos_fnb.open_order", table="ZZE1", pos_profile="ZZ E2E Register", guests=3, order_type="Dine In"); o1 = j["message"]["name"]; check("waiter opens a dine-in order", c == 200 and j["message"]["order_type"] == "Dine In", msg(j))
c, j = call(W, P + "pos_fnb.set_order_items", order=o1, items=json.dumps([{"item_code": "Blue Pen", "qty": 2, "note": "well done, crunchy"}, {"item_code": "Cola", "qty": 1, "note": "no ice"}]))
kot = (j.get("message") or {}).get("kot") or {}
check("saving the order files the KOT — no button", c == 200 and kot.get("kot", "").startswith("KOT-") and len(kot.get("items", [])) == 2, msg(j))
check("the note travels to the kitchen", any(i["note"] == "well done, crunchy" for i in kot.get("items", [])), kot.get("items"))
c, j = call(K, P + "pos_fnb.list_kots", pos_profile="ZZ E2E Register"); mine = [k for k in j.get("message", []) if k["name"] == kot.get("kot")]
check("the kitchen board shows it immediately, with the type", c == 200 and mine and mine[0]["order_type"] == "Dine In" and mine[0]["table"] == "ZZE1", msg(j))
for stt in ("Preparing", "Ready", "Served"):
    c, j = call(K, P + "pos_fnb.set_kot_status", kot=kot["kot"], status=stt); check(f"kitchen marks it {stt}", c == 200 and j["message"]["status"] == stt, msg(j))
c, j = call(K, P + "pos_fnb.open_order", table="ZZE2", pos_profile="ZZ E2E Register"); check("kitchen staff can't take orders (403)", c == 403, msg(j))
c, j = call(W, P + "pos_fnb.set_order_items", order=o1, items=json.dumps([{"item_code": "Blue Pen", "qty": 1, "note": "well done, crunchy"}, {"item_code": "Cola", "qty": 1, "note": "no ice"}]))
check("waiter can't reduce what's saved", c >= 400 and "can add items but not reduce" in msg(j), msg(j))
c, j = call(W, P + "pos_fnb.set_order_items", order=o1, items=json.dumps([{"item_code": "Blue Pen", "qty": 3, "note": "well done, crunchy"}, {"item_code": "Cola", "qty": 1, "note": "no ice"}]))
check("…but can add more (only the extra goes to the kitchen)", c == 200 and j["message"]["kot"] and j["message"]["kot"]["items"][0]["qty"] == 1, msg(j))
for name, m, a in (("close the bill", "pos_fnb.close_bill", {"order": o1}), ("take payment", "pos_fnb.bill_order", {"order": o1, "payment_method": "Cash"}), ("cancel an order with items", "pos_fnb.cancel_order", {"order": o1}),
                   ("open a shift", "pos_core.open_shift", {"pos_profile": "ZZ E2E Register"}), ("see the day-end report", "pos_core.end_of_day_report", {}), ("list staff", "pos.list_pos_users", {})):
    c, j = call(W, P + m, **a); check(f"waiter can't {name} (403)", c == 403 and "can't do this" in msg(j) or (name.startswith("cancel") and c >= 400), (c, msg(j)))
check("…still signed in after all those refusals", still_in(W, "zz.e2e.waiter@example.com"))

print("== cashier: modify + bill; supervisor: void")
c, j = call(C, P + "pos_fnb.close_bill", order=o1); check("cashier closes the bill", c == 200 and j["message"]["order"]["bill_closed"] == 1, msg(j))
check("…and is still signed in (session intact after billing logic)", still_in(C, "zz.e2e.cashier@example.com"))
c, j = call(C, P + "pos_fnb.reopen_bill", order=o1); check("cashier can't re-open another person's check", c >= 400 and "only the waiter" in msg(j).lower(), msg(j))
c, j = call(C, P + "pos_fnb.cancel_order", order=o1); check("cashier can't cancel food already in the kitchen", c >= 400 and "manager" in msg(j).lower(), msg(j))
c, j = call(C, P + "pos_fnb.save_table", table_name="ZZE9"); check("cashier can't add a table (403)", c == 403)
c, j = call(C, P + "pos_core.end_of_day_report"); check("cashier can't see the day-end report (403)", c == 403)
c, j = call(S_, P + "pos_fnb.reopen_bill", order=o1); check("supervisor re-opens it", c == 200 and j["message"]["bill_closed"] == 0, msg(j))
c, j = call(S_, P + "pos_fnb.cancel_order", order=o1); check("supervisor voids the order (food already sent)", c == 200, msg(j))
c, j = call(S_, P + "pos_core.end_of_day_report"); check("supervisor sees the day-end report", c == 200 and "gross_sales" in j["message"], msg(j))
c, j = call(C, P + "pos_core.open_shift", pos_profile="ZZ E2E Register", opening_cash=json.dumps({"BHD": 10})); check("cashier opens a shift", c == 200 and j["message"]["status"] == "Open", msg(j))

print("== take away")
c, j = call(W, P + "pos_fnb.open_order", table=None, pos_profile="ZZ E2E Register", order_type="Take Away", guest_name="ZZ Sara", guest_phone="39112233"); t1 = j["message"]
check("take-away order: no table, a token, the customer's name", c == 200 and t1["table"] is None and t1["order_type"] == "Take Away" and t1["token"] and t1["guest_name"] == "ZZ Sara", msg(j))
c, j = call(W, P + "pos_fnb.set_order_items", order=t1["name"], items=json.dumps([{"item_code": "Blue Pen", "qty": 1, "note": "deep fried"}])); tk = j["message"]["kot"]
check("its KOT says Take Away with the token", c == 200 and tk["order_type"] == "Take Away" and tk["token"] == t1["token"], msg(j))
c, j = call(W, P + "pos_fnb.list_open_orders", pos_profile="ZZ E2E Register"); check("open take-away orders can be found again", c == 200 and any(o["name"] == t1["name"] for o in j["message"]), msg(j))
c, j = call(K, P + "pos_fnb.list_kots"); check("the kitchen shows it as a take-away", any(k["name"] == tk["kot"] and k["order_type"] == "Take Away" and k["token"] == t1["token"] for k in j["message"]))
c, j = call(C, P + "pos_fnb.transfer_table", order=t1["name"], to_table="ZZE2"); check("a take-away order has no table to move", c >= 400 and "no table to move" in msg(j), msg(j))
c, j = call(W, P + "pos_fnb.open_order", table=None, pos_profile="ZZ E2E Register", order_type="Dine In"); check("dine-in needs a table", c >= 400 and "choose a table" in msg(j).lower(), msg(j))
call(S_, P + "pos_fnb.cancel_order", order=t1["name"])

print("== reservations")
tmr = str(datetime.date.today() + datetime.timedelta(days=1))
c, j = call(W, P + "pos_fnb.save_reservation", guest_name="ZZ Guest", party_size=4, reservation_date=tmr, reservation_time="20:00", phone="39000111", tables=json.dumps(["ZZE1"]), pos_profile="ZZ E2E Register"); b = j.get("message", {})
check("waiter books a table", c == 200 and b.get("status") == "Booked" and b.get("meal") == "Dinner", msg(j))
c, j = call(W, P + "pos_fnb.save_reservation", guest_name="ZZ Other", party_size=2, reservation_date=tmr, reservation_time="20:30", tables=json.dumps(["ZZE1"]), pos_profile="ZZ E2E Register"); check("the same table can't be double-booked", c >= 400 and "already booked for ZZ Guest" in msg(j), msg(j))
c, j = call(W, P + "pos_fnb.save_reservation", guest_name="ZZ Big", party_size=9, reservation_date=tmr, reservation_time="13:00", tables=json.dumps(["ZZE2"]), pos_profile="ZZ E2E Register"); check("a party too big for its table is refused", c >= 400 and "seat 2" in msg(j), msg(j))
c, j = call(W, P + "pos_fnb.list_reservations", date=tmr, pos_profile="ZZ E2E Register"); check("the day's bookings list", c == 200 and any(x["name"] == b.get("name") for x in j["message"]), msg(j))
c, j = call(W, P + "pos_fnb.seat_reservation", name=b["name"], pos_profile="ZZ E2E Register"); so = j.get("message", {})
check("waiter seats the party: order opened for the party size, booking Seated", c == 200 and so["order"]["guests"] == 4 and so["reservation"]["status"] == "Seated", msg(j))
call(S_, P + "pos_fnb.cancel_order", order=so["order"]["name"])
c, j = call(W, P + "pos_fnb.list_reservations", date=tmr, pos_profile="ZZ E2E Register"); check("cancelling the order cancels the booking", [x for x in j["message"] if x["name"] == b["name"]][0]["status"] == "Cancelled")

print("== menu management and item notes")
c, j = call(W, P + "pos_core.save_menu_item", item_name="ZZ E2E Dish", item_group="Products", rate=4.25); check("waiter can't add a menu item (403)", c == 403)
c, j = call(S_, P + "pos_core.save_menu_item", item_name="ZZ E2E Dish", item_group="Products", rate=4.25, pos_profile="ZZ E2E Register"); check("supervisor adds a dish with a price", c == 200 and j["message"]["rate"] == 4.25, msg(j))
c, j = call(W, P + "pos_core.list_menu", pos_profile="ZZ E2E Register"); row = [i for i in j["message"] if i["item_code"] == "ZZ E2E Dish"]; check("it's on the waiter's menu at that price", c == 200 and row and row[0]["rate"] == 4.25, msg(j))
c, j = call(S_, P + "pos_core.set_item_hidden", item_code="ZZ E2E Dish", hidden=1); check("supervisor hides it", c == 200)
c, j = call(W, P + "pos_core.list_menu", pos_profile="ZZ E2E Register"); check("…gone from the waiter's menu", not [i for i in j["message"] if i["item_code"] == "ZZ E2E Dish"])
c, j = call(W, P + "pos_core.list_menu", pos_profile="ZZ E2E Register", include_hidden=1); check("waiter can't ask for hidden items", c == 403)
c, j = call(S_, P + "pos_core.set_item_hidden", item_code="ZZ E2E Dish", hidden=0)
c, j = call(W, P + "pos_core.get_item_notes", item_code="ZZ E2E Dish"); n = j.get("message", {})
check("a waiter gets suggested notes for the dish", c == 200 and len(n.get("notes", [])) >= 3 and n.get("source") in ("Standard", "AI"), msg(j))
print("   (note source:", n.get("source"), "| AI key configured:", n.get("ai_enabled"), "| suggestions:", n.get("notes"), ")")
c, j = call(W, P + "pos_core.set_item_notes", item_code="ZZ E2E Dish", notes=json.dumps(["x"])); check("waiter can't rewrite a dish's notes (403)", c == 403)
c, j = call(S_, P + "pos_core.set_item_notes", item_code="ZZ E2E Dish", notes=json.dumps(["Extra crispy", "No garlic", "Well done"])); check("supervisor writes them", c == 200 and j["message"]["source"] == "Manual", msg(j))
c, j = call(W, P + "pos_core.get_item_notes", item_code="ZZ E2E Dish"); check("waiters then see the supervisor's notes", j["message"]["notes"] == ["Extra crispy", "No garlic", "Well done"] and j["message"]["source"] == "Manual", msg(j))

print("== settings: administrator only")
c, j = call(S_, P + "pos_core.save_pos_settings", auto_kot=0); check("supervisor can't change POS settings (403)", c == 403 and "administrator" in msg(j).lower() or c == 403, msg(j))
c, j = call(M, P + "pos_core.save_pos_settings", auto_kot=0); check("administrator turns auto-KOT off", c == 200 and j["message"]["auto_kot"] == 0, msg(j))
c, j = call(W, P + "pos_fnb.open_order", table="ZZE3", pos_profile="ZZ E2E Register", guests=2); o3 = j["message"]["name"]
c, j = call(W, P + "pos_fnb.set_order_items", order=o3, items=json.dumps([{"item_code": "Blue Pen", "qty": 1}])); check("with it off, saving sends nothing", c == 200 and j["message"]["kot"] is None, msg(j))
c, j = call(W, P + "pos_fnb.send_kot", order=o3); check("…the manual Send to kitchen still works", c == 200 and j["message"]["kot"].startswith("KOT-"), msg(j))
call(S_, P + "pos_fnb.cancel_order", order=o3)
c, j = call(M, P + "pos_core.save_pos_settings", auto_kot=orig["auto_kot"], item_notes_prompt=orig["item_notes_prompt"], checkout_document=orig["checkout_document"]); check("settings restored", c == 200 and j["message"]["auto_kot"] == orig["auto_kot"], msg(j))

print("== staff and roles")
c, j = call(S_, P + "pos.create_pos_user", email="zz.e2e.newwaiter@example.com", full_name="ZZ E2E New", pin="791355", pos_profile="ZZ E2E Register", pos_role="POS Waiter"); check("supervisor adds a waiter", c == 200, msg(j))
nw, cn, jn = login("791355"); check("…who signs in with their PIN as a waiter", cn == 200 and jn["message"]["user"]["roles"].count("POS Waiter") == 1 and jn["message"]["pos_profile"] == "ZZ E2E Register", msg(jn))
c, j = call(S_, P + "pos.create_pos_user", email="zz.e2e.newsup@example.com", full_name="ZZ E2E Sup", pin="802466", pos_role="POS Supervisor"); check("supervisor can't create a supervisor", c == 403 and "administrator" in msg(j).lower(), msg(j))
c, j = call(W, P + "pos.list_pos_users"); check("waiter can't list staff (403)", c == 403)
c, j = call(S_, P + "pos.list_pos_users"); check("supervisor lists the team with roles", c == 200 and any(u["user"] == "zz.e2e.newwaiter@example.com" and u["level"] == "waiter" for u in j["message"]))
c, j = call(S_, P + "pos.set_pos_role", user="zz.e2e.newwaiter@example.com", pos_role="POS Cashier"); check("supervisor promotes them to cashier", c == 200 and j["message"]["pos_role"] == "POS Cashier", msg(j))
c, j = call(S_, P + "pos.set_pin_active", user="zz.e2e.newwaiter@example.com", active=0)
w2, c2, j2 = login("791355"); check("a switched-off PIN can't sign in", c2 >= 400, c2)

print("== restore")
if orig["pos_mode"] != "F&B":
    c, j = call(M, P + "pos_core.set_pos_mode", mode=orig["pos_mode"]); check("mode restored", c == 200, msg(j))
for s_ in (W, C, S_, K, M): call(s_, "logout")
print(f"\nE2E RESULT: {len(OK)} passed, {len(BAD)} failed"); [print("  FAILED:", b_) for b_ in BAD]
