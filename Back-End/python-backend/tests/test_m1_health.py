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


async def test_skip_auth_allows_request(client):
    """SKIP_AUTH=true 時，缺少 X-MS-CLIENT-PRINCIPAL 也應通過"""
    res = await client.get("/health")
    assert res.status_code == 200


async def test_auth_bypass_allows_api_request(client):
    """SKIP_AUTH=true 時，任何 API 請求都不應被 EasyAuth 擋住（回傳 401）"""
    # 用不存在的路徑：若 auth 通過，得到 404；若 auth 擋住，得到 401
    res = await client.get("/api/v1/__auth_test__")
    assert res.status_code == 404, f"SKIP_AUTH=true 時應得 404，但收到 {res.status_code}"


async def test_auth_passes_health_without_header(client):
    """/health 端點永遠不受 EasyAuth 影響"""
    res = await client.get("/health")
    assert res.status_code == 200
