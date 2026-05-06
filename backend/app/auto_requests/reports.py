"""Sprint 4 — Inspection Reports + Job Lifecycle service.

Lifecycle: claimed → on_route → arrived → inspecting → done
                                                     ↓
                                                 (report submit)

Credit consumption: ONLY on report submit (anti-fraud).
Cancel: claimed/on_route/arrived/inspecting → released back to "open".
"""
from __future__ import annotations
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Any

from app.core.db import get_db
from app.auto_requests.schemas import SubmitReportRequest, ReportOut
from app.auto_requests.checklist import CHECKLIST

logger = logging.getLogger(__name__)


# Lifecycle gating: who can transition into a status, from which states.
# Empty list means terminal in this direction for inspector.
_INSPECTOR_TRANSITIONS = {
    "on_route":   {"from": ["claimed"]},
    "arrived":    {"from": ["on_route"]},
    "inspecting": {"from": ["arrived"]},
}

# Statuses from which inspector can cancel and release the job back to "open".
_CANCELLABLE_BY_INSPECTOR = {"claimed", "on_route", "arrived", "inspecting"}


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(v: Any) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.isoformat()
    return str(v)


def _scrub(doc: dict) -> dict:
    """Convert a Mongo doc to a JSON-safe dict (drop _id, isoformat datetimes)."""
    if not doc:
        return {}
    out = dict(doc)
    out.pop("_id", None)
    for k, v in list(out.items()):
        if isinstance(v, datetime):
            out[k] = v.isoformat()
    return out


def _job_to_dict(doc: dict) -> dict:
    """Job projection for inspector/customer screens (lifecycle-aware)."""
    return {
        "id": str(doc.get("_id", "")),
        "requestId": str(doc.get("requestId", "")),
        "city": doc.get("city", ""),
        "inspectorId": doc.get("inspectorId"),
        "status": doc.get("status", "open"),
        "brand": doc.get("brand", ""),
        "model": doc.get("model", ""),
        "budget": int(doc.get("budget", 0)),
        "createdAt": _iso(doc.get("createdAt")),
        "claimedAt": _iso(doc.get("claimedAt")),
        "onRouteAt": _iso(doc.get("onRouteAt")),
        "arrivedAt": _iso(doc.get("arrivedAt")),
        "inspectionStartedAt": _iso(doc.get("inspectionStartedAt")),
        "completedAt": _iso(doc.get("completedAt")),
        "canceledAt": _iso(doc.get("canceledAt")),
        "reportId": doc.get("reportId"),
    }


def _report_to_out(doc: dict) -> ReportOut:
    return ReportOut(
        id=str(doc.get("_id", "")),
        jobId=str(doc.get("jobId", "")),
        requestId=str(doc.get("requestId", "")),
        inspectorId=str(doc.get("inspectorId", "")),
        city=doc.get("city", ""),
        brand=doc.get("brand", ""),
        model=doc.get("model", ""),
        score=float(doc.get("score", 0.0)),
        verdict=doc.get("verdict", ""),
        checklist=list(doc.get("checklist", []) or []),
        issues=list(doc.get("issues", []) or []),
        summary=doc.get("summary", ""),
        repairEstimateMin=doc.get("repairEstimateMin"),
        repairEstimateMax=doc.get("repairEstimateMax"),
        status=doc.get("status", "submitted"),
        rejectReason=doc.get("rejectReason"),
        createdAt=_iso(doc.get("createdAt")) or "",
        approvedAt=_iso(doc.get("approvedAt")),
    )


# ──────────────────────────────────────────────────────────────────────
# Lifecycle
# ──────────────────────────────────────────────────────────────────────

async def transition_status(
    job_id: str, inspector_id: str, target_status: str
) -> Tuple[Optional[dict], Optional[str]]:
    """Atomic inspector-driven lifecycle transition.

    Returns (job_dict, error_or_None). Error is a short reason if the
    transition is invalid (404 / 409).
    """
    rule = _INSPECTOR_TRANSITIONS.get(target_status)
    if not rule:
        return None, "unknown_target_status"
    db = get_db()
    now = _now()

    timestamp_field = {
        "on_route": "onRouteAt",
        "arrived": "arrivedAt",
        "inspecting": "inspectionStartedAt",
    }[target_status]

    res = await db.inspection_jobs.find_one_and_update(
        {
            "_id": job_id,
            "inspectorId": inspector_id,
            "status": {"$in": rule["from"]},
        },
        {"$set": {"status": target_status, timestamp_field: now}},
        return_document=True,
    )
    if not res:
        # Diagnose: 404 vs ownership vs wrong status
        existing = await db.inspection_jobs.find_one({"_id": job_id})
        if not existing:
            return None, "job_not_found"
        if existing.get("inspectorId") != inspector_id:
            return None, "not_your_job"
        return None, f"invalid_status:{existing.get('status')}"
    return _job_to_dict(res), None


async def cancel_by_inspector(
    job_id: str, inspector_id: str, reason: Optional[str] = None
) -> Tuple[Optional[dict], Optional[str]]:
    """Inspector cancels — job is released back to `open`. Credits stay reserved."""
    db = get_db()
    now = _now()
    job = await db.inspection_jobs.find_one(
        {"_id": job_id, "inspectorId": inspector_id}
    )
    if not job:
        return None, "job_not_found_or_not_yours"
    if job.get("status") not in _CANCELLABLE_BY_INSPECTOR:
        return None, f"not_cancellable:{job.get('status')}"

    # Release: remove inspector and reset status to "open" — credits stay reserved
    await db.inspection_jobs.update_one(
        {"_id": job_id},
        {
            "$set": {
                "status": "open",
                "inspectorId": None,
                "canceledAt": now,
                "lastCancelReason": (reason or "")[:500],
            },
            "$unset": {
                "claimedAt": "",
                "onRouteAt": "",
                "arrivedAt": "",
                "inspectionStartedAt": "",
            },
        },
    )
    # Decrement parent counters (this job is back to open)
    if job.get("status") == "claimed" or job.get("status") in {"on_route", "arrived", "inspecting"}:
        await db.car_requests.update_one(
            {"_id": job["requestId"]},
            {"$inc": {"jobsClaimed": -1}, "$set": {"updatedAt": now}},
        )
    fresh = await db.inspection_jobs.find_one({"_id": job_id})
    return _job_to_dict(fresh) if fresh else None, None


# ──────────────────────────────────────────────────────────────────────
# Report submission (CRITICAL — credit consume happens here)
# ──────────────────────────────────────────────────────────────────────

async def submit_report(
    job_id: str, inspector_id: str, payload: SubmitReportRequest
) -> Tuple[Optional[dict], Optional[str]]:
    """Submit report → close job → consume customer's credit (only here).

    Returns (report_dict, error_or_None).
    """
    from app.packages import service as credits_svc
    # Lazy import to avoid circular dep with chat router
    try:
        from app.chat.router import push_notification  # type: ignore
    except Exception:
        push_notification = None  # type: ignore

    db = get_db()
    now = _now()

    job = await db.inspection_jobs.find_one({"_id": job_id})
    if not job:
        return None, "job_not_found"
    if job.get("inspectorId") != inspector_id:
        return None, "not_your_job"
    if job.get("status") != "inspecting":
        return None, f"job_not_in_inspecting:{job.get('status')}"
    if job.get("reportId"):
        return None, "report_already_submitted"

    # Derive customer-facing summary fields (P1 — report = decision):
    #   • riskLevel: low/medium/high derived from verdict + score
    #   • topProblems: up to 3 checklist items flagged as 'problem'
    verdict = payload.verdict
    risk_level = (
        "high"   if verdict == "not_recommended" or float(payload.score) < 5
        else "medium" if verdict == "risky" or float(payload.score) < 7.5
        else "low"
    )
    top_problems = []
    for it in payload.checklist:
        if it.status == "problem" and len(top_problems) < 3:
            top_problems.append({
                "key": it.key,
                "comment": (it.comment or "").strip()[:140] or None,
            })

    # Build report document
    report_id = str(uuid.uuid4())
    report_doc = {
        "_id": report_id,
        "jobId": job_id,
        "requestId": job["requestId"],
        "inspectorId": inspector_id,
        "city": job.get("city", ""),
        "brand": job.get("brand", ""),
        "model": job.get("model", ""),
        "score": float(payload.score),
        "verdict": payload.verdict,
        "riskLevel": risk_level,
        "topProblems": top_problems,
        "checklist": [it.model_dump() for it in payload.checklist],
        "issues": [it.model_dump() for it in payload.issues],
        "summary": payload.summary,
        "repairEstimateMin": payload.repairEstimateMin,
        "repairEstimateMax": payload.repairEstimateMax,
        "status": "submitted",
        "rejectReason": None,
        "createdAt": now,
        "approvedAt": None,
    }
    await db.inspection_reports.insert_one(report_doc)

    # Close job atomically
    upd = await db.inspection_jobs.update_one(
        {"_id": job_id, "status": "inspecting", "reportId": None},
        {"$set": {"status": "done", "completedAt": now, "reportId": report_id}},
    )
    if upd.modified_count != 1:
        # Race: rollback the report we just inserted
        await db.inspection_reports.delete_one({"_id": report_id})
        return None, "race_condition_retry"

    # Bump request counters
    await db.car_requests.update_one(
        {"_id": job["requestId"]},
        {"$inc": {"jobsClaimed": -1, "jobsDone": +1}, "$set": {"updatedAt": now}},
    )

    # CRITICAL — consume customer credit ONLY now (post report submit)
    req = await db.car_requests.find_one({"_id": job["requestId"]})
    customer_id = (req or {}).get("userId")
    if customer_id:
        try:
            await credits_svc.consume_credit(customer_id, job_id=job_id, request_id=req["_id"])
        except Exception as exc:
            logger.exception("Failed to consume credit for job %s: %s", job_id, exc)

    # Mark request status based on completion progress.
    # `req` was re-fetched AFTER `$inc jobsDone:+1` above, so `jobsDone`
    # already reflects this submission — do NOT add another +1.
    #   - all jobs done  → completed
    #   - some jobs done → report_ready (at least one report available)
    if req:
        jobs_done = int(req.get("jobsDone", 0))
        jobs_total = int(req.get("jobsTotal", 0))
        if jobs_total > 0 and jobs_done >= jobs_total:
            await db.car_requests.update_one(
                {"_id": req["_id"]},
                {"$set": {"status": "completed", "updatedAt": now}},
            )
        elif jobs_done > 0 and req.get("status") not in {"completed", "cancelled", "report_ready"}:
            await db.car_requests.update_one(
                {"_id": req["_id"]},
                {"$set": {"status": "report_ready", "updatedAt": now}},
            )

    # P1 — Inspector rating: recompute ratingAvg + reviewsCount on-the-fly
    # so the home dashboard reflects the new report immediately.
    # Note: inspectorId may be either a user _id (string from ObjectId) for
    # individual providers, OR an organization _id (UUID). We update BOTH
    # collections — whichever exists wins.
    try:
        agg = await db.inspection_reports.aggregate([
            {"$match": {"inspectorId": inspector_id, "status": {"$in": ["submitted", "approved"]}}},
            {"$group": {"_id": "$inspectorId", "avg": {"$avg": "$score"}, "n": {"$sum": 1}}},
        ]).to_list(1)
        if agg:
            r = agg[0]
            patch = {
                "ratingAvg": round(float(r["avg"]) / 2.0, 2),  # 0-10 score → 0-5 stars
                "reviewsCount": int(r["n"]),
                "completedJobs": int(r["n"]),
                "ratingUpdatedAt": now,
            }
            # Try organization (UUID-keyed) first
            await db.organizations.update_one({"_id": inspector_id}, {"$set": patch}, upsert=False)
            # Also update the user doc (ObjectId-keyed). Convert if it's a hex string.
            try:
                from bson import ObjectId
                user_oid = ObjectId(inspector_id) if len(inspector_id) == 24 else inspector_id
                await db.users.update_one({"_id": user_oid}, {"$set": patch}, upsert=False)
            except Exception:
                await db.users.update_one({"_id": inspector_id}, {"$set": patch}, upsert=False)
    except Exception as exc:
        logger.exception("Failed to recompute inspector rating for %s: %s", inspector_id, exc)

    # Notify customer
    if push_notification and customer_id:
        try:
            brand = job.get("brand", "")
            model = job.get("model", "")
            city = job.get("city", "")
            await push_notification(
                customer_id,
                "report_ready",
                "Inspection report ready",
                f"{brand} {model} in {city} — score {payload.score:.1f} · {payload.verdict}",
                action_url=f"/dashboard/reports/{report_id}",
            )
        except Exception as exc:
            logger.warning("push_notification failed: %s", exc)

    return _scrub({**report_doc, "id": report_id}), None


# ──────────────────────────────────────────────────────────────────────
# Read APIs
# ──────────────────────────────────────────────────────────────────────

async def get_report(report_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.inspection_reports.find_one({"_id": report_id})
    if not doc:
        return None
    out = _scrub({**doc, "id": str(doc["_id"])})
    # Attach media metadata (no payload) for one-shot client consumption
    cursor = db.inspection_media.find({"reportId": report_id}, {"dataBase64": 0}).sort("createdAt", 1)
    media_docs = await cursor.to_list(200)
    out["media"] = [
        {
            "id": str(m["_id"]),
            "type": m.get("type"),
            "mimeType": m.get("mimeType"),
            "sizeBytes": int(m.get("sizeBytes", 0)),
            "url": f"/api/media/{m['_id']}",
            "createdAt": m.get("createdAt").isoformat() if isinstance(m.get("createdAt"), datetime) else m.get("createdAt"),
        }
        for m in media_docs
    ]
    return out


async def list_reports_for_request(request_id: str) -> List[dict]:
    db = get_db()
    cursor = db.inspection_reports.find({"requestId": request_id}).sort("createdAt", -1)
    docs = await cursor.to_list(50)
    return [_scrub({**d, "id": str(d["_id"])}) for d in docs]


async def list_reports_for_customer(user_id: str) -> List[dict]:
    """All reports across user's car_requests."""
    db = get_db()
    req_ids = [r["_id"] async for r in db.car_requests.find({"userId": user_id}, {"_id": 1})]
    if not req_ids:
        return []
    cursor = db.inspection_reports.find({"requestId": {"$in": req_ids}}).sort("createdAt", -1)
    docs = await cursor.to_list(200)
    return [_scrub({**d, "id": str(d["_id"])}) for d in docs]


async def list_all_reports(
    status: Optional[str] = None,
    city: Optional[str] = None,
    inspector_id: Optional[str] = None,
    limit: int = 200,
) -> List[dict]:
    db = get_db()
    q: dict = {}
    if status:
        q["status"] = status
    if city:
        q["city"] = city
    if inspector_id:
        q["inspectorId"] = inspector_id
    cursor = db.inspection_reports.find(q).sort("createdAt", -1).limit(limit)
    docs = await cursor.to_list(limit)
    return [_scrub({**d, "id": str(d["_id"])}) for d in docs]


# ──────────────────────────────────────────────────────────────────────
# Admin moderation
# ──────────────────────────────────────────────────────────────────────

async def admin_set_report_status(
    report_id: str, status: str, reason: Optional[str] = None
) -> Optional[dict]:
    db = get_db()
    update: dict = {"status": status}
    if status == "approved":
        update["approvedAt"] = _now()
        update["rejectReason"] = None
    elif status == "rejected":
        update["rejectReason"] = (reason or "")[:1000]
        update["approvedAt"] = None
    res = await db.inspection_reports.find_one_and_update(
        {"_id": report_id},
        {"$set": update},
        return_document=True,
    )
    if not res:
        return None
    return _scrub({**res, "id": str(res["_id"])})


# ──────────────────────────────────────────────────────────────────────
# Inspector queries (lifecycle-aware listings)
# ──────────────────────────────────────────────────────────────────────

async def list_my_jobs_full(inspector_id: str) -> List[dict]:
    """Full lifecycle data for inspector's My Jobs screen."""
    db = get_db()
    cursor = db.inspection_jobs.find({"inspectorId": inspector_id}).sort("createdAt", -1)
    docs = await cursor.to_list(200)
    return [_job_to_dict(d) for d in docs]


async def get_job_full(job_id: str, inspector_id: str) -> Tuple[Optional[dict], Optional[str]]:
    db = get_db()
    doc = await db.inspection_jobs.find_one({"_id": job_id})
    if not doc:
        return None, "job_not_found"
    if doc.get("inspectorId") and doc["inspectorId"] != inspector_id:
        # An inspector can also view an open job (no owner yet) before claim
        if doc.get("status") != "open":
            return None, "not_your_job"
    return _job_to_dict(doc), None
