from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from pathlib import Path

import httpx

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.security import create_access_token


ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "docs" / "PRICING_LIVE_MATRIX_REPORT.md"
BASE_URL = "http://127.0.0.1:8000"


PLAN_USERS = {
    "Free": "qa.free@datahub.local",
    "Professional": "qa.professional@datahub.local",
    "Team": "qa.team@datahub.local",
    "Business": "qa.business@datahub.local",
    "Enterprise": "qa.enterprise@datahub.local",
}


@dataclass
class CaseResult:
    capability: str
    plan: str
    expected: str
    status_code: int | None
    ok: bool
    detail: str


def _token_for_user(username: str) -> str:
    token_data = create_access_token(username, role="editor", expires_minutes=240)
    return token_data["access_token"]


def _headers(plan: str) -> dict[str, str]:
    token = _token_for_user(PLAN_USERS[plan])
    return {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }


def _expect_forbidden(plan: str, blocked_plans: set[str]) -> str:
    return "403" if plan in blocked_plans else "non-403"


def _matches_expectation(expected: str, status_code: int) -> bool:
    if expected == "403":
        return status_code == 403
    return status_code != 403 and status_code < 500


def _request(client: httpx.Client, method: str, url: str, plan: str, **kwargs) -> tuple[int | None, str]:
    try:
        response = client.request(method, url, headers=_headers(plan), timeout=20.0, **kwargs)
        detail = ""
        try:
            payload = response.json()
            detail = str(payload.get("detail") or payload.get("message") or "")
        except Exception:
            detail = response.text[:120]
        return response.status_code, detail
    except Exception as exc:
        return None, str(exc)


def run_matrix() -> list[CaseResult]:
    plans = ["Free", "Professional", "Team", "Business", "Enterprise"]
    cases: list[CaseResult] = []

    with httpx.Client(base_url=BASE_URL) as client:
        for plan in plans:
            expected = _expect_forbidden(plan, {"Free", "Professional", "Team"})
            status, detail = _request(client, "GET", "/webhooks/", plan)
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Webhooks", plan, expected, status, ok, detail))

            expected = _expect_forbidden(plan, {"Free"})
            status, detail = _request(
                client,
                "POST",
                "/jobs/",
                plan,
                params={"name": f"live-job-{plan.lower()}", "cron": "0 0 * * *", "action": "noop"},
            )
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Scheduling (Jobs)", plan, expected, status, ok, detail))

            expected = _expect_forbidden(plan, {"Free", "Professional"})
            status, detail = _request(client, "POST", "/workspaces/ws-live/share", plan)
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Workspace Sharing", plan, expected, status, ok, detail))

            expected = _expect_forbidden(plan, {"Free"})
            status, detail = _request(client, "POST", "/api/dashboards/nonexistent/publish", plan)
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Dashboard Sharing", plan, expected, status, ok, detail))

            expected = _expect_forbidden(plan, {"Free"})
            status, detail = _request(
                client,
                "POST",
                "/import/test-connection",
                plan,
                json={
                    "type": "postgresql",
                    "host": "localhost",
                    "port": 5432,
                    "database": "db",
                    "username": "user",
                    "password": "pass",
                },
            )
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Core Connectors", plan, expected, status, ok, detail))

            expected = _expect_forbidden(plan, {"Free", "Professional"})
            status, detail = _request(
                client,
                "POST",
                "/import/test-connection",
                plan,
                json={
                    "type": "snowflake",
                    "account": "acme",
                    "username": "user",
                    "password": "pass",
                    "database": "db",
                    "warehouse": "wh",
                    "table": "t",
                },
            )
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Enterprise Connectors", plan, expected, status, ok, detail))

            try:
                response = client.get("/auth/sso/status", headers=_headers(plan), timeout=20.0)
                status = response.status_code
                payload = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                detail = str(payload.get("detail") or payload.get("message") or "")
            except Exception as exc:
                status = None
                payload = {}
                detail = str(exc)
            expected_enabled = plan in {"Business", "Enterprise"}
            actual_enabled = None
            if status == 200:
                actual_enabled = bool(payload.get("enabled"))
            ok = status == 200 and actual_enabled == expected_enabled
            expected = "enabled" if expected_enabled else "disabled"
            cases.append(CaseResult("SSO Status", plan, expected, status, ok, detail))

            expected = _expect_forbidden(plan, {"Free", "Professional", "Team"})
            status, detail = _request(client, "GET", "/datasets/fake-dataset/lineage/graph", plan)
            ok = status is not None and _matches_expectation(expected, status)
            cases.append(CaseResult("Lineage Graph", plan, expected, status, ok, detail))

    return cases


def render_report(cases: list[CaseResult]) -> str:
    lines: list[str] = []
    lines.append("# Live Pricing Matrix Report")
    lines.append("")
    lines.append(f"- Base URL: `{BASE_URL}`")
    lines.append("- Auth mode: app JWT tokens (`APP_SECRET_KEY`) with seeded users/plans")
    lines.append("")
    lines.append("| Capability | Plan | Expected | Actual Status | Result | Detail |")
    lines.append("|---|---|---|---|---|---|")
    for case in cases:
        status = str(case.status_code) if case.status_code is not None else "ERR"
        result = "PASS" if case.ok else "FAIL"
        detail = (case.detail or "").replace("|", "\\|")
        lines.append(
            f"| {case.capability} | {case.plan} | {case.expected} | {status} | {result} | {detail[:120]} |"
        )

    lines.append("")
    total = len(cases)
    passed = sum(1 for case in cases if case.ok)
    lines.append(f"- Passed: {passed}/{total}")
    lines.append(f"- Final: {'PASS' if passed == total else 'FAIL'}")
    lines.append("")
    return "\n".join(lines)


def main() -> int:
    cases = run_matrix()
    report = render_report(cases)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print(f"Wrote report: {REPORT_PATH}")
    failures = [case for case in cases if not case.ok]
    return 0 if not failures else 1


if __name__ == "__main__":
    raise SystemExit(main())
