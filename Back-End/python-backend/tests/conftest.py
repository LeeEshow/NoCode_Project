import os
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

# 必須在 import main 之前設定，讓 EasyAuth middleware 進入 bypass 模式
os.environ.setdefault("SKIP_AUTH", "true")
os.environ.setdefault("FIRESTORE_PROJECT_ID", "nocode-finance")

from main import app


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", follow_redirects=True
    ) as ac:
        yield ac
