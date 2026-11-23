# Single-Vendor Mode Conversion — Agent Instructions

> **Audience**: AI coding agent working in the Ariston monorepo.
> **Read first**: `PROJECT_AGENT_GUIDE.md` (architecture + invariants). Every rule there still applies.
> **Goal**: Make the platform run as a **single-vendor app for Ariston Cafe** (restaurant owner = admin = vendor) **without removing or breaking multi-vendor (marketplace) functionality**.

---

## 0. Non-Negotiable Rules

1. **Do NOT delete or fork multi-vendor code.** Add a deployment mode flag; behavior branches on it.
2. **Default mode must stay `marketplace`** until the owner flips it. After every phase, marketplace behavior must be unchanged.
3. Obey the invariants in `PROJECT_AGENT_GUIDE.md` section 5:
   - Never rename `gstPaidByFoodie`, `foodie_business_settings`, `foodie_customization_settings`, `window.__foodieNativeApiErrorBridge`, `FOODIE_FCM_CONFIG`.
   - Never edit `mobile-*/android/` or `mobile-*/ios/`. Use `app.json` or Expo config plugins.
   - HTTP header names never contain spaces.
4. **Never trust a client-supplied `restaurantId` in single-vendor mode.** Always resolve it server-side.
5. Do not scatter `if (mode === 'single_vendor')` checks. Use the helpers defined in Phase 1 only.
6. Work phase by phase. After each phase, run the validation commands (section 8) and report what changed before continuing.
7. Before editing, **read the existing code** (models, routes, controllers). Do not assume field names; this document names concepts, not guaranteed identifiers. Where a name below differs from the code, follow the code and note the mapping.

---

## 1. Default Restaurant Constants

Use these exact values everywhere (seed script, env, docs):

| Constant | Value |
|---|---|
| `DEFAULT_RESTAURANT_ID` | `650000000000000000a15701` (valid 24-char hex Mongo ObjectId) |
| Restaurant name | `Ariston Cafe` |
| Slug | `ariston-cafe` |
| Status | approved / active / verified (use whatever the Restaurant model calls these) |

Add to `Backend/.env` and `Backend/.env.example`:

```env
PLATFORM_MODE=marketplace          # marketplace | single_vendor
DEFAULT_RESTAURANT_ID=650000000000000000a15701
```

Add to frontend/mobile env examples:

```env
VITE_PLATFORM_MODE=marketplace           # Frontend
EXPO_PUBLIC_PLATFORM_MODE=marketplace    # mobile-user, mobile-restaurant, mobile-delivery
```

The backend value is the source of truth. Clients should read mode from the public business-settings/config endpoint and use the env value only as a startup fallback.

---

## 2. Phase 1 — Mode Flag and Resolver (Backend)

1. Create `Backend/src/config/platformMode.js` exporting:
   - `getPlatformMode()` → `'marketplace' | 'single_vendor'` (reads env, validates, defaults to `marketplace`).
   - `isSingleVendor()` → boolean.
   - `getDefaultRestaurantId()` → string, throws a clear error at startup if mode is single-vendor and the ID is missing or not a valid ObjectId.
   - `getDefaultRestaurant()` → loads the restaurant document, cached in Redis (reuse the existing cache helper; short TTL, invalidate on restaurant update).
2. Validate config at server boot in `server.js`. In single-vendor mode, **fail fast** if the default restaurant does not exist in the DB (message: "Run the seed script").
3. Expose `platformMode` and `defaultRestaurantId` in the existing public business-settings response so clients can read them. Do not rename any existing storage keys.
4. Create middleware `resolveRestaurantContext` in `Backend/src/middleware/`:
   - Marketplace mode: `req.restaurantId` = restaurant id from the authenticated restaurant token (existing behavior).
   - Single-vendor mode: `req.restaurantId` = `getDefaultRestaurantId()`.
   - Apply it to every restaurant-scoped route. Controllers must read `req.restaurantId`, never `req.body.restaurantId` or `req.params.restaurantId` for scoping in single-vendor mode.
5. Create middleware `marketplaceOnly` that returns `404` (preferred, so the route appears absent) in single-vendor mode. Apply it in Phase 3.

**Acceptance**: with `PLATFORM_MODE=marketplace`, the API behaves exactly as before. With `single_vendor` and a missing restaurant, the server refuses to boot with a clear message.

---

## 3. Phase 2 — Seed Script: Default Restaurant

Create `Backend/scripts/seedDefaultRestaurant.js` (ES module, matching `"type": "module"`), and add an npm script `"seed:default-restaurant": "node scripts/seedDefaultRestaurant.js"`.

Requirements:
- Connect using the existing Mongo config (`MONGODB_URI`).
- **Idempotent**: upsert by `_id = DEFAULT_RESTAURANT_ID`. Running twice must not create duplicates or overwrite owner-edited fields (use `$setOnInsert` for editable fields like name, address, menu settings; `$set` only for the approval/status flags that single-vendor mode requires).
- Inspect the Restaurant model first and populate **every required field**. Use placeholders clearly marked for the owner to edit later (phone, address, coordinates, FSSAI/GST, opening hours, cuisines, image). Take real values from env vars where sensible (`SEED_RESTAURANT_NAME`, `SEED_RESTAURANT_PHONE`, etc.), with safe defaults.
- Set: name `Ariston Cafe`, slug `ariston-cafe`, approved/verified/active flags true, KYC and approval workflow marked complete, accepting orders true, **commission = 0** (use the model's commission field and type).
- Do not store any real secrets or passwords in the script.
- Also create (or link) the owner account (see Phase 4) if the script is run with `--with-owner`. Read the owner email and password from env (`SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD`), hash the password with the same bcrypt setup used for admin login, and never log the password.
- Print a summary: restaurant id, created vs already existed.

**Acceptance**: running the script on an empty DB creates the restaurant with the exact ID; running it again changes nothing; the restaurant appears approved in any query that previously filtered on approval.

---

## 4. Phase 3 — Auth, Onboarding, Roles

1. **Restaurant registration and approval endpoints**: wrap the public "register as restaurant", approval queue, rejection, and KYC-review routes with `marketplaceOnly`. Do not delete them.
2. **Owner identity**: in single-vendor mode the owner uses **one admin login** that has full restaurant permissions for the default restaurant.
   - Reuse the sub-admin RBAC. Ensure the owner role includes `orders.manage`, `menu.edit`, `settlements.approve`, `maintenance.toggle` and any restaurant-side permissions.
   - Restaurant-app login (`mobile-restaurant`) must also work for the owner and for staff accounts bound to the default restaurant. Staff accounts get limited permissions (e.g. orders and stock only).
3. In single-vendor mode, any restaurant-scoped endpoint must reject attempts to act on a restaurant other than the default one (403).
4. Tokens keep the existing dual-token scheme (15m access / refresh). Do not change token lifetimes or cookie handling.

**Acceptance**: in single-vendor mode the owner can log in once and reach both admin and restaurant functions. Registration/approval routes return 404. In marketplace mode both flows still work.

---

## 5. Phase 4 — Orders, Pricing, Money

1. **Order creation**: in single-vendor mode, ignore any client `restaurantId` and set it from `getDefaultRestaurantId()`. Reject carts containing items that do not belong to that restaurant.
2. **Pricing engine** (`/api/v1/food/orders/calculate-pricing`): keep item, variant, packaging, GST 9(5) (`gstPaidByFoodie`), platform fee, distance fee, coupon, and Diamond logic. Only the **commission** step changes: in single-vendor mode the commission is 0 and no restaurant commission line is produced.
3. **Settlements and payouts**: in single-vendor mode, skip creating vendor payout/settlement records and do not schedule the settlement reconciliation BullMQ jobs. Do not delete job definitions. Rider wallet credits and analytics counters stay unchanged.
4. **Dispatch**: leave dispatch sweeps, rider broadcast, and OTP handover untouched. They already derive from the order's restaurant location.
5. **Sockets**: keep `restaurant_<restaurantId>` rooms. The default restaurant's merchant devices join `restaurant_650000000000000000a15701`. Do not change room naming.
6. **Delivery eligibility**: replace "restaurants available in the customer's zone" with "is the customer's address within the delivery zone/radius of the default restaurant?" Keep zone polygons and surge logic.

**Acceptance**: place a full test order in single-vendor mode (place, pay, kitchen accept, rider assign, pickup, OTP delivery) with no commission or vendor payout generated. Repeat in marketplace mode and confirm identical results to before the change.

---

## 6. Phase 5 — Customer Web and `mobile-user`

Drive everything from the platform mode read from the config endpoint. Add a small shared helper (`usePlatformMode()` or equivalent) in each client; do not duplicate string checks.

- **Home screen**: single-vendor shows the Ariston Cafe menu directly (categories, offers, Diamond banner, table-booking entry). Hide the restaurant list, cuisine carousels, and "restaurants near you".
- **Routing**: the restaurant detail screen becomes the home route; the listing route redirects to it. Keep the listing screen in the codebase.
- **Search**: switch to menu-item search.
- **Cart**: single restaurant only (already true; make the "different restaurant" prompt unreachable in this mode).
- **Dining and Diamond**: unchanged, bound to the default restaurant.
- **Branding copy**: remove marketplace wording ("restaurants", "partners") in single-vendor mode only. Keep the existing Ariston Cafe red gradient branding.
- `mobile-user`: any mode-dependent native config goes in `app.json` or config plugins, never in `android/` or `ios/`.

**Acceptance**: with `single_vendor` the app opens straight to the Ariston Cafe menu; with `marketplace` the existing home and listing flow is unchanged.

---

## 7. Phase 6 — Admin Panel and Restaurant App

1. Create one navigation config map, e.g. `{ key, label, route, modes: ['marketplace'] | ['single_vendor'] | ['marketplace','single_vendor'] }`, and render menus from it. Do not hardcode conditionals per menu item.
2. **Hide in single-vendor mode**: vendor approval queue, KYC review, restaurant list/management, commission structures, vendor payouts/settlements.
3. **Keep in both modes**: zones, surge pricing, riders and rider KYC, coupons, Diamond settings, refunds, dispute tickets, maintenance lock, sub-admin management, page content.
4. **Add "My Restaurant"** (single-vendor only): reuses existing restaurant-side components for menu and pricing, inventory toggles, timings, table reservations, live orders, and profile editing, all bound to the default restaurant.
5. `mobile-restaurant` stays the kitchen app (KDS order queue, sound alarms, stock toggles). Log in as owner or staff tied to the default restaurant. Remove or hide payout reconciliation screens in single-vendor mode only.
6. `mobile-delivery` (Ariston Rider): no functional change. Confirm pickup address shows the default restaurant.

**Acceptance**: switching `PLATFORM_MODE` changes the visible menus as specified; no screen crashes in either mode.

---

## 8. Validation (run after every phase)

```bash
cd Frontend && npm run build
cd Backend && node -e "import('./src/app.js')"
```

**Mobile validation is deferred.** Do NOT run `npx expo config`, `expo prebuild`, or any mobile build/validation during this conversion. The owner will validate the mobile apps separately later. You may still edit mobile source code as described in Phases 5 and 6; just don't claim mobile apps are validated, and list every mobile file you changed in your phase report so it can be checked later.

Also run the seed script twice against a dev database and confirm idempotency.

**Test matrix** (add automated tests where a test setup exists; otherwise document manual steps in `docs/`):

| Case | marketplace | single_vendor |
|---|---|---|
| Server boot | OK | OK; fails clearly if default restaurant missing |
| Restaurant register/approval routes | Work | 404 |
| Order with client-supplied other `restaurantId` | Uses it | Forced to default |
| Commission on order | Applied | 0 / none |
| Vendor settlement jobs | Scheduled | Not scheduled |
| Customer home | Restaurant list | Ariston Cafe menu |
| Admin menu | Full | Vendor-admin items hidden, My Restaurant shown |

---

## 9. Definition of Done

- [ ] Default mode `marketplace` behaves exactly as before the change.
- [ ] `PLATFORM_MODE=single_vendor` runs end to end with only Ariston Cafe.
- [ ] Seed script is idempotent and creates restaurant `650000000000000000a15701`.
- [ ] No legacy field, storage key, or header name was renamed; no `android/` or `ios/` file edited.
- [ ] Mode checks live only in the shared helpers and navigation config, not scattered through controllers.
- [ ] `docs/SINGLE_VENDOR_MODE.md` documents how to switch modes, seed the restaurant, and create the owner account.

## 10. Reporting Format

After each phase, reply with: files changed, any mapping between names in this document and actual code identifiers, validation results, and anything that needs the owner's decision. Do not start the next phase until the current one passes validation.