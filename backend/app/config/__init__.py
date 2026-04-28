from pydantic import BaseModel
from typing import List
import importlib
import os
import re
import sys


_PROD_CORS_ORIGINS = [
    "https://datahub.org.in",
    "https://www.datahub.org.in",
]
# Localhost origins are only included when APP_ENV != "production" so that
# developer machines cannot make credentialed requests to the production API.
_APP_ENV_FOR_CORS = os.getenv("APP_ENV", "development")
DEFAULT_CORS_ORIGINS = (
    _PROD_CORS_ORIGINS
    if _APP_ENV_FOR_CORS == "production"
    else _PROD_CORS_ORIGINS + ["http://localhost:5173", "http://localhost:3000"]
)


def _parse_origins(value: str) -> List[str]:
    if not value:
        return DEFAULT_CORS_ORIGINS
    if value.strip() == "*":
        return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in value.split(",") if origin.strip()]


def _parse_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    normalized = value.strip().lower()
    if normalized == "":
        return default
    return normalized in {"1", "true", "yes", "on"}


def _normalize_aws_region(value: str | None, default: str = "us-east-1") -> str:
    if not value:
        return default
    candidate = value.strip()
    if not candidate:
        return default

    region_match = re.search(r"\b[a-z]{2}-[a-z]+-\d\b", candidate.lower())
    if region_match:
        return region_match.group(0)
    return candidate


class Settings(BaseModel):
    app_env: str = os.getenv("APP_ENV", "development")
    app_secret_key: str = os.getenv("APP_SECRET_KEY", "change-me")
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://datahub:datahub@localhost:5432/datahub",
    )
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    chroma_url: str = os.getenv("CHROMA_URL", "http://localhost:8001")
    llm_provider: str = os.getenv("LLM_PROVIDER", "groq")
    groq_api_key: str = os.getenv("GROQ_API_KEY", "")
    groq_base_url: str = os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1")
    groq_model: str = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
    cors_origins: List[str] = _parse_origins(
        os.getenv("CORS_ORIGINS", ",".join(DEFAULT_CORS_ORIGINS))
    )
    oidc_issuer: str = os.getenv("OIDC_ISSUER", "")
    oidc_client_id: str = os.getenv("OIDC_CLIENT_ID", "")
    oidc_client_secret: str = os.getenv("OIDC_CLIENT_SECRET", "")
    oidc_redirect_uri: str = os.getenv("OIDC_REDIRECT_URI", "")
    supabase_url: str = os.getenv("SUPABASE_URL", "")
    supabase_jwt_secret: str = os.getenv("SUPABASE_JWT_SECRET", "")
    supabase_jwt_audience: str = os.getenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    supabase_anon_key: str = os.getenv("SUPABASE_ANON_KEY", "")
    supabase_service_role_key: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    billing_enabled: bool = _parse_bool(os.getenv("BILLING_ENABLED"), False)
    # USD/international billing is launched separately from INR. When False (the
    # default), /billing/subscribe rejects USD requests with a clean 400 instead
    # of failing deep inside the Razorpay client because the USD plan IDs are
    # placeholders. Set USD_BILLING_ENABLED=true after running
    # scripts/setup_razorpay_plans.py and configuring RAZORPAY_*_USD_PLAN env vars.
    usd_billing_enabled: bool = _parse_bool(os.getenv("USD_BILLING_ENABLED"), False)
    razorpay_key_id: str = os.getenv("RAZORPAY_KEY_ID", "")
    razorpay_key_secret: str = os.getenv("RAZORPAY_KEY_SECRET", "")
    razorpay_webhook_secret: str = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
    posthog_api_key: str = os.getenv("POSTHOG_API_KEY", "")
    sentry_dsn: str = os.getenv("SENTRY_DSN", "")
    sentry_traces_sample_rate: float = float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1"))
    dataset_cache_max: int = int(os.getenv("DATASET_CACHE_MAX", "20"))
    dataset_cache_ttl_seconds: int = int(os.getenv("DATASET_CACHE_TTL", "1800"))
    profile_cache_ttl_seconds: int = int(os.getenv("PROFILE_CACHE_TTL", "300"))
    profile_cache_max: int = int(os.getenv("PROFILE_CACHE_MAX", "200"))
    recipe_retention_max_versions: int = int(os.getenv("RECIPE_RETENTION_MAX_VERSIONS", "100"))
    recipe_retention_max_age_days: int = int(os.getenv("RECIPE_RETENTION_MAX_AGE_DAYS", "90"))
    storage_tier_hot_max_size_bytes: int = int(os.getenv("STORAGE_TIER_HOT_MAX_SIZE_BYTES", str(250 * 1024 * 1024)))
    storage_tier_warm_max_size_bytes: int = int(os.getenv("STORAGE_TIER_WARM_MAX_SIZE_BYTES", str(2 * 1024 * 1024 * 1024)))
    storage_tier_warm_after_days: int = int(os.getenv("STORAGE_TIER_WARM_AFTER_DAYS", "30"))
    storage_tier_archive_after_days: int = int(os.getenv("STORAGE_TIER_ARCHIVE_AFTER_DAYS", "90"))
    automation_guardrails_enabled: bool = _parse_bool(os.getenv("AUTOMATION_GUARDRAILS_ENABLED"), True)
    automation_guardrails_max_rows: int = int(os.getenv("AUTOMATION_GUARDRAILS_MAX_ROWS", "250000"))
    automation_guardrails_max_columns: int = int(os.getenv("AUTOMATION_GUARDRAILS_MAX_COLUMNS", "200"))
    automation_guardrails_max_request_chars: int = int(os.getenv("AUTOMATION_GUARDRAILS_MAX_REQUEST_CHARS", "2000"))
    automation_guardrails_max_steps: int = int(os.getenv("AUTOMATION_GUARDRAILS_MAX_STEPS", "12"))
    automation_guardrails_allow_ml_training: bool = _parse_bool(os.getenv("AUTOMATION_GUARDRAILS_ALLOW_ML"), False)
    tenant_isolation_monitor_enabled: bool = _parse_bool(os.getenv("TENANT_ISOLATION_MONITOR_ENABLED"), True)
    tenant_isolation_monitor_hour: int = int(os.getenv("TENANT_ISOLATION_MONITOR_HOUR", "3"))
    tenant_isolation_monitor_minute: int = int(os.getenv("TENANT_ISOLATION_MONITOR_MINUTE", "15"))
    tenant_isolation_monitor_violation_sample_limit: int = int(os.getenv("TENANT_ISOLATION_MONITOR_SAMPLE_LIMIT", "25"))
    ai_controls_enable_durable_memory: bool = _parse_bool(os.getenv("AI_CONTROLS_ENABLE_DURABLE_MEMORY"), True)
    ai_controls_max_message_chars: int = int(os.getenv("AI_CONTROLS_MAX_MESSAGE_CHARS", "4000"))
    ai_controls_max_stream_events: int = int(os.getenv("AI_CONTROLS_MAX_STREAM_EVENTS", "200"))
    ai_controls_allowed_intents: list[str] = [
        intent.strip().lower()
        for intent in os.getenv("AI_CONTROLS_ALLOWED_INTENTS", "analyze,transform,visualize,general").split(",")
        if intent.strip()
    ]
    storage_provider: str = os.getenv("STORAGE_PROVIDER", "s3")
    s3_access_key_id: str = os.getenv("AWS_ACCESS_KEY_ID", "")
    s3_secret_access_key: str = os.getenv("AWS_SECRET_ACCESS_KEY", "")
    s3_region: str = _normalize_aws_region(os.getenv("AWS_REGION", "us-east-1"))
    s3_bucket_name: str = os.getenv("S3_BUCKET_NAME", "")
    r2_account_id: str = os.getenv("R2_ACCOUNT_ID", "")
    r2_access_key_id: str = os.getenv("R2_ACCESS_KEY_ID", "")
    r2_secret_access_key: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    r2_bucket_name: str = os.getenv("R2_BUCKET_NAME", "")
    # Google Cloud Storage settings
    gcs_project_id: str = os.getenv("GCS_PROJECT_ID", "")
    gcs_bucket_name: str = os.getenv("GCS_BUCKET_NAME", "")
    gcs_credentials_json: str = os.getenv("GCS_CREDENTIALS_JSON", "")
    # Azure Blob Storage settings
    azure_account_name: str = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "")
    azure_account_key: str = os.getenv("AZURE_STORAGE_ACCOUNT_KEY", "")
    azure_connection_string: str = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
    azure_container_name: str = os.getenv("AZURE_CONTAINER_NAME", "")
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
    cron_secret: str = os.getenv("CRON_SECRET", "change-me-in-production")
    supabase_realtime_url: str = os.getenv("SUPABASE_REALTIME_URL", "")
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    email_from_address: str = os.getenv("EMAIL_FROM_ADDRESS", "DataHub <noreply@datahub.org.in>")
    # Connector credential encryption — kept separate from JWT key so each can rotate independently
    connector_encryption_key: str = os.getenv("CONNECTOR_ENCRYPTION_KEY", "")
    # Live dataset federation — TTL (in seconds) for the per-dataset in-process result cache
    live_dataset_ttl_seconds: int = int(os.getenv("LIVE_DATASET_TTL_SECONDS", "300"))
    # Google service-account JSON for Sheets sync (base64-encoded or raw JSON string)
    google_service_account_json: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    # Explicit SA email override — if blank, the email is parsed from the JSON at runtime
    google_service_account_email: str = os.getenv("GOOGLE_SERVICE_ACCOUNT_EMAIL", "")


settings = Settings()

# Refuse to boot in production with placeholder secrets. These keys gate webhook
# replay (cron_secret), share-token integrity, and request-signing — leaving the
# default values in a public deployment is equivalent to no auth at all.
if settings.app_env == "production":
    _PLACEHOLDER_TOKENS = {"", "change-me", "change-me-in-production", "changeme", "placeholder", "secret"}
    _required = {
        "CRON_SECRET": settings.cron_secret,
        "APP_SECRET_KEY": settings.app_secret_key,
    }
    _missing = [k for k, v in _required.items() if (v or "").strip().lower() in _PLACEHOLDER_TOKENS]
    if _missing:
        raise RuntimeError(
            "Refusing to start in production: the following environment variables "
            "are unset or use placeholder values: " + ", ".join(sorted(_missing))
            + ". Generate strong random secrets and set them before deploying."
        )
    # SHARE_SIGNING_SECRET is only required if anyone has minted a share token,
    # but warn loudly so the operator notices before the first share is issued.
    if not settings.share_signing_secret:
        import logging as _logging
        _logging.getLogger(__name__).warning(
            "SHARE_SIGNING_SECRET is not set — public share tokens will be rejected at sign time."
        )

try:
    _razorpay_plans = importlib.import_module("app.razorpay_plans")
    sys.modules[__name__ + ".razorpay_plans"] = _razorpay_plans
except Exception:
    pass
