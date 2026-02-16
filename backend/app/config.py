from pydantic import BaseModel
from typing import List
import os


def _parse_origins(value: str) -> List[str]:
    if not value:
        return ["*"]
    if value.strip() == "*":
        return ["*"]
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized == "":
        return default
    return normalized in {"1", "true", "yes", "on"}


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
    storage_provider: str = os.getenv("STORAGE_PROVIDER", "s3")
    s3_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    s3_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    s3_region: str = os.getenv("AWS_REGION", "us-east-1")
    s3_bucket_name: str = os.getenv("S3_BUCKET_NAME", "")
    r2_account_id: str = os.getenv("R2_ACCOUNT_ID", "")
    r2_access_key_id: str = os.getenv("R2_ACCESS_KEY_ID", "")
    r2_secret_access_key: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    r2_bucket_name: str = os.getenv("R2_BUCKET_NAME", "")
    query_cache_ttl_seconds: int = int(os.getenv("QUERY_CACHE_TTL", "3600"))
    enable_query_cache: bool = _parse_bool(os.getenv("ENABLE_QUERY_CACHE"), True)
    enable_auto_archival: bool = _parse_bool(os.getenv("ENABLE_AUTO_ARCHIVAL"), True)
    compression_level: int = int(os.getenv("COMPRESSION_LEVEL", "9"))
    dataset_inline_max_rows: int = int(os.getenv("DATASET_INLINE_MAX_ROWS", "5000"))
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
