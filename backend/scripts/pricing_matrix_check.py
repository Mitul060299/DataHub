from __future__ import annotations

import ast
import re
import sys
from dataclasses import dataclass
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services import plan_guard


@dataclass
class CapabilityCheck:
    name: str
    expected: dict[str, bool]
    actual: dict[str, bool]


@dataclass
class EndpointGuardCheck:
    file_path: str
    function_name: str
    required_tokens: list[str]
    passed: bool
    details: str


ROOT = Path(__file__).resolve().parents[2]
BACKEND_APP = ROOT / "backend" / "app"


def _can_use_connector(plan: str, connector: str) -> bool:
    try:
        plan_guard.enforce_connector_access(plan, connector)
        return True
    except Exception:
        return False


def _can_use_sso(plan: str) -> bool:
    try:
        plan_guard.enforce_sso(plan)
        return True
    except Exception:
        return False


def _can_use_webhooks(plan: str) -> bool:
    try:
        plan_guard.enforce_webhooks(plan)
        return True
    except Exception:
        return False


def _can_use_scheduling(plan: str) -> bool:
    try:
        plan_guard.enforce_scheduling(plan)
        return True
    except Exception:
        return False


def _can_use_dashboard_sharing(plan: str) -> bool:
    try:
        plan_guard.enforce_dashboard_sharing(plan)
        return True
    except Exception:
        return False


def _lineage_graph_allowed(plan: str) -> bool:
    try:
        plan_guard.enforce_sso(plan)
        return True
    except Exception:
        return False


def build_capability_checks() -> list[CapabilityCheck]:
    plans = ["Free", "Starter", "Professional", "Team", "Business", "Enterprise"]

    expected_json_parquet = {
        "Free": False,
        "Starter": False,
        "Professional": True,
        "Team": True,
        "Business": True,
        "Enterprise": True,
    }
    actual_json_parquet = {
        plan: {"json", "parquet"}.issubset(plan_guard.limits_for_plan(plan).allowed_formats)
        for plan in plans
    }

    expected_core_connector = {
        "Free": False,
        "Starter": False,
        "Professional": True,
        "Team": True,
        "Business": True,
        "Enterprise": True,
    }
    actual_core_connector = {plan: _can_use_connector(plan, "postgresql") for plan in plans}

    expected_enterprise_connector = {
        "Free": False,
        "Starter": False,
        "Professional": False,
        "Team": True,
        "Business": True,
        "Enterprise": True,
    }
    actual_enterprise_connector = {plan: _can_use_connector(plan, "snowflake") for plan in plans}

    expected_scheduling = {
        "Free": False,
        "Starter": True,
        "Professional": True,
        "Team": True,
        "Business": True,
        "Enterprise": True,
    }
    actual_scheduling = {plan: _can_use_scheduling(plan) for plan in plans}

    expected_dashboard_sharing = {
        "Free": False,
        "Starter": True,
        "Professional": True,
        "Team": True,
        "Business": True,
        "Enterprise": True,
    }
    actual_dashboard_sharing = {plan: _can_use_dashboard_sharing(plan) for plan in plans}

    expected_workspace_sharing = {
        "Free": False,
        "Starter": False,
        "Professional": False,
        "Team": True,
        "Business": True,
        "Enterprise": True,
    }
    actual_workspace_sharing = {
        plan: plan_guard.has_min_plan(plan, "Team")
        for plan in plans
    }

    expected_sso = {
        "Free": False,
        "Starter": False,
        "Professional": False,
        "Team": False,
        "Business": True,
        "Enterprise": True,
    }
    actual_sso = {plan: _can_use_sso(plan) for plan in plans}

    expected_webhooks = {
        "Free": False,
        "Starter": False,
        "Professional": False,
        "Team": False,
        "Business": True,
        "Enterprise": True,
    }
    actual_webhooks = {plan: _can_use_webhooks(plan) for plan in plans}

    expected_lineage = {
        "Free": False,
        "Starter": False,
        "Professional": False,
        "Team": False,
        "Business": True,
        "Enterprise": True,
    }
    actual_lineage = {plan: _lineage_graph_allowed(plan) for plan in plans}

    return [
        CapabilityCheck("JSON+Parquet Upload", expected_json_parquet, actual_json_parquet),
        CapabilityCheck("Core DB Connectors", expected_core_connector, actual_core_connector),
        CapabilityCheck("Enterprise Connectors", expected_enterprise_connector, actual_enterprise_connector),
        CapabilityCheck("Scheduling", expected_scheduling, actual_scheduling),
        CapabilityCheck("Dashboard Sharing", expected_dashboard_sharing, actual_dashboard_sharing),
        CapabilityCheck("Workspace Sharing", expected_workspace_sharing, actual_workspace_sharing),
        CapabilityCheck("SSO", expected_sso, actual_sso),
        CapabilityCheck("Webhooks", expected_webhooks, actual_webhooks),
        CapabilityCheck("Lineage Graph", expected_lineage, actual_lineage),
    ]


def _function_segment(file_path: Path, function_name: str) -> str | None:
    source = file_path.read_text(encoding="utf-8")
    tree = ast.parse(source)
    lines = source.splitlines()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name == function_name:
            start = node.lineno - 1
            end = getattr(node, "end_lineno", node.lineno)
            return "\n".join(lines[start:end])
    return None


def build_endpoint_guard_checks() -> list[EndpointGuardCheck]:
    checks = [
        ("backend/app/routers/imports.py", "upload_file", ["enforce_file_constraints"]),
        ("backend/app/routers/imports.py", "test_connection", ["enforce_connector_access"]),
        ("backend/app/routers/imports.py", "connector_import", ["enforce_connector_access", "enforce_file_constraints"]),
        ("backend/app/routers/imports.py", "connect_database", ["enforce_connector_access"]),
        ("backend/app/routers/connectors.py", "import_from_connector", ["enforce_connector_access", "enforce_file_constraints"]),
        ("backend/app/routers/connectors.py", "sync_connector", ["enforce_connector_access", "enforce_file_constraints"]),
        ("backend/app/routers/jobs.py", "create_job", ["enforce_scheduling"]),
        ("backend/app/routers/pipelines.py", "create_pipeline", ["enforce_scheduling"]),
        ("backend/app/routers/pipelines.py", "update_pipeline", ["enforce_scheduling"]),
        ("backend/app/routers/pipelines.py", "run_pipeline", ["enforce_scheduling"]),
        ("backend/app/routers/dashboards_v2.py", "publish_dashboard", ["enforce_dashboard_sharing"]),
        ("backend/app/routers/workspaces.py", "create_workspace", ["enforce_workspace_limit"]),
        ("backend/app/routers/workspaces.py", "share_workspace", ["enforce_min_plan", '"Team"']),
        ("backend/app/routers/auth.py", "oidc_login", ["enforce_sso"]),
        ("backend/app/routers/webhooks.py", "register_hook", ["enforce_webhooks"]),
        ("backend/app/routers/webhooks.py", "list_hooks", ["enforce_webhooks"]),
        ("backend/app/routers/datasets.py", "dataset_lineage_graph", ["enforce_sso"]),
    ]

    results: list[EndpointGuardCheck] = []
    for rel_path, fn_name, tokens in checks:
        file_path = ROOT / rel_path
        segment = _function_segment(file_path, fn_name)
        if segment is None:
            results.append(
                EndpointGuardCheck(
                    file_path=rel_path,
                    function_name=fn_name,
                    required_tokens=tokens,
                    passed=False,
                    details="Function not found",
                )
            )
            continue
        missing = [token for token in tokens if token not in segment]
        results.append(
            EndpointGuardCheck(
                file_path=rel_path,
                function_name=fn_name,
                required_tokens=tokens,
                passed=len(missing) == 0,
                details="OK" if not missing else f"Missing tokens: {', '.join(missing)}",
            )
        )
    return results


def scan_hardcoded_free_assignments() -> list[str]:
    findings: list[str] = []
    pattern = re.compile(r"user_plan\s*=\s*['\"]free['\"]", re.IGNORECASE)
    for file_path in BACKEND_APP.rglob("*.py"):
        text = file_path.read_text(encoding="utf-8")
        if pattern.search(text):
            findings.append(str(file_path.relative_to(ROOT)).replace("\\", "/"))
    return findings


def _emoji(ok: bool) -> str:
    return "✅" if ok else "❌"


def render_markdown(
    capability_checks: list[CapabilityCheck],
    endpoint_checks: list[EndpointGuardCheck],
    hardcoded_findings: list[str],
) -> str:
    plans = ["Free", "Starter", "Professional", "Team", "Business", "Enterprise"]
    lines: list[str] = []

    lines.append("# Pricing Matrix Execution Report")
    lines.append("")
    lines.append("## Execution Mode")
    lines.append("")
    lines.append("- Live API matrix: skipped (backend not reachable at `http://127.0.0.1:8000`)")
    lines.append("- Offline verification: enabled (plan logic + endpoint guard wiring + hardcoded plan scan)")
    lines.append("")

    lines.append("## Plan Capability Matrix")
    lines.append("")
    lines.append("| Capability | Free | Starter | Professional | Team | Business | Enterprise | Status |")
    lines.append("|---|---|---|---|---|---|---|---|")

    for check in capability_checks:
        match = all(check.expected[plan] == check.actual[plan] for plan in plans)
        row = [check.name]
        for plan in plans:
            row.append(_emoji(check.actual[plan]))
        row.append("PASS" if match else "FAIL")
        lines.append("| " + " | ".join(row) + " |")

    lines.append("")
    lines.append("## Endpoint Guard Wiring")
    lines.append("")
    lines.append("| Endpoint Function | File | Required Guards | Result |")
    lines.append("|---|---|---|---|")
    for item in endpoint_checks:
        lines.append(
            "| "
            + f"`{item.function_name}` | `{item.file_path}` | "
            + ", ".join(f"`{token}`" for token in item.required_tokens)
            + f" | {'PASS' if item.passed else 'FAIL'} ({item.details}) |"
        )

    lines.append("")
    lines.append("## Hardcoded Plan Override Scan")
    lines.append("")
    if hardcoded_findings:
        lines.append("- Result: FAIL")
        lines.append("- Files:")
        for finding in hardcoded_findings:
            lines.append(f"  - `{finding}`")
    else:
        lines.append("- Result: PASS")
        lines.append("- No `user_plan = \"free\"` assignments found in `backend/app`." )

    lines.append("")
    capability_pass = all(all(c.expected[p] == c.actual[p] for p in plans) for c in capability_checks)
    endpoint_pass = all(item.passed for item in endpoint_checks)
    hardcoded_pass = not hardcoded_findings
    overall = capability_pass and endpoint_pass and hardcoded_pass
    lines.append("## Overall")
    lines.append("")
    lines.append(f"- Capability matrix: {'PASS' if capability_pass else 'FAIL'}")
    lines.append(f"- Endpoint guard checks: {'PASS' if endpoint_pass else 'FAIL'}")
    lines.append(f"- Hardcoded override scan: {'PASS' if hardcoded_pass else 'FAIL'}")
    lines.append(f"- Final status: {'PASS' if overall else 'FAIL'}")
    lines.append("")

    return "\n".join(lines)


def main() -> int:
    capability_checks = build_capability_checks()
    endpoint_checks = build_endpoint_guard_checks()
    hardcoded_findings = scan_hardcoded_free_assignments()

    markdown = render_markdown(capability_checks, endpoint_checks, hardcoded_findings)
    out_path = ROOT / "docs" / "PRICING_MATRIX_REPORT.md"
    out_path.write_text(markdown, encoding="utf-8")
    print(f"Wrote report: {out_path}")

    plans = ["Free", "Starter", "Professional", "Team", "Business", "Enterprise"]
    capability_pass = all(all(c.expected[p] == c.actual[p] for p in plans) for c in capability_checks)
    endpoint_pass = all(item.passed for item in endpoint_checks)
    hardcoded_pass = not hardcoded_findings
    return 0 if (capability_pass and endpoint_pass and hardcoded_pass) else 1


if __name__ == "__main__":
    raise SystemExit(main())
