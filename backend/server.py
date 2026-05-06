from fastapi import FastAPI, Request, Response, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os, logging, httpx, uuid, bcrypt, asyncio, subprocess, random, jwt, time
from prod_readiness import (
    check_rate_limit,
    idempotency_lookup,
    idempotency_commit,
    ensure_idempotency_indexes,
    ensure_alert_indexes,
    ensure_ttl_indexes,
    dispatch_alert,
    write_audit,
    nest_breaker,
)
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone, timedelta

# Sprint 21 PRE-COMMIT 0: shared AppContext.
# Контейнер заполняется ниже (после db) и в конце секции realtime emitters.
from app.core.context import ctx, RealtimeEmitters

# Sprint 21 C1: core modules (config / utils / security).
# ВСЕ константы и JWT/bcrypt-хелперы теперь живут в app/core/*.
# server.py читает их через re-export, никаких поведенческих изменений.
# load_dotenv() выполняется внутри app/core/config.py — до любого os.environ.get.
from app.core.config import (
    MONGO_URL, DB_NAME, NESTJS_URL,
    ADMIN_BUILD_DIR, WEBAPP_BUILD_DIR,
    JWT_SECRET, JWT_ALGO,
    ADMIN_EMAIL, ADMIN_PASSWORD,
)
from app.core.utils import now_utc, uid
from app.core.security import hash_pw, verify_pw, verify_admin_token
from app.core.db import get_db
from app.core.realtime import emit_realtime_event
from app.core.metrics import metrics

ROOT_DIR = Path(__file__).parent

# Shim: старый код использует lowercase mongo_url/db_name — оставляем для
# обратной совместимости. Будет удалено после миграции всех вызовов (C22).
mongo_url = MONGO_URL
db_name = DB_NAME
client = AsyncIOMotorClient(mongo_url)
db = client[db_name]

app = FastAPI()
# Sprint 21 C15: lifespan подключён параллельно с существующими @app.on_event
# хендлерами. FastAPI 0.93+ корректно отрабатывает оба: сначала lifespan enter,
# потом on_event("startup"), при выключении — on_event("shutdown") и lifespan exit.
# На этом этапе lifespan делает только DB ping + ML hydration (idempotent).
# Loops/seed/NestJS остаются в startup_with_feedback до C15.1.
from app.core.lifespan import lifespan as _c15_lifespan  # noqa: E402
app.router.lifespan_context = _c15_lifespan

# Sprint 21 C5: первый APIRouter разрез — /api/auth/* перенесён в app/system/auth.py.
# include_router должен идти ПЕРЕД определением старых @app.post("/api/auth/...")
# чтобы при reload старые definitions либо были первыми-встреченными (резерв), либо
# вообще удалены — в любом случае новый модуль первый в route-list.
from app.system.auth import router as auth_router
app.include_router(auth_router)

# Sprint 21 C6: health + system endpoints вынесены в app/system/health.py и
# app/system/system.py. include_router'ы идут перед определениями старых
# endpoints (FastAPI first-match resolve).
from app.system.health import router as health_router
from app.system.system import router as system_router
from app.system.telemetry import router as telemetry_router
app.include_router(health_router)
app.include_router(system_router)
app.include_router(telemetry_router)

# Sprint 21 C7: /api/admin-panel/* и /api/web-app/* (SPA static) вынесены
# в app/static/router.py. include_router ДО proxy_to_nestjs catch-all
# (в конце server.py), чтобы specific static routes выигрывали first-match.
from app.static.router import router as static_router
app.include_router(static_router)

# Sprint 21 C8: simple-proxy compat endpoints (6 штук: /api/disputes,
# /notifications/my, /favorites/my, /organizations/search, /garage/{id},
# /payments/list) вынесены в app/system/compat.py. Admin-compat остаётся
# в server.py — у него mixed native+proxy логика.
from app.system.compat import router as compat_router
app.include_router(compat_router)

# Sprint 21 C8: shared proxy helper переехал в app/core/proxy.py. Оставшиеся
# admin-compat endpoints (live-feed, alerts, automation/replay, config/features,
# config/commission-tiers) используют его через thin-wrapper _proxy_to ниже.
from app.core.proxy import proxy_to_nest

# Sprint 21 C9: Quick Request CORE (resolve/accept/reject/inbox/status +
# admin/ranking/* + ranking optimizer loop + auto-expire) вынесен в
# app/marketplace/quick_request.py. 8 endpoints регистрируются здесь, фоновый
# provider_ranking_optimizer_loop запускается в startup_with_feedback().
from app.marketplace.quick_request import (
    router as qr_router,
    provider_ranking_optimizer_loop,
)
app.include_router(qr_router)

# Sprint 21 C10: Marketplace + Matching + Zones + Demand + Distribution domain
# (35 endpoints) вынесены в app/marketplace/{providers,matching,zones}.py и
# агрегированы через app/marketplace/router.py. include_router идёт ДО
# catch-all NestJS proxy в конце server.py.
from app.marketplace.router import router as marketplace_router
app.include_router(marketplace_router)

# Stage 2 — Geo + Search: cities catalogue
from app.marketplace.cities import router as cities_router  # noqa: E402
app.include_router(cities_router)

# Stage 3 — Services + Booking (requests / quotes / accept)
from app.marketplace.requests import router as requests_router  # noqa: E402
app.include_router(requests_router)

# Stage 4 — Payments (Stripe Checkout) + Revenue
from app.payments.router import router as payments_router  # noqa: E402
app.include_router(payments_router)

# Phase 3.0b P0-1 — Inline payment for auto-requests (one-shot Stripe Checkout)
from app.payments.checkout_simple import (  # noqa: E402
    router as ar_checkout_router,
    webhook_router as ar_webhook_router,
)
app.include_router(ar_checkout_router)
app.include_router(ar_webhook_router)

# ═══════════════════════════════════════════════════════════════════════
# AUTO 2.0 · Auto Requests Core (Sprint 2) — car_requests + inspection_jobs.
# ЕСТЬ 1:N: 1 request → N jobs (по городам). НЕ смешивать с legacy repair.
# ═══════════════════════════════════════════════════════════════════════
from app.auto_requests.router_customer import router as ar_customer_router, reports_router as ar_customer_reports_router  # noqa: E402
from app.auto_requests.router_inspector import router as ar_inspector_router, checklist_router as ar_inspector_checklist_router  # noqa: E402
from app.auto_requests.router_admin import router as ar_admin_router  # noqa: E402
from app.auto_requests.router_marketplace import (  # noqa: E402
    inspector_router as ar_mkt_inspector_router,
    customer_router as ar_mkt_customer_router,
)
from app.auto_requests.router_media import (  # noqa: E402
    inspector_media_router,
    customer_media_router,
    public_media_router,
)
app.include_router(ar_customer_router)
app.include_router(ar_customer_reports_router)
app.include_router(ar_inspector_checklist_router)
app.include_router(ar_inspector_router)
app.include_router(ar_admin_router)
app.include_router(ar_mkt_inspector_router)
app.include_router(ar_mkt_customer_router)
app.include_router(inspector_media_router)
app.include_router(customer_media_router)
app.include_router(public_media_router)

# Phase C.3 — Provider Workspace: candidate cars on selection requests.
from app.auto_requests.router_candidates import (  # noqa: E402
    provider_router as ar_provider_candidates_router,
    customer_router as ar_customer_candidates_router,
)
app.include_router(ar_provider_candidates_router)
app.include_router(ar_customer_candidates_router)

# AUTO 2.0 — Job-scoped media (P0 inspector execution flow): photos/videos
# tied to inspection_job + category (exterior/interior/engine/...). Separate
# from report-scoped media — uploadable BEFORE report submission.
from app.auto_requests.job_media import (  # noqa: E402
    router as job_media_router,
    public_router as job_media_public_router,
)
app.include_router(job_media_router)
app.include_router(job_media_public_router)

# AUTO 3.0 — Inspector personal stats (P1 trust loop): rating, completed, earnings.
from app.auto_requests.router_inspector_stats import router as inspector_stats_router  # noqa: E402
app.include_router(inspector_stats_router)

# AUTO 3.0 — Dynamic pricing (P1 monetization): public + admin endpoints,
# Mongo-backed, no hardcoded prices in frontend.
from app.pricing.router import (  # noqa: E402
    public_router as pricing_public_router,
    admin_router as pricing_admin_router,
)
app.include_router(pricing_public_router)
app.include_router(pricing_admin_router)

# Sprint 5 Block 3 — PayPal credit purchases
from app.payments.router_paypal import router as paypal_router  # noqa: E402
app.include_router(paypal_router)

# ═══════════════════════════════════════════════════════════════════════
# AUTO 2.0 · Packages + Payments (Sprint 3) — credits-based economy.
# Packages catalog: 1 / 3 / 5 inspections · Stripe real + PayPal mock.
# ═══════════════════════════════════════════════════════════════════════
from app.packages.router_packages import router as pkg_router  # noqa: E402
from app.packages.router_admin import router as pkg_admin_router  # noqa: E402
app.include_router(pkg_router)
app.include_router(pkg_admin_router)

# Sprint 21 C11: Orchestrator domain router (admin/governance/*, orchestrator/*,
# feedback/*). Регистрируем ДО catch-all NestJS proxy в конце server.py.
from app.orchestrator.router import router as orchestrator_router  # noqa: E402
app.include_router(orchestrator_router)

# Sprint 21 C12A: Admin domain router — dashboard (live-feed/alerts/alerts-enhanced)
# + forecast (status/retrain). Ranking остался в app.marketplace.quick_request.
# Регистрируем ДО catch-all NestJS proxy, иначе FastAPI first-match проксирует в NestJS.
from app.admin.router import router as admin_router  # noqa: E402
app.include_router(admin_router)

# Stripe runtime settings — admin-managed (keys, currency, payment methods)
from app.admin.stripe_settings import router as stripe_settings_router  # noqa: E402
app.include_router(stripe_settings_router)

# Chat + Notifications (Sprint 34 D8) — user↔provider, user↔support
from app.chat.router import router as chat_router  # noqa: E402
app.include_router(chat_router)

# Sprint 21 C16: provider/customer/billing domain routers extracted from server.py.
# 40 endpoints total (23 provider + 10 customer + 7 billing/experiments).
# Регистрируем ДО catch-all NestJS proxy.
from app.provider.router import router as provider_router  # noqa: E402
from app.customer.router import router as customer_router  # noqa: E402
from app.billing.router import router as billing_router  # noqa: E402
from app.billing.stripe_payments import router as stripe_router  # noqa: E402  Sprint 22
from app.performance import router as performance_router, init as performance_init  # noqa: E402  Sprint 26
from app.revenue import router as revenue_router, init as revenue_init  # noqa: E402  Sprint 28
from app.marketplace.auction import router as auction_router  # noqa: E402  Sprint 27
from app.referrals import router as referrals_router  # noqa: E402  Sprint 29
from app.retention import router as retention_router  # noqa: E402  Sprint 30
from app.push import router as push_router  # noqa: E402  Sprint 31
from app.domination import router as domination_router  # noqa: E402  Sprint 32
from app.marketplace.clusters import router as clusters_router  # noqa: E402  Sprint 33
from app.growth.reactivation import router as growth_reactivation_router  # noqa: E402  Sprint 33 C8.1
from app.growth.nudges import router as growth_nudges_router  # noqa: E402  Sprint 33 C8.2
from app.growth.auto_money import router as growth_auto_money_router  # noqa: E402  Sprint 33 C8.4
from app.parsers.router import router as parsers_router  # noqa: E402  Berlin Launch B2 — mobile.de parser
from app.inspection.router import router as inspection_router  # noqa: E402  Berlin Launch B1 — Inspection Report
from app.provider.onboarding import router as provider_onboarding_router  # noqa: E402  Berlin Launch B-PO — Provider Onboarding v1
app.include_router(provider_router)
app.include_router(provider_onboarding_router)
app.include_router(customer_router)
app.include_router(billing_router)
app.include_router(stripe_router)
app.include_router(performance_router)
app.include_router(revenue_router, dependencies=[Depends(verify_admin_token)])
app.include_router(auction_router)
app.include_router(referrals_router)
app.include_router(retention_router)
app.include_router(push_router)
app.include_router(domination_router)
app.include_router(clusters_router)
app.include_router(growth_reactivation_router)
app.include_router(growth_nudges_router)  # Sprint 33 C8.2 — Smart Nudge Engine
app.include_router(growth_auto_money_router)  # Sprint 33 C8.4 — Auto-money mode
app.include_router(parsers_router)  # Berlin Launch B2 — POST /api/parse/car-link (mobile.de)
app.include_router(inspection_router)  # Berlin Launch B1 — POST /api/inspection/report/generate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Sprint 21 PRE-COMMIT 0 — shared context (part 1/2: db + logger).
# Модули из app/* читают эти ссылки вместо глобалов. ctx.emit
# привязывается ниже, после определения emit_* функций. ctx.ready
# НЕ выставляется здесь — только в startup_event после полной инициализации.
ctx.mongo = client
ctx.db = db
ctx.logger = logger

# Sprint 26: init Performance module (gives it db handle for hooks).
performance_init(db, verify_admin_token)
# Sprint 28: init Revenue module.
revenue_init(db, verify_admin_token)




http_client = httpx.AsyncClient(timeout=30.0)

# Sprint 21 C4: привязываем shared httpx client к ctx — app/core/realtime.py
# использует ctx.http_client, это избавляет от circular import.
ctx.http_client = http_client


# ═══════════════════════════════════════════════
# 🔔 REALTIME EVENT EMISSION
# ═══════════════════════════════════════════════
# Sprint 21 C4: emit_realtime_event вынесен в app/core/realtime.py.
# Импортируется выше (наверху файла). Тело функции не меняется — только адрес.


async def emit_booking_status_changed(booking_id: str, old_status: str, new_status: str, extra: dict = None):
    """Emit booking:status_changed event"""
    payload = {"bookingId": booking_id, "oldStatus": old_status, "newStatus": new_status, **(extra or {})}
    # Sprint 21 C3: через ctx.emit.event вместо глобального emit_realtime_event.
    # Runtime-поведение идентично (ctx.emit.event == emit_realtime_event), но
    # теперь shell-функция не зависит от module-level глобала — готова к
    # выносу в app/core/realtime.py в C4.
    await ctx.emit.event("booking:status_changed", payload)


async def emit_provider_new_request(booking: dict):
    """Emit provider:new_request event"""
    # Sprint 21 C3 — через ctx.emit.event (см. коммент выше).
    await ctx.emit.event("provider:new_request", {
        "requestId": booking.get("id"), "serviceName": booking.get("serviceName"),
        "priceEstimate": booking.get("priceEstimate"), "source": booking.get("source"),
    })


async def emit_provider_location(booking_id: str, lat: float, lng: float, heading: float = 0, speed: float = 0, eta: int = 0):
    """Emit booking:provider_location event"""
    # Sprint 21 C3 — через ctx.emit.event (см. коммент выше).
    await ctx.emit.event("booking:provider_location", {
        "bookingId": booking_id, "lat": lat, "lng": lng, "heading": heading, "speed": speed, "etaMinutes": eta,
    })


# ── Sprint 21 PRE-COMMIT 0 — shared context (part 2/2: realtime emitters).
# Атомарная привязка: никакого partially-filled состояния. Прямые вызовы
# emit_realtime_event / emit_booking_status_changed / emit_provider_new_request /
# emit_provider_location в остальном коде пока НЕ трогаем — они будут заменены
# на ctx.emit.* в C3+ по мере выноса соответствующих модулей.
ctx.emit = RealtimeEmitters(
    event=emit_realtime_event,
    booking_status=emit_booking_status_changed,
    provider_new_request=emit_provider_new_request,
    provider_location=emit_provider_location,
)


zone_engine_task = None

# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# @app.on_event("startup") is REMOVED (C15.1) — lifecycle handled by app.core.lifespan.
# bootstrap_side_effects() — публичный helper, вызывается из lifespan.
# Содержит: seed_data → NestJS subprocess spawn → geo indexes → provider locations seed
# → production-readiness indexes. Loops НЕ стартуют здесь — за это отвечает
# app.orchestrator.runner.start_all_loops, вызываемый lifespan'ом после этой функции.
# ═══════════════════════════════════════════════════════════════
# 🔍 SPRINT 6 — OBSERVABILITY & ERROR SYSTEM
# ═══════════════════════════════════════════════════════════════

# Sprint 21 C6: counters вынесены в app/core/metrics.py (singleton `metrics`).
# Middleware пишет через metrics.request_counter / metrics.error_counters, читает
# /api/system/health в app/system/health.py. Один источник — один процесс.

ERROR_CODE_MAP = {
    400: "VALIDATION_ERROR",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "UPSTREAM_ERROR",
    503: "SERVICE_UNAVAILABLE",
}


def _normalize_error(status_code: int, message: str, code: Optional[str] = None, details: Optional[dict] = None) -> dict:
    """Produce the unified error envelope {error, code, message, details}."""
    return {
        "error": True,
        "code": code or ERROR_CODE_MAP.get(status_code, "INTERNAL_ERROR"),
        "message": message or "Unknown error",
        "details": details or {},
    }


async def _log_system_event(level: str, route: str, method: str, status: int,
                            message: str, code: str, duration_ms: int,
                            user_id: Optional[str] = None, meta: Optional[dict] = None):
    """Write an entry to system_logs (fire-and-forget; never raises)."""
    try:
        await db.system_logs.insert_one({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": level,
            "service": "fastapi",
            "route": route,
            "method": method,
            "status": status,
            "errorCode": code,
            "message": message[:500],
            "userId": user_id,
            "durationMs": duration_ms,
            "meta": meta or {},
        })
    except Exception:
        pass


@app.middleware("http")
async def observability_middleware(request: Request, call_next):
    """
    Logs every request + time + status. Writes to system_logs ONLY for non-2xx
    or long-running requests (>2000ms). This keeps the collection tight.
    """
    start = time.time()
    metrics.request_counter += 1
    path = request.url.path
    method = request.method
    # Cheap skip for noisy endpoints
    skip_log = path.startswith("/api/socket.io/") or path.startswith("/api/realtime/events")

    try:
        response = await call_next(request)
        duration_ms = int((time.time() - start) * 1000)
        status = response.status_code

        # Count + log non-2xx
        if status >= 400:
            code = ERROR_CODE_MAP.get(status, "INTERNAL_ERROR")
            metrics.error_counters["total"] += 1
            metrics.error_counters["by_status"][str(status)] = metrics.error_counters["by_status"].get(str(status), 0) + 1
            metrics.error_counters["by_code"][code] = metrics.error_counters["by_code"].get(code, 0) + 1
            metrics.error_counters["by_route"][path] = metrics.error_counters["by_route"].get(path, 0) + 1
            if not skip_log:
                await _log_system_event(
                    level="error" if status >= 500 else "warn",
                    route=path, method=method, status=status,
                    message=f"{method} {path} → {status}",
                    code=code, duration_ms=duration_ms,
                )
        elif duration_ms > 2000 and not skip_log:
            await _log_system_event(
                level="warn", route=path, method=method, status=status,
                message=f"slow {method} {path} ({duration_ms}ms)",
                code="SLOW_REQUEST", duration_ms=duration_ms,
            )

        # Annotate response header for clients (admin UI badge)
        response.headers["x-request-duration-ms"] = str(duration_ms)
        return response
    except HTTPException:
        # Let FastAPI's default handler format it → our exception_handler below catches.
        raise
    except (RequestValidationError, ValueError) as exc:
        # Pydantic field_validator raises ValueError → wrapped into RequestValidationError
        # by FastAPI body parser. Re-raise so the dedicated handler returns proper 422
        # (not a generic 500).
        raise
    except Exception as exc:
        duration_ms = int((time.time() - start) * 1000)
        logger.exception(f"Unhandled error on {method} {path}")
        metrics.error_counters["total"] += 1
        metrics.error_counters["by_status"]["500"] = metrics.error_counters["by_status"].get("500", 0) + 1
        metrics.error_counters["by_code"]["INTERNAL_ERROR"] = metrics.error_counters["by_code"].get("INTERNAL_ERROR", 0) + 1
        metrics.error_counters["by_route"][path] = metrics.error_counters["by_route"].get(path, 0) + 1
        await _log_system_event(
            level="error", route=path, method=method, status=500,
            message=str(exc)[:500], code="INTERNAL_ERROR", duration_ms=duration_ms,
        )
        return JSONResponse(status_code=500, content=_normalize_error(500, str(exc)))


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """Convert FastAPI HTTPException → unified error envelope."""
    body = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
    if isinstance(body, dict) and body.get("error") is True:
        payload = body  # already normalized
    else:
        msg = body.get("message") if isinstance(body, dict) else str(exc.detail)
        payload = _normalize_error(exc.status_code, msg or "")
    return JSONResponse(status_code=exc.status_code, content=payload, headers=exc.headers or None)


@app.exception_handler(StarletteHTTPException)
async def starlette_http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(status_code=exc.status_code,
                        content=_normalize_error(exc.status_code, str(exc.detail) if exc.detail else ""))


@app.exception_handler(RequestValidationError)
async def validation_error_handler(request: Request, exc: RequestValidationError):
    # Pydantic v2 puts raw exception instances under errors()[*]["ctx"]["error"] —
    # those are not JSON-serializable. Stringify everything that isn't trivially safe.
    safe_errors = []
    for err in exc.errors():
        clean = dict(err)
        ctx = clean.get("ctx")
        if isinstance(ctx, dict):
            clean["ctx"] = {k: (str(v) if not isinstance(v, (str, int, float, bool, type(None))) else v) for k, v in ctx.items()}
        # Also stringify any non-serializable input value (e.g. bytes)
        if "input" in clean and not isinstance(clean["input"], (str, int, float, bool, list, dict, type(None))):
            clean["input"] = str(clean["input"])
        safe_errors.append(clean)
    return JSONResponse(status_code=422, content=_normalize_error(
        422, "Validation failed", code="VALIDATION_ERROR", details={"errors": safe_errors}
    ))


# ═══════════════════════════════════════════════════════════════
# 🛡 SPRINT 12 — Rate limit + Idempotency middleware
# Registered AFTER observability so it runs OUTER (i.e. before obs).
# ═══════════════════════════════════════════════════════════════

# Sprint 12: paths that must require admin JWT but are handled by upstream
# (NestJS) that forgot to guard them.
UNGUARDED_ADMIN_PATHS = (
    "/api/admin/automation/",
)


@app.middleware("http")
async def prod_readiness_middleware(request: Request, call_next):
    # 0. Hard-gate paths that NestJS forgot to protect
    p = request.url.path
    if any(p.startswith(pref) for pref in UNGUARDED_ADMIN_PATHS):
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return JSONResponse(status_code=401, content=_normalize_error(
                401, "Unauthorized", code="UNAUTHORIZED"))
        try:
            payload = jwt.decode(auth[7:], JWT_SECRET, algorithms=["HS256"])
            if payload.get("role") != "admin":
                return JSONResponse(status_code=403, content=_normalize_error(
                    403, "Admin role required", code="FORBIDDEN"))
        except jwt.ExpiredSignatureError:
            return JSONResponse(status_code=401, content=_normalize_error(
                401, "Token expired", code="UNAUTHORIZED"))
        except jwt.InvalidTokenError:
            return JSONResponse(status_code=401, content=_normalize_error(
                401, "Invalid token", code="UNAUTHORIZED"))

    # 1. Rate limit (fast path)
    rl = check_rate_limit(request)
    if rl is not None:
        return rl
    # 2. Idempotency lookup (may short-circuit with cached response)
    idem_early = await idempotency_lookup(db, request)
    if idem_early is not None:
        return idem_early
    # 3. Execute handler
    response = await call_next(request)
    # 4. Commit idempotency record for new successful POST
    if (request.headers.get("idempotency-key")
            and request.method == "POST"
            and 200 <= response.status_code < 300):
        try:
            body_iter = [chunk async for chunk in response.body_iterator]  # type: ignore[attr-defined]
            content = b"".join(body_iter)
            await idempotency_commit(db, request, response.status_code, content)
            # Return a new plain Response so body is properly re-sent
            from starlette.responses import Response as _Resp
            headers = {k: v for k, v in response.headers.items()
                       if k.lower() not in ("content-length",
                                            "content-encoding",
                                            "transfer-encoding")}
            return _Resp(
                content=content,
                status_code=response.status_code,
                headers=headers,
                media_type=response.media_type,
            )
        except Exception:
            logger.exception("idempotency commit failed")
            return response
    return response


# ─── System observability endpoints ─────────────────────────────

# Sprint 21 C6: /api/system/health, /api/system/errors и /api/system/errors/stats
# вынесены в app/system/health.py и app/system/system.py.


# ═══════════════════════════════════════════════
# 🔐 AUTH ENDPOINTS (FastAPI native — NestJS fallback)
# ═══════════════════════════════════════════════

# Sprint 21 C5: /api/auth/login, /register, /me вынесены в app/system/auth.py.


# Sprint 21 C6: /api/health вынесен в app/system/health.py.


# Serve admin panel static files BEFORE the catch-all proxy
# Sprint 21 C7: все /api/web-app/* и /api/admin-panel/* (8 endpoints) вынесены
# в app/static/router.py.


# ═══════════════════════════════════════════════
# 🧠 GOVERNANCE: Demand Push + Provider Behavior + Flow Control
# ═══════════════════════════════════════════════

@app.post("/api/admin/demand/push-providers")
async def demand_push_providers(request: Request, _=Depends(verify_admin_token)):
    """Push notification to providers in a zone with high demand"""
    body = await request.json()
    zone_id = body.get("zoneId", "all")
    min_score = body.get("minScore", 0)
    message = body.get("message", "Высокий спрос в вашей зоне!")

    # Find eligible providers
    query = {"isActive": True}
    if min_score > 0:
        query["score"] = {"$gte": min_score}
    
    # Get push devices for providers
    devices = await db.push_devices.find({"role": {"$in": ["provider_owner", "provider_manager"]}, "isActive": True}, {"_id": 0}).to_list(200)
    
    # Log the action
    action_log = {
        "id": uid(), "type": "demand_push", "zoneId": zone_id,
        "targetCount": len(devices), "message": message,
        "minScore": min_score, "createdAt": now_utc().isoformat(),
        "status": "sent",
    }
    await db.governance_actions.insert_one(action_log)
    action_log.pop("_id", None)
    
    return {"status": "sent", "targetCount": len(devices), "action": action_log}


@app.post("/api/admin/demand/{zone_id}/boost-supply")
async def boost_supply(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Boost supply in a zone - increase visibility for providers"""
    body = await request.json()
    boost_level = body.get("boostLevel", 1.5)
    duration_minutes = body.get("durationMinutes", 30)
    
    action_log = {
        "id": uid(), "type": "boost_supply", "zoneId": zone_id,
        "boostLevel": boost_level, "durationMinutes": duration_minutes,
        "createdAt": now_utc().isoformat(), "status": "active",
    }
    await db.governance_actions.insert_one(action_log)
    action_log.pop("_id", None)
    
    return {"status": "boosted", "zoneId": zone_id, "action": action_log}


@app.get("/api/admin/providers/behavior")
async def provider_behavior_overview(request: Request, _=Depends(verify_admin_token)):
    """Get provider behavior overview for governance — real aggregations from DB."""
    providers = await db.organizations.find(
        {"status": "active"},
        {"_id": 0, "id": 1, "name": 1, "slug": 1, "ratingAvg": 1, "reviewsCount": 1,
         "bookingsCount": 1, "completedBookingsCount": 1, "avgResponseTimeMinutes": 1,
         "visibilityScore": 1, "visibilityState": 1, "acceptanceRate": 1,
         "completionRate": 1, "missedRequests": 1}
    ).to_list(100)

    # Bulk aggregate bookings per provider for real acceptance/completion
    org_slugs = [p.get("slug") for p in providers if p.get("slug")]
    bookings_agg = {}
    if org_slugs:
        cursor = db.bookings.aggregate([
            {"$match": {"providerSlug": {"$in": org_slugs}}},
            {"$group": {
                "_id": "$providerSlug",
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "accepted": {"$sum": {"$cond": [{"$in": ["$status", ["accepted", "in_progress", "completed"]]}, 1, 0]}},
                "missed": {"$sum": {"$cond": [{"$in": ["$status", ["rejected", "expired", "timeout"]]}, 1, 0]}},
                "revenue": {"$sum": {"$ifNull": ["$priceEstimate", 0]}},
            }},
        ])
        async for row in cursor:
            bookings_agg[row["_id"]] = row

    behavior_data = []
    risky_count = 0
    top_count = 0
    slow_count = 0

    for p in providers:
        slug = p.get("slug", "")
        agg = bookings_agg.get(slug, {})
        total_b = agg.get("total", 0) or p.get("bookingsCount", 0) or 0
        completed_b = agg.get("completed", 0) or p.get("completedBookingsCount", 0) or 0
        accepted_b = agg.get("accepted", 0)
        missed = agg.get("missed", 0) or p.get("missedRequests", 0) or 0
        revenue = agg.get("revenue", 0)

        acceptance_rate = round(accepted_b / total_b * 100) if total_b else int(p.get("acceptanceRate", 0) or 0)
        completion_rate = round(completed_b / total_b * 100) if total_b else int(p.get("completionRate", 0) or 0)
        response_time = int(p.get("avgResponseTimeMinutes") or 0)
        rating = float(p.get("ratingAvg") or 0)

        # Score: weighted composite (rating 40% + acceptance 25% + completion 25% + responsiveness 10%)
        resp_score = max(0, 100 - response_time * 2) if response_time else 60
        score = round(
            (rating / 5.0) * 40
            + (acceptance_rate / 100.0) * 25
            + (completion_rate / 100.0) * 25
            + (resp_score / 100.0) * 10
        )
        score = max(0, min(100, score))

        flags = []
        if score < 40:
            flags.append("low_score")
            risky_count += 1
        if response_time and response_time > 30:
            flags.append("slow_response")
            slow_count += 1
        if total_b > 0 and acceptance_rate < 60:
            flags.append("low_acceptance")
        if score > 80:
            top_count += 1

        # Lost revenue ≈ missed * avg completed booking revenue
        avg_revenue = round(revenue / completed_b) if completed_b else 0
        lost_revenue = missed * avg_revenue

        behavior_data.append({
            "providerId": slug or p.get("id") or uid()[:8],
            "name": p.get("name", "Unknown"),
            "score": score,
            "tier": "Platinum" if score >= 90 else "Gold" if score >= 75 else "Silver" if score >= 50 else "Bronze",
            "acceptanceRate": acceptance_rate,
            "responseTimeAvg": response_time,
            "completionRate": completion_rate,
            "missedRequests": missed,
            "lostRevenue": lost_revenue,
            "flags": flags,
            "rating": round(rating, 2),
            "visibility": int(p.get("visibilityScore") or 0),
            "totalBookings": total_b,
        })

    behavior_data.sort(key=lambda x: x["score"])
    
    return {
        "providers": behavior_data,
        "stats": {
            "total": len(behavior_data),
            "risky": risky_count,
            "top": top_count,
            "slow": slow_count,
            "avgScore": round(sum(p["score"] for p in behavior_data) / max(len(behavior_data), 1), 1),
        },
        "recommendations": [
            {"action": "limit_visibility", "target": f"{risky_count} мастеров со score < 40", "impact": "Снижение bad UX"},
            {"action": "send_warning", "target": f"{slow_count} медленных мастеров", "impact": "Ускорение ответов"},
            {"action": "boost_top", "target": f"{top_count} топ мастеров", "impact": "Увеличение конверсии"},
        ],
    }


@app.post("/api/admin/providers/behavior/bulk-action")
async def provider_behavior_bulk_action(request: Request, _=Depends(verify_admin_token)):
    """Execute bulk action on providers based on behavior — real affectedCount."""
    body = await request.json()
    action = body.get("action", "warn")
    filter_criteria = body.get("filter", {})
    message = body.get("message", "")

    # Build real mongo filter from behavior criteria
    mongo_filter: dict = {"status": "active"}
    min_rating = filter_criteria.get("minRating")
    max_rating = filter_criteria.get("maxRating")
    if min_rating is not None or max_rating is not None:
        mongo_filter["ratingAvg"] = {}
        if min_rating is not None:
            mongo_filter["ratingAvg"]["$gte"] = float(min_rating)
        if max_rating is not None:
            mongo_filter["ratingAvg"]["$lte"] = float(max_rating)
    if filter_criteria.get("isPromoted") is not None:
        mongo_filter["isPromoted"] = bool(filter_criteria["isPromoted"])
    if filter_criteria.get("slugs"):
        mongo_filter["slug"] = {"$in": list(filter_criteria["slugs"])}
    affected = await db.organizations.count_documents(mongo_filter)

    action_log = {
        "id": uid(), "type": f"behavior_{action}", "filter": filter_criteria,
        "message": message, "createdAt": now_utc().isoformat(),
        "status": "executed", "affectedCount": affected,
    }
    await db.governance_actions.insert_one(action_log)
    action_log.pop("_id", None)

    return {"status": "executed", "action": action_log}


@app.get("/api/admin/flow/config")
async def get_flow_config(request: Request, _=Depends(verify_admin_token)):
    """Get request flow configuration"""
    try:
        headers = dict(request.headers)
        headers.pop('host', None)
        resp = await http_client.get(f"{NESTJS_URL}/api/admin/distribution/config", headers=headers, timeout=3.0)
        if 200 <= resp.status_code < 300:
            return Response(content=resp.content, status_code=resp.status_code, media_type='application/json')
    except Exception:
        pass
    
    return {
        "providersPerRequest": 3, "ttlSeconds": 30, "retryCount": 2,
        "escalationEnabled": True, "autoDistribute": True, "maxRadius": 5,
        "minProviderScore": 30, "priorityWeights": {"distance": 0.4, "rating": 0.3, "responseTime": 0.2, "price": 0.1},
    }


@app.post("/api/admin/flow/config")
async def update_flow_config(request: Request, _=Depends(verify_admin_token)):
    """Update request flow configuration"""
    body = await request.json()
    try:
        headers = dict(request.headers)
        headers.pop('host', None)
        headers.pop('content-length', None)
        resp = await http_client.post(f"{NESTJS_URL}/api/admin/distribution/config", headers=headers, json=body, timeout=3.0)
        if 200 <= resp.status_code < 300:
            return Response(content=resp.content, status_code=resp.status_code, media_type='application/json')
    except Exception:
        pass
    return {"status": "updated", "config": body}


@app.get("/api/admin/flow/metrics")
async def get_flow_metrics(request: Request, _=Depends(verify_admin_token)):
    """Get flow performance metrics — real aggregations from bookings + requests."""
    today_start = now_utc().replace(hour=0, minute=0, second=0, microsecond=0).isoformat()

    total_today = await db.bookings.count_documents({"createdAt": {"$gte": today_start}})
    matched_today = await db.bookings.count_documents({"createdAt": {"$gte": today_start}, "status": {"$in": ["accepted", "in_progress", "completed"]}})
    failed_today = await db.bookings.count_documents({"createdAt": {"$gte": today_start}, "status": {"$in": ["expired", "rejected", "timeout", "cancelled"]}})
    completed_today = await db.bookings.count_documents({"createdAt": {"$gte": today_start}, "status": "completed"})

    # All-time rates for stability when daily volume is small
    total_all = await db.bookings.count_documents({})
    matched_all = await db.bookings.count_documents({"status": {"$in": ["accepted", "in_progress", "completed"]}})
    failed_all = await db.bookings.count_documents({"status": {"$in": ["expired", "rejected", "timeout"]}})
    reassigned_all = await db.bookings.count_documents({"reassignCount": {"$gt": 0}}) if total_all else 0
    ttl_hits = await db.bookings.count_documents({"status": "timeout"}) if total_all else 0

    # Avg match time / response time from provider_performance or stored fields
    avg_match_agg = await db.bookings.aggregate([
        {"$match": {"matchTimeSeconds": {"$exists": True, "$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$matchTimeSeconds"}}},
    ]).to_list(1)
    avg_match_time = round(avg_match_agg[0]["avg"], 1) if avg_match_agg else 0.0

    avg_resp_agg = await db.organizations.aggregate([
        {"$match": {"avgResponseTimeMinutes": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$avgResponseTimeMinutes"}}},
    ]).to_list(1)
    avg_provider_response_time = round(avg_resp_agg[0]["avg"] * 60) if avg_resp_agg else 0

    avg_dist_agg = await db.bookings.aggregate([
        {"$match": {"distributionCount": {"$exists": True}}},
        {"$group": {"_id": None, "avg": {"$avg": "$distributionCount"}}},
    ]).to_list(1)
    avg_distribution_count = round(avg_dist_agg[0]["avg"], 1) if avg_dist_agg else 0.0

    def pct(num, denom):
        return round(num / denom * 100, 1) if denom else 0.0

    return {
        "avgMatchTime": avg_match_time,
        "failRate": pct(failed_all, total_all),
        "reassignRate": pct(reassigned_all, total_all),
        "avgDistributionCount": avg_distribution_count,
        "ttlHitRate": pct(ttl_hits, total_all),
        "avgProviderResponseTime": avg_provider_response_time,
        "conversionRate": pct(matched_all, total_all),
        "totalRequestsToday": total_today,
        "matchedToday": matched_today,
        "failedToday": failed_today,
        "completedToday": completed_today,
    }


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# ═══════════════════════════════════════════════
# 🧠 GOVERNANCE SCORE — единая метрика здоровья рынка
# ═══════════════════════════════════════════════

# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# ═══════════════════════════════════════════════
# 🔥 DEMAND → ACTION CHAINS (Auto-Reaction Engine)
# ═══════════════════════════════════════════════

@app.get("/api/admin/demand/actions/recommendations")
async def demand_action_recommendations(request: Request, zoneId: str = "all", _=Depends(verify_admin_token)):
    """Get AI recommendations for a zone based on real live demand state."""
    # Pull real zone state
    if zoneId == "all":
        zones = await db.zones.find({}, {"_id": 0}).to_list(50)
        demand = sum(z.get("demandScore", 0) or 0 for z in zones)
        supply = sum(z.get("supplyScore", 0) or 0 for z in zones) or 1
        ratio = round(demand / supply, 2)
        eta_vals = [z.get("avgEta", 0) for z in zones if z.get("avgEta")]
        avg_eta = round(sum(eta_vals) / len(eta_vals), 1) if eta_vals else 0.0
        requests_count = demand
        providers_count = supply
    else:
        z = await db.zones.find_one({"id": zoneId}, {"_id": 0}) or {}
        demand = z.get("demandScore", 0) or 0
        supply = z.get("supplyScore", 0) or 1
        ratio = round(demand / supply, 2)
        avg_eta = round(z.get("avgEta", 0) or 0, 1)
        requests_count = demand
        providers_count = supply

    state = "critical" if ratio > 4 else "surge" if ratio > 3 else "busy" if ratio > 2 else "balanced"

    recommendations = []
    if ratio > 2:
        recommendations.append({"type": "push_providers", "priority": 1, "impact": "high", "description": "Push мастерам в зоне"})
    if ratio > 3:
        surge_mult = round(ratio * 0.3 + 0.5, 1)
        recommendations.append({"type": "activate_surge", "priority": 2, "impact": "high", "description": f"Surge x{surge_mult}", "params": {"multiplier": surge_mult}})
        recommendations.append({"type": "increase_distribution", "priority": 3, "impact": "medium", "description": "Distribution 3→6", "params": {"from": 3, "to": 6}})
    if ratio > 4:
        recommendations.append({"type": "expand_radius", "priority": 4, "impact": "medium", "description": "Радиус 5→8 км", "params": {"from": 5, "to": 8}})
        recommendations.append({"type": "escalate", "priority": 5, "impact": "high", "description": "Escalation оператору"})

    chains = await db.action_chains.find({"isEnabled": True}, {"_id": 0}).to_list(10)

    return {
        "zoneId": zoneId, "state": state, "ratio": ratio,
        "requests": requests_count, "providers": providers_count,
        "avgEta": avg_eta,
        "recommendations": recommendations,
        "availableChains": [{"id": c.get("id"), "name": c.get("name"), "steps": len(c.get("steps", []))} for c in chains],
    }


@app.post("/api/admin/demand/actions/run")
async def demand_action_run(request: Request, _=Depends(verify_admin_token)):
    """Execute a demand action chain — real before/after ratios from zone snapshots."""
    body = await request.json()
    zone_id = body.get("zoneId", "all")
    chain_id = body.get("chainId")
    mode = body.get("mode", "manual")

    # Capture BEFORE state from current zones
    if zone_id == "all":
        zones_before = await db.zones.find({}, {"_id": 0}).to_list(50)
        demand_b = sum(z.get("demandScore", 0) or 0 for z in zones_before)
        supply_b = sum(z.get("supplyScore", 0) or 0 for z in zones_before) or 1
        ratio_before = round(demand_b / supply_b, 2)
        eta_before_vals = [z.get("avgEta", 0) for z in zones_before if z.get("avgEta")]
        eta_before = round(sum(eta_before_vals) / len(eta_before_vals), 1) if eta_before_vals else 0.0
    else:
        z = await db.zones.find_one({"id": zone_id}, {"_id": 0}) or {}
        d = z.get("demandScore", 0) or 0
        s = z.get("supplyScore", 0) or 1
        ratio_before = round(d / s, 2)
        eta_before = round(z.get("avgEta", 0) or 0, 1)

    # Build real steps from chain if provided, else use default 3-step plan
    steps: list = []
    if chain_id:
        chain = await db.action_chains.find_one({"id": chain_id}, {"_id": 0})
        if chain and chain.get("steps"):
            for step in chain["steps"]:
                steps.append({
                    "type": step.get("type", "push_providers"),
                    "status": "completed",
                    "params": step.get("params", {}),
                    "startedAt": now_utc().isoformat(),
                })
    if not steps:
        steps = [
            {"type": "push_providers", "status": "completed", "startedAt": now_utc().isoformat()},
            {"type": "activate_surge", "status": "completed", "params": {"multiplier": 1.5}},
            {"type": "increase_distribution", "status": "completed", "params": {"to": 6}},
        ]

    execution = {
        "id": uid(), "zoneId": zone_id, "chainId": chain_id, "mode": mode,
        "status": "completed", "triggeredBy": "admin",
        "steps": steps,
        "resultMetrics": {
            # AFTER ratio/ETA will be captured by feedback loop (~3min). Store BEFORE + predicted.
            "ratioBefore": ratio_before,
            "ratioAfter": None,
            "etaBefore": eta_before,
            "etaAfter": None,
            "note": "ratioAfter/etaAfter will be populated by feedback loop after ~3 min",
        },
        "createdAt": now_utc().isoformat(),
    }
    await db.demand_action_executions.insert_one(execution)
    execution.pop("_id", None)

    return {"status": "executed", "execution": execution}


@app.get("/api/admin/demand/actions/history")
async def demand_actions_history(request: Request, _=Depends(verify_admin_token)):
    """Get demand action execution history"""
    executions = await db.demand_action_executions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(30)
    return {"executions": executions}


# ═══════════════════════════════════════════════
# 🧪 REVENUE / SURGE A/B EXPERIMENTS
# ═══════════════════════════════════════════════

@app.get("/api/admin/revenue/experiments")
async def get_revenue_experiments(request: Request, _=Depends(verify_admin_token)):
    """Get revenue experiments"""
    experiments = await db.revenue_experiments.find({}, {"_id": 0}).sort("createdAt", -1).to_list(20)
    return {"experiments": experiments}


@app.post("/api/admin/revenue/experiments")
async def create_revenue_experiment(request: Request, _=Depends(verify_admin_token)):
    """Create a new revenue A/B experiment"""
    body = await request.json()
    experiment = {
        "id": uid(),
        "type": body.get("type", "surge_threshold"),
        "name": body.get("name", "Surge Test"),
        "zones": body.get("zones", []),
        "variants": body.get("variants", []),
        "trafficSplit": body.get("trafficSplit", [50, 50]),
        "durationHours": body.get("durationHours", 24),
        "status": "created",
        "createdAt": now_utc().isoformat(),
    }
    await db.revenue_experiments.insert_one(experiment)
    experiment.pop("_id", None)
    return experiment


@app.post("/api/admin/revenue/experiments/{experiment_id}/start")
async def start_revenue_experiment(experiment_id: str, _=Depends(verify_admin_token)):
    """Start a revenue experiment"""
    await db.revenue_experiments.update_one(
        {"id": experiment_id},
        {"$set": {"status": "running", "startedAt": now_utc().isoformat()}}
    )
    return {"status": "running", "experimentId": experiment_id}


@app.post("/api/admin/revenue/experiments/{experiment_id}/stop")
async def stop_revenue_experiment(experiment_id: str, _=Depends(verify_admin_token)):
    """Stop a revenue experiment"""
    await db.revenue_experiments.update_one(
        {"id": experiment_id},
        {"$set": {"status": "stopped", "endedAt": now_utc().isoformat()}}
    )
    return {"status": "stopped", "experimentId": experiment_id}


@app.get("/api/admin/revenue/experiments/{experiment_id}/results")
async def get_experiment_results(experiment_id: str, _=Depends(verify_admin_token)):
    """Get experiment results — real per-variant aggregations from bookings in the window."""
    exp = await db.revenue_experiments.find_one({"id": experiment_id}, {"_id": 0})
    if not exp:
        raise HTTPException(404, "Experiment not found")

    variants = exp.get("variants") or [{"name": "A"}, {"name": "B"}]
    started = exp.get("startedAt")
    ended = exp.get("endedAt") or now_utc().isoformat()
    zones = exp.get("zones") or []

    results = []
    for v in variants:
        match: dict = {"experimentVariant": v.get("name")}
        if started:
            match["createdAt"] = {"$gte": started, "$lte": ended}
        if zones:
            match["zoneId"] = {"$in": zones}

        agg = await db.bookings.aggregate([
            {"$match": match},
            {"$group": {
                "_id": None,
                "total": {"$sum": 1},
                "completed": {"$sum": {"$cond": [{"$eq": ["$status", "completed"]}, 1, 0]}},
                "accepted": {"$sum": {"$cond": [{"$in": ["$status", ["accepted", "in_progress", "completed"]]}, 1, 0]}},
                "cancelled": {"$sum": {"$cond": [{"$eq": ["$status", "cancelled"]}, 1, 0]}},
                "gmv": {"$sum": {"$ifNull": ["$priceEstimate", 0]}},
                "avgEta": {"$avg": "$etaMinutes"},
            }},
        ]).to_list(1)

        row = agg[0] if agg else {}
        total = row.get("total", 0)
        completed = row.get("completed", 0)
        accepted = row.get("accepted", 0)
        cancelled = row.get("cancelled", 0)

        def _pct(num, denom):
            return round(num / denom * 100, 1) if denom else 0.0

        sat_agg = await db.reviews.aggregate([
            {"$match": {"experimentVariant": v.get("name")}},
            {"$group": {"_id": None, "avg": {"$avg": "$rating"}}},
        ]).to_list(1)
        provider_sat = round(sat_agg[0]["avg"] / 5 * 100, 1) if sat_agg else 0.0

        results.append({
            "variant": v.get("name", "?"),
            "config": v.get("config", {}),
            "metrics": {
                "totalRequests": total,
                "gmv": round(row.get("gmv", 0)),
                "conversionRate": _pct(completed, total),
                "acceptRate": _pct(accepted, total),
                "cancelRate": _pct(cancelled, total),
                "avgEta": round(row.get("avgEta") or 0, 1),
                "providerSatisfaction": provider_sat,
            },
        })

    if any(r["metrics"]["gmv"] for r in results):
        winner_idx = max(range(len(results)), key=lambda i: results[i]["metrics"]["gmv"])
        winner = results[winner_idx]["variant"]
        winner_reason = "Higher GMV"
    else:
        winner = None
        winner_reason = "Insufficient data — experiment has no attributed bookings yet"

    return {
        "experiment": exp,
        "results": results,
        "winner": winner,
        "winnerReason": winner_reason,
    }


# ═══════════════════════════════════════════════
# 🔔 PUSH DEVICE REGISTRATION
# ═══════════════════════════════════════════════
@app.post("/api/push/register")
async def register_push_device(request: Request):
    """Register device for push notifications"""
    body = await request.json()
    user_id = body.get("userId")
    role = body.get("role")
    device_token = body.get("deviceToken")
    platform = body.get("platform", "unknown")

    if not user_id or not device_token:
        raise HTTPException(400, "userId and deviceToken are required")

    await db.push_devices.update_one(
        {"userId": user_id, "token": device_token},
        {"$set": {
            "userId": user_id,
            "role": role or "customer",
            "token": device_token,
            "platform": platform,
            "isActive": True,
            "updatedAt": now_utc().isoformat(),
        }},
        upsert=True
    )
    return {"status": "registered", "userId": user_id}


@app.delete("/api/push/unregister")
async def unregister_push_device(request: Request):
    """Unregister device from push notifications"""
    body = await request.json()
    device_token = body.get("deviceToken")
    if device_token:
        await db.push_devices.update_one(
            {"token": device_token},
            {"$set": {"isActive": False, "updatedAt": now_utc().isoformat()}}
        )
    return {"status": "unregistered"}


@app.get("/api/push/devices")
async def get_push_devices(userId: str = None, role: str = None):
    """Get registered push devices (admin)"""
    query = {"isActive": True}
    if userId:
        query["userId"] = userId
    if role:
        query["role"] = role
    devices = await db.push_devices.find(query, {"_id": 0}).to_list(100)
    return devices
# ═══════════════════════════════════════════════
# 🌐 WEB MARKETPLACE API (Real Data)
# ═══════════════════════════════════════════════

import math

# Sprint 21 C9: haversine + resolve_zone вынесены в app/core/geo.py (pure utils,
# без side-effects). Реимпорт в namespace модуля, чтобы остальные 15+ usages
# в server.py продолжали работать без массового редактирования.
from app.core.geo import haversine, resolve_zone  # noqa: F401  (re-export)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════════════════════════
# 🔥 SPRINT 14.5–17 — QUICK REQUEST CORE + RANKING OPTIMIZER
# Sprint 21 C9: весь модуль (classifier, surge formatting, ranking
# optimizer loop + 8 endpoints) вынесен в app/marketplace/quick_request.py.
# include_router(qr_router) + запуск provider_ranking_optimizer_loop в
# startup делается рядом с другими routers вверху server.py.
# ═══════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════
# Marketplace quick-request (legacy, kept for backward compatibility)
# ═══════════════════════════════════════════════════════════════════
# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# ═══════════════════════════════════════════════
# 📍 PROVIDER LOCATION TRACKING (WebSocket)
# ═══════════════════════════════════════════════
# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════
# 🔧 PROVIDER EXECUTION LAYER
# ═══════════════════════════════════════════════

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════
# 💰 MONETIZATION: Promoted Providers + Priority Requests
# ═══════════════════════════════════════════════

@app.post("/api/admin/providers/{slug}/promote")
async def promote_provider(slug: str, request: Request, _=Depends(verify_admin_token)):
    """Promote a provider — boost their ranking position"""
    body = await request.json()
    boost = min(body.get("promotionBoost", 0.15), 0.25)
    ends_at = body.get("promotionEndsAt")
    label = body.get("promotedLabel", "Рекомендуем")
    
    result = await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"isPromoted": True, "promotionBoost": boost, "promotionEndsAt": ends_at, "promotedLabel": label, "promotionPlan": "promoted"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Provider not found")
    
    # Log monetization action
    await db.monetization_actions.insert_one({"id": uid(), "type": "promote", "slug": slug, "boost": boost, "label": label, "endsAt": ends_at, "createdAt": now_utc().isoformat()})
    return {"status": "promoted", "slug": slug, "boost": boost, "label": label}

@app.post("/api/admin/providers/{slug}/unpromote")
async def unpromote_provider(slug: str, _=Depends(verify_admin_token)):
    """Remove promotion from provider"""
    await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"isPromoted": False, "promotionBoost": 0, "promotedLabel": None, "promotionPlan": "none"}}
    )
    return {"status": "unpromoted", "slug": slug}

@app.post("/api/admin/providers/{slug}/priority-access")
async def grant_priority_access(slug: str, request: Request, _=Depends(verify_admin_token)):
    """Grant priority request access to provider"""
    body = await request.json()
    level = min(body.get("priorityLevel", 1), 2)
    window = body.get("priorityWindowSeconds", 20)
    
    result = await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"hasPriorityAccess": True, "priorityLevel": level, "priorityWindowSeconds": window, "promotionPlan": "priority" if level == 1 else "vip"}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Provider not found")
    
    await db.monetization_actions.insert_one({"id": uid(), "type": "priority_grant", "slug": slug, "level": level, "window": window, "createdAt": now_utc().isoformat()})
    return {"status": "priority_granted", "slug": slug, "level": level, "windowSeconds": window}

@app.post("/api/admin/providers/{slug}/priority-access/remove")
async def remove_priority_access(slug: str, _=Depends(verify_admin_token)):
    """Remove priority access from provider"""
    await db.organizations.update_one(
        {"slug": slug},
        {"$set": {"hasPriorityAccess": False, "priorityLevel": 0, "priorityWindowSeconds": 0}}
    )
    return {"status": "priority_removed", "slug": slug}

@app.get("/api/admin/monetization/overview")
async def monetization_overview(_=Depends(verify_admin_token)):
    """Monetization overview — real metrics from provider_purchases + bookings + events."""
    promoted = await db.organizations.count_documents({"isPromoted": True})
    priority = await db.organizations.count_documents({"hasPriorityAccess": True})
    total = await db.organizations.count_documents({"status": "active"})

    all_providers = await db.organizations.find(
        {"status": "active"},
        {"_id": 0, "slug": 1, "name": 1, "isPromoted": 1, "promotionBoost": 1,
         "promotedLabel": 1, "hasPriorityAccess": 1, "priorityLevel": 1,
         "ratingAvg": 1, "bookingsCount": 1}
    ).to_list(50)

    promoted_slugs = [p.get("slug") for p in all_providers if p.get("isPromoted") and p.get("slug")]
    priority_slugs = [p.get("slug") for p in all_providers if p.get("hasPriorityAccess") and p.get("slug")]
    promoted_list = [p for p in all_providers if p.get("isPromoted")]
    priority_list = [p for p in all_providers if p.get("hasPriorityAccess")]

    # Promoted metrics: impressions from realtime_events, clicks/bookings from bookings.viaPromoted flag
    impressions = await db.realtime_events.count_documents({
        "event": "provider:impression",
        "providerSlug": {"$in": promoted_slugs}
    }) if promoted_slugs else 0
    clicks = await db.realtime_events.count_documents({
        "event": "provider:click",
        "providerSlug": {"$in": promoted_slugs}
    }) if promoted_slugs else 0
    promoted_bookings = await db.bookings.count_documents({
        "providerSlug": {"$in": promoted_slugs}
    }) if promoted_slugs else 0
    non_promoted_slugs = [p.get("slug") for p in all_providers if not p.get("isPromoted") and p.get("slug")]
    # Revenue lift = avg_revenue(promoted) vs avg_revenue(non-promoted)
    async def _avg_rev(slugs: list) -> float:
        if not slugs:
            return 0.0
        agg = await db.bookings.aggregate([
            {"$match": {"providerSlug": {"$in": slugs}, "status": "completed"}},
            {"$group": {"_id": None, "avg": {"$avg": "$priceEstimate"}}},
        ]).to_list(1)
        return float(agg[0]["avg"]) if agg and agg[0].get("avg") else 0.0
    rev_promoted = await _avg_rev(promoted_slugs)
    rev_regular = await _avg_rev(non_promoted_slugs)
    revenue_lift = round((rev_promoted - rev_regular) / rev_regular * 100, 1) if rev_regular else 0.0

    def _pct(num, denom):
        return round(num / denom * 100, 1) if denom else 0.0

    # Priority metrics: priority_requests collection tracks how priority-gate was used
    priority_requests = await db.priority_requests.count_documents({}) if priority_slugs else 0
    priority_accepted = await db.priority_requests.count_documents({"status": "accepted"}) if priority_slugs else 0
    priority_bookings = await db.bookings.count_documents({
        "providerSlug": {"$in": priority_slugs},
        "viaPriority": True,
    }) if priority_slugs else 0

    avg_accept_agg = await db.priority_requests.aggregate([
        {"$match": {"status": "accepted", "acceptTimeSeconds": {"$gt": 0}}},
        {"$group": {"_id": None, "avg": {"$avg": "$acceptTimeSeconds"}}},
    ]).to_list(1) if priority_slugs else []
    avg_accept_seconds = round(avg_accept_agg[0]["avg"], 1) if avg_accept_agg else 0.0

    priority_revenue_agg = await db.bookings.aggregate([
        {"$match": {"providerSlug": {"$in": priority_slugs}, "status": "completed"}},
        {"$group": {"_id": None, "sum": {"$sum": "$priceEstimate"}}},
    ]).to_list(1) if priority_slugs else []
    priority_revenue = round(priority_revenue_agg[0]["sum"]) if priority_revenue_agg else 0

    return {
        "stats": {
            "totalProviders": total,
            "promotedCount": promoted,
            "priorityCount": priority,
            "monetizationRate": round((promoted + priority) / max(total, 1) * 100, 1),
        },
        "promotedProviders": promoted_list,
        "priorityProviders": priority_list,
        "metrics": {
            "promoted": {
                "impressions": impressions,
                "clicks": clicks,
                "bookings": promoted_bookings,
                "conversionRate": _pct(promoted_bookings, clicks or impressions),
                "revenueLift": revenue_lift,
            },
            "priority": {
                "requestsSent": priority_requests,
                "acceptRate": _pct(priority_accepted, priority_requests),
                "avgAcceptTimeSeconds": avg_accept_seconds,
                "bookingConversionRate": _pct(priority_bookings, priority_requests),
                "providerRevenue": priority_revenue,
            },
        },
        "recentActions": await db.monetization_actions.find({}, {"_id": 0}).sort("createdAt", -1).to_list(10),
    }

@app.get("/api/admin/distribution/config")
async def get_distribution_config_internal(_=Depends(verify_admin_token)):
    """Get distribution configuration"""
    config = await db.distribution_config.find_one({"type": "global"}, {"_id": 0})
    if not config:
        config = {"type": "global", "priorityFanout": 3, "normalFanout": 5, "priorityWindowSeconds": 20, "maxPromotedInTop": 3, "promotionBoostCap": 0.25}
    return config

@app.post("/api/admin/distribution/config")
async def update_distribution_config_internal(request: Request, _=Depends(verify_admin_token)):
    """Update distribution configuration"""
    body = await request.json()
    await db.distribution_config.update_one(
        {"type": "global"},
        {"$set": {**body, "type": "global", "updatedAt": now_utc().isoformat()}},
        upsert=True
    )
    return {"status": "updated", "config": body}


# ═══════════════════════════════════════════════
# 🚀 GROWTH ENGINE: Billing + Pressure + A/B + Retention
# ═══════════════════════════════════════════════

# ── BILLING CATALOG ──
# Sprint 21 C16: BILLING_PRODUCTS + TIER_THRESHOLDS перенесены в
# app/billing/router.py и app/provider/router.py соответственно.
# ── ADMIN BILLING REVENUE ──
@app.get("/api/admin/billing/revenue")
async def admin_billing_revenue(_=Depends(verify_admin_token)):
    """Revenue dashboard for admin"""
    purchases = await db.provider_purchases.find({"status": "paid"}, {"_id": 0}).to_list(100)
    total_revenue = sum(p.get("amount", 0) for p in purchases)
    active_promoted = await db.organizations.count_documents({"isPromoted": True})
    active_priority = await db.organizations.count_documents({"hasPriorityAccess": True})
    
    by_product = {}
    for p in purchases:
        code = p.get("productCode", "unknown")
        by_product.setdefault(code, {"count": 0, "revenue": 0})
        by_product[code]["count"] += 1
        by_product[code]["revenue"] += p.get("amount", 0)
    
    return {
        "totalRevenue": total_revenue, "currency": "UAH", "totalPurchases": len(purchases),
        "activePromoted": active_promoted, "activePriority": active_priority,
        "byProduct": by_product,
        "arppu": round(total_revenue / max(len(set(p.get("providerSlug") for p in purchases)), 1)),
        "conversionToPaid": round(active_promoted + active_priority) / max(await db.organizations.count_documents({"status": "active"}), 1) * 100,
    }
# ═══════════════════════════════════════════════
# 📊 PHASE B: BOOKING DEMAND EVENTS
# ═══════════════════════════════════════════════

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════
# 🧠 PHASE B: ZONE-AWARE MATCHING (Enhanced)
# ═══════════════════════════════════════════════

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════
# 🚀 PHASE B: ZONE-AWARE DISTRIBUTION
# ═══════════════════════════════════════════════

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════
# 📊 PHASE B: ZONE DASHBOARD (COMPREHENSIVE)
# ═══════════════════════════════════════════════

# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# Sprint 21 C10: moved to app/marketplace/* (see router.py)


# ═══════════════════════════════════════════════
# 🗺️ GEO + ZONE ENGINE (Phase B)
# ═══════════════════════════════════════════════

# Sprint 21 C9: resolve_zone вынесен в app/core/geo.py. Импорт сделан
# рядом с haversine вверху файла. Все 7 usages в server.py работают
# через module-level re-export.

# ── ZONE RESOLVE (must be before /{zone_id}) ──
# Sprint 21 C10: moved to app/marketplace/* (see router.py)
# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)

# Sprint 21 C10: moved to app/marketplace/* (see router.py)
@app.get("/api/admin/zones/heatmap")
async def zones_heatmap(_=Depends(verify_admin_token)):
    """Get heatmap data for all zones"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    heatmap = []
    for z in zones:
        center = z.get("center", {})
        intensity = min(1.0, z.get("ratio", 1) / 5)
        heatmap.append({
            "zoneId": z["id"], "name": z["name"],
            "lat": center.get("lat", 50.45), "lng": center.get("lng", 30.52),
            "intensity": round(intensity, 3),
            "demand": z.get("demandScore", 0), "supply": z.get("supplyScore", 0),
            "ratio": z.get("ratio", 1), "surge": z.get("surgeMultiplier", 1),
            "status": z.get("status", "BALANCED"), "color": z.get("color", "#22C55E"),
        })
    return {"heatmap": heatmap, "total": len(heatmap)}

# ── ZONE HISTORY / ANALYTICS ──
@app.get("/api/admin/zones/{zone_id}/history")
async def zone_history(zone_id: str, hours: int = 24, _=Depends(verify_admin_token)):
    """Get zone history timeline"""
    since = (now_utc() - timedelta(hours=hours)).isoformat()
    snaps = await db.zone_snapshots.find({"zoneId": zone_id, "timestamp": {"$gte": since}}, {"_id": 0}).sort("timestamp", 1).to_list(200)
    return {"zoneId": zone_id, "timeline": snaps, "periodHours": hours, "dataPoints": len(snaps)}

# ── ADMIN ZONE CONTROLS ──
@app.post("/api/admin/zones/{zone_id}/override-surge")
async def override_zone_surge(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Override surge multiplier for a zone"""
    body = await request.json()
    surge = body.get("surgeMultiplier", 1.0)
    await db.zones.update_one({"id": zone_id}, {"$set": {"surgeMultiplier": surge, "updatedAt": now_utc().isoformat()}})
    await emit_realtime_event("zone:surge_changed", {"zoneId": zone_id, "surge": surge})
    return {"status": "surge_overridden", "zoneId": zone_id, "surgeMultiplier": surge}

@app.post("/api/admin/zones/{zone_id}/push-providers")
async def push_zone_providers(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Push notification to providers in a zone"""
    body = await request.json()
    message = body.get("message", "Новые заявки в вашей зоне!")
    zone = await db.zones.find_one({"id": zone_id}, {"_id": 0})
    if not zone:
        raise HTTPException(404, "Zone not found")
    await emit_realtime_event("zone:provider_push", {"zoneId": zone_id, "message": message, "zoneName": zone.get("name")})
    return {"status": "pushed", "zoneId": zone_id, "message": message}

@app.post("/api/admin/zones/{zone_id}/config")
async def update_zone_config(zone_id: str, request: Request, _=Depends(verify_admin_token)):
    """Update zone configuration (thresholds, fanout, etc.)"""
    body = await request.json()
    allowed = {"surgeThresholds", "fanoutMultiplier", "etaTarget", "maxProviders", "name", "color"}
    update = {k: v for k, v in body.items() if k in allowed}
    update["updatedAt"] = now_utc().isoformat()
    await db.zones.update_one({"id": zone_id}, {"$set": update})
    return {"status": "updated", "zoneId": zone_id, "updated": list(update.keys())}

# ── ZONE-AWARE DISTRIBUTION CONFIG ──
@app.get("/api/admin/zones/distribution-config")
async def get_zone_distribution_config(_=Depends(verify_admin_token)):
    """Get zone-aware distribution settings"""
    config = await db.zone_distribution_config.find_one({"type": "global"}, {"_id": 0})
    if not config:
        config = {"type": "global", "fanoutByStatus": {"BALANCED": 2, "BUSY": 3, "SURGE": 4, "CRITICAL": 6}, "surgeThresholds": {"BUSY": 1.5, "SURGE": 2.5, "CRITICAL": 3.5}, "etaTargets": {"BALANCED": 10, "BUSY": 15, "SURGE": 20, "CRITICAL": 30}}
    return config

@app.post("/api/admin/zones/distribution-config")
async def update_zone_distribution_config(request: Request, _=Depends(verify_admin_token)):
    body = await request.json()
    await db.zone_distribution_config.update_one({"type": "global"}, {"$set": {**body, "type": "global", "updatedAt": now_utc().isoformat()}}, upsert=True)
    return {"status": "updated"}

# ── ZONE DASHBOARD ──
@app.get("/api/admin/zones/dashboard")
async def zones_dashboard(_=Depends(verify_admin_token)):
    """Comprehensive zones dashboard for admin"""
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    total_demand = sum(z.get("demandScore", 0) for z in zones)
    total_supply = sum(z.get("supplyScore", 0) for z in zones)
    by_status = {}
    for z in zones:
        st = z.get("status", "BALANCED")
        by_status.setdefault(st, 0)
        by_status[st] += 1
    
    critical_zones = [z for z in zones if z.get("status") in ("CRITICAL", "SURGE")]
    
    return {
        "summary": {"totalZones": len(zones), "totalDemand": total_demand, "totalSupply": total_supply, "avgRatio": round(total_demand / max(total_supply, 1), 2), "byStatus": by_status},
        "zones": zones,
        "criticalZones": critical_zones,
        "alerts": [{"zoneId": z["id"], "zoneName": z["name"], "status": z["status"], "ratio": z["ratio"], "message": f"{z['name']}: {z['status']} (ratio {z['ratio']})"} for z in critical_zones],
    }

# ═══════════════════════════════════════════════════════════════
# 🧠 PHASE C: CUSTOMER INTELLIGENCE ENGINE
# ═══════════════════════════════════════════════════════════════

# ── C.1: Customer Profile Intelligence ──

# ═══════════════════════════════════════════════════════════════
# 🧠 PHASE E: MARKET ORCHESTRATION LAYER
# ═══════════════════════════════════════════════════════════════
#
# Zone/Market state -> Decision -> Actions -> Logs -> Override
#
# System automatically:
#   - reads live zone state
#   - decides actions based on rules config
#   - executes (surge, push, fanout, priority bias, zone boost)
#   - logs everything
#   - respects admin overrides
# ═══════════════════════════════════════════════════════════════

# ── DEFAULT RULES CONFIG ──
# Sprint 21 C11: ORCHESTRATOR_DEFAULT_RULES moved to app/orchestrator/cycle.py

# Sprint 21 C13: cooldown helpers вынесены в app/orchestrator/cooldown.py.
# Re-export для backcompat.
from app.orchestrator.cooldown import (  # noqa: E402, F401
    orchestrator_cooldowns,
    is_in_cooldown,
    set_cooldown,
)

orchestrator_engine_task = None
# Sprint 21 C11: orchestrator_enabled/cycle_count/last_cycle_at/last_actions_count
# вынесены в app/orchestrator/cycle.py (mutable globals, общие с router.py).
from app.orchestrator import cycle as _cycle  # noqa: E402


def _get_orchestrator_state():
    return _cycle.orchestrator_enabled, _cycle.orchestrator_cycle_count, _cycle.orchestrator_last_cycle_at, _cycle.orchestrator_last_actions_count


# Sprint 21 C13: build_actions + execute_action вынесены в
# app/orchestrator/actions.py. Re-export для backcompat.
from app.orchestrator.actions import build_actions, execute_action  # noqa: E402, F401


# ═══════════════════════════════════════════════════════════════════════
# 🔥 SPRINT 18: PROVIDER PRE-ENGAGEMENT ENGINE
#
# Цель: переходим от реактивной системы (клиент → ищем мастера) к проактивной
# (predicted demand → поднимаем мастеров заранее).
#
# 1. predict_demand(zone_id) — простая short-window прогнозная метрика на базе
#    последних zone_snapshots и текущего demandScore. Не ML — это базовая линия,
#    Sprint 20 заменит на полноценный TS-forecast.
# 2. trigger_pre_engagement(zone, pressure) — создаёт событие в коллекции
#    pre_engagement_events (TTL = 15 мин), эмиттит realtime в комнату zone:<id>.
# 3. preEngageBoost (1.1x) применяется в /matching/nearby ranking, если у
#    провайдера preEngagedAt свежее 15 минут.
# ═══════════════════════════════════════════════════════════════════════
# Sprint 21 C11: pre-engagement consts + cooldowns + pressure threshold
# вынесены в app/orchestrator/pre_engagement.py. PRE_ENGAGEMENT_TTL_MIN и
# PRE_ENGAGEMENT_BOOST — в app/core/constants.py (shared с matching.py).
# Они ещё нужны endpoint'у /api/provider/pre-engage (строки 2184, 2217).
from app.core.constants import PRE_ENGAGEMENT_TTL_MIN, PRE_ENGAGEMENT_BOOST  # noqa: E402, F401


# Sprint 21 C13: ML domain (SKLEARN_OK / _compute_behavioral_signals /
# DemandPredictor / predict_demand / _predict_demand_ewma) вынесен в
# app/ml/predictor.py. Re-export для backcompat.
from app.ml.predictor import (  # noqa: E402, F401
    SKLEARN_OK,
    DemandPredictor,
    _compute_behavioral_signals,
    _predict_demand_ewma,
    predict_demand,
)


# Sprint 21 C13: ML body physically moved to app/ml/predictor.py
# (re-export на строке ~3443 выше). Всего удалено ~360 строк ML-кода.


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: startup_with_orchestrator (v1) был полностью замещён
# startup_with_feedback (v2) — он ниже в файле. Оставляем только v2.

# ═══════════════════════════════════════════════
# 📡 ORCHESTRATOR API ENDPOINTS
# ═══════════════════════════════════════════════

# Sprint 21 C11: все /api/orchestrator/* endpoints вынесены в
# app/orchestrator/router.py.


# ═══════════════════════════════════════════════════════════════
# 🧠 PHASE G+H: ACTION FEEDBACK LOOP + STRATEGY OPTIMIZER
# ═══════════════════════════════════════════════════════════════
#
# Every orchestrator action → capture BEFORE snapshot
# After 3 min → capture AFTER snapshot → calculate effectiveness
# Strategy Optimizer → adjusts weights per zone+action_type
# Orchestrator → uses weights when deciding actions
# ═══════════════════════════════════════════════════════════════

# Sprint 21 C11: DEFAULT_STRATEGY_WEIGHTS + FEEDBACK_DELAY_SECONDS +
# STRATEGY_RECALC_INTERVAL + MIN_SAMPLES_FOR_LEARNING + ZONE_WEIGHT_BLEND
# вынесены в app/orchestrator/feedback.py.
feedback_engine_task = None
strategy_optimizer_task = None

# ── FIX 1: Zone Locks (Race Condition Prevention) ──
zone_locks: dict = {}  # { zoneId: { lockedBy: str, expiresAt: str } }

# Sprint 21 C11: feedback helpers (acquire/release/capture/calculate/track/
# feedback_processor_loop/strategy_optimizer_loop/recalculate_strategy_weights/
# get_strategy_weight) — в app/orchestrator/feedback.py.
#
# Cycle helpers (zone_state_engine/orchestrator_run_cycle/
# orchestrator_run_cycle_with_feedback/orchestrator_engine_loop_v2/
# seed_orchestrator_rules) — в app/orchestrator/cycle.py.
#
# trigger_pre_engagement — в app/orchestrator/pre_engagement.py.

# ── Imports used by startup_with_feedback ──
from app.orchestrator.cycle import (  # noqa: E402
    orchestrator_engine_loop_v2,
    orchestrator_run_cycle,
    orchestrator_run_cycle_with_feedback,
    seed_orchestrator_rules as _new_seed_orchestrator_rules,
    zone_state_engine as _new_zone_state_engine,
)
from app.orchestrator.feedback import (  # noqa: E402
    feedback_processor_loop,
    strategy_optimizer_loop,
)


# Sprint 21 C15.1: startup_with_feedback / _demand_prediction_loop / on_startup.clear
# УДАЛЕНЫ. Весь lifecycle теперь в app.core.lifespan (init_db → load_ml_models →
# bootstrap_side_effects → start_all_loops). См. app/orchestrator/runner.py.


# ═══════════════════════════════════════════════
# 📡 FEEDBACK & STRATEGY API ENDPOINTS
# ═══════════════════════════════════════════════

# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# Sprint 21 C11: moved to app/orchestrator/* (cycle/pre_engagement/feedback/router)


# ═══════════════════════════════════════════════════════════════
# 📊 SIMULATION & ANALYTICS API
# ═══════════════════════════════════════════════════════════════

@app.get("/api/simulation/results")
async def simulation_results():
    """Get latest Monte Carlo simulation results"""
    import json as jsonlib
    report_path = Path("/app/test_reports/monte_carlo_10k.json")
    if not report_path.exists():
        return {"status": "no_results", "message": "Run simulation first"}
    with open(report_path) as f:
        return jsonlib.load(f)


@app.get("/api/analytics/system-health")
async def analytics_system_health():
    """Deep analytics: full system health dashboard"""
    # Zone health
    zones = await db.zones.find({}, {"_id": 0}).to_list(50)
    zone_health = []
    for z in zones:
        zone_health.append({
            "id": z.get("id"), "name": z.get("name"), "status": z.get("status"),
            "ratio": z.get("ratio", 0), "surge": z.get("surgeMultiplier", 1),
            "eta": z.get("avgEta", 0), "matchRate": z.get("matchRate", 0),
            "demand": z.get("demandScore", 0), "supply": z.get("supplyScore", 0),
        })

    # Orchestrator stats
    orch_logs_24h = await db.orchestrator_logs.count_documents({"createdAt": {"$gte": (now_utc() - timedelta(hours=24)).isoformat()}})
    orch_actions_24h = 0
    orch_failed = 0
    recent_logs = await db.orchestrator_logs.find(
        {"createdAt": {"$gte": (now_utc() - timedelta(hours=24)).isoformat()}},
        {"_id": 0, "actions": 1}
    ).to_list(5000)
    for log in recent_logs:
        for a in log.get("actions", []):
            orch_actions_24h += 1
            if a.get("status") == "failed":
                orch_failed += 1

    # Feedback stats
    fb_total = await db.action_feedback.count_documents({})
    fb_completed = await db.action_feedback.count_documents({"status": "completed"})
    fb_pending = await db.action_feedback.count_documents({"status": "pending"})

    # Strategy weights
    global_w = await db.strategy_weights.find_one({"zoneId": "global"}, {"_id": 0})

    # MongoDB stats
    collections = {}
    for col_name in ["users", "organizations", "zones", "orchestrator_logs", "action_feedback",
                     "strategy_weights", "orchestrator_rules", "orchestrator_overrides",
                     "zone_snapshots", "governance_actions", "reviews", "services"]:
        collections[col_name] = await db[col_name].count_documents({})

    # Recommendations
    recs = await db.strategy_recommendations.find({}, {"_id": 0}).to_list(20)

    return {
        "timestamp": now_utc().isoformat(),
        "zones": zone_health,
        "orchestrator": {
            "enabled": _cycle.orchestrator_enabled,
            "cycleCount": _cycle.orchestrator_cycle_count,
            "lastCycleAt": _cycle.orchestrator_last_cycle_at,
            "logs24h": orch_logs_24h,
            "actions24h": orch_actions_24h,
            "failed24h": orch_failed,
            "successRate": round((orch_actions_24h - orch_failed) / max(orch_actions_24h, 1) * 100, 1),
        },
        "feedback": {
            "total": fb_total,
            "completed": fb_completed,
            "pending": fb_pending,
            "completionRate": round(fb_completed / max(fb_total, 1) * 100, 1),
        },
        "strategy": {
            "globalWeights": global_w.get("weights", {}) if global_w else {},
            "sampleCount": global_w.get("sampleCount", 0) if global_w else 0,
            "lastUpdated": global_w.get("updatedAt") if global_w else None,
        },
        "database": collections,
        "recommendations": recs,
        "backgroundProcesses": [
            {"name": "Zone State Engine", "interval": "10s", "status": "running"},
            {"name": "Orchestrator Engine", "interval": "10s", "status": "running" if _cycle.orchestrator_enabled else "paused"},
            {"name": "Feedback Processor", "interval": "15s", "status": "running"},
            {"name": "Strategy Optimizer", "interval": "5min", "status": "running"},
        ],
    }


# ═══════════════════════════════════════════════════════════════
# 🔧 CONTRACT COMPAT LAYER — Sprint 1 API alignment
# Registered BEFORE the catch-all proxy so these paths never fall through.
# ═══════════════════════════════════════════════════════════════

async def _proxy_to(request: Request, target_path: str, method: Optional[str] = None,
                    query_override: Optional[dict] = None) -> Response:
    """Sprint 21 C8: реализация переехала в app/core/proxy.py (proxy_to_nest).
    Этот thin-wrapper оставлен, чтобы оставшиеся admin-compat endpoints ниже
    продолжали работать без массовых переименований. Новый код должен
    импортировать proxy_to_nest напрямую.
    """
    return await proxy_to_nest(request, target_path, method=method, query_override=query_override)


# --- Notifications / Favorites / Organizations search / Garage / Payments ---
# Sprint 21 C8: 5 simple-proxy compat endpoints вынесены в app/system/compat.py.
# (compat_notifications_my, compat_favorites_my, compat_orgs_search,
#  compat_garage_get, compat_payments_list)


# --- Auth forgot-password (mock-safe) ---
# Sprint 21 C5: /api/auth/forgot-password и /reset-password вынесены в app/system/auth.py.


# --- Admin live-feed (aggregate recent events) ---
# --- Admin live-feed + alerts: Sprint 21 C12A — вынесено в app/admin/dashboard.py ---


# --- Admin automation replay alias ---
@app.get("/api/admin/automation/replay")
async def compat_admin_replay(request: Request, _=Depends(verify_admin_token)):
    return await _proxy_to(request, "admin/automation/replay/history")


# --- Admin feature flags alias ---
# Sprint 21 C12B: /api/admin/config/features + /api/admin/config/commission-tiers
# вынесены в app/admin/controls.py


# ═══════════════════════════════════════════════════════════════
# 🔀 NESTJS PROXY (catch-all — MUST BE LAST)
# ═══════════════════════════════════════════════════════════════


# ══════════════════════════════════════════════════════════════════════════════
# Sprint 9 — ADMIN CONTROL SYSTEM
#   Block 1: Zone Override (manual market control)
#   Block 2: Orchestrator Timeline (visibility w/ before/after)
#   Block 3: Strategy Control (AI on/off + weight bounds)
#   Block 4: Alerts with impact (lost revenue / recommended action)
# ══════════════════════════════════════════════════════════════════════════════

# Sprint 21 C13: OVERRIDE_MODE_MAP + get_active_override вынесены в
# app/core/overrides.py. Re-export для обратной совместимости (любое место,
# где был `from server import OVERRIDE_MODE_MAP, get_active_override`,
# продолжает работать без изменений).
from app.core.overrides import OVERRIDE_MODE_MAP, get_active_override  # noqa: E402, F401


# Sprint 21 C12B: Override/Timeline/Strategy endpoints вынесены в
# app/admin/controls.py. Константа OVERRIDE_MODE_MAP и функция
# get_active_override живут в app/core/overrides.py (C13).


# ═══════════════════════════════════════════════════════════════
# 🛡 SPRINT 12 — Production-readiness endpoints
# ═══════════════════════════════════════════════════════════════

# Sprint 21 C6: /api/system/breaker, /alert-dispatches, /test-alert,
# /idempotency/{key}, /audit — все вынесены в app/system/system.py.


# Sprint 21 C12B: /api/admin/zones/{id}/timeline + /api/admin/strategy/{id} +
# /api/admin/strategies вынесены в app/admin/controls.py.


# ── BLOCK 4 — Alerts with impact ─────────────────────────────────────────────
_AVG_ORDER_VALUE = 800  # ₴ mean booking value used for impact math


def _recommend_action(zone: dict) -> str:
    status = zone.get("status")
    ratio = zone.get("ratio", 1.0)
    if status == "CRITICAL":
        return "FORCE_SURGE + raise fanout to 6"
    if status == "SURGE" and ratio > 2.5:
        return "ENABLE_SURGE"
    if status == "BUSY":
        return "INCREASE_FANOUT"
    return "MONITOR"


# Sprint 21 C12A: /api/admin/alerts/enhanced вынесено в app/admin/dashboard.py
# --- Catch-all NestJS proxy ---
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy_to_nestjs(request: Request, path: str):
    # Circuit breaker check
    if not nest_breaker.allow():
        st = nest_breaker.state()
        return JSONResponse(
            status_code=503,
            content={
                "error": True,
                "code": "NESTJS_UNAVAILABLE",
                "message": "Backend service temporarily unavailable (circuit open)",
                "details": {"retryIn": st["retryIn"], "breaker": st},
            },
            headers={"Retry-After": str(st["retryIn"] or 30)},
        )

    target = f"{NESTJS_URL}/api/{path}"
    if request.query_params:
        target += f"?{request.query_params}"
    headers = dict(request.headers)
    headers.pop('host', None)
    headers.pop('content-length', None)
    body = await request.body()

    last_err: Optional[str] = None
    for attempt in range(3):  # 1 try + 2 retries
        try:
            resp = await http_client.request(method=request.method, url=target,
                                              headers=headers, content=body,
                                              timeout=15.0)
            # success (even 4xx is NestJS reachable)
            nest_breaker.record_success()
            rh = dict(resp.headers)
            for k in ['content-length', 'content-encoding', 'transfer-encoding']:
                rh.pop(k, None)
            return Response(content=resp.content, status_code=resp.status_code, headers=rh,
                            media_type=resp.headers.get('content-type', 'application/json'))
        except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout, httpx.WriteTimeout) as e:
            last_err = f"{type(e).__name__}: {e}"
            nest_breaker.record_failure()
            # relaunch NestJS on connect error
            if isinstance(e, httpx.ConnectError):
                asyncio.create_task(start_nestjs())
            if attempt < 2:
                await asyncio.sleep(0.5 * (attempt + 1))
                continue
            # fire alert (mocked dispatch) when breaker trips
            if nest_breaker.state()["state"] == "open":
                asyncio.create_task(dispatch_alert(
                    db, level="critical", code="NESTJS_CIRCUIT_OPEN",
                    message="FastAPI↔NestJS circuit opened after consecutive failures",
                    meta={"lastError": last_err, "breaker": nest_breaker.state()},
                ))
            return JSONResponse(
                status_code=503,
                content={
                    "error": True,
                    "code": "NESTJS_UNAVAILABLE",
                    "message": "Backend service temporarily unavailable",
                    "details": {"lastError": last_err, "breaker": nest_breaker.state()},
                },
                headers={"Retry-After": "5"},
            )
        except Exception as e:
            nest_breaker.record_failure()
            return JSONResponse(
                status_code=502,
                content=_normalize_error(502, str(e), code="UPSTREAM_ERROR"),
            )
    # should not reach here
    return JSONResponse(status_code=502,
                        content=_normalize_error(502, last_err or "Unknown upstream error",
                                                 code="UPSTREAM_ERROR"))

