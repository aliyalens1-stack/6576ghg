"""Sprint 6 · Job-scoped media (P0 inspector execution flow).

Stores media tied to inspection_job (not yet to report). Categories:
  exterior, interior, engine, documents, damage, odometer, vin, test_drive, other

Storage: base64 in Mongo (mirrors report-scoped media). Collection: inspection_job_media.
On report submission, these records can be linked via reportId reference.
"""
from __future__ import annotations
import base64
from datetime import datetime, timezone
from typing import Literal, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from app.auto_requests.auth import get_user_id_required
from app.core.db import get_db


CATEGORIES = {"exterior", "interior", "engine", "documents", "damage",
              "odometer", "vin", "test_drive", "other"}
ALLOWED_PHOTO_MIME = {"image/jpeg", "image/png", "image/webp", "image/heic"}
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm"}
PHOTO_MAX_BYTES = 8 * 1024 * 1024
VIDEO_MAX_BYTES = 25 * 1024 * 1024


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _meta(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "jobId": doc.get("jobId"),
        "requestId": doc.get("requestId"),
        "category": doc.get("category"),
        "type": doc.get("type"),
        "mimeType": doc.get("mimeType"),
        "sizeBytes": int(doc.get("sizeBytes", 0)),
        "url": f"/api/inspector/jobs/{doc.get('jobId')}/media/{doc['_id']}",
        "createdAt": (doc.get("createdAt").isoformat()
                      if isinstance(doc.get("createdAt"), datetime) else doc.get("createdAt")),
    }


router = APIRouter(prefix="/api/inspector/jobs", tags=["media:inspector_jobs"])
public_router = APIRouter(prefix="/api/inspector/jobs", tags=["media:inspector_jobs"])


class JobMediaUpload(BaseModel):
    type: Literal["photo", "video"]
    mimeType: str = Field(min_length=4, max_length=64)
    dataBase64: str = Field(min_length=10)
    category: str = Field(min_length=2, max_length=24)
    note: Optional[str] = Field(default=None, max_length=400)


@router.post("/{job_id}/media")
async def upload_job_media(
    job_id: str,
    payload: JobMediaUpload,
    uid: str = Depends(get_user_id_required),
):
    """Inspector uploads photo/video tied to a job + category."""
    db = get_db()
    job = await db.inspection_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(404, "job not found")
    if job.get("inspectorId") != uid:
        raise HTTPException(403, "not your job")
    if job.get("status") not in {"claimed", "on_route", "arrived", "inspecting"}:
        raise HTTPException(409, f"job not in active lifecycle (status: {job.get('status')})")

    cat = payload.category.lower().strip()
    if cat not in CATEGORIES:
        raise HTTPException(400, f"invalid category. allowed: {sorted(CATEGORIES)}")

    mime = payload.mimeType.lower().strip()
    if payload.type == "photo" and mime not in ALLOWED_PHOTO_MIME:
        raise HTTPException(400, f"photo mime not allowed: {mime}")
    if payload.type == "video" and mime not in ALLOWED_VIDEO_MIME:
        raise HTTPException(400, f"video mime not allowed: {mime}")

    try:
        raw = base64.b64decode(payload.dataBase64, validate=True)
    except Exception:
        raise HTTPException(400, "invalid base64")

    size = len(raw)
    cap = PHOTO_MAX_BYTES if payload.type == "photo" else VIDEO_MAX_BYTES
    if size > cap:
        raise HTTPException(413, f"file too large: {size} > {cap}")

    doc = {
        "_id": str(uuid.uuid4()),
        "jobId": job_id,
        "requestId": job.get("requestId"),
        "inspectorId": uid,
        "category": cat,
        "type": payload.type,
        "mimeType": mime,
        "sizeBytes": size,
        "dataBase64": payload.dataBase64,
        "note": payload.note,
        "createdAt": _now(),
    }
    await db.inspection_job_media.insert_one(doc)
    return {"status": "ok", "media": _meta(doc)}


@router.get("/{job_id}/media")
async def list_job_media(
    job_id: str,
    uid: str = Depends(get_user_id_required),
):
    """List all media for a job (inspector only — must own the job)."""
    db = get_db()
    job = await db.inspection_jobs.find_one({"_id": job_id})
    if not job:
        raise HTTPException(404, "job not found")
    if job.get("inspectorId") != uid:
        raise HTTPException(403, "not your job")

    cursor = db.inspection_job_media.find(
        {"jobId": job_id},
        {"dataBase64": 0},  # never return base64 in list
    ).sort("createdAt", -1)

    items = []
    by_category: dict[str, int] = {}
    photos = videos = 0
    async for doc in cursor:
        items.append(_meta(doc))
        by_category[doc.get("category", "other")] = by_category.get(doc.get("category", "other"), 0) + 1
        if doc.get("type") == "photo":
            photos += 1
        else:
            videos += 1

    return {
        "items": items,
        "stats": {
            "total": len(items),
            "photos": photos,
            "videos": videos,
            "byCategory": by_category,
        },
    }


@router.delete("/{job_id}/media/{media_id}")
async def delete_job_media(
    job_id: str,
    media_id: str,
    uid: str = Depends(get_user_id_required),
):
    db = get_db()
    res = await db.inspection_job_media.delete_one(
        {"_id": media_id, "jobId": job_id, "inspectorId": uid}
    )
    if res.deleted_count == 0:
        raise HTTPException(404, "media not found or not yours")
    return {"status": "ok"}


@public_router.get("/{job_id}/media/{media_id}")
async def get_job_media_blob(job_id: str, media_id: str):
    """Serve media bytes — used inside the app via <Image source uri>."""
    db = get_db()
    doc = await db.inspection_job_media.find_one({"_id": media_id, "jobId": job_id})
    if not doc:
        raise HTTPException(404, "not found")
    raw = base64.b64decode(doc["dataBase64"])
    return Response(content=raw, media_type=doc.get("mimeType", "application/octet-stream"))


__all__ = ["router", "public_router"]
