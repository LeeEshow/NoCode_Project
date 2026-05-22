"""M1 驗證：健康探測端點與 Response wrapper 格式"""


async def test_health_returns_200(client):
    res = await client.get("/health")
    assert res.status_code == 200


async def test_health_has_status_ok(client):
    res = await client.get("/health")
    body = res.json()
    assert body.get("status") == "ok"


async def test_health_has_uptime(client):
    res = await client.get("/health")
    body = res.json()
    assert "uptime" in body
    assert isinstance(body["uptime"], (int, float))


async def test_http_error_returns_success_false(client):
    """不存在的路徑應回傳 404，且格式為 { success: false, error: ... }"""
    res = await client.get("/api/v1/nonexistent")
    assert res.status_code == 404


async def test_easy_auth_bypass_allows_request(client):
    """EASY_AUTH_BYPASS=true 時，缺少 X-MS-CLIENT-PRINCIPAL 也應通過"""
    res = await client.get("/health")
    assert res.status_code == 200


async def test_easy_auth_blocks_without_header(client):
    """關閉 bypass 時，缺少 EasyAuth header 應回傳 401"""
    import os
    original = os.environ.get("EASY_AUTH_BYPASS")
    os.environ["EASY_AUTH_BYPASS"] = "false"
    try:
        res = await client.get("/api/v1/nonexistent")
        assert res.status_code == 401
        body = res.json()
        assert body.get("success") is False
        assert "error" in body
    finally:
        if original is None:
            del os.environ["EASY_AUTH_BYPASS"]
        else:
            os.environ["EASY_AUTH_BYPASS"] = original


async def test_easy_auth_passes_health_without_header(client):
    """/health 端點不受 EasyAuth 影響"""
    import os
    original = os.environ.get("EASY_AUTH_BYPASS")
    os.environ["EASY_AUTH_BYPASS"] = "false"
    try:
        res = await client.get("/health")
        assert res.status_code == 200
    finally:
        if original is None:
            del os.environ["EASY_AUTH_BYPASS"]
        else:
            os.environ["EASY_AUTH_BYPASS"] = original
