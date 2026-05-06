"""app.parsers.router — public endpoint POST /api/parse/car-link.

Принимает URL объявления (mobile.de), возвращает структурированные данные.
Stateless, без auth (нужен и анонимам перед заказом проверки).

Лёгкий rate-limit: дополнительная защита поверх глобального rate-limit middleware.
"""
from __future__ import annotations
import time
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.parsers.universal import parse_listing

logger = logging.getLogger("parsers.router")

router = APIRouter(prefix="/api/parse", tags=["parsers"])


class CarLinkRequest(BaseModel):
    url: str = Field(..., min_length=8, max_length=2048)


# in-memory rate limit (по IP, 20 запросов / 60 сек на парсер)
_rate_state: dict[str, list[float]] = {}
_RATE_LIMIT = 20
_RATE_WINDOW = 60.0


def _ip_throttle(ip: str) -> bool:
    now = time.time()
    bucket = _rate_state.setdefault(ip, [])
    # cleanup
    cutoff = now - _RATE_WINDOW
    while bucket and bucket[0] < cutoff:
        bucket.pop(0)
    if len(bucket) >= _RATE_LIMIT:
        return False
    bucket.append(now)
    return True


@router.post("/car-link")
async def parse_car_link(payload: CarLinkRequest, request: Request):
    """Parse external car listing URL → unified preview shape.

    Phase C.1 — Link Intelligence Core. Returns:
    ```
    {
      "recognized": true|false,        # backend understood the listing
      "softFail":   true|false,        # site blocked auto-fetch (anti-bot 4xx/5xx) — link is OK
      "hardFail":   true|false,        # url syntax bad / unsupported domain — surface to user
      "source":     "mobile.de|autoscout24|kleinanzeigen.de|otomoto.pl|leboncoin.fr|willhaben.at|marktplaats.nl|heycar|pkw.de|generic|null",
      "sourceUrl":  "...",
      "title":      "BMW X5 xDrive30d M Sport" | null,
      "image":      "https://..." | null,
      "price":      24900 | null,
      "currency":   "EUR",
      "year":       2019 | null,
      "mileage":    148000 | null,
      "fuel":       "diesel" | null,
      "make":       "BMW" | null,
      "model":      "X5" | null,

      # legacy fields kept for back-compat with current frontend:
      "parsed": <recognized>,
      "error":  <softFail/hardFail code or null>
    }
    ```
    Soft-fail UX rule: NEVER show "broken link" — show "✓ Link accepted, inspector will open it".
    """
    ip = (request.client.host if request.client else None) or "anon"
    if not _ip_throttle(ip):
        raise HTTPException(status_code=429, detail={"error": True, "code": "RATE_LIMITED",
                                                     "message": "Too many parse requests"})

    url = payload.url.strip()
    if not url.lower().startswith(("http://", "https://")):
        url = "https://" + url

    # Hard-fail check 1: syntactically invalid URL (no host)
    from urllib.parse import urlparse as _up
    parsed_url = _up(url)
    host_lc = (parsed_url.hostname or "").lower()
    if not host_lc or "." not in host_lc:
        return {
            "recognized": False, "softFail": False, "hardFail": True,
            "source": None, "sourceUrl": url,
            "title": None, "image": None, "price": None, "currency": "EUR",
            "year": None, "mileage": None, "fuel": None, "make": None, "model": None,
            "parsed": False, "error": "bad_url",
        }

    try:
        data = await parse_listing(url)
    except Exception:
        logger.exception(f"parse_car_link failed url={url}")
        # Soft-fail rather than 500 — frontend still accepts the link.
        return {
            "recognized": False, "softFail": True, "hardFail": False,
            "source": None, "sourceUrl": url,
            "title": None, "image": None, "price": None, "currency": "EUR",
            "year": None, "mileage": None, "fuel": None, "make": None, "model": None,
            "parsed": False, "error": "parse_error",
        }

    # Wrap legacy shape into unified response.
    err = data.get("error")
    is_anti_bot = isinstance(err, str) and (
        err.startswith("http_4") or err.startswith("http_5") or
        err in ("fetch_failed", "timeout", "network", "parse_error")
    )
    recognized = bool(data.get("parsed"))
    out = {
        "recognized": recognized,
        # softFail = the URL is structurally OK + we know the marketplace, but anti-bot blocked the fetch.
        "softFail":  bool((not recognized) and is_anti_bot),
        # hardFail = unsupported domain / unparseable structure.
        "hardFail":  bool((not recognized) and (not is_anti_bot) and (data.get("source") is None)),
        "source":    data.get("source"),
        "sourceUrl": data.get("sourceUrl") or url,
        "title":     data.get("title"),
        "image":     data.get("image"),
        "price":     data.get("price"),
        "currency":  data.get("currency") or "EUR",
        "year":      data.get("year"),
        "mileage":   data.get("mileage"),
        "fuel":      data.get("fuel"),
        "make":      data.get("make"),
        "model":     data.get("model"),
        # legacy
        "parsed":    recognized,
        "error":     err,
    }
    return out


@router.get("/supported-sources")
async def supported_sources():
    """List of currently supported listing platforms (Phase C.1)."""
    return {
        "sources": [
            {"id": "mobile.de",        "name": "mobile.de",      "country": "DE", "active": True, "fidelity": "high"},
            {"id": "autoscout24",      "name": "AutoScout24",    "country": "EU", "active": True, "fidelity": "medium"},
            {"id": "kleinanzeigen.de", "name": "Kleinanzeigen",  "country": "DE", "active": True, "fidelity": "medium"},
            {"id": "heycar",           "name": "heycar",         "country": "DE", "active": True, "fidelity": "low"},
            {"id": "pkw.de",           "name": "PKW.de",         "country": "DE", "active": True, "fidelity": "low"},
            {"id": "otomoto.pl",       "name": "Otomoto",        "country": "PL", "active": True, "fidelity": "low"},
            {"id": "leboncoin.fr",     "name": "Leboncoin",      "country": "FR", "active": True, "fidelity": "low"},
            {"id": "willhaben.at",     "name": "Willhaben",      "country": "AT", "active": True, "fidelity": "low"},
            {"id": "marktplaats.nl",   "name": "Marktplaats",    "country": "NL", "active": True, "fidelity": "low"},
            {"id": "lacentrale.fr",    "name": "LaCentrale",     "country": "FR", "active": True, "fidelity": "low"},
            {"id": "subito.it",        "name": "Subito",         "country": "IT", "active": True, "fidelity": "low"},
            {"id": "generic",          "name": "Other / dealer", "country": "ANY","active": True, "fidelity": "best-effort"},
        ]
    }
