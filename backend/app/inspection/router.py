"""app.inspection.router — POST /api/inspection/report/generate (B1)."""
from __future__ import annotations
from typing import Optional
import logging

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.parsers.mobile_de import parse_url as parse_mobile_de, estimate_market_avg
from app.inspection.report import build_report
from app.inspection.baselines import get_baseline

logger = logging.getLogger("inspection.router")
router = APIRouter(prefix="/api/inspection", tags=["inspection"])


class ReportRequest(BaseModel):
    # либо url (парсим на месте), либо manual (user fills in missing data)
    url: Optional[str] = Field(None, max_length=2048)
    price: Optional[int] = Field(None, ge=0, le=10_000_000)
    mileage: Optional[int] = Field(None, ge=0, le=2_000_000)
    year: Optional[int] = Field(None, ge=1950, le=2030)
    fuel: Optional[str] = Field(None, max_length=32)
    make: Optional[str] = Field(None, max_length=64)
    model: Optional[str] = Field(None, max_length=128)
    title: Optional[str] = Field(None, max_length=256)


@router.post("/report/generate")
async def generate_report(payload: ReportRequest, request: Request):
    """Generate inspection report from either a mobile.de URL or manual fields.

    Priority: explicit fields in payload override parsed values.
    """
    if not payload.url and not any([payload.price, payload.mileage, payload.year]):
        raise HTTPException(status_code=422, detail={
            "error": True, "code": "VALIDATION_ERROR",
            "message": "Provide either 'url' or at least one of price/mileage/year",
        })

    data: dict = {}
    parse_meta: dict = {"parsed": None, "error": None, "source": None}

    if payload.url:
        try:
            parsed = await parse_mobile_de(payload.url)
            data.update({k: parsed.get(k) for k in
                         ("title", "make", "model", "price", "mileage", "year",
                          "fuel", "currency", "image", "marketAvg", "source",
                          "sourceUrl", "listingId")})
            parse_meta = {"parsed": bool(parsed.get("parsed")),
                          "error": parsed.get("error"),
                          "source": parsed.get("source") or "mobile.de"}
        except Exception:
            logger.exception("parse_mobile_de failed inside /report/generate")
            parse_meta = {"parsed": False, "error": "parse_exception", "source": "mobile.de"}

    # manual overrides
    for fld in ("title", "make", "model", "price", "mileage", "year", "fuel"):
        v = getattr(payload, fld)
        if v is not None:
            data[fld] = v

    # Berlin Launch B1.1 — prefer model-aware baseline over coarse year-only
    model_avg, _key = get_baseline(data.get("make"), data.get("model"), data.get("year"))
    if model_avg:
        data["marketAvg"] = model_avg
    elif not data.get("marketAvg"):
        data["marketAvg"] = estimate_market_avg(data.get("year"))

    report = build_report(data)

    return {
        "report": report,
        "car": {
            "title": data.get("title"),
            "make": data.get("make"),
            "model": data.get("model"),
            "price": data.get("price"),
            "currency": data.get("currency") or "EUR",
            "mileage": data.get("mileage"),
            "year": data.get("year"),
            "fuel": data.get("fuel"),
            "image": data.get("image"),
            "marketAvg": data.get("marketAvg"),
            "source": data.get("source"),
            "sourceUrl": data.get("sourceUrl"),
            "listingId": data.get("listingId"),
        },
        "parseMeta": parse_meta,
        "pricing": {
            "inspectionFee": 149,
            "currency": "EUR",
            "deliveryHours": 24,
        },
    }
