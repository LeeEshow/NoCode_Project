from typing import Optional
import shioaji as sj

_api: Optional[sj.Shioaji] = None


def get_api() -> sj.Shioaji:
    if _api is None:
        raise RuntimeError("Shioaji API not initialized")
    return _api


def set_api(api: sj.Shioaji) -> None:
    global _api
    _api = api
