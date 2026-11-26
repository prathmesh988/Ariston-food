# Ariston Cafe & Delivery Ecosystem: System & Agent Architecture Guide

> **Target Audience**: AI Agents, Systems Engineers, and Technical Leads.  
> **Purpose**: Single source of truth detailing the technical architecture, business logic, runtime environments, domain models, and operational guidelines for the entire Ariston platform.

---

## Table of Contents
1. [Executive & Business Domain Overview (Non-Technical)](#1-executive--business-domain-overview-non-technical)
   - 1.1 Product Ecosystem & Mission
   - 1.2 The Four Core Platform Actors
   - 1.3 End-to-End User Journeys
   - 1.4 Commercial & Financial Mechanics
2. [Monorepo Topology & Project Layout](#2-monorepo-topology--project-layout)
3. [Deep Technical Architecture](#3-deep-technical-architecture)
   - 3.1 Backend Engine (Node.js, Express, MongoDB, Redis, BullMQ)
   - 3.2 Real-time Subsystems (Socket.io & Firebase RTDB)
   - 3.3 Frontend Web Portal (Vite, React 18, Tailwind)
   - 3.4 Mobile Suite (Expo SDK 52, React Native, Expo Router)
   - 3.5 Dynamic Route Trimming & Live Tracking Engine
   - 3.6 Authentication, Tokens & Authorization (RBAC)
4. [Environment & Configuration Matrix](#4-environment--configuration-matrix)
5. [Operational Guidelines & Agent Invariants](#5-operational-guidelines--agent-invariants)

---

# 1. Executive & Business Domain Overview (Non-Technical)

### 1.1 Product Ecosystem & Mission
The **Ariston** platform is a hyper-local, multi-tenant on-demand food ordering, dining reservation, and logistics fulfillment platform. It connects customers, commercial restaurants/cafes, and freelance delivery fleets through an integrated digital workflow.

The platform consists of four distinct user-facing properties:
1. **Ariston Cafe (Customer Web & User Mobile App)**: Consumer-facing ordering, table bookings, loyalty membership (Diamond), and real-time order tracking.
2. **Ariston Cafe Restaurant (Restaurant Web & Mobile Partner App)**: Commercial merchant dashboard for live kitchen order management, menu/pricing control, inventory toggling, and payout reconciliation.
3. **Ariston Rider (Delivery Partner Mobile App)**: Gig-economy rider app for turn-by-turn navigation, order pickup/delivery validation, real-time earnings, and status broadcasts.
4. **Platform Administration Suite (Admin Portal)**: Centralized management dashboard for zone boundary mapping, dynamic surge pricing, commission structures, KYC approvals, and system-wide maintenance locks.

---

### 1.2 The Four Core Platform Actors

```
┌────────────────────────────────────────────────────────────────────────┐
│                        ARISTON PLATFORM ADMIN                          │
│        (Zones, Commissions, KYC, Surge, System Configurations)          │
└───────────────▲────────────────────────▲───────────────────────▲───────┘
                │                        │                       │
      Dispatches Orders           Receives Menus          Routes Orders
                │                        │                       │
┌───────────────▼────────┐      ┌────────▼────────┐     ┌────────▼───────┐
│     ARISTON CAFE       │      │  ARISTON CAFE   │     │ ARISTON RIDER  │
│      (Customer)        │◄────►│  (Restaurant)   │◄───►│ (Deliveryman)  │
│ Browse, Order, Pay,    │      │ Kitchen KDS,    │     │ Accept, GPS,   │
│ Track Live Route       │      │ Menu, Tables    │     │ Handover OTP   │
└────────────────────────┘      └─────────────────┘     └────────────────┘
```

#### Actor Responsibilities:
- **Customer**: Browses localized restaurant menus, configures food item add-ons and variants, utilizes discount coupons or Diamond VIP perks, makes payments via UPI/Cards/COD, and watches live rider movement.
- **Restaurant (Outlet)**: Receives order alerts (custom sound notifications), sets preparation times (KDS), marks items out-of-stock, handles table reservation inquiries, and monitors weekly financial settlements.
- **Delivery Rider**: Toggles online/offline shifts, accepts broadcasts within their geofenced radius, navigates to the restaurant for food collection, navigates to the customer, and executes secure handover using a 4-digit OTP.
- **Admin & Dispatcher**: Oversees platform health, defines geo-zones (polygons), configures delivery distance fees, monitors dispute tickets, triggers refunds, and manages sub-admin permissions.

---

### 1.3 End-to-End User Journeys

#### Complete Food Delivery Lifecycle:
1. **Cart & Pricing Computation**: Customer adds items to cart. The client queries the pricing engine (`/api/v1/food/orders/calculate-pricing`) which factors item base costs, item variants, packaging fees, GST u/s 9(5), platform fees, distance delivery fees, and active coupon discounts.
2. **Order Placement**: Order created in status `placed` or `pending` (if online payment is pending).
3. **Payment Reconciliation**: If Razorpay is used, webhooks or client verification triggers state transition to `confirmed`.
4. **Kitchen Dispatch (Restaurant Notification)**: Socket.io and FCM ping the restaurant. A persistent audio alarm plays on the merchant device. The restaurant accepts the order and sets preparation time (order status: `cooking`).
5. **Rider Assignment**: The backend dispatch queue queries online riders in the zone. An order broadcast is dispatched. The first eligible rider to accept locks the dispatch (order status: `ready_for_pickup` or `rider_assigned`).
6. **Pickup**: Rider arrives at restaurant, inspects items, and taps "Picked Up" (order status: `picked_up` / `in_transit`).
7. **Live GPS Stream**: Rider GPS updates every 2–5 seconds, streaming coordinates to Firebase Realtime Database. The customer app dynamically trims the route polyline in real time.
8. **Secure Delivery**: At the doorstep, the customer provides the secret OTP shown on their screen. The rider enters the OTP into the Rider app. The backend validates and completes the order (`delivered`).
9. **Financial Settlement**: The rider's wallet is credited with delivery earnings, the restaurant balance is updated minus platform commission, and analytics counters increment.

---

### 1.4 Commercial & Financial Mechanics

- **Commission Engine**: Configurable percentage or fixed fee deducted from each restaurant order payout.
- **GST Section 9(5) Compliance**: The platform calculates and collects GST on restaurant services on behalf of unregistered/registered food outlets. In code and DB schemas, this is tracked under `gstPaidByFoodie` (historical field preserved for database continuity).
- **Diamond VIP Program**: Customer subscription tier unlocking zero delivery fees on orders above a minimum basket size and exclusive restaurant discounts.
- **Surge & Zone Tariffs**: Dynamic pricing adjustments triggered by inclement weather, high order density, or midnight operational shifts.

---

# 2. Monorepo Topology & Project Layout

The repository is structured into isolated frontend, backend, and native mobile projects:

```
d:\food-project\
├── Backend\                  # Node.js + Express API Server & Background Workers
│   ├── src\
│   │   ├── config\           # Database (Mongo), Redis, Firebase Admin, Sockets, Environment
│   │   ├── core\             # Notifications, OTP services, base utilities
│   │   ├── middleware\       # Auth, rate limiting, error handling, maintenance gates
│   │   ├── modules\food\     # Domain logic: admin, delivery, diamond, dining, orders, restaurant, user
│   │   ├── queues\           # BullMQ job queues (refunds, dispatch sweeps, notifications)
│   │   └── utils\            # Encryption, emailers, loggers
│   ├── server.js             # Main HTTP + Socket cluster entry point
│   └── package.json          # "ariston-backend"
│
├── Frontend\                 # Unified React 18 Web Application (Vite SPA)
│   ├── public\               # Static assets (logo.webp, logo-icon.webp, sound FX, favicon.webp)
│   ├── src\
│   │   ├── app\              # Shell, providers, MasterLandingPage, Redux slices
│   │   ├── modules\          # User Web Ordering, Delivery Web Portal, Admin Control Center
│   │   ├── services\api\     # Axios interceptors, API clients, token renewal
│   │   └── shared\           # Toast engines, Google Places compatibility, splash screens
│   ├── index.html            # Vite entry with MIME-mismatch crash guards & tab favicon
│   └── package.json          # "ariston-frontend"
│
├── mobile-user\              # Customer Native App ("Ariston Cafe")
│   ├── app.json              # App Name: "Ariston Cafe", Package: "com.user.aristoncafe"
│   ├── assets\               # App icons, splash screens, notification icons
│   ├── src\app\              # Expo Router file-based screens (`_layout.jsx`, `/food/user/`)
│   └── src\lib\              # Native push, Razorpay bridge, storage shims
│
├── mobile-delivery\          # Rider Native App ("Ariston Rider")
│   ├── app.json              # App Name: "Ariston Rider", Package: "com.delivery.aristonrider"
│   ├── assets\               # Dedicated Rider icon (Blue gradient + Scooter motif)
│   └── src\app\              # Order queue, live route GPS broadcaster, earnings ledger
│
├── mobile-restaurant\        # Restaurant Partner Native App ("Ariston Cafe Restaurant")
│   ├── app.json              # App Name: "Ariston Cafe Restaurant", Package: "com.restaurant.aristoncafe"
│   ├── assets\               # Dedicated Merchant icon (Red gradient + Chef hat motif)
│   └── src\app\              # Live kitchen order display, menu stock toggles, sound alarms
│
└── docs\                     # Operational SOPs, gap analyses, and deployment configurations
```

---

# 3. Deep Technical Architecture

### 3.1 Backend Engine

- **Runtime**: Node.js (ES Module format `"type": "module"`).
- **Framework**: Express.js with custom rate limiters and CORS dynamic origin matchers.
- **Primary Database**: MongoDB accessed via Mongoose ORM.
  - Core collections: `users`, `restaurants`, `orders`, `deliverymen`, `businesssettings`, `diamondsettings`, `zones`, `pagecontents`.
  - Transaction support used during checkout and wallet debits/credits.
- **Cache & Message Broker**: Redis instance handling:
  - Cache layers for category trees, zone boundaries, and business configuration settings.
  - **BullMQ**: Asynchronous background workers for:
    - Dispatch sweeps (retrying unassigned orders to expanded radii).
    - Auto-rejection of unattended orders.
    - Payment reconciliation and retry loops for automated customer refunds.
    - Scheduled expiration of time-limited discount coupons.
- **Background Cron Sweepers**: Initiated inside `server.js` with graceful shutdown hooks (`SIGTERM`, `SIGINT`).

```
                              ┌────────────────┐
                              │ Express Server │
                              └───────┬────────┘
                                      │
          ┌──────────────┬────────────┼────────────┬──────────────┐
          │              │            │            │              │
     ┌────▼─────┐  ┌─────▼────┐  ┌────▼────┐  ┌────▼─────┐  ┌─────▼──────┐
     │ MongoDB  │  │  Redis   │  │ BullMQ  │  │Socket.io │  │  Firebase  │
     │ Mongoose │  │  Cache   │  │ Workers │  │ Realtime │  │ Admin SDK  │
     └──────────┘  └──────────┘  └─────────┘  └──────────┘  └────────────┘
```

---

### 3.2 Real-time Subsystems (Socket.io & Firebase RTDB)

The platform utilizes a **hybrid dual-layer real-time architecture**:

1. **Socket.io (Event-Driven State Machine)**:
   - Primary transport for state changes, alarms, and room notifications.
   - Rooms:
     - `order_<orderId>`: Customer and rider listening for state transitions (`cooking`, `ready_for_pickup`, `in_transit`, `delivered`).
     - `restaurant_<restaurantId>`: Merchant listening for new order placement alerts with audio triggers.
     - `rider_<riderId>`: Individual rider notifications for private delivery broadcasts.
     - `admin`: High-level operational events and emergency flags.

2. **Firebase Realtime Database (High-Frequency Geolocation Streaming)**:
   - Low-latency, cost-effective spatial coordinates streaming.
   - Schema:
     ```json
     {
       "riders": {
         "<riderId>": {
           "lat": 28.6139,
           "lng": 77.2090,
           "heading": 142.5,
           "speed": 22.4,
           "updatedAt": 1732360000000,
           "activeOrderId": "<orderId>"
         }
       },
       "orders": {
         "<orderId>": {
           "riderLocation": { "lat": 28.6139, "lng": 77.2090 },
           "status": "in_transit"
         }
       }
     }
     ```
   - Eliminates database write bottlenecks on MongoDB for high-frequency GPS pings.

---

### 3.3 Frontend Web Portal (Vite + React 18)

- **Build Tool**: Vite 7 with manual chunk splitting for vendor libraries, maps, and chart components.
- **State Management**:
  - Redux Toolkit for global session state and auth credentials.
  - Custom React Contexts for Shopping Cart calculations (`CartContext.jsx`) and Location geo-coordinates (`useLocation.jsx`).
- **Dynamic Module Recovery**:
  - `Frontend/index.html` embeds an inline error interceptor that detects Vite dynamic import chunk failures (`Failed to fetch dynamically imported module`) following hot production deployments and performs a controlled, throttle-protected page reload.
- **Shared Web Styling**: Tailwind CSS with custom branding design tokens, Poppins/Outfit/Plus Jakarta Sans typography, and sonner/toast abstractions.

---

### 3.4 Mobile Suite (Expo SDK 52 + Expo Router)

All three mobile apps (`mobile-user`, `mobile-delivery`, `mobile-restaurant`) share a unified native foundation built on **Expo SDK 52** and **Expo Router v4**:

- **Continuous Native Generation (CNG)**: The `/android` and `/ios` directories are treated as build artifacts generated during `npx expo prebuild`. Native modifications are applied exclusively via **Expo Config Plugins**:
  - `withReleaseSigning.js`: Automatically injects production Android keystore configurations into Gradle.
  - `withShortCmakeObjectPaths.js`: Overcomes Windows 260-character path limits during C++ CMake compilation in React Native Maps.
  - `withReleaseNoMinify.js`: Resolves obfuscation/minification clashes in release builds when needed.
  - `withMapsPrewarm.js`: Pre-initializes native Google Maps modules to prevent cold-start UI stutter.
- **Native Bridges & Shims**:
  - **Storage Polyfill** (`@/lib/storage`): Shims browser `localStorage` and `sessionStorage` into native `AsyncStorage` / `expo-secure-store`, allowing shared business logic code to run unchanged across web and mobile.
  - **Background Geolocation** (`mobile-delivery`): Integrates `expo-task-manager` and `expo-location` with foreground/background location permissions to broadcast rider telemetry even when the device screen is off.
  - **Sound Systems**: High-priority alert sound integration using `expo-audio` to wake up kitchen staff and riders when new orders arrive.

---

### 3.5 Dynamic Route Trimming & Live Tracking Engine

Implemented in `liveTrackingPolyline.js` and active in the customer tracking views:
1. **Decode**: Converts Google Directions API polyline into coordinate arrays.
2. **Nearest-Point Projection**: On each GPS tick from the rider, the algorithm computes the orthogonal projection of the rider's coordinate onto the polyline line segments.
3. **Backward Truncation**: Points behind the rider's current segment index are sliced out. The visible route dynamically collapses as the rider advances, providing a clean visual indication of the remaining trip.
4. **Interpolation & Heading Smoothing**: Renders marker rotation (heading/bearing) via `requestAnimationFrame` interpolation to prevent marker jumping.

---

### 3.6 Authentication, Tokens & Authorization (RBAC)

- **Authentication Scheme**: Dual Access Token (short-lived JWT, 15m) + Refresh Token (long-lived, 7d/30d) flow stored in HTTP-only cookies or SecureStore.
- **Login Providers**:
  - Mobile Phone OTP (SMS Hub India / MSG91 API with development fallback test bypasses `USE_DEFAULT_TEST_PHONE`).
  - Google OAuth / Firebase Authentication.
  - Admin Email & Passwords (bcrypt hashed).
- **Sub-Admin RBAC**: Fine-grained capability permissions (`orders.manage`, `menu.edit`, `settlements.approve`, `maintenance.toggle`).
- **HTTP Header Standard**:
  - **`X-Ariston-Client: local-dev`**: Custom header sent by local development instances to bypass maintenance locks.  
  - *Invariant*: Header names **must never contain spaces**.

---

# 4. Environment & Configuration Matrix

### Key Backend Variables (`Backend/.env`)
| Variable | Description | Production Example / Invariant |
|---|---|---|
| `PORT` | API listen port | `5000` |
| `MONGODB_URI` | Mongo connection string | `mongodb+srv://...` |
| `REDIS_URL` | Redis instance URL | `redis://127.0.0.1:6379` |
| `JWT_SECRET` | Secret for user & partner tokens | 256-bit cryptographically secure string |
| `FIREBASE_SERVICE_ACCOUNT` | Minified single-line JSON string | Service account credentials from Google Cloud Console |
| `VITE_FIREBASE_DATABASE_URL` | Realtime Database Endpoint | `https://aristontheoasis-7ff6b-default-rtdb.asia-southeast1.firebasedatabase.app/` |
| `USE_DEFAULT_OTP` | Test mode flag for SMS bypass | Set `false` in production! |
| `DEFAULT_TEST_PHONE` | Whitelisted developer test phone | Bypasses live SMS gateways when configured |
| `RAZORPAY_KEY_ID` / `_SECRET` | Payment Gateway Credentials | Production / Test API keys |

### Key Frontend & Mobile Variables (`Frontend/.env`, `mobile-*/.env`)
| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Absolute URL to backend API (`/api/v1`) |
| `VITE_FIREBASE_*` | Web client Firebase API Key, Project ID, Sender ID, App ID |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps Android SDK API key for native map rendering |
| `EXPO_PUBLIC_API_URL` | Base API endpoint for native mobile apps |

---

# 5. Operational Guidelines & Agent Invariants

### ⚠️ Critical Rules for AI Agents Operating on this Codebase:

1. **HTTP Header Formatting**:
   - Never inject spaces or illegal characters into HTTP headers.
   - Use `X-Ariston-Client` (NOT `X-Ariston Cafe-Client`).

2. **Database Field Continuity**:
   - Certain schema fields and storage keys carry historical prefixes for database backwards-compatibility.
   - **Do NOT rename**:
     - MongoDB field: `gstPaidByFoodie` (models and aggregation queries depend on this).
     - Storage keys: `foodie_business_settings`, `foodie_customization_settings`.
     - Internal bridges: `window.__foodieNativeApiErrorBridge`.
     - Service worker action types: `FOODIE_FCM_CONFIG`.

3. **Continuous Native Generation (Expo)**:
   - **Never manually edit** files inside `mobile-*/android/` or `mobile-*/ios/`. Any changes will be destroyed on the next `npx expo prebuild`.
   - Always modify `app.json` or author an Expo Config Plugin in `plugins/`.

4. **Branding & Visual Consistency**:
   - Customer App: **Ariston Cafe** (Red gradient `#E8294A` → `#B80B3D`, bowl icon, green leaf, smile curve).
   - Restaurant App: **Ariston Cafe Restaurant** (Red gradient `#E8294A` → `#B80B3D`, chef hat icon, RESTAURANT badge).
   - Delivery App: **Ariston Rider** (Blue gradient `#15498B` → `#0D2F5A`, scooter icon with motion streaks).
   - Browser Tab Favicon: Uses `/logo-icon.webp` (512x512/128x128 square mark).

5. **Local Validation Commands**:
   - Frontend validation: `cd Frontend && npm run build`
   - Backend health check: `cd Backend && node -e "import('./src/app.js')"`
   - Mobile config validation: `cd mobile-user && npx expo config --type public`
