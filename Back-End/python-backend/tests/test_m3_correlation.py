"""M3-D 驗證：tag-correlation-matrix + previousEntries"""
from tests.helpers import assert_success, assert_keys, assert_no_snake

MATRIX_KEYS = ["lastUpdated", "entries", "previousEntries"]
ENTRY_KEYS  = ["tagA", "tagB", "rho"]


async def test_get_matrix_returns_success(client):
    res = await client.get("/api/v1/tag-correlation-matrix/")
    data = assert_success(res)
    assert_keys(data, MATRIX_KEYS)
    assert_no_snake(data)


async def test_get_matrix_entries_is_list(client):
    res = await client.get("/api/v1/tag-correlation-matrix/")
    data = assert_success(res)
    assert isinstance(data["entries"], list)


async def test_get_matrix_previous_entries_null_or_list(client):
    res = await client.get("/api/v1/tag-correlation-matrix/")
    data = assert_success(res)
    assert data["previousEntries"] is None or isinstance(data["previousEntries"], list), \
        "previousEntries 應為 null 或陣列"


async def test_get_matrix_entries_camel(client):
    res = await client.get("/api/v1/tag-correlation-matrix/")
    data = assert_success(res)
    for entry in data["entries"]:
        assert_keys(entry, ENTRY_KEYS)
        assert_no_snake(entry)


async def test_get_matrix_last_updated_is_string(client):
    res = await client.get("/api/v1/tag-correlation-matrix/")
    data = assert_success(res)
    assert isinstance(data["lastUpdated"], str), "lastUpdated 應為 ISO 字串"
