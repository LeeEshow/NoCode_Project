from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Any

from routers.schemas import success

router = APIRouter()
logger = logging.getLogger(__name__)

_MCP_ACCESS_KEY = os.getenv("MCP_ACCESS_KEY", "")


def _require_key(key: str | None):
    if not _MCP_ACCESS_KEY:
        return  # 未設定 key 時不驗證（開發模式）
    if key != _MCP_ACCESS_KEY:
        raise HTTPException(status_code=401, detail="Invalid MCP access key")


# ── SSE helpers ────────────────────────────────────────────────────────────────

def _sse_event(event: str, data: Any) -> str:
    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def _sse_stream(request: Request) -> AsyncGenerator[str, None]:
    """保持連線，每 15 秒送 ping，前端斷線時結束"""
    yield _sse_event("endpoint", {"url": "/api/v1/mcp/message"})
    try:
        while True:
            if await request.is_disconnected():
                break
            yield _sse_event("ping", {})
            await asyncio.sleep(15)
    except asyncio.CancelledError:
        pass


# ── GET /mcp/sse ───────────────────────────────────────────────────────────────

@router.get("/sse")
async def mcp_sse(request: Request, key: str | None = Query(default=None)):
    _require_key(key)
    return StreamingResponse(
        _sse_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ── POST /mcp/message ──────────────────────────────────────────────────────────

class McpMessagePayload(BaseModel):
    method: str
    params: dict = {}
    id: Any = None


@router.post("/message")
async def mcp_message(body: McpMessagePayload, key: str | None = Query(default=None)):
    _require_key(key)

    from services.mcp_service import TOOLS

    method = body.method
    msg_id = body.id

    # ── initialize ────────────────────────────────────────────────────────────
    if method == "initialize":
        return {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "finance-mcp", "version": "1.0.0"},
            },
        }

    # ── tools/list ────────────────────────────────────────────────────────────
    if method == "tools/list":
        tools = [
            {
                "name": name,
                "description": meta["description"],
                "inputSchema": meta["inputSchema"],
            }
            for name, meta in TOOLS.items()
        ]
        return {"jsonrpc": "2.0", "id": msg_id, "result": {"tools": tools}}

    # ── tools/call ────────────────────────────────────────────────────────────
    if method == "tools/call":
        tool_name = body.params.get("name")
        arguments  = body.params.get("arguments", {})
        if tool_name not in TOOLS:
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32601, "message": f"Tool '{tool_name}' not found"},
            }
        try:
            result = await TOOLS[tool_name]["fn"](arguments)
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(result, ensure_ascii=False, default=str)}]
                },
            }
        except Exception as e:
            logger.exception("MCP tool %s failed: %s", tool_name, e)
            return {
                "jsonrpc": "2.0",
                "id": msg_id,
                "error": {"code": -32603, "message": str(e)},
            }

    # ── unknown method ────────────────────────────────────────────────────────
    return {
        "jsonrpc": "2.0",
        "id": msg_id,
        "error": {"code": -32601, "message": f"Method '{method}' not supported"},
    }
