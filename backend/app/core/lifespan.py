"""app.core.lifespan — Sprint 21 C15 + C15.1 + C17: единая точка lifecycle.

C17 cleanup: runtime `from server import` удалены. bootstrap_side_effects и
shutdown_cleanup теперь живут в `app.core.bootstrap` (чистый модуль, нет
зависимостей от server.py).

Порядок startup:
  init_db → load_ml_models → bootstrap_side_effects → start_all_loops

Порядок shutdown:
  shutdown_cleanup (close mongo + kill NestJS subprocess)

Правила:
  1. `init_db` ДО `load_ml_models` — ML читает ml_models коллекцию.
  2. `load_ml_models` ДО `bootstrap_side_effects`/loops — чтобы warm-start
     модели были готовы до первого orchestrator tick.
  3. `start_all_loops` В ПОСЛЕДНЮЮ ОЧЕРЕДЬ — все loops делают await db.X,
     поэтому seed/indexes должны быть прошиты.
"""
from __future__ import annotations
import logging
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING

from app.core.bootstrap import bootstrap_side_effects, shutdown_cleanup
from app.orchestrator.runner import start_all_loops

if TYPE_CHECKING:
    from fastapi import FastAPI


logger = logging.getLogger("server")


async def init_db() -> None:
    """Проверка что MongoDB доступна (ping). Idempotent."""
    from app.core.db import get_db
    try:
        db = get_db()
        await db.client.admin.command("ping")
        logger.info("C15 lifespan: MongoDB ping OK")
    except Exception as e:
        logger.error(f"C15 lifespan: MongoDB ping FAILED — {e}")
        raise


async def load_ml_models() -> int:
    """Warm-hydration GBM моделей из db.ml_models. Non-fatal на ошибке."""
    try:
        from app.ml.predictor import DemandPredictor
        loaded = await DemandPredictor.load_persisted()
        logger.info(f"C15 lifespan: DemandPredictor warm-hydrated {loaded} models")
        return loaded
    except Exception as e:
        logger.warning(f"C15 lifespan: load_ml_models failed (non-fatal): {e}")
        return 0


@asynccontextmanager
async def lifespan(app: "FastAPI"):
    """FastAPI lifespan — единая точка lifecycle."""
    logger.info("C15 lifespan: startup phase begin")
    await init_db()
    await load_ml_models()
    await bootstrap_side_effects()
    app.state.background_tasks = start_all_loops()
    # Sprint 28: Auto-bidding worker (every 15s)
    try:
        import asyncio
        from app.marketplace.auction import autobid_worker_loop
        app.state.autobid_task = asyncio.create_task(autobid_worker_loop(15))
        logger.info("C15 lifespan: autobid worker started")
    except Exception as e:
        logger.warning(f"C15 lifespan: autobid worker failed to start (non-fatal): {e}")

    # Phase 3 — Soft Marketplace: exposures lifecycle
    try:
        import asyncio
        from app.auto_requests.exposures_cron import (
            ensure_exposure_indexes,
            expire_loop,
            batching_loop,
            stats_recompute_loop,
        )
        from app.auto_requests.feature_flags_helper import ensure_flags_seed
        await ensure_exposure_indexes()
        await ensure_flags_seed(default_use_exposures=True)
        app.state.exposures_expire_task = asyncio.create_task(expire_loop(60))
        app.state.exposures_batching_task = asyncio.create_task(batching_loop(60))
        app.state.exposures_stats_task = asyncio.create_task(stats_recompute_loop(300))
        logger.info("Phase 3: exposures loops started (expire=60s, batching=60s, stats=300s)")
    except Exception as e:
        logger.warning(f"Phase 3: exposures loops failed to start (non-fatal): {e}")

    logger.info("C15 lifespan: startup phase complete")
    yield
    logger.info("C15 lifespan: shutdown phase begin")
    try:
        await shutdown_cleanup()
    except Exception as e:
        logger.warning(f"C15 lifespan: shutdown_cleanup error (non-fatal): {e}")
    logger.info("C15 lifespan: shutdown phase complete")
