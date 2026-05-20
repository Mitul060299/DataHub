import hmac

from fastapi import APIRouter, Response, Header, HTTPException
from prometheus_client import CONTENT_TYPE_LATEST, generate_latest
from ..security import get_current_role, require_role
from ..config import settings

router = APIRouter(tags=["metrics"])


def _require_metrics_access(authorization: str | None) -> None:
    if settings.metrics_bearer_token:
        expected = f"Bearer {settings.metrics_bearer_token}"
        # Use constant-time comparison to prevent timing-based token enumeration
        if not hmac.compare_digest(authorization or "", expected):
            raise HTTPException(status_code=401, detail="Unauthorized")
        return
    role = get_current_role(authorization)
    require_role("admin", role)


@router.get("/metrics")
def metrics(authorization: str | None = Header(default=None)) -> Response:
    _require_metrics_access(authorization)
    payload = generate_latest()
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)


@router.get("/metrics/health")
def metrics_health(authorization: str | None = Header(default=None)) -> dict:
    _require_metrics_access(authorization)
    return {"status": "ok"}
