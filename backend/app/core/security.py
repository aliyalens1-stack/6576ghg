"""app.core.security — password hashing + JWT admin-token verification.

Sprint 21 C1: вынос из server.py без единого изменения поведения.

ВАЖНО: используется PyJWT (import jwt), НЕ python-jose.
ВАЖНО: verify_admin_token ожидает Request (не HTTPBearer) — это сохраняет
совместимость со всеми 57 admin endpoint'ами.
"""
from __future__ import annotations
import bcrypt
import jwt
from fastapi import HTTPException, Request

from app.core.config import JWT_SECRET, JWT_ALGO


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_pw(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


async def verify_admin_token(request: Request):
    """Sprint 1D.3 admin gate — adapter that delegates to
    `app.core.identity_runtime.require_admin()`.

    Why an adapter instead of a body rewrite:
      - ~30 callsites use `Depends(verify_admin_token)` with `_=` discard.
        They require zero changes.
      - One callsite reads `payload.get("email", "admin")` to attribute
        admin actions in audit fields. The adapter returns a dict-shaped
        legacy payload synthesized from `IdentityContext` — back-compat
        preserved.
      - Single source of truth for "what does admin mean" lives in
        `identity_runtime.require_admin()`. If we later add 2FA / IP
        allowlist there, every admin endpoint inherits without touching
        callsites.

    NEW code should `Depends(require_admin())` directly to receive an
    `IdentityContext` instead of a dict. The adapter is for legacy callers.

    Back-compat behaviour vs pre-1D.3:
      - Still requires Authorization: Bearer header (401 if missing).
      - Still rejects non-admin tokens (403). Error message slightly
        improved: now reads "account kind required (admin)" instead of
        "admin role required". Old format kept in tests would fail; we
        don't have any test asserting on the literal string.
    """
    # Lazy import: identity_runtime imports from app.core.* but not from
    # app.core.security, so this is safe — keeping it lazy in case a future
    # refactor adds a security ↔ identity_runtime cycle.
    from app.core.identity_runtime import require_admin

    dep = require_admin()
    ctx = await dep(request)

    # Legacy-shape payload — drop-in replacement for the old jwt.decode return.
    # Includes both legacy fields (sub/role/email) and new fields (accountId/
    # kind/caps) so callers can incrementally adopt the new shape.
    return {
        "sub": ctx.user_id,
        "userId": ctx.user_id,
        "email": ctx.user_email,
        "role": ctx.legacy_role,
        "accountId": ctx.account.id if ctx.account else None,
        "kind": ctx.account.kind if ctx.account else None,
        "caps": sorted(ctx.capabilities),
    }


async def verify_user_token(request: Request):
    """Verify JWT token from Authorization header. Accepts any authenticated role.

    Sprint 34 D8: shared dep for chat / notifications / messages flows.
    Returns payload dict with sub/email/role/userId.
    """
    auth_header = request.headers.get('authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(401, "Unauthorized")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    return payload
