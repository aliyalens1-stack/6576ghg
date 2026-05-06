"""app.system.auth — /api/auth/* endpoints.

Sprint 1C — Identity Runtime Closure.
ALL auth endpoints now go through `app.core.identity_runtime`. Single source
of truth for: account resolution, capability resolution, JWT issuance,
account-switch. No more JWT minting at this layer.

Endpoints:
  - POST /api/auth/login            → issue JWT bound to (user, primary account)
  - POST /api/auth/register         → create user + account, issue JWT
  - GET  /api/auth/me               → { user, accounts[], activeAccount }
  - POST /api/auth/switch-account   → stateless: new JWT with different accountId
  - POST /api/auth/forgot-password  → unchanged (no identity-runtime touch)
  - POST /api/auth/reset-password   → unchanged

Backwards compatibility:
  - JWT still carries `role` claim — existing legacy gates keep working.
  - Login/register response shape adds `accounts[]` but keeps `user`,
    `activeAccount`, `accessToken`. Old clients that only read `accessToken`
    and `user.role` continue to work transparently.
"""
from __future__ import annotations
import logging
from datetime import timedelta, datetime
import jwt
from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from app.core.db import get_db
from app.core.security import hash_pw, verify_pw
from app.core.utils import now_utc, uid
from app.core.config import JWT_SECRET, JWT_ALGO
from app.core.identity_runtime import (
    ensure_account_for_user,
    get_user_accounts,
    get_active_account,
    get_account,
    issue_account_jwt,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth")


def _user_public_view(user_doc: dict) -> dict:
    """Stable shape for the `user` field across login/register/me responses."""
    return {
        "id": str(user_doc["_id"]),
        "email": user_doc["email"],
        "firstName": user_doc.get("firstName", ""),
        "lastName": user_doc.get("lastName", ""),
        "role": user_doc.get("role", "customer"),  # legacy, kept ≥3 releases
    }


@router.post("/login")
async def auth_login(request: Request):
    """Login with email/password. Returns JWT bound to the primary account."""
    db = get_db()
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")

    if not email or not password:
        raise HTTPException(400, "Email and password are required")

    user = await db.users.find_one({"email": email})
    if not user:
        raise HTTPException(401, "Invalid credentials")

    pw_hash = user.get("passwordHash", "")
    if not pw_hash or not verify_pw(password, pw_hash):
        raise HTTPException(401, "Invalid credentials")

    if not user.get("isActive", True):
        raise HTTPException(403, "Account is disabled")

    user_id = str(user["_id"])
    legacy_role = user.get("role", "customer")

    # Make sure this user has a real `accounts` row. Idempotent — if they were
    # created before 1C migration, the row gets backfilled here on first login.
    await ensure_account_for_user(user)

    accounts = await get_user_accounts(user_id)
    active = await get_active_account(user_id, requested_account_id=None)
    if active is None:
        # Defensive — ensure_account_for_user guarantees ≥1 account.
        raise HTTPException(500, "Failed to resolve active account")

    access_token = issue_account_jwt(
        user_id=user_id,
        user_email=email,
        legacy_role=legacy_role,
        account=active,
    )

    return {
        "accessToken": access_token,
        "user": _user_public_view(user),
        "accounts": [a.to_json() for a in accounts],
        "activeAccount": active.to_json(),
    }


@router.post("/register")
async def auth_register(request: Request):
    """Register a new user, create matching account row, return JWT."""
    db = get_db()
    body = await request.json()
    email = body.get("email", "").strip().lower()
    password = body.get("password", "")
    first_name = body.get("firstName", "")
    last_name = body.get("lastName", "")
    role = body.get("role", "customer")

    if not email or not password:
        raise HTTPException(400, "Email and password are required")
    if len(password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")

    existing = await db.users.find_one({"email": email})
    if existing:
        raise HTTPException(409, "User with this email already exists")

    user_doc = {
        "email": email,
        "passwordHash": hash_pw(password),
        "firstName": first_name,
        "lastName": last_name,
        "role": role if role in ["customer", "provider_owner"] else "customer",
        "isActive": True,
        "createdAt": now_utc().isoformat(),
    }
    result = await db.users.insert_one(user_doc)
    user_id = str(result.inserted_id)

    # Sprint 1C: create the matching `accounts` row immediately. Single source
    # of truth — no shim path for newly-registered users.
    user_doc_with_id = {**user_doc, "_id": result.inserted_id}
    active = await ensure_account_for_user(user_doc_with_id)
    accounts = await get_user_accounts(user_id)

    # Sprint 29: apply referral code if provided (kept verbatim from 1A).
    ref_code = (body.get("referralCode") or body.get("refCode") or "").strip().upper()
    ref_result = None
    if ref_code:
        try:
            from app.referrals import apply_referral_code, ensure_referral_code
            ip = request.headers.get("x-forwarded-for") or (request.client.host if request.client else None)
            device = request.headers.get("x-device-id")
            owner_type = "provider" if user_doc["role"].startswith("provider") else "customer"
            ref_result = await apply_referral_code(
                code=ref_code,
                invited_user_id=user_id if owner_type == "customer" else None,
                invited_slug=None,
                ip=ip,
                device_id=device,
            )
            await ensure_referral_code(user_id, {**user_doc, "role": user_doc["role"]})
        except Exception as _exc:
            ref_result = {"ok": False, "reason": f"error: {_exc}"}

    access_token = issue_account_jwt(
        user_id=user_id,
        user_email=email,
        legacy_role=user_doc["role"],
        account=active,
    )

    return {
        "accessToken": access_token,
        "user": _user_public_view(user_doc_with_id),
        "accounts": [a.to_json() for a in accounts],
        "activeAccount": active.to_json(),
        "referralApplied": ref_result,
    }


@router.get("/me")
async def auth_me(request: Request):
    """Return identity envelope: { user, accounts[], activeAccount }.

    Frontend should branch UI on activeAccount.kind / activeAccount.capabilities,
    not on the legacy user.role field.
    """
    db = get_db()
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token (no sub)")

    # users._id may be ObjectId or string
    user = None
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        pass
    if user is None:
        user = await db.users.find_one({"_id": user_id})
    if user is None:
        raise HTTPException(401, "User not found")

    accounts = await get_user_accounts(user_id)
    active = await get_active_account(user_id, requested_account_id=payload.get("accountId"))

    return {
        "user": _user_public_view(user),
        "accounts": [a.to_json() for a in accounts],
        "activeAccount": active.to_json() if active else None,
    }


@router.post("/switch-account")
async def auth_switch_account(request: Request):
    """Stateless account-mode switch. Caller passes the target accountId; we
    verify ownership, then mint a NEW JWT carrying that accountId + matching
    capabilities. No DB mutation — multi-device sessions remain independent.

    Body: { "accountId": "<accounts._id>" }
    Response: { accessToken, activeAccount, accounts[] }
    """
    db = get_db()
    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(401, "Unauthorized")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(401, "Invalid token (no sub)")

    body = await request.json()
    target_account_id = (body.get("accountId") or "").strip()
    if not target_account_id:
        raise HTTPException(400, "accountId is required")

    target = await get_account(target_account_id)
    if target is None or target.userId != user_id:
        # Don't leak whether the account exists vs. doesn't belong to caller.
        raise HTTPException(403, "Account not accessible")

    user = None
    try:
        user = await db.users.find_one({"_id": ObjectId(user_id)})
    except Exception:
        pass
    if user is None:
        user = await db.users.find_one({"_id": user_id})
    if user is None:
        raise HTTPException(401, "User not found")

    new_token = issue_account_jwt(
        user_id=user_id,
        user_email=user.get("email", payload.get("email", "")),
        legacy_role=user.get("role", "customer"),
        account=target,
    )
    accounts = await get_user_accounts(user_id)

    return {
        "accessToken": new_token,
        "activeAccount": target.to_json(),
        "accounts": [a.to_json() for a in accounts],
    }


@router.post("/forgot-password")
async def compat_forgot_password(request: Request):
    db = get_db()
    body = await request.json()
    email = (body.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(400, "Email is required")
    user = await db.users.find_one({"email": email})
    if user:
        reset_token = uid()
        await db.password_reset_tokens.insert_one({
            "userId": str(user["_id"]),
            "email": email,
            "token": reset_token,
            "expiresAt": (now_utc() + timedelta(hours=1)).isoformat(),
            "used": False,
            "createdAt": now_utc().isoformat(),
        })
        logger.info(f"Password reset token generated for {email} (mock; no email sent)")
    # Never reveal whether user exists
    return {"ok": True, "message": "If the email exists, a reset link has been sent."}


@router.post("/reset-password")
async def compat_reset_password(request: Request):
    db = get_db()
    body = await request.json()
    token = body.get("token", "")
    new_password = body.get("password", "")
    if not token or len(new_password) < 6:
        raise HTTPException(400, "Token and password (>=6 chars) are required")
    record = await db.password_reset_tokens.find_one({"token": token, "used": False})
    if not record:
        raise HTTPException(400, "Invalid or expired token")
    try:
        exp_str = record.get("expiresAt", "")
        if exp_str:
            exp = datetime.fromisoformat(exp_str.replace("Z", "+00:00"))
            if exp < now_utc():
                raise HTTPException(400, "Token expired")
    except HTTPException:
        raise
    except Exception:
        pass
    await db.users.update_one(
        {"_id": ObjectId(record["userId"])},
        {"$set": {"passwordHash": hash_pw(new_password)}},
    )
    await db.password_reset_tokens.update_one(
        {"token": token},
        {"$set": {"used": True, "usedAt": now_utc().isoformat()}},
    )
    return {"ok": True, "message": "Password updated"}
