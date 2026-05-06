"""Customer API: create + list + get own car requests.

Sprint 1D.2 — gates moved from anonymous-or-any-authenticated to
`require_account_kind("customer")` for the my/reports endpoints.

`POST /api/customer/requests` STAYS guest-friendly (anonymous create allowed).
The "list my requests" / "view my reports" endpoints are customer-gated:
  - 401 for anonymous
  - 403 for provider/admin tokens (their own data isn't here)
  - 200 for customer tokens — reads are scoped to ctx.user_id

Dual-write `customerAccountId` happens in the create endpoint via a thin
overlay update — service.py is intentionally untouched (same scope discipline
as Sprint 1D.1).
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Request

from app.auto_requests.schemas import CreateCarRequest, CarRequestOut
from app.auto_requests import service as svc
from app.auto_requests.auth import get_user_id_optional
from app.packages import service as credits_svc
from app.core.identity_runtime import IdentityContext, require_account_kind
from app.core.db import get_db


router = APIRouter(prefix="/api/customer/requests", tags=["auto_requests:customer"])

# Customer principal gate — for "my" reads / report views below.
_customer_required = require_account_kind("customer")


@router.post("", response_model=CarRequestOut)
async def create_endpoint(data: CreateCarRequest, request: Request):
    """Create a car selection request.

    INTENTIONALLY guest-friendly — anonymous creation is part of the public
    landing flow ("post a request, then sign up to track it"). When a token
    IS present we still derive the user_id, but we DO NOT enforce
    `account.kind == "customer"` because:
      - admin tokens helping a customer create a request shouldn't be 403'd
      - provider tokens may legitimately self-request inspections of their
        own purchase candidates

    Sprint 1D.2 dual-write: when authenticated, also persist
    `customerAccountId` so future joins can go through accounts._id.
    """
    uid = get_user_id_optional(request)
    cities_count = len(data.cities)

    out = await svc.create_request(data, user_id=uid)

    # Dual-write customerAccountId for authenticated requests.
    if uid:
        try:
            db = get_db()
            user = await db.users.find_one({"_id": uid}, {"_id": 0})
            if user is None:
                # Try ObjectId form
                from bson import ObjectId
                try:
                    user = await db.users.find_one({"_id": ObjectId(uid)}, {"_id": 0})
                except Exception:
                    user = None
            # Look up the customer account for this user (idempotent)
            acc = await db.accounts.find_one(
                {"userId": uid, "kind": "customer"}, {"_id": 1},
            )
            if acc:
                await db.car_requests.update_one(
                    {"_id": out.id},
                    {"$set": {"customerAccountId": str(acc["_id"])}},
                )
        except Exception:
            # Dual-write is best-effort — never block the create flow.
            pass

    # Best-effort credit reservation for legacy authenticated users with packages.
    if uid and cities_count > 0:
        try:
            balance = await credits_svc.get_balance(uid)
            if balance.available >= cities_count:
                await credits_svc.reserve_credits(uid, cities_count, request_id=out.id)
        except Exception:
            pass

    return out


@router.get("/my", response_model=list[CarRequestOut])
async def my_requests(ctx_: IdentityContext = Depends(_customer_required)):  # noqa: B008
    return await svc.list_my_requests(ctx_.user_id)


@router.get("/{request_id}", response_model=CarRequestOut)
async def get_one(request_id: str):
    """Public read of a single request — owner check happens at the report
    level. Kept open so the public landing can show "your request status"
    without forcing a login first."""
    doc = await svc.get_request(request_id)
    if not doc:
        raise HTTPException(404, "request not found")
    return doc


@router.get("/{request_id}/jobs")
async def get_request_jobs(request_id: str):
    """Public — see comment on `get_one`."""
    doc = await svc.get_request(request_id)
    if not doc:
        raise HTTPException(404, "request not found")
    jobs = await svc.get_jobs_for_request(request_id)
    return {"request": doc, "jobs": jobs}


# ─────────────────────────────────────────────────────────────────────
# Sprint 4 — Customer-facing inspection reports (kind-gated)
# ─────────────────────────────────────────────────────────────────────

reports_router = APIRouter(prefix="/api/customer", tags=["auto_requests:customer"])


@reports_router.get("/reports")
async def my_reports(ctx_: IdentityContext = Depends(_customer_required)):  # noqa: B008
    """List all inspection reports across the customer's car_requests."""
    from app.auto_requests import reports as rsvc
    items = await rsvc.list_reports_for_customer(ctx_.user_id)
    return {"reports": items, "count": len(items)}


@reports_router.get("/reports/{report_id}")
async def my_report_detail(
    report_id: str,
    ctx_: IdentityContext = Depends(_customer_required),  # noqa: B008
):
    """Detail of a single report — owner-scoped."""
    from app.auto_requests import reports as rsvc
    rep = await rsvc.get_report(report_id)
    if not rep:
        raise HTTPException(404, "report not found")
    db = get_db()
    req = await db.car_requests.find_one({"_id": rep["requestId"]}, {"userId": 1})
    if not req or req.get("userId") != ctx_.user_id:
        raise HTTPException(403, "not your report")
    return {"report": rep}


@reports_router.get("/requests/{request_id}/reports")
async def reports_for_request(
    request_id: str,
    ctx_: IdentityContext = Depends(_customer_required),  # noqa: B008
):
    """All reports for one of the customer's requests."""
    from app.auto_requests import reports as rsvc
    db = get_db()
    req = await db.car_requests.find_one({"_id": request_id}, {"userId": 1})
    if not req:
        raise HTTPException(404, "request not found")
    if req.get("userId") != ctx_.user_id:
        raise HTTPException(403, "not your request")
    items = await rsvc.list_reports_for_request(request_id)
    return {"reports": items, "count": len(items)}
