import logging
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from shioaji_api.core.config import settings
from shioaji_api.core.manager import manager
from shioaji_api.routers import health, index, kline, quote, stocks

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await manager.initialize(
            api_key=settings.sj_api_key,
            secret_key=settings.sj_secret_key,
        )
    except Exception as e:
        logger.error(f"Shioaji initialization failed (app will start in degraded mode): {e}")
    yield
    try:
        await manager.shutdown()
    except Exception as e:
        logger.error(f"Shioaji shutdown error: {e}")


app = FastAPI(title="Shioaji Market API", version="0.1.0", lifespan=lifespan)

app.include_router(health.router)
app.include_router(quote.router)
app.include_router(index.router)
app.include_router(stocks.router)
app.include_router(kline.router)


def run() -> None:
    uvicorn.run("shioaji_api.main:app", host="0.0.0.0", port=settings.port, reload=False)


def dev() -> None:
    uvicorn.run("shioaji_api.main:app", host="0.0.0.0", port=settings.port, reload=True)


if __name__ == "__main__":
    run()
