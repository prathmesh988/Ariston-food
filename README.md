# Ariston Cafe & Delivery Ecosystem

Welcome to the **Ariston** Food Ordering, Kitchen Management & On-Demand Delivery platform.

For a comprehensive technical and business deep-dive designed for developers and AI agents, please refer to:
👉 **[PROJECT_AGENT_GUIDE.md](./PROJECT_AGENT_GUIDE.md)**

---

## Quick Navigation

| Component | Role | Tech Stack | Root Directory |
|---|---|---|---|
| **Backend** | REST API, WebSockets, BullMQ, Workers | Node.js, Express, MongoDB, Redis, Firebase Admin | [`./Backend`](./Backend) |
| **Frontend** | Customer Web, Admin Panel, Merchant Portal | React 18, Vite, Tailwind CSS, Redux Toolkit | [`./Frontend`](./Frontend) |
| **Ariston Cafe (User)** | Consumer Mobile App | React Native, Expo SDK 52, Expo Router v4 | [`./mobile-user`](./mobile-user) |
| **Ariston Rider** | Delivery Fleet Mobile App | React Native, Background GPS, TaskManager | [`./mobile-delivery`](./mobile-delivery) |
| **Ariston Cafe Restaurant** | Merchant Partner Mobile App | React Native, Sound Alarms, KDS Order Queue | [`./mobile-restaurant`](./mobile-restaurant) |

---

## Core Brand Identities

- **Customer App**: `Ariston Cafe` (Red gradient, food bowl & leaf motif)
- **Delivery App**: `Ariston Rider` (Blue gradient, scooter speed motif)
- **Restaurant App**: `Ariston Cafe Restaurant` (Red gradient, chef hat motif)

For complete architectural diagrams, state machines, environment setups, and invariant rules, see **[PROJECT_AGENT_GUIDE.md](./PROJECT_AGENT_GUIDE.md)**.
