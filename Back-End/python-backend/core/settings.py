"""集中管理所有環境變數，單一來源避免命名不一致。"""
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

    # ── Auth ──────────────────────────────────────────────────────────────────
    skip_auth: bool = False
    cron_secret: str = ""

    # ── Server ────────────────────────────────────────────────────────────────
    port: int = 8000
    # 逗號分隔的允許 origin，例如 "https://app.example.com,http://localhost:5173"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # ── Firestore ─────────────────────────────────────────────────────────────
    firestore_project_id: str | None = None
    # Azure 部署：base64 JSON（與下方二擇一）
    google_application_credentials_json: str | None = None
    # 本機開發：憑證檔路徑
    google_application_credentials: str = "./serviceAccountKey.json"

    # ── MCP ───────────────────────────────────────────────────────────────────
    # production 必填；未設定且非 dev 環境時 MCP 端點回 503
    mcp_access_key: str = ""

    # ── FinMind（選填；未設定時 FinMind API 不帶 Token，免費呼叫仍可用）──────
    finmind_token: str = ""

    # ── Shioaji（選填；未設定時全程使用 Yahoo Finance）────────────────────────
    sj_api_key: str = ""
    sj_secret_key: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
