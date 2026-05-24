import threading
import time
from collections import OrderedDict
from typing import Any

_MAX_SIZE = 512
_store: OrderedDict[str, tuple[Any, float]] = OrderedDict()
_lock = threading.Lock()


def cache_get(key: str) -> Any:
    with _lock:
        entry = _store.get(key)
        if entry is None:
            return None
        value, expire = entry
        if time.time() < expire:
            _store.move_to_end(key)   # LRU：標記為最近使用
            return value
        del _store[key]
        return None


def cache_set(key: str, value: Any, ttl: int) -> None:
    with _lock:
        if key in _store:
            _store.move_to_end(key)
        _store[key] = (value, time.time() + ttl)
        # 超出容量時逐出最久未使用的 entry
        while len(_store) > _MAX_SIZE:
            _store.popitem(last=False)
