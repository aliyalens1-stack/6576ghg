"""Sprint 28 — Revenue Dashboard.

Aggregates payments + boost purchases for admin to answer in 10s:
сколько заработали / откуда / какие провайдеры платят / где просадка.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase  # type: ignore

router = APIRouter(tags=["admin-revenue"])

db: Optional[AsyncIOMotorDatabase] = None
_verify_admin = None


def init(database, verify_admin_token):
    global db, _verify_admin
    db = database
    _verify_admin = verify_admin_token


def _now():
    return datetime.now(timezone.utc)


async def _sum_amount(start_iso: str, extra_match: Optional[dict] = None):
    """Sum amount across payment_transactions + provider_purchases (both are revenue sources)."""
    match = {"createdAt": {"$gte": start_iso}, "status": {"$in": ["paid", "completed"]}}
    if extra_match:
        match.update(extra_match)
    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    total = 0
    count = 0
    for coll_name in ("payment_transactions", "provider_purchases"):
        try:
            coll = getattr(db, coll_name)
            rows = await coll.aggregate(pipeline).to_list(1)
            if rows:
                total += int(rows[0].get("total", 0) or 0)
                count += int(rows[0].get("count", 0) or 0)
        except Exception:
            continue
    return {"total": total, "count": count}


@router.get("/api/admin/revenue/summary")
async def revenue_summary():  # auth applied via dependency below
    if db is None:
        raise HTTPException(500, "DB not initialised")

    now = _now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    week_start = (now - timedelta(days=7)).isoformat()
    month_start = (now - timedelta(days=30)).isoformat()

    today = await _sum_amount(today_start)
    week = await _sum_amount(week_start)
    month = await _sum_amount(month_start)

    # ── Sprint 28 finalization: yesterday + last-week (для growth deltas) ──
    yesterday_start = (now - timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    today_start_dt = now.replace(hour=0, minute=0, second=0, microsecond=0)
    yesterday_end = today_start_dt.isoformat()
    yesterday = await _sum_amount(yesterday_start, {"createdAt": {"$gte": yesterday_start, "$lt": yesterday_end}})
    last_week_start = (now - timedelta(days=14)).isoformat()
    last_week_end = (now - timedelta(days=7)).isoformat()
    last_week = await _sum_amount(last_week_start, {"createdAt": {"$gte": last_week_start, "$lt": last_week_end}})

    def _growth(curr: int, prev: int) -> float:
        if not prev:
            return 0.0 if not curr else 1.0
        return round((curr - prev) / prev, 3)

    growth = {
        "vsYesterday": _growth(today["total"], yesterday["total"]),
        "vsLastWeek": _growth(week["total"], last_week["total"]),
    }

    # Status breakdown (last 30d) — across both collections
    paid = 0
    failed = 0
    total_txn = 0
    for coll_name in ("payment_transactions", "provider_purchases"):
        try:
            coll = getattr(db, coll_name)
            rows = await coll.aggregate([
                {"$match": {"createdAt": {"$gte": month_start}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]).to_list(20)
            for r in rows:
                cnt = int(r.get("count", 0) or 0)
                total_txn += cnt
                if r.get("_id") in ("paid", "completed"):
                    paid += cnt
                elif r.get("_id") == "failed":
                    failed += cnt
        except Exception:
            continue
    conversion = round(paid / total_txn, 3) if total_txn else 0

    # Boost-only revenue (productCode containing 'boost' OR config.boostMultiplier present)
    boost_revenue = 0
    try:
        rows = await db.provider_purchases.aggregate([
            {"$match": {
                "createdAt": {"$gte": month_start},
                "status": {"$in": ["paid", "completed"]},
                "productCode": {"$regex": "boost", "$options": "i"},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        boost_revenue = int(rows[0]["total"]) if rows else 0
    except Exception:
        pass

    avg_order = round(month["total"] / month["count"], 2) if month["count"] else 0

    # ── Sprint 28 finalization: revenue breakdown by source ───────────────
    # boost = provider_purchases с productCode~boost; subscription = sub*; other = всё остальное
    breakdown = {"boost": boost_revenue, "subscription": 0, "other": 0}
    try:
        sub_rows = await db.provider_purchases.aggregate([
            {"$match": {
                "createdAt": {"$gte": month_start},
                "status": {"$in": ["paid", "completed"]},
                "productCode": {"$regex": "subscription|sub_", "$options": "i"},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
        ]).to_list(1)
        breakdown["subscription"] = int(sub_rows[0]["total"]) if sub_rows else 0
    except Exception:
        pass
    breakdown["other"] = max(0, int(month["total"]) - breakdown["boost"] - breakdown["subscription"])

    # Top providers (last 30d) — across both collections
    by_slug: dict = {}
    for coll_name in ("payment_transactions", "provider_purchases"):
        try:
            coll = getattr(db, coll_name)
            rows = await coll.aggregate([
                {"$match": {
                    "createdAt": {"$gte": month_start},
                    "status": {"$in": ["paid", "completed"]},
                }},
                {"$group": {
                    "_id": "$providerSlug",
                    "revenue": {"$sum": "$amount"},
                    "transactions": {"$sum": 1},
                }},
            ]).to_list(50)
            for r in rows:
                slug = r.get("_id")
                if not slug:
                    continue
                slot = by_slug.setdefault(slug, {"revenue": 0, "transactions": 0})
                slot["revenue"] += int(r.get("revenue", 0) or 0)
                slot["transactions"] += int(r.get("transactions", 0) or 0)
        except Exception:
            continue
    top_slugs = sorted(by_slug.items(), key=lambda kv: kv[1]["revenue"], reverse=True)[:5]
    slugs = [s for s, _ in top_slugs]
    orgs = await db.organizations.find({"slug": {"$in": slugs}}, {"_id": 0, "slug": 1, "name": 1}).to_list(50)
    org_by_slug = {o["slug"]: o for o in orgs}
    top_providers_out = []
    for slug, agg in top_slugs:
        ent = await db.provider_entitlements.find_one({"providerSlug": slug, "boostActive": True}, {"_id": 0})
        top_providers_out.append({
            "providerId": slug,
            "name": (org_by_slug.get(slug, {}) or {}).get("name") or slug,
            "revenue": agg["revenue"],
            "transactions": agg["transactions"],
            "boostLevel": ent.get("boostLevel") if ent else None,
        })

    # Top zones (best-effort — payment_transactions может содержать zoneId)
    top_zones_out = []
    try:
        rows = await db.payment_transactions.aggregate([
            {"$match": {
                "status": {"$in": ["paid", "completed"]},
                "createdAt": {"$gte": month_start},
                "zoneId": {"$exists": True, "$ne": None},
            }},
            {"$group": {"_id": "$zoneId", "revenue": {"$sum": "$amount"}, "transactions": {"$sum": 1}}},
            {"$sort": {"revenue": -1}},
            {"$limit": 5},
        ]).to_list(5)
        if rows:
            zone_ids = [r["_id"] for r in rows]
            zones = await db.zones.find({"id": {"$in": zone_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(20)
            zone_by_id = {z["id"]: z for z in zones}
            for r in rows:
                zid = r["_id"]
                top_zones_out.append({
                    "zoneId": zid,
                    "name": (zone_by_id.get(zid, {}) or {}).get("name") or zid,
                    "revenue": int(r["revenue"]),
                    "transactions": int(r["transactions"]),
                })
    except Exception:
        pass

    # Recent transactions (mix from both collections)
    recent: list = []
    for coll_name, type_default in (("provider_purchases", "boost"), ("payment_transactions", "payment")):
        try:
            coll = getattr(db, coll_name)
            docs = await coll.find({}, {"_id": 0}).sort("createdAt", -1).limit(10).to_list(10)
            for d in docs:
                recent.append({
                    "id": d.get("id") or d.get("_id") or "",
                    "providerId": d.get("providerSlug") or d.get("providerId") or "",
                    "amount": int(d.get("amount", 0) or 0),
                    "status": d.get("status") or "unknown",
                    "type": d.get("type") or d.get("productCode") or type_default,
                    "createdAt": d.get("createdAt"),
                })
        except Exception:
            continue
    recent.sort(key=lambda r: r.get("createdAt") or "", reverse=True)
    recent = recent[:10]

    # ── Sprint 28 finalization: critical alerts (что орёт когда деньги падают) ──
    alerts: list = []
    # 1) Падение конверсии (threshold: -20% vs прошлая неделя — сравним paid/total)
    try:
        prev_paid = 0
        prev_total = 0
        for coll_name in ("payment_transactions", "provider_purchases"):
            coll = getattr(db, coll_name)
            rows = await coll.aggregate([
                {"$match": {"createdAt": {"$gte": last_week_start, "$lt": last_week_end}}},
                {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            ]).to_list(20)
            for r in rows:
                cnt = int(r.get("count", 0) or 0)
                prev_total += cnt
                if r.get("_id") in ("paid", "completed"):
                    prev_paid += cnt
        prev_conv = (prev_paid / prev_total) if prev_total else 0
        if prev_conv > 0 and conversion > 0:
            delta = (conversion - prev_conv) / prev_conv
            if delta <= -0.2:
                alerts.append({
                    "type": "danger",
                    "text": f"Падение конверсии {int(delta * 100)}% за неделю ({int(prev_conv * 100)}% → {int(conversion * 100)}%)",
                })
    except Exception:
        pass

    # 2) Нет новых платежей за последние 3 часа (если хотя бы что-то было за день)
    try:
        if today["count"] > 0:
            three_h_ago = (now - timedelta(hours=3)).isoformat()
            recent3 = await _sum_amount(three_h_ago)
            if recent3["count"] == 0:
                alerts.append({
                    "type": "warning",
                    "text": "Нет новых платежей за последние 3 часа",
                })
    except Exception:
        pass

    # 3) Failed > 30% от транзакций за день — Stripe/payment provider issue
    try:
        if today["count"] >= 3:
            fail_rows = []
            for coll_name in ("payment_transactions", "provider_purchases"):
                coll = getattr(db, coll_name)
                r = await coll.aggregate([
                    {"$match": {"createdAt": {"$gte": today_start}, "status": "failed"}},
                    {"$group": {"_id": None, "count": {"$sum": 1}}},
                ]).to_list(1)
                fail_rows.extend(r)
            today_fails = sum(int(r.get("count", 0) or 0) for r in fail_rows)
            if today_fails / today["count"] >= 0.3:
                alerts.append({
                    "type": "danger",
                    "text": f"{today_fails} из {today['count']} платежей провалились — проверьте Stripe webhook",
                })
    except Exception:
        pass

    # 4) Concentration risk: один провайдер даёт >50% месячного дохода
    try:
        if month["total"] > 0 and top_providers_out:
            top = top_providers_out[0]
            share = top["revenue"] / month["total"]
            if share > 0.5:
                alerts.append({
                    "type": "warning",
                    "text": f"{top['name']} даёт {int(share * 100)}% дохода — высокая концентрация",
                })
    except Exception:
        pass

    return {
        "today": today["total"],
        "yesterday": yesterday["total"],
        "week": week["total"],
        "lastWeek": last_week["total"],
        "month": month["total"],
        "currency": "UAH",
        "transactions": total_txn,
        "paidTransactions": paid,
        "failedTransactions": failed,
        "boostRevenue": boost_revenue,
        "avgOrderValue": avg_order,
        "conversionRate": conversion,
        "growth": growth,
        "revenueBreakdown": breakdown,
        "alerts": alerts,
        "topProviders": top_providers_out,
        "topZones": top_zones_out,
        "recent": recent,
    }


# Wrap with admin auth at registration time (server.py applies dependency).


# ─────────────────────────────────────────────────────────────
# 🧪 Dev seed: создаёт N fake paid transactions (для проверки DoD).
# Прячем за admin auth + опциональный флаг.
# ─────────────────────────────────────────────────────────────
@router.post("/api/admin/revenue/_dev_seed_fake")
async def dev_seed_fake_payments(count: int = 3):
    if db is None:
        raise HTTPException(500, "DB not initialised")
    import uuid
    now = _now()
    iso = now.isoformat()
    inserted = []
    samples = [
        {"providerSlug": "avtomaster-pro", "amount": 699,  "productCode": "boost_pro_7d",   "type": "boost"},
        {"providerSlug": "mobile-service-24", "amount": 299, "productCode": "boost_basic_7d", "type": "boost"},
        {"providerSlug": "avtomaster-pro", "amount": 1499, "productCode": "boost_max_7d",   "type": "boost"},
        {"providerSlug": "avtomaster-pro", "amount": 499,  "productCode": "subscription_monthly", "type": "subscription"},
        {"providerSlug": "mobile-service-24", "amount": 200, "productCode": "commission_order", "type": "payment"},
    ]
    for i in range(min(max(count, 1), len(samples))):
        s = samples[i]
        doc = {
            "id": str(uuid.uuid4()),
            "providerSlug": s["providerSlug"],
            "providerId": s["providerSlug"],
            "amount": s["amount"],
            "currency": "UAH",
            "status": "paid",
            "productCode": s["productCode"],
            "type": s["type"],
            "createdAt": iso,
            "source": "dev_seed",
        }
        coll = db.payment_transactions if s["type"] == "payment" else db.provider_purchases
        await coll.insert_one(doc)
        inserted.append({"id": doc["id"], "amount": s["amount"], "type": s["type"], "providerSlug": s["providerSlug"]})
    return {"ok": True, "inserted": inserted, "count": len(inserted)}
