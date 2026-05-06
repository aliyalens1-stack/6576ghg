"""app.core.geo — геометрические утилиты.

Sprint 21 C9: вынос haversine + resolve_zone из server.py — были нужны
quick_request модулю. Pure-functional, без side-effects, без БД, без ctx.

Реализация 1-в-1 с server.py. 15+ usages в server.py будут резолвиться через
импорт `from app.core.geo import haversine, resolve_zone`.
"""
from __future__ import annotations
import math


def haversine(lat1, lon1, lat2, lon2):
    """Great-circle distance (km) between two (lat,lng) points."""
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return R * 2 * math.asin(math.sqrt(a))


# Phase B / Sprint 9: simple bounding-box fallback zone resolution.
# Более точный polygon $geoIntersects живёт в NestJS — эта функция — быстрый
# lookup без обращения к БД, используется в sync hot-paths.
_ZONE_BOUNDS = {
    "kyiv-center":    (50.44, 50.46, 30.49, 30.55),
    "kyiv-podil":     (50.46, 50.48, 30.49, 30.54),
    "kyiv-obolon":    (50.48, 50.53, 30.46, 30.52),
    "kyiv-pechersk":  (50.42, 50.45, 30.52, 30.58),
    "kyiv-sviatoshyn": (50.44, 50.48, 30.34, 30.40),
    "kyiv-darnytsia": (50.41, 50.45, 30.58, 30.65),
    # Sprint 33 C6 — Germany zones (Europe rollout)
    "berlin-mitte":    (52.49, 52.55, 13.36, 13.45),
    "berlin-neukolln": (52.46, 52.50, 13.40, 13.48),
    "munich-zentrum":  (48.10, 48.17, 11.53, 11.63),
    "hamburg-altona":  (53.52, 53.59, 9.93, 10.06),
}


def resolve_zone(lat: float, lng: float) -> str:
    """Simple point-in-bounding-box zone resolution.

    Sprint 33 C6: covers Kyiv (UA) + Berlin/Munich/Hamburg (DE). Falls back
    to `kyiv-center` if no bbox matches (legacy default).
    """
    for zid, (lat_min, lat_max, lng_min, lng_max) in _ZONE_BOUNDS.items():
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return zid
    return "kyiv-center"
