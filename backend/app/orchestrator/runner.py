"""app.orchestrator.runner — C15.1 централизованный запуск фоновых loops.

Одна точка входа для всех background tasks. Вызывается из `app/core/lifespan.py`
после `init_db()` + `load_ml_models()` — т.е. когда `ctx.db` гарантированно
готов и ML-модели гидратированы. До этого loops стартовать нельзя: они
делают `await db.X.find(...)` в первом же тике.

Порядок не важен (все loops независимы), но фиксируем логический:
  1) zone_state_engine           — Phase B demand/supply state (10s)
  2) orchestrator_engine_loop_v2 — Phase E+G actions cycle (10s)
  3) feedback_processor_loop     — Phase G feedback drain (15s)
  4) strategy_optimizer_loop     — Phase H weight optimizer (5min)
  5) provider_ranking_optimizer  — Sprint 17 (5min)
  6) _demand_prediction_loop     — Sprint 19+20 ML retrain (5min)

Возвращает список созданных task-ов (для shutdown cancellation, если понадобится).
"""
from __future__ import annotations
import asyncio
import logging
from typing import List

logger = logging.getLogger("server")


def start_all_loops() -> List[asyncio.Task]:
    """Запустить все фоновые loops. Должен вызываться ПОСЛЕ init_db()+load_ml_models()."""
    # Lazy import: все эти модули тянут за собой DB / ml, которые уже готовы к моменту
    # вызова. Импортируем здесь, а не на module-top — чтобы `app.orchestrator.runner`
    # оставался лёгким и не грузил БД при импорте.
    from app.orchestrator.cycle import (
        zone_state_engine,
        orchestrator_engine_loop_v2,
    )
    from app.orchestrator.feedback import (
        feedback_processor_loop,
        strategy_optimizer_loop,
    )
    from app.marketplace.quick_request import provider_ranking_optimizer_loop
    from app.ml.predictor import DemandPredictor

    async def _demand_prediction_loop():
        """Sprint 19+20: периодическая переобучка каждые TRAIN_INTERVAL_S.

        C15.1: warm-start (load_persisted) УБРАН отсюда — он теперь делается
        явно в lifespan.load_ml_models() ДО запуска loops. Дубль не нужен.
        """
        # warm-up: ждём 30с чтобы db/mongo index был готов (на первом трейне
        # нам нужны собранные zone_snapshots).
        await asyncio.sleep(30)
        while True:
            try:
                await DemandPredictor.train_all_zones()
            except Exception as e:
                logger.warning(f"DemandPredictor train cycle error: {e}")
            await asyncio.sleep(DemandPredictor.TRAIN_INTERVAL_S)

    tasks: List[asyncio.Task] = []
    tasks.append(asyncio.create_task(zone_state_engine(), name="zone_state_engine"))
    logger.info("C15.1 runner: Phase B Zone State Engine started (10s cycle)")

    tasks.append(asyncio.create_task(orchestrator_engine_loop_v2(), name="orchestrator_engine"))
    tasks.append(asyncio.create_task(feedback_processor_loop(), name="feedback_processor"))
    tasks.append(asyncio.create_task(strategy_optimizer_loop(), name="strategy_optimizer"))
    logger.info("C15.1 runner: Phase E+G orchestrator/feedback/optimizer started")

    tasks.append(asyncio.create_task(provider_ranking_optimizer_loop(), name="provider_ranking_optimizer"))
    logger.info("C15.1 runner: Sprint 17 Provider Ranking Optimizer started (5min cycle)")

    tasks.append(asyncio.create_task(_demand_prediction_loop(), name="demand_prediction"))
    logger.info("C15.1 runner: Sprint 19+20 Demand Prediction Engine started (5min retrain)")

    # Sprint 33 C8.1 — Reactivation Engine sweep
    from app.growth.reactivation import reactivation_sweep_loop, SWEEP_SECONDS
    tasks.append(asyncio.create_task(reactivation_sweep_loop(), name="reactivation_sweep"))
    logger.info(f"C8.1 runner: Reactivation Engine started ({SWEEP_SECONDS}s cycle)")

    # Sprint 33 C8.2 — Smart Nudge Engine sweep (tells providers where to earn)
    from app.growth.nudges import nudge_sweep_loop, NUDGE_SWEEP_SECONDS
    tasks.append(asyncio.create_task(nudge_sweep_loop(), name="nudge_sweep"))
    logger.info(f"C8.2 runner: Smart Nudge Engine started ({NUDGE_SWEEP_SECONDS}s cycle)")

    # Sprint 33 C8.4 — Auto-money worker (subscription-grade autobidder)
    from app.growth.auto_money import auto_money_worker_loop, AUTO_MONEY_TICK_SECONDS
    tasks.append(asyncio.create_task(auto_money_worker_loop(), name="auto_money_worker"))
    logger.info(f"C8.4 runner: Auto-money worker started ({AUTO_MONEY_TICK_SECONDS}s cycle)")

    logger.info(f"C15.1 runner: {len(tasks)} background loops launched")
    return tasks
