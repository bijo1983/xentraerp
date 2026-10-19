# 02 — Route → view → component → store → API map

Branch `feature/pos-app` @ `543c34a`. Paths relative to `pos-frontend/src/` unless stated. Backend methods are
`custom_erp.api.<module>.<method>`; definitions are listed with line numbers in `01-audit.md` §3.1.

Guard rules (`router/index.ts:27-71`) are summarised in the "Guard" column. They are convenience checks; each
backend method re-checks its capability (`pos_core.require_cap`).

## Route table

| Route | View | Guard | Components | Stores | Backend calls |
|---|---|---|---|---|---|
| `/login` | `views/LoginView.vue` (120 lines) | public; logged-in users redirected to `/registers` | — | `auth` | `signup.tenant_lookup` (control plane), `pos.pin_login` |
| `/registers` | `views/RegisterSelectView.vue` (82) | login | — | `auth`, `pos` | `pos.list_pos_profiles`, then `pos_core.get_pos_settings` (via `pos.load(profile)`) |
| `/shift` | `views/ShiftView.vue` (183) | login, cap `shift`, register selected | `SessionMenu` | `auth`, `pos` | `pos_core.list_checkout_currencies`, `pos_core.shift_report`, `pos_core.open_shift`, `pos_core.close_shift` (via store) |
| `/terminal` | `views/TerminalView.vue` (429) | login, cap `bill`, Retail on, register, open shift if required | `PayDialog`, `SessionMenu` | `auth`, `pos`, `printer` | REST `Item`, REST `Item Price`, `pos_core.retail_estimate`, `pos_core.retail_checkout`, `pos_core.list_open_balances`, `pos_core.settle_invoice`; `PayDialog` → `pos_core.list_checkout_currencies` |
| `/floor` | `views/FloorView.vue` (264) | login, F&B on, register, open shift if required | `FloorPlan`, `NewOrderDialog`, `ReservationDialog`, `SessionMenu` | `auth`, `pos` | `pos_fnb.list_tables`, `pos_fnb.list_reservations`, `pos_fnb.list_open_orders` (poll 8 s), `pos_fnb.open_order`, `pos_fnb.save_reservation`, `pos_fnb.seat_reservation`, `pos_fnb.cancel_reservation`, `pos_fnb.mark_no_show` |
| `/order/:id` | `views/OrderView.vue` (490) | as `/floor` | `PayDialog`, `ItemNoteDialog`, `ConfirmSheet`, `SessionMenu` | `auth`, `pos`, `printer` | `pos_fnb.get_order`, `pos_fnb.list_tables`, `pos_core.list_menu`, `pos_fnb.set_order_items`, `pos_fnb.send_kot`, `pos_fnb.close_bill`, `pos_fnb.reopen_bill`, `pos_fnb.bill_totals`, `pos_fnb.bill_order`, `pos_fnb.split_order`, `pos_fnb.merge_orders`, `pos_fnb.merge_tables`, `pos_fnb.unmerge_table`, `pos_fnb.transfer_table`, `pos_fnb.open_order` (new bill), `pos_fnb.cancel_order`; `ItemNoteDialog` → `pos_core.get_item_notes` |
| `/kitchen` | `views/KitchenView.vue` (115) | login, F&B on (kitchen level is confined here) | `SessionMenu` | `auth`, `pos`, `printer` | `pos_fnb.list_kots` (poll 6 s), `pos_fnb.set_kot_status` |
| `/admin` | `views/AdminView.vue` (480) | login, any of caps tables/menu/reports/settings | — | `auth`, `pos` | see tab table below |
| `/` | redirect → `/registers` | | | | |

There is no 404 route; unknown paths render nothing inside `App.vue`'s `<router-view>`.

## `/admin` tabs (`AdminView.vue:251-257`)

| Tab | Visible when | Backend calls |
|---|---|---|
| Mode | `settings` cap | `pos_core.set_pos_mode` (store) |
| Hours & kitchen | `settings` | `pos_core.save_pos_settings` (store), `rounding.get_rounding`, `rounding.set_rounding` |
| Menu | `menu` | `pos_core.list_menu(include_hidden=1)`, `pos_core.list_item_groups`, `pos_core.set_item_hidden`, `pos_core.save_menu_item`, `pos_core.get_item_notes(refresh)`, `pos_core.set_item_notes` |
| Tables | `tables` and F&B | `pos_fnb.list_tables`, `pos_fnb.save_table`, `pos_fnb.delete_table` |
| Locations | `settings` | `pos_core.list_locations`, `pos.list_pos_profiles`, REST `Cost Center`, REST `Warehouse`, `pos_core.save_location`, `pos_core.delete_location` |
| Currencies | `settings` | `pos_core.set_exchange_rate` |
| End of day | `reports` | `pos_core.end_of_day_report` |

Staff & PIN management is **not** in the POS app; it lives in the ERP User form
(`erp-frontend/src/components/dynamic/pos-access-panel.tsx`) → `pos.get_pos_access`, `pos.save_pos_access`,
`pos.set_pin`, `pos.reset_pin`.

## Components

| Component | Lines | Props / emits | Calls | Used by |
|---|---|---|---|---|
| `PayDialog.vue` | 128 | props `posProfile, currency, due, methods, busy, error, allowPartial, balanceOf`; emits `pay(payments, partial)`, `cancel` | `pos_core.list_checkout_currencies` | Terminal, Order |
| `SessionMenu.vue` | 135 | shift summary, switch user/register, sign out, settings link | `auth.switchUser/logout` | Terminal, Order, Floor, Shift, Kitchen |
| `FloorPlan.vue` | 63 | table tiles positioned by zone | — | Floor |
| `NewOrderDialog.vue` | 68 | Dine In (table, guests) / Take Away (name, phone) | — | Floor |
| `ReservationDialog.vue` | 104 | booking form; emits save | — | Floor |
| `ItemNoteDialog.vue` | 60 | suggestion chips + free text | `pos_core.get_item_notes` | Order |
| `ConfirmSheet.vue` | 32 | generic confirm (`role="alertdialog"`) | — | Order |

## Stores

| Store | Actions → backend |
|---|---|
| `stores/auth.ts` | `lookupTenant` → `signup.tenant_lookup`; `pinLogin` → `pos.pin_login`; `checkSession` → `frappe.auth.get_logged_user` + REST `User/<me>`; `switchUser` / `logout` → `logout` |
| `stores/pos.ts` | `load` → `pos_core.get_pos_settings`; `setMode` → `set_pos_mode`; `saveSettings` → `save_pos_settings`; `openShift` → `open_shift`; `closeShift` → `close_shift` |
| `stores/printer.ts` | no backend; `printKot`/`printReceipt` → `lib/bluetooth-printer.ts` (BLE) or `lib/kot.ts`/`lib/receipt.ts` (browser) |

## Library modules

| Module | Purpose |
|---|---|
| `lib/api.ts` | `call` (POST `/api/method/<m>`, JSON), `getList`, `getDoc`, `createDoc`/`updateDoc` (unused), `setTenantCookie`, `logout` |
| `lib/escpos.ts` | ESC/POS byte builder (`ReceiptBuilder`) |
| `lib/receipt.ts` | receipt bytes (32 columns) and popup print |
| `lib/kot.ts` | KOT bytes and hidden-iframe print |
| `lib/bluetooth-printer.ts` | BLE pairing/reconnect/write via `@capacitor-community/bluetooth-le` |
| `lib/native.ts` | Capacitor shell bootstrap (status bar, back button, splash) |

## Request path for every call

`browser (pos.xentraerp.net)` → nginx `location /api/` (`scripts/nginx-pos.xentraerp.net.conf:22-29`) →
Next.js `erp-frontend/src/app/api/{method,resource}/[...path]/route.ts` (tenant from `x-xentra-tenant` header or
`xentra_tenant` cookie; `Host: <code>.xentraerp.local`; `X-Forwarded-For` = nginx `X-Real-IP`; error bodies
scrubbed by `lib/method-alias.ts`) → gunicorn `127.0.0.1:8001` → Frappe site DB.

## Backend module → doctypes touched

| Module | Reads | Writes |
|---|---|---|
| `pos.py` | POS PIN, User, POS Profile, POS Payment Method, Location | POS PIN, User roles, Role, Custom DocPerm, Comment |
| `pos_core.py` | Settings, Location, POS Profile, Item, Item Price, Currency Exchange, Shift, Tender, POS/Sales Invoice, Order, Mode of Payment, Account | Settings, Location, Property Setter (naming series), Currency Exchange, Shift(+Cash), POS Invoice, Sales Invoice, Payment Entry, Tender, Item, Item Price, Item Note, Hidden Item |
| `pos_fnb.py` | Table, Order, KOT, Reservation, Item | Table, Order(+Item), KOT(+Item), Reservation, Series (`getseries`) |
| `rounding.py` | Global Defaults, Currency | Global Defaults, Currency (`smallest_currency_fraction_value`), POS Profile, DefaultValue |
