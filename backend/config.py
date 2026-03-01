"""
PantryPal SK — Backend Configuration

Environment-based configuration using pydantic-settings.
Reads from environment variables or .env file.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables."""

    # Database connection
    database_url: str = "postgresql://user:pass@localhost:5432/pantrypal"

    # Server configuration
    host: str = "0.0.0.0"
    port: int = 8000
    reload: bool = False

    # CORS settings
    cors_origins: list[str] = ["*"]

    # API settings
    api_prefix: str = "/api/v1"

    # Application metadata
    app_name: str = "PantryPal SK Backend"
    app_version: str = "1.0.0"
    debug: bool = False

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


# Global settings instance
settings = Settings()
