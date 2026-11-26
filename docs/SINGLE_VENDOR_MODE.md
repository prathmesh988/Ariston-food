# Single-Vendor Mode Guide — Ariston Cafe

This document details how the Ariston platform operates in **single-vendor mode** versus **marketplace mode**, how to switch modes, seed the default restaurant, create the owner account, and verify behavior.

---

## 1. Architecture Overview

The Ariston platform supports dual operating modes:

| Mode | Target | Characteristics |
|---|---|---|
| `marketplace` *(Default)* | Multi-Vendor Marketplace | Independent vendors register, submit KYC, await approval, set up commissions, and request payouts. Customers browse a list of restaurants. |
| `single_vendor` | Dedicated Brand App | Dedicated solely to **Ariston Cafe**. Registration, vendor KYC, commission structures, and vendor payout queues are disabled/hidden. Customer app loads the Ariston Cafe menu directly. |

### Pinned Default Restaurant Constants

| Identifier | Value |
|---|---|
| `DEFAULT_RESTAURANT_ID` | `650000000000000000a15701` |
| Restaurant Name | `Ariston Cafe` |
| Slug | `ariston-cafe` |
| Status | `approved` |
| Commission | `0%` |

---

## 2. Environment Configuration

### Backend (`Backend/.env`)

```env
# Operating mode: marketplace (default) | single_vendor
PLATFORM_MODE=single_vendor

# Required in single_vendor mode (valid 24-char MongoDB ObjectId)
DEFAULT_RESTAURANT_ID=650000000000000000a15701
```

### Frontend (`Frontend/.env`)

```env
# Client fallback (overridden by public business-settings endpoint at runtime)
VITE_PLATFORM_MODE=single_vendor
```

### Mobile Apps (`mobile-*/.env.example`)

```env
EXPO_PUBLIC_PLATFORM_MODE=single_vendor
```

---

## 3. Seeding the Default Restaurant & Owner Account

The seed script is **fully idempotent** — running it multiple times will not duplicate records or overwrite owner-customized fields (it uses `$setOnInsert` for editable details and `$set` for mandatory approval flags).

### 3.1. Seed Restaurant Only

```bash
cd Backend
npm run seed:default-restaurant
```

Expected output:
```
[seed] Connecting to MongoDB…
[seed] Connected.
[seed] ✅ Restaurant CREATED: "Ariston Cafe" (650000000000000000a15701)
```

Running it again:
```
[seed] ℹ️  Restaurant ALREADY EXISTS: "Ariston Cafe" (650000000000000000a15701)
```

### 3.2. Seed Restaurant with Owner Admin Account

To create an owner account simultaneously, provide credentials in `Backend/.env`:

```env
SEED_OWNER_EMAIL=owner@aristoncafe.com
SEED_OWNER_PASSWORD=YourSecurePassword123!
```

Then run:

```bash
cd Backend
npm run seed:default-restaurant:with-owner
```

This hashes the password using `bcryptjs` (honoring `config.bcryptSaltRounds`) and grants the account `ADMIN` privileges with full restaurant and platform control.

---

## 4. Boot-Time Verification & Fail-Fast Check

When running in `single_vendor` mode:
1. `validateConfig()` checks that `DEFAULT_RESTAURANT_ID` is defined and is a valid 24-character hexadecimal ObjectId.
2. During `server.js` startup (after connecting to MongoDB), the server queries the database for `DEFAULT_RESTAURANT_ID`.
   - If the restaurant is found:
     ```
     [platform] Running in single_vendor mode — verifying default restaurant…
     [platform] Default restaurant confirmed: "Ariston Cafe" (650000000000000000a15701)
     ```
   - If the restaurant is missing, the server logs a fatal error and terminates immediately:
     ```
     [platform] FATAL: single_vendor mode requires DEFAULT_RESTAURANT_ID="650000000000000000a15701" to exist in the database. Run: npm run seed:default-restaurant
     ```

---

## 5. Behavior Matrix

| Feature | `marketplace` | `single_vendor` |
|---|---|---|
| **Server Boot** | Boots normally | Verifies default restaurant exists in DB; fails fast if missing |
| **Public Business Settings** | Returns settings | Returns settings + `platformMode: 'single_vendor'` + `defaultRestaurantId` |
| **Vendor Registration (`POST /register`)** | Allowed (multipart KYC upload) | Blocked (Returns `404 Not Found`) |
| **Admin Vendor Approvals** | Visible in admin portal | Hidden from sidebar; API routes return `404` |
| **Restaurant Commissions** | Calculated and deducted | Commission forced to `0`; no deduction |
| **Vendor Settlements / Payouts** | Scheduled & processed | Skipped (platform owns the restaurant) |
| **Order Creation** | Uses client `restaurantId` | Ignores client `restaurantId`; forced to default restaurant |
| **Non-Matching Cart Items** | Allowed if single restaurant | Rejected with validation error |
| **Customer Web Home** | Restaurant carousels & listing grid | Ariston Cafe menu & dishes directly |
| **Customer Web Search** | Restaurants & dishes | Focused dish search |
| **Admin Portal Sidebar** | Multi-vendor sections | Vendor sections hidden; "MY RESTAURANT" section displayed |
| **Kitchen App (`mobile-restaurant`)**| Hub finance / payout tab active | Payout reconciliation screens hidden |
| **Rider App (`mobile-delivery`)** | Pickup from any vendor | Pickup always from Ariston Cafe |

---

## 6. How to Switch Modes

### Option A: Via Admin UI (Zero-Downtime, No Restart Required) ✨
1. Log in to the Admin Dashboard as an Administrator.
2. Navigate to **Business Setup** (`/admin/food/business-setup`).
3. At the top of the page, view the **Platform Operating Mode** card.
4. Click either:
   - **Multi-Vendor Marketplace**
   - **Single-Vendor (Ariston Cafe)**
5. The change is persisted immediately to MongoDB (`FoodBusinessSettings`), cached in memory/Redis, and broadcasts a `businessSettingsUpdated` event across the frontend.
6. The Admin Sidebar, Customer view, and restaurant routing adapt in real time!

### Option B: Via Environment File (`Backend/.env`)
To set the boot-time default mode, configure `Backend/.env`:

- **For Marketplace Mode**:
  ```env
  PLATFORM_MODE=marketplace
  ```
- **For Single-Vendor Mode**:
  ```env
  PLATFORM_MODE=single_vendor
  DEFAULT_RESTAURANT_ID=650000000000000000a15701
  ```

---

## 7. Restaurant Onboarding vs. Rider Approval Rules

### Restaurant Onboarding & Approval (Bypassed in Single-Vendor Mode)
- **Single-Vendor Mode**:
  - Direct navigation to `/food/restaurant/onboarding` or `/food/restaurant/signup` redirects immediately to `/food/restaurant` or `/food/restaurant/login`.
  - Landing page hides the "Restaurant Partner Onboarding" section.
  - Admin restaurant approval queue (`/admin/food/restaurants/joining-request`) is hidden from sidebar and API endpoints return 404.
  - Ariston Cafe (`650000000000000000a15701`) is pre-seeded and always active.

### Rider / Delivery Partner Approval (CRITICAL INVARIANT — ALWAYS ACTIVE)
- **In BOTH Modes (`marketplace` and `single_vendor`)**:
  - Delivery partner registration (`POST /api/v1/food/delivery/register`) remains fully active.
  - Newly registered riders enter `pending` status.
  - The Admin **Deliveryman > New Join Request** menu (`/admin/food/delivery-partners/join-request`) remains active and visible.
  - Admin **MUST review and approve** every delivery partner (`PATCH /api/v1/food/admin/delivery/:id/approve`) before they can accept orders or go online.
  - Rider onboarding pitch on the landing page is always visible.

---

## 8. Restaurant Account Creation & Login Restrictions (Single-Vendor Mode)

In Single-Vendor mode, **public registration / signup for restaurant accounts is completely disabled**:
- **Strict Authorization**: Only phone numbers explicitly configured by the Administrator can log in to the Restaurant Portal / Kitchen App (`mobile-restaurant`).
- **Pre-OTP Verification**: If an unauthorized phone number attempts to log in via `/food/restaurant/login`, the backend rejects the OTP request immediately with:
  > `"This phone number is not registered for Ariston Cafe. In Single-Vendor mode, accounts are created exclusively by the administrator."`
- **Zero Registration Leaks**: An unauthorized user is NEVER given access to Ariston Cafe, nor are they allowed to create a new restaurant.
- **Admin Account Management**:
  - The Administrator manages restaurant access from **MY RESTAURANT > Restaurant Profile** (`/admin/food/my-restaurant/profile`).
  - **Primary Owner Account**: Configured via Owner Phone & Owner Email fields.
  - **Authorized Staff Accounts**: Admin can add multiple staff accounts (Name, Mobile Number, Role: Manager, Kitchen / Orders, Cashier, Staff) directly in the **Authorized Restaurant Accounts** section.
  - Any authorized staff phone number can immediately log in to the Restaurant App with their OTP.
