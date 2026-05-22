from httpx import Response


def assert_success(res: Response, status: int = 200) -> object:
    assert res.status_code == status, f"期望 {status}，實際 {res.status_code}：{res.text}"
    body = res.json()
    assert body.get("success") is True, f"success 應為 true，實際：{body}"
    assert "data" in body, f"回應缺少 data 欄位：{body}"
    return body["data"]


def assert_error(res: Response, status: int) -> str:
    assert res.status_code == status, f"期望 {status}，實際 {res.status_code}：{res.text}"
    body = res.json()
    assert body.get("success") is False, f"success 應為 false，實際：{body}"
    assert "error" in body, f"回應缺少 error 欄位：{body}"
    return body["error"]


def assert_keys(obj: dict, required_keys: list[str]) -> None:
    for key in required_keys:
        assert key in obj, f"缺少欄位：'{key}'，實際欄位：{list(obj.keys())}"


def assert_no_snake(obj: dict) -> None:
    for key in obj:
        assert "_" not in key, (
            f"欄位應為 camelCase，但收到 snake_case：'{key}'"
        )


def assert_type(obj: dict, key: str, expected_type) -> None:
    value = obj.get(key)
    if value is not None:
        assert isinstance(value, expected_type), (
            f"欄位 '{key}' 應為 {expected_type.__name__}，實際為 {type(value).__name__}：{value}"
        )
