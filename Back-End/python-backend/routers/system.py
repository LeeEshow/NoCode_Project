from fastapi import APIRouter
from services.api_switch import get_switch_status

router = APIRouter()


@router.get("/status")
async def system_status():
    switch = get_switch_status()

    sj_status: dict = {}
    try:
        from services.shioaji_manager import shioaji_manager
        sj_status = shioaji_manager.get_status()
    except Exception:
        pass

    return {
        "success": True,
        "data": {
            "apiSwitch": switch,
            "shioaji":   sj_status,
        },
    }
