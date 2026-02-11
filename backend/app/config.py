from pydantic import BaseModel
from typing import List
import os


def _parse_origins(value: str) -> List[str]:
    if not value:
        return ["*"]
    if value.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


class Settings(BaseModel):
    app_env: str = os.getenv("APP_ENV", "development")
    app_secret_key: str = os.getenv("APP_SECRET_KEY", "change-me")
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://datahub:datahub@localhost:5432/datahub",
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    chroma_url: str = os.getenv("CHROMA_URL", "http://localhost:8001")
    llm_provider: str = os.getenv("LLM_PROVIDER", "mock")
    openai_api_key: str = os.getenv("OPENAI_API_KEY", "")
    cors_origins: List[str] = _parse_origins(os.getenv("CORS_ORIGINS", "*"))
    oidc_issuer: str = os.getenv("OIDC_ISSUER", "")
    oidc_client_id: str = os.getenv("OIDC_CLIENT_ID", "")
    oidc_client_secret: str = os.getenv("OIDC_CLIENT_SECRET", "")
    oidc_redirect_uri: str = os.getenv("OIDC_REDIRECT_URI", "")
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
    supabase_jwt_audience: str = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    dataset_cache_max: int = int(os.getenv("DATASET_CACHE_MAX", "20"))
    dataset_cache_ttl_seconds: int = int(os.getenv("DATASET_CACHE_TTL", "1800"))
    profile_cache_ttl_seconds: int = int(os.getenv("PROFILE_CACHE_TTL", "300"))
    profile_cache_max: int = int(os.getenv("PROFILE_CACHE_MAX", "200"))
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "")
    shared_rate_limit_per_minute: int = int(os.getenv("SHARED_RATE_LIMIT_PER_MIN", "120"))
    share_signing_secret: str = os.getenv("SHARE_SIGNING_SECRET", "")
    metrics_bearer_token: str = os.getenv("METRICS_BEARER_TOKEN", "")
    share_scope_allowlist: list[str] = [
        scope.strip()
        for scope in os.getenv("SHARE_SCOPE_ALLOWLIST", "").split(",")
        if scope.strip()
    ]
    share_scope_policy: dict[str, str] = {
        "public": os.getenv("SHARE_SCOPE_POLICY_PUBLIC", "editor"),
        "partners": os.getenv("SHARE_SCOPE_POLICY_PARTNERS", "editor"),
        "internal": os.getenv("SHARE_SCOPE_POLICY_INTERNAL", "viewer"),
    }


settings = Settings()
