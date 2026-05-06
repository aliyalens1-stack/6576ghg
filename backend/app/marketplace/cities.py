"""
Stage 2 — Geo + Search.
Cities catalogue + city filter for organizations.

- Catalogue static (Berlin, Munich, Hamburg, Kyiv, Lviv, Odesa).
- Each city has center coordinates → frontend uses them for `/marketplace/providers?lat=&lng=`.
- Extends existing `/api/marketplace/providers` via `?city=` filter (handled here as override).
- Migrates existing orgs by inferring city from address/coords on first call.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from server import db  # shared Motor handle
from app.core.redis_state import rate_limit_public  # public RL dep

router = APIRouter(tags=["geo"])


class City(BaseModel):
    code: str          # short id used in URLs and AsyncStorage
    name: str          # display name (i18n done client-side)
    country: str       # ISO-2 country code
    lat: float
    lng: float
    timezone: str
    currency: str      # display currency hint
    providersCount: int = 0
    aliases: List[str] = []  # alternative spellings for search (Munich/Muenchen/München)


# Static catalogue. Adding more = just append + re-deploy.
# Phase 3.0b P0-2 — DACH expansion: 20 German cities (Tier 1+2) for funnel coverage.
# UA cities kept for legacy compat but de-prioritised in client UI (sort by country).
CITY_CATALOGUE: List[dict] = [
    # ── DE Tier 1 (top 4 metros) ──────────────────────────────────────────
    {"code": "berlin",    "name": "Berlin",          "country": "DE", "lat": 52.5200, "lng": 13.4050, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Berlin"]},
    {"code": "hamburg",   "name": "Hamburg",         "country": "DE", "lat": 53.5511, "lng":  9.9937, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Hamburg"]},
    {"code": "munich",    "name": "München",         "country": "DE", "lat": 48.1351, "lng": 11.5820, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["München", "Munich", "Muenchen"]},
    {"code": "cologne",   "name": "Köln",            "country": "DE", "lat": 50.9375, "lng":  6.9603, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Köln", "Koeln", "Cologne"]},
    # ── DE Tier 2 (next 16) ───────────────────────────────────────────────
    {"code": "frankfurt", "name": "Frankfurt am Main","country": "DE", "lat": 50.1109, "lng":  8.6821, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Frankfurt am Main", "Frankfurt"]},
    {"code": "stuttgart", "name": "Stuttgart",       "country": "DE", "lat": 48.7758, "lng":  9.1829, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Stuttgart"]},
    {"code": "dusseldorf","name": "Düsseldorf",      "country": "DE", "lat": 51.2277, "lng":  6.7735, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Düsseldorf", "Duesseldorf", "Dusseldorf"]},
    {"code": "leipzig",   "name": "Leipzig",         "country": "DE", "lat": 51.3397, "lng": 12.3731, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Leipzig"]},
    {"code": "dortmund",  "name": "Dortmund",        "country": "DE", "lat": 51.5136, "lng":  7.4653, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Dortmund"]},
    {"code": "essen",     "name": "Essen",           "country": "DE", "lat": 51.4556, "lng":  7.0116, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Essen"]},
    {"code": "bremen",    "name": "Bremen",          "country": "DE", "lat": 53.0793, "lng":  8.8017, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Bremen"]},
    {"code": "dresden",   "name": "Dresden",         "country": "DE", "lat": 51.0504, "lng": 13.7373, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Dresden"]},
    {"code": "hannover",  "name": "Hannover",        "country": "DE", "lat": 52.3759, "lng":  9.7320, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Hannover", "Hanover"]},
    {"code": "nuremberg", "name": "Nürnberg",        "country": "DE", "lat": 49.4521, "lng": 11.0767, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Nürnberg", "Nuremberg", "Nuernberg"]},
    {"code": "duisburg",  "name": "Duisburg",        "country": "DE", "lat": 51.4344, "lng":  6.7623, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Duisburg"]},
    {"code": "bochum",    "name": "Bochum",          "country": "DE", "lat": 51.4818, "lng":  7.2162, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Bochum"]},
    {"code": "wuppertal", "name": "Wuppertal",       "country": "DE", "lat": 51.2562, "lng":  7.1508, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Wuppertal"]},
    {"code": "bielefeld", "name": "Bielefeld",       "country": "DE", "lat": 52.0302, "lng":  8.5325, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Bielefeld"]},
    {"code": "bonn",      "name": "Bonn",            "country": "DE", "lat": 50.7374, "lng":  7.0982, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Bonn"]},
    {"code": "muenster",  "name": "Münster",         "country": "DE", "lat": 51.9607, "lng":  7.6261, "timezone": "Europe/Berlin", "currency": "EUR", "addressMarkers": ["Münster", "Muenster"]},
    # ── AT (Austria) — neighbouring EU ────────────────────────────────────
    {"code": "vienna",    "name": "Wien",            "country": "AT", "lat": 48.2082, "lng": 16.3738, "timezone": "Europe/Vienna", "currency": "EUR", "addressMarkers": ["Wien", "Vienna"]},
    {"code": "salzburg",  "name": "Salzburg",        "country": "AT", "lat": 47.8095, "lng": 13.0550, "timezone": "Europe/Vienna", "currency": "EUR", "addressMarkers": ["Salzburg"]},
    # ── UA (legacy, low priority) ─────────────────────────────────────────
    {"code": "kyiv",      "name": "Київ",            "country": "UA", "lat": 50.4501, "lng": 30.5234, "timezone": "Europe/Kyiv",   "currency": "UAH", "addressMarkers": ["Київ", "Киев", "Kyiv"]},
    {"code": "lviv",      "name": "Львів",           "country": "UA", "lat": 49.8397, "lng": 24.0297, "timezone": "Europe/Kyiv",   "currency": "UAH", "addressMarkers": ["Львів", "Львов", "Lviv"]},
    {"code": "odesa",     "name": "Одеса",           "country": "UA", "lat": 46.4825, "lng": 30.7233, "timezone": "Europe/Kyiv",   "currency": "UAH", "addressMarkers": ["Одеса", "Одесса", "Odesa"]},
]


def _infer_city(org: dict) -> Optional[str]:
    """Derive city code for an org based on address substring or proximity to a known centre."""
    address = (org.get("address") or "").lower()
    for c in CITY_CATALOGUE:
        for marker in c["addressMarkers"]:
            if marker.lower() in address:
                return c["code"]
    # fallback: nearest center by lat/lng
    loc = org.get("location") or {}
    coords = loc.get("coordinates") or []
    if len(coords) == 2:
        lng, lat = coords
        nearest = None
        nearest_d = 1e9
        for c in CITY_CATALOGUE:
            d = (c["lat"] - lat) ** 2 + (c["lng"] - lng) ** 2
            if d < nearest_d:
                nearest_d = d
                nearest = c["code"]
        return nearest
    return None


async def _ensure_city_field() -> None:
    """One-shot migration: tag every org with a `city` if missing."""
    cursor = db.organizations.find({"$or": [{"city": None}, {"city": {"$exists": False}}]}, {"_id": 1, "address": 1, "location": 1})
    async for doc in cursor:
        code = _infer_city(doc)
        if code:
            await db.organizations.update_one({"_id": doc["_id"]}, {"$set": {"city": code}})


@router.get("/api/cities", response_model=List[City])
async def list_cities(_=Depends(rate_limit_public)):
    """List supported cities with provider counts."""
    await _ensure_city_field()

    # Aggregate counts per city in one round-trip
    counts = {}
    pipeline = [{"$match": {"status": "active"}}, {"$group": {"_id": "$city", "n": {"$sum": 1}}}]
    async for r in db.organizations.aggregate(pipeline):
        if r["_id"]:
            counts[r["_id"]] = r["n"]

    return [
        City(
            code=c["code"], name=c["name"], country=c["country"],
            lat=c["lat"], lng=c["lng"], timezone=c["timezone"],
            currency=c["currency"], providersCount=counts.get(c["code"], 0),
            aliases=c.get("addressMarkers", []),
        )
        for c in CITY_CATALOGUE
    ]


@router.get("/api/cities/{code}", response_model=City)
async def get_city(code: str, _=Depends(rate_limit_public)):
    await _ensure_city_field()
    c = next((x for x in CITY_CATALOGUE if x["code"] == code), None)
    if not c:
        from fastapi import HTTPException
        raise HTTPException(404, f"city '{code}' not found")
    n = await db.organizations.count_documents({"status": "active", "city": code})
    return City(
        code=c["code"], name=c["name"], country=c["country"],
        lat=c["lat"], lng=c["lng"], timezone=c["timezone"],
        currency=c["currency"], providersCount=n,
        aliases=c.get("addressMarkers", []),
    )
