from typing import Any


def success(data: Any) -> dict:
    return {"success": True, "data": data}


def error(message: str) -> dict:
    return {"success": False, "error": message}
