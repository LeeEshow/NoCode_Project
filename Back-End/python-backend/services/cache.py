import time
from typing import Any

_store: dict[str, tuple[Any, float]] = {}


def cache_get(key: str) -> Any:
    entry = _store.get(key)
    if entry is None:
        return None
    value, expire = entry
    if time.time() < expire:
        return value
    del _store[key]
    return None


def cache_set(key: str, value: Any, ttl: int) -> None:
    _store[key] = (value, time.time() + ttl)
