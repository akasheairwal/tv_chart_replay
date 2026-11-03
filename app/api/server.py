"""FastAPI Cloud Transport Adapter.

Exposes the core application and data pipelines over HTTP and WebSockets,
allowing the TypeScript frontend (hosted on Vercel or any browser) to communicate
with the backend without the PySide6 desktop shell.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.application import ApplicationContext, build_context
from app.bridge.commands import BridgeCommandHandler

logger = logging.getLogger(__name__)

APP_VERSION = "0.1.0"


class WebSocketManager:
    """Manages active browser WebSocket connections for real-time event streaming."""

    def __init__(self) -> None:
        self.active_connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info("WebSocket client connected. Active: %d", len(self.active_connections))

    def disconnect(self, websocket: WebSocket) -> None:
        self.active_connections.discard(websocket)
        logger.info("WebSocket client disconnected. Active: %d", len(self.active_connections))

    async def broadcast(self, event: str, payload: Any) -> None:
        if not self.active_connections:
            return
        message = json.dumps({"event": event, "data": payload}, separators=(",", ":"))
        dead: list[WebSocket] = []
        for connection in list(self.active_connections):
            try:
                await connection.send_text(message)
            except Exception:
                dead.append(connection)
        for d in dead:
            self.disconnect(d)


# Global instances initialized during lifespan
_context: ApplicationContext | None = None
_handler: BridgeCommandHandler | None = None
_ws_manager = WebSocketManager()
_main_loop: asyncio.AbstractEventLoop | None = None


def get_handler() -> BridgeCommandHandler:
    if _handler is None:
        raise RuntimeError("API server not initialized")
    return _handler


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _context, _handler, _main_loop
    _main_loop = asyncio.get_running_loop()
    logger.info("Initializing ApplicationContext and BridgeCommandHandler for API server...")

    _context = build_context()
    _handler = BridgeCommandHandler(app_version=APP_VERSION)
    _handler.attach_services(_context)

    # Relay backend events (replay ticks, data download progress, order fills) to WebSockets
    def on_backend_event(name: str, payload: Any) -> None:
        if _main_loop and _main_loop.is_running() and _ws_manager.active_connections:
            asyncio.run_coroutine_threadsafe(_ws_manager.broadcast(name, payload), _main_loop)

    _context.event_relay.add_listener(on_backend_event)

    yield

    logger.info("Shutting down API server...")
    if _context is not None:
        _context.event_relay.remove_listener(on_backend_event)
        _context.close()


app = FastAPI(
    title="Trading Chart Replayer Cloud API",
    version=APP_VERSION,
    lifespan=lifespan,
)

# CORS middleware for cross-origin requests from Vercel
cors_origins_env = os.environ.get("CORS_ORIGINS", "*")
origins = [o.strip() for o in cors_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "trading-chart-replayer-backend",
        "version": APP_VERSION,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/systemVersion")
def system_version():
    handler = get_handler()
    return Response(content=handler.systemVersion(), media_type="text/plain")


@app.post("/api/systemPing")
async def system_ping(request: Request):
    handler = get_handler()
    body = await request.body()
    msg = body.decode("utf-8").strip() if body else "ping"
    # If JSON formatted string, unwrap
    if msg.startswith('"') and msg.endswith('"') and len(msg) >= 2:
        try:
            msg = json.loads(msg)
        except Exception:
            pass
    result = handler.systemPing(msg)
    return Response(content=result, media_type="text/plain")


@app.post("/api/{command}")
async def dispatch_command(command: str, request: Request):
    """Generic bridge slot dispatcher matching Qt QWebChannel command surface."""
    handler = get_handler()
    fn = getattr(handler, command, None)
    if fn is None or not callable(fn) or command.startswith("_"):
        raise HTTPException(status_code=404, detail=f"Unknown bridge command: {command}")

    body = await request.body()
    body_str = body.decode("utf-8") if body else ""

    try:
        sig = inspect.signature(fn)
        params = [p for p in sig.parameters.values() if p.name not in ("self",)]

        if len(params) == 0:
            result = fn()
        else:
            result = fn(body_str)

        # If result is already a serialized JSON envelope string
        if isinstance(result, str):
            if result.startswith("{") or result.startswith("["):
                return Response(content=result, media_type="application/json")
            return Response(content=result, media_type="text/plain")
        elif result is None:
            return Response(content=json.dumps({"ok": True, "data": None}), media_type="application/json")
        else:
            return Response(content=json.dumps({"ok": True, "data": result}), media_type="application/json")

    except Exception as exc:
        logger.exception("Error executing command %s: %s", command, exc)
        return Response(
            content=json.dumps({"ok": False, "error": str(exc)}),
            status_code=500,
            media_type="application/json",
        )


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket streaming endpoint for real-time replay ticks and events."""
    await _ws_manager.connect(websocket)
    # Send welcome handshake
    await websocket.send_text(
        json.dumps(
            {"event": "connected", "data": {"version": APP_VERSION}},
            separators=(",", ":"),
        )
    )
    try:
        while True:
            # Keep-alive ping/pong
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        _ws_manager.disconnect(websocket)
    except Exception as exc:
        logger.debug("WebSocket exception: %s", exc)
        _ws_manager.disconnect(websocket)


def main():
    import uvicorn

    port = int(os.environ.get("PORT", 7860))
    host = os.environ.get("HOST", "0.0.0.0")
    uvicorn.run("app.api.server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    main()

