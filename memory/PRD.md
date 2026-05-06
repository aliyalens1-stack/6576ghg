# Auto-Search Marketplace — PRD (Deployment from GitHub)

## Source
- Repository: https://github.com/aliyalens1-stack/we2342323
- Cloned & deployed: 2026-05-06

## Components Deployed

| Component | Tech | Path | URL |
|---|---|---|---|
| **Mobile (Expo)** | React Native + expo-router (SDK 54) | `/app/frontend` | `/` (preview port 3000) |
| **Web App (consumer)** | React + Vite + Tailwind (i18n, leaflet) | `/app/web-app` → built into `dist/` | `/api/web-app/` |
| **Admin Panel** | React + Vite + Radix UI + Tailwind | `/app/admin` → built into `dist/` | `/api/admin-panel/` |
| **Backend (API)** | FastAPI + Motor (MongoDB) + 9 background loops | `/app/backend` | `/api/*` (port 8001) |
| **MongoDB** | Local instance | — | `mongodb://localhost:27017` |

## Architecture
The Vite SPAs are **built once** (`yarn build` in `/app/admin` and `/app/web-app`)
and served as static files by FastAPI from `/api/admin-panel/` and `/api/web-app/`
(routes defined in `/app/backend/app/static/router.py`). This works seamlessly
inside the single-port Kubernetes preview where only `/` (Expo, port 3000)
and `/api/*` (FastAPI, port 8001) are routed externally.

## Backend Highlights (production-grade marketplace platform)
- 100+ FastAPI routers across modules: `auto_requests`, `marketplace`, `pricing`,
  `payments` (Stripe + PayPal), `chat`, `inspection`, `parsers` (mobile.de / autoscout24),
  `provider`, `customer`, `billing`, `revenue`, `referrals`, `growth`, etc.
- Background loops: orchestrator (10s), exposures expire/batching (60s), inspector stats
  (300s), Smart Nudge Engine (900s), auto-money worker (15s), autobid (15s),
  Strategy Optimizer (5min), feedback processor (15s).
- Redis is **optional** — when unavailable, server falls back to in-memory NO-OPs.

## Deployment Steps Performed
1. `git clone` from GitHub → `/tmp/repo`
2. Wiped existing `/app/{backend,frontend}` placeholders, kept `.git` / `.emergent`
3. Copied repo content into `/app` (admin, backend, frontend, web-app, memory, tests)
4. Restored protected `.env` files (`backend/.env`, `frontend/.env`)
5. Installed deps: `pip install -r requirements.txt`, `yarn install` (×3 frontends)
6. Installed missing transitive: `beautifulsoup4`, `lxml` (used by parsers, not in requirements)
7. Built Vite SPAs: `cd admin && yarn build`, `cd web-app && yarn build`
8. Started services via existing supervisor config (no edits to protected configs)

## Verified
- `GET /api/health` → `{"status":"ok","db":"connected"}`
- `GET /` → Expo mobile app renders ("A|SEARCH" Pre-purchase car inspection)
- `GET /api/admin-panel/` → Admin login page (Russian UI)
- `GET /api/web-app/` → Consumer web platform (Russian UI, mobile.de inspector flow)
- `GET /api/marketplace/providers`, `/api/marketplace/stats`, `/api/cities` → 200 OK

## Known Notes
- NestJS subprocess (`backend/src/`) is **not** running — Python FastAPI is the active backend.
  Endpoints that proxy to NestJS gracefully degrade (the `nestjs:"starting"` flag in `/api/health`).
- Redis-dependent state ops are NO-OPs (warning log). Not blocking any feature.
- `.env` files preserved from the platform — not copied from the repo.

## Test Credentials
See `/app/memory/test_credentials.md`
