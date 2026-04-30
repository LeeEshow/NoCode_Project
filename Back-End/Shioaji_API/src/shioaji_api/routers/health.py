from fastapi import APIRouter

from shioaji_api.core.manager import manager
from shioaji_api.schemas.market import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    status = manager.get_status()
    return HealthResponse(
        status="ok" if status["connected"] else "degraded",
        **status,
    )
