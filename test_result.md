## Phase 3 — Soft Marketplace (B-lite) — needs testing

### Files changed
- NEW: /app/backend/app/auto_requests/feature_flags_helper.py
- NEW: /app/backend/app/auto_requests/inspector_stats.py
- NEW: /app/backend/app/auto_requests/exposures_cron.py
- MODIFIED: /app/backend/app/auto_requests/marketplace.py
- MODIFIED: /app/backend/app/auto_requests/service.py
- MODIFIED: /app/backend/app/auto_requests/schemas.py (added useExposures field)
- MODIFIED: /app/backend/app/auto_requests/router_marketplace.py (anti-abuse)
- MODIFIED: /app/backend/app/core/lifespan.py (loop registration)

### Verified manually
- POST /api/customer/requests with type=inspection → creates 3 exposures (score desc), waveReason=initial
- GET /api/customer/requests/{id}/matching → correct counts + "Ищем инспекторов · 3 получили задание"
- POST /api/inspector/exposures/{id}/accept?inspectorId={orgId} → sibling exposures get expired with reason job_claimed_by_other, job → claimed, matching label flips to "Инспектор в работе"
- Mongo indexes created on inspector_exposures
- Loops started: expire (60s), batching (60s), stats recompute (300s)
- Stats loop recomputed 11 inspectors successfully
