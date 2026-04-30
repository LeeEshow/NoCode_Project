from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    sj_api_key: str = ""
    sj_secret_key: str = ""
    port: int = 8001


settings = Settings()
