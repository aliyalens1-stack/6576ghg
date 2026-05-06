"""app.system.compat — compatibility shim для mobile/web-app ↔ NestJS.

Sprint 21 C8: 6 simple-proxy compat endpoints вынесены 1-в-1 из server.py.

Почему они нужны: клиенты (Expo mobile + Vite web-app) исторически ходят в
/my-варианты и non-existing aliases, а NestJS контракт другой. Compat
маппит один на другой без бизнес-логики — чистый shim.

Endpoints (все GET, без auth — проксирование доверяет NestJS):
    1. /api/disputes                → /disputes/my     (Sprint 14 G-1)
    2. /api/notifications/my        → /notifications
    3. /api/favorites/my            → /favorites
    4. /api/organizations/search    → /organizations  (rewrite: q → search)
    5. /api/garage/{vehicle_id}     → /vehicles/{id}
    6. /api/payments/list           → /payments/my

Admin-compat (/api/admin/live-feed, /alerts, /automation/replay,
/config/features, /config/commission-tiers) в ЭТОТ модуль НЕ входят —
у них mixed native+proxy логика и admin-guard, их разрез пойдёт в
отдельный app/admin/* модуль на более поздних шагах Sprint 21.

КРИТИЧНО: router регистрируется в server.py ДО catch-all NestJS-proxy,
иначе FastAPI first-match отправит запросы в общий proxy и compat
никогда не сработает.
"""
from __future__ import annotations
from fastapi import APIRouter, Request, Response

from app.core.proxy import proxy_to_nest

router = APIRouter()


# --- Disputes list compat: /api/disputes → NestJS /disputes/my ---
# Sprint 14 G-1: mobile/web-app contract uses /disputes; NestJS exposes /disputes/my only.
@router.get("/api/disputes")
async def compat_disputes_list(request: Request) -> Response:
    return await proxy_to_nest(request, "disputes/my")


# --- Notifications alias (/my → /) ---
@router.get("/api/notifications/my")
async def compat_notifications_my(request: Request) -> Response:
    return await proxy_to_nest(request, "notifications")


# --- Favorites alias (/my → /) ---
@router.get("/api/favorites/my")
async def compat_favorites_my(request: Request) -> Response:
    return await proxy_to_nest(request, "favorites")


# --- Organizations search: accept both q= and search= ---
@router.get("/api/organizations/search")
async def compat_orgs_search(request: Request) -> Response:
    qp = dict(request.query_params)
    if "q" in qp and "search" not in qp:
        qp["search"] = qp.pop("q")
    return await proxy_to_nest(request, "organizations", query_override=qp)


# --- Garage alias → /vehicles ---
@router.get("/api/garage/{vehicle_id}")
async def compat_garage_get(vehicle_id: str, request: Request) -> Response:
    return await proxy_to_nest(request, f"vehicles/{vehicle_id}")


# --- Payments list alias ---
@router.get("/api/payments/list")
async def compat_payments_list(request: Request) -> Response:
    return await proxy_to_nest(request, "payments/my")
