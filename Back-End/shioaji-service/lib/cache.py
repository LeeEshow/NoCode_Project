import time
from typing import TypeVar, Callable, Optional, Any, Awaitable

T = TypeVar("T")

# key -> (value, expires_at)
_cache: dict[str, tuple[Any, float]] = {}


def get_or_set(
    key: str,
    factory: Callable[[], T],
    ttl: int,
    valid: Optional[Callable[[T], bool]] = None,
) -> T:
    now = time.monotonic()
    entry = _cache.get(key)
    if entry is not None:
        value, expires_at = entry
        if now < expires_at:
            return value  # type: ignore[return-value]
    value = factory()
    if valid is None or valid(value):
        _cache[key] = (value, now + ttl)
    return value


async def get_or_set_async(
    key: str,
    factory: Callable[[], Awaitable[T]],
    ttl: int,
    valid: Optional[Callable[[T], bool]] = None,
) -> T:
    now = time.monotonic()
    entry = _cache.get(key)
    if entry is not None:
        value, expires_at = entry
        if now < expires_at:
            return value  # type: ignore[return-value]
    value = await factory()
    if valid is None or valid(value):
        _cache[key] = (value, now + ttl)
    return value
