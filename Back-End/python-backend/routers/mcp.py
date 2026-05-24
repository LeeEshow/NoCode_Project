import asyncio
import os
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import Response, StreamingResponse

from services.mcp_service import MCP_TOOLS, call_tool

router = APIRouter()

_SERVER_INFO = {"name": "nocode-finance-mcp", "version": "1.0.0"}
_PROTOCOL_VERSION = "2024-11-05"


# ─── 共用 JSON-RPC 處理邏輯 ────────────────────────────────────────────────────

async def _handle_rpc(body: dict) -> Response | dict:
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

    # Notifications（無 id）不回傳 response，符合 JSON-RPC 規範
    if method.startswith("notifications/"):
        return Response(status_code=204)

    return err(-32601, f"未實作方法：{method}")


def _check_key(key: str | None) -> None:
    # 每次 request 直讀（不用 lru_cache），確保測試 monkeypatch 可即時生效
    required = os.getenv("MCP_ACCESS_KEY", "")
    if required:
        # key 已設定：驗證是否吻合
        if key != required:
            raise HTTPException(status_code=401, detail="MCP access key 無效")
    elif os.getenv("SKIP_AUTH", "false").lower() != "true":
        # key 未設定 + 非 dev 環境：fail closed，避免敏感資料外洩
        raise HTTPException(status_code=503, detail="MCP_ACCESS_KEY 未設定，服務不可用")


# ─── GET /mcp/sse ──────────────────────────────────────────────────────────────

@router.get("/sse")
async def mcp_sse(request: Request, key: str | None = Query(default=None)):
    _check_key(key)

    # Azure SSL 終止後內部 scheme 永遠是 http；非 localhost 環境強制使用 https
    netloc = request.headers.get("X-Forwarded-Host", request.url.netloc)
    scheme = request.headers.get("X-Forwarded-Proto", request.url.scheme)
    if scheme == "http" and "localhost" not in netloc:
        scheme = "https"
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


# ─── POST /mcp（Streamable HTTP transport，MCP 2025-03-26）────────────────────

@router.post("")
async def mcp_http(body: dict, key: str | None = Query(default=None)):
    """Streamable HTTP transport — Claude Code 推薦格式（`--transport http`）"""
    _check_key(key)
    return await _handle_rpc(body)


# ─── POST /mcp/message（SSE transport，保留向下相容）──────────────────────────

@router.post("/message")
async def mcp_message(body: dict, key: str | None = Query(default=None)):
    _check_key(key)
    return await _handle_rpc(body)
