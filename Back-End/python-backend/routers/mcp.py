import asyncio
import os
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from services.mcp_service import MCP_TOOLS, call_tool

router = APIRouter()

_SERVER_INFO = {"name": "nocode-finance-mcp", "version": "1.0.0"}
_PROTOCOL_VERSION = "2024-11-05"


def _check_key(key: str | None) -> None:
    required = os.getenv("MCP_ACCESS_KEY", "")
    if required and key != required:
        raise HTTPException(status_code=401, detail="MCP access key 無效")


# ─── GET /mcp/sse ──────────────────────────────────────────────────────────────

@router.get("/sse")
async def mcp_sse(request: Request, key: str | None = Query(default=None)):
    _check_key(key)

    # Azure SSL 終止後 request.url.scheme 會是 http，需從 X-Forwarded-Proto 取得真實 scheme
    scheme  = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    netloc  = request.headers.get("X-Forwarded-Host", request.url.netloc)
    qs      = f"?key={key}" if key else ""
    message_url = f"{scheme}://{netloc}/api/v1/mcp/message{qs}"

    async def event_stream():
        try:
            yield f"event: endpoint\ndata: {message_url}\n\n"
            while True:
                await asyncio.sleep(15)
                yield ": ping\n\n"
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── POST /mcp/message ─────────────────────────────────────────────────────────

@router.post("/message")
async def mcp_message(body: dict, key: str | None = Query(default=None)):
    _check_key(key)

    rpc_id = body.get("id")
    method = body.get("method", "")
    params = body.get("params") or {}

    def ok(result):
        return {"jsonrpc": "2.0", "id": rpc_id, "result": result}

    def err(code: int, message: str):
        return {"jsonrpc": "2.0", "id": rpc_id, "error": {"code": code, "message": message}}

    if method == "initialize":
        return ok({
            "protocolVersion": _PROTOCOL_VERSION,
            "serverInfo": _SERVER_INFO,
            "capabilities": {"tools": {}},
        })

    if method == "tools/list":
        return ok({"tools": MCP_TOOLS})

    if method == "tools/call":
        name = params.get("name", "")
        arguments = params.get("arguments") or {}
        if not name:
            return err(-32602, "缺少 params.name")
        try:
            result = await call_tool(name, arguments)
            return ok(result)
        except Exception as e:
            return err(-32603, str(e))

    if method == "notifications/initialized":
        return {"jsonrpc": "2.0", "id": rpc_id}

    return err(-32601, f"未實作方法：{method}")
