"""app.orchestrator.actions — Sprint 21 C13.

build_actions() + execute_action() — были в server.py. Логика 1-в-1.
"""
from __future__ import annotations
import logging
from typing import Optional

from app.core.db import db
from app.core.realtime import emit_realtime_event
from app.core.utils import now_utc, uid


logger = logging.getLogger("server")


def build_actions(zone: dict, rule: dict, override: Optional[dict] = None) -> list:
    """Build list of actions based on zone state, rule config, and optional override."""
    actions = []
    ov = override.get("overrides", {}) if override else {}

    # ── SURGE ──
    if rule.get("enableSurge") and not ov.get("disableSurge"):
        multiplier = ov.get("forceSurgeMultiplier") or rule.get("surgeMultiplier", 1.0)
        actions.append({
            "type": "ENABLE_SURGE",
            "payload": {"zoneId": zone["id"], "multiplier": multiplier},
            "status": "planned",
        })

    # ── PUSH PROVIDERS ──
    if (rule.get("enablePushProviders") and not ov.get("disablePushProviders")) or ov.get("forcePushProviders"):
        actions.append({
            "type": "PUSH_PROVIDERS",
            "payload": {"zoneId": zone["id"], "radiusKm": rule.get("pushRadiusKm", 5)},
            "status": "planned",
        })

    # ── FANOUT OVERRIDE ──
    if rule.get("enableFanoutOverride") and not ov.get("disableFanoutOverride"):
        fanout = ov.get("forceFanout") or rule.get("fanout", 3)
        actions.append({
            "type": "SET_FANOUT",
            "payload": {"zoneId": zone["id"], "fanout": fanout},
            "status": "planned",
        })

    # ── PRIORITY BIAS ──
    if rule.get("enablePriorityBias"):
        actions.append({
            "type": "SET_PRIORITY_BIAS",
            "payload": {"zoneId": zone["id"], "level": rule.get("priorityBiasLevel", 1)},
            "status": "planned",
        })

    # ── ZONE BOOST ──
    if rule.get("enableZoneBoost"):
        actions.append({
            "type": "SET_ZONE_BOOST",
            "payload": {"zoneId": zone["id"], "boost": rule.get("zoneBoostScore", 0.05)},
            "status": "planned",
        })

    return actions


async def execute_action(action: dict):
    """Execute a single orchestrator action against the database / zone engine."""
    action_type = action["type"]
    payload = action["payload"]
    zone_id = payload.get("zoneId")

    try:
        if action_type == "ENABLE_SURGE":
            multiplier = payload.get("multiplier", 1.0)
            await db.zones.update_one(
                {"id": zone_id},
                {"$set": {"surgeMultiplier": multiplier, "updatedAt": now_utc().isoformat()}}
            )
            await emit_realtime_event("zone:surge_changed", {"zoneId": zone_id, "surgeMultiplier": multiplier, "source": "orchestrator"})
            action["status"] = "executed"

        elif action_type == "PUSH_PROVIDERS":
            radius_km = payload.get("radiusKm", 5)
            providers_in_zone = await db.provider_locations.count_documents({"zoneId": zone_id, "isOnline": True})
            push_log = {
                "id": uid(), "type": "orchestrator_push", "zoneId": zone_id,
                "radiusKm": radius_km, "targetCount": providers_in_zone,
                "message": "Высокий спрос в зоне! Есть заказы рядом.",
                "createdAt": now_utc().isoformat(), "status": "sent",
            }
            await db.governance_actions.insert_one(push_log)
            await emit_realtime_event("provider:push", {"zoneId": zone_id, "message": push_log["message"], "source": "orchestrator"})
            action["status"] = "executed"

        elif action_type == "SET_FANOUT":
            fanout = payload.get("fanout", 3)
            await db.zone_distribution_config.update_one(
                {"zoneId": zone_id},
                {"$set": {"zoneId": zone_id, "fanout": fanout, "updatedAt": now_utc().isoformat(), "source": "orchestrator"}},
                upsert=True
            )
            action["status"] = "executed"

        elif action_type == "SET_PRIORITY_BIAS":
            level = payload.get("level", 1)
            await db.zone_distribution_config.update_one(
                {"zoneId": zone_id},
                {"$set": {"zoneId": zone_id, "priorityBiasLevel": level, "updatedAt": now_utc().isoformat(), "source": "orchestrator"}},
                upsert=True
            )
            action["status"] = "executed"

        elif action_type == "SET_ZONE_BOOST":
            boost = payload.get("boost", 0.05)
            await db.zone_distribution_config.update_one(
                {"zoneId": zone_id},
                {"$set": {"zoneId": zone_id, "zoneBoostScore": boost, "updatedAt": now_utc().isoformat(), "source": "orchestrator"}},
                upsert=True
            )
            action["status"] = "executed"

        else:
            action["status"] = "skipped"
            action["reason"] = f"Unknown action type: {action_type}"

    except Exception as e:
        action["status"] = "failed"
        action["reason"] = str(e)
        logger.error(f"Orchestrator action {action_type} failed for zone {zone_id}: {e}")
