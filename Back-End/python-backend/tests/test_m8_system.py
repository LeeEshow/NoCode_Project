"""M8 驗證：系統狀態端點 + Shioaji reinitialize"""

import pytest
import routers.system as sys_router
from tests.helpers import assert_success, assert_error, assert_keys


# ─── GET /system/status ───────────────────────────────────────────────────────

async def test_system_status_returns_200(client):
    res = await client.get("/api/v1/system/status")
    assert res.status_code == 200


async def test_system_status_has_api_switch(client):
    res = await client.get("/api/v1/system/status")
    data = assert_success(res)
    assert "apiSwitch" in data


async def test_system_status_shioaji_fields(client):
    """providers.shioaji 必須包含 reinitializing 欄位"""
    res = await client.get("/api/v1/system/status")
    data = assert_success(res)
    sj = data["apiSwitch"]["providers"]["shioaji"]
    assert_keys(sj, ["enabled", "initialized", "connected", "reinitializing",
                      "subscribedStocks", "cachedStocks"])
    assert isinstance(sj["reinitializing"], bool)


# ─── POST /system/shioaji/reinitialize ───────────────────────────────────────

async def test_reinitialize_without_sj_key_returns_400(client, monkeypatch):
    """SJ_API_KEY 未設定 → 400（強制 shioaji_enabled=False 排除本機 .env 影響）"""
    monkeypatch.setattr(sys_router, "shioaji_enabled", lambda: False)
    res = await client.post("/api/v1/system/shioaji/reinitialize")
    assert_error(res, 400)


async def test_reinitialize_returns_409_when_busy(client, monkeypatch):
    """_reinitializing=True 時 → 409"""
    monkeypatch.setattr(sys_router, "shioaji_enabled", lambda: True)

    from services.shioaji_manager import shioaji_manager
    shioaji_manager._reinitializing = True
    try:
        res = await client.post("/api/v1/system/shioaji/reinitialize")
        assert_error(res, 409)
    finally:
        shioaji_manager._reinitializing = False


async def test_reinitialize_returns_202_when_enabled(client, monkeypatch):
    """shioaji_enabled=True + 未在初始化中 → 202；背景任務用 mock 避免真實 SJ 連線"""
    import asyncio

    monkeypatch.setattr(sys_router, "shioaji_enabled", lambda: True)

    # mock _bg_reinitialize：僅重置 flag，不做真實 SJ 操作
    async def _fake_bg():
        from services.shioaji_manager import shioaji_manager
        shioaji_manager._reinitializing = False

    monkeypatch.setattr(sys_router, "_bg_reinitialize", _fake_bg)

    from services.shioaji_manager import shioaji_manager
    shioaji_manager._reinitializing = False

    res = await client.post("/api/v1/system/shioaji/reinitialize")
    assert res.status_code == 202
    data = assert_success(res, status=202)
    assert "message" in data

    # 讓 event loop 跑一輪讓背景 task 執行
    await asyncio.sleep(0)
    assert shioaji_manager._reinitializing is False
