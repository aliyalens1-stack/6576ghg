"""app.core.realtime — NestJS event emitter (HTTP → /api/realtime/emit).

Sprint 21 C4: вынос emit_realtime_event из server.py. Функция использует
shared httpx.AsyncClient через ctx.http_client (привязывается в server.py
startup) — никаких собственных pool'ов, нулевой impact на нагрузку.

Design:
  - Best-effort / non-blocking: exceptions тихо глотаются (как было в server.py).
  - NESTJS_URL читается из app.core.config.
  - http_client берём через ctx, чтобы:
    * не создавать второй connection pool
    * избежать circular import (server.py -> realtime.py -> server.py)
    * в тестах можно замокать ctx.http_client

Module-level коммент: почему НЕ через параметр функции — потому что функция
вызывается из десятков мест в бизнес-логике и менять сигнатуру везде = scope
creep. ctx — естественный DI-контейнер, уже установленный в PRE-COMMIT 0.
"""
from __future__ import annotations

from app.core.context import ctx
from app.core.config import NESTJS_URL


async def emit_realtime_event(event_type: str, data: dict) -> None:
    """Push event to NestJS realtime controller for WebSocket broadcast.

    Non-blocking best-effort: любая ошибка (network/timeout/NestJS down)
    тихо игнорируется — realtime не должен блокировать бизнес-операции.
    """
    client = ctx.http_client
    if client is None:
        # ctx ещё не инициализирован (holodny start) — просто пропускаем emit.
        # Это не должно случаться в нормальном runtime: server.py привязывает
        # ctx.http_client до старта любых async tasks.
        return
    try:
        await client.post(
            f"{NESTJS_URL}/api/realtime/emit?event_type={event_type}",
            json=data, timeout=2.0,
        )
    except Exception:
        pass  # Non-blocking, best-effort
