"""
dashboard_generator.py
======================
Auto Mode node — runs after goal_verifier on the success path.

Uses the user's original goal text + dataset schema/stats to ask the LLM
for a 3-6 tile dashboard layout, then creates the dashboard and its tiles
in one shot via DashboardsV2Service.

For each chart/metric tile that has a query_hint, a second LLM call generates
a DuckDB SQL query which is executed in-process; the result is stored as a live
echarts_config (chart) or metric_value (metric) directly on the tile.

Outputs merged into AgentState:
  - generated_dashboard_id : str | None   — ID of the new dashboard (or None on skip/error)
"""
from __future__ import annotations

import logging
from typing import Any

import duckdb

from ...dashboards_v2_service import DashboardsV2Service
from ...dashboard_ai_service import generate_layout
from ...echarts_builder import build_echarts_config
from ...llm_provider import complete
from ..state import AgentState

_logger = logging.getLogger(__name__)

# Only auto-generate when the goal run largely passed.
_SUCCESS_THRESHOLD = 0.5

_SQL_SYSTEM = """\
You are a SQL expert for DuckDB.
Given a table name, its columns, and a plain-English description of what to visualise,
output ONLY a valid DuckDB SQL SELECT statement — no markdown, no explanation.

Rules:
- Use the exact table name provided.
- Return at most 50 rows.
- For charts: return 2 columns — a category/label column and a numeric value column.
- For metrics: return exactly 1 row with 1 numeric column (the aggregate value).
- Never use LIMIT more than 50.
"""


def _goal_succeeded(state: AgentState) -> bool:
    report = state.get("goal_report") or {}
    total = int(report.get("total_rules", 0))
    satisfied = int(report.get("rules_satisfied", 0))
    return total > 0 and (satisfied / total) >= _SUCCESS_THRESHOLD


def _build_description(state: AgentState) -> str:
    goal_raw: str = state.get("auto_goal_raw") or ""
    schema: dict = state.get("schema") or {}
    cols = list(schema.keys())[:20]
    col_list = ", ".join(cols) if cols else "unknown columns"

    stats: dict = state.get("stats") or {}
    row_count: int = int(stats.get("row_count", 0))

    parts = []
    if goal_raw:
        parts.append(f"Goal: {goal_raw.strip()}")
    parts.append(f"Dataset has {row_count:,} rows and columns: {col_list}.")
    parts.append(
        "Create a dashboard with 1-2 metric tiles for key KPIs, "
        "2-3 chart tiles visualising the most interesting dimensions, "
        "and optionally one table tile for drill-down."
    )
    return " ".join(parts)


async def _generate_sql_for_hint(
    query_hint: str,
    table_name: str,
    schema: dict,
    tile_type: str,
    user_id: str,
) -> str | None:
    """Ask the LLM to write a DuckDB SQL query for the given hint."""
    col_list = ", ".join(f"{c} ({v.get('dtype', 'text')})" for c, v in list(schema.items())[:30])
    user_msg = (
        f"Table: {table_name}\n"
        f"Columns: {col_list}\n\n"
        f"Visualisation request ({tile_type}): {query_hint}"
    )
    try:
        raw, _, _ = await complete(
            [
                {"role": "system", "content": _SQL_SYSTEM},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.1,
            timeout=20.0,
            call_type="dashboard_sql",
            user_id=user_id,
        )
        # Strip markdown fences if LLM wrapped the SQL
        sql = raw.strip().removeprefix("```sql").removeprefix("```").removesuffix("```").strip()
        return sql if sql.upper().startswith("SELECT") else None
    except Exception as exc:
        _logger.warning("_generate_sql_for_hint: LLM error: %s", exc)
        return None


async def _populate_tile(
    tile_type: str,
    chart_type: str,
    title: str,
    query_hint: str,
    table_name: str,
    schema: dict,
    duckdb_path: str | None,
    user_id: str,
) -> dict[str, Any]:
    """Return updates dict with echarts_config / metric_value / query_spec.sql."""
    sql = await _generate_sql_for_hint(query_hint, table_name, schema, tile_type, user_id)
    if not sql:
        return {}

    try:
        if duckdb_path:
            conn = duckdb.connect(duckdb_path, read_only=True)
        else:
            conn = duckdb.connect()
        try:
            df = conn.execute(sql).df()
        finally:
            conn.close()
    except Exception as exc:
        _logger.warning("_populate_tile: DuckDB exec failed: %s", exc)
        return {}

    if df is None or df.empty:
        return {}

    updates: dict[str, Any] = {"query_spec_sql": sql}

    if tile_type == "metric":
        try:
            val = float(df.iloc[0, 0])
            # Format as integer if no fractional part
            updates["metric_value"] = f"{val:,.0f}" if val == int(val) else f"{val:,.2f}"
        except Exception:
            pass
    else:
        rows = df.to_dict(orient="records")
        cols = list(df.columns)
        if len(cols) >= 2:
            try:
                updates["echarts_config"] = build_echarts_config(
                    chart_type=chart_type or "bar",
                    rows=rows,
                    x_col=cols[0],
                    y_col=cols[1:] if len(cols) > 2 else cols[1],
                    title=title,
                )
            except Exception as exc:
                _logger.warning("_populate_tile: echarts build failed: %s", exc)

    return updates


async def dashboard_generator(state: AgentState) -> dict[str, Any]:
    # Only run on auto-mode success paths
    if not state.get("auto_mode"):
        return {"generated_dashboard_id": None}

    if not _goal_succeeded(state):
        _logger.info("dashboard_generator: goal did not meet threshold — skipping")
        return {"generated_dashboard_id": None}

    user_id: str = state.get("user_id") or ""
    dataset_id: str = state.get("output_dataset_id") or state.get("dataset_id") or ""

    if not user_id or not dataset_id:
        _logger.warning("dashboard_generator: missing user_id or dataset_id — skipping")
        return {"generated_dashboard_id": None}

    schema: dict = state.get("schema") or {}
    table_name: str = state.get("active_table_name") or state.get("source_table") or "dataset"
    duckdb_path: str | None = state.get("duckdb_conn_path")

    try:
        description = _build_description(state)
        dataset_name = table_name

        tile_specs = generate_layout(
            description=description,
            dataset_names=[dataset_name],
            user_id=user_id,
        )
    except Exception as exc:
        _logger.error("dashboard_generator: LLM layout generation failed: %s", exc)
        return {"generated_dashboard_id": None}

    if not tile_specs:
        return {"generated_dashboard_id": None}

    # Create the dashboard
    try:
        goal_raw: str = (state.get("auto_goal_raw") or "Auto Dashboard").strip()
        dash_name = goal_raw[:60] if len(goal_raw) > 60 else goal_raw
        dashboard = DashboardsV2Service.create_dashboard(
            user_id=user_id,
            dataset_id=dataset_id,
            name=dash_name,
            description="Auto-generated from goal run",
            layout={},
        )
    except Exception as exc:
        _logger.error("dashboard_generator: create_dashboard failed: %s", exc)
        return {"generated_dashboard_id": None}

    # Add tiles (and immediately populate chart/metric data where possible)
    created_tiles = []
    for i, spec in enumerate(tile_specs):
        try:
            tile_type: str = spec.get("tile_type", "chart")
            title: str = str(spec.get("title", f"Tile {i + 1}"))
            chart_type: str = str(spec.get("chart_type", "bar"))
            w: int = int(spec.get("w", 6))
            h: int = int(spec.get("h", 6))
            layout = {"x": (i % 2) * 6, "y": (i // 2) * h, "w": w, "h": h}

            query_spec: dict[str, Any] = {}
            if spec.get("query_hint"):
                query_spec["query_hint"] = str(spec["query_hint"])
            if spec.get("level"):
                query_spec["level"] = spec["level"]
            if spec.get("text"):
                query_spec["text"] = str(spec["text"])

            metric_label: str | None = str(spec["metric_label"]) if spec.get("metric_label") else None
            metric_value: str | None = str(spec["metric_value"]) if spec.get("metric_value") else None
            echarts_config: dict | None = None

            # For chart and metric tiles with a query_hint, generate real data
            hint = str(spec.get("query_hint") or "")
            if hint and tile_type in ("chart", "metric"):
                data_updates = await _populate_tile(
                    tile_type=tile_type,
                    chart_type=chart_type,
                    title=title,
                    query_hint=hint,
                    table_name=table_name,
                    schema=schema,
                    duckdb_path=duckdb_path,
                    user_id=user_id,
                )
                if data_updates.get("echarts_config"):
                    echarts_config = data_updates["echarts_config"]
                if data_updates.get("metric_value"):
                    metric_value = data_updates["metric_value"]
                if data_updates.get("query_spec_sql"):
                    query_spec["sql"] = data_updates["query_spec_sql"]

            tile = DashboardsV2Service.add_tile(
                user_id=user_id,
                dashboard_id=dashboard.id,
                dataset_id=dataset_id,
                title=title,
                chart_type=chart_type,
                query_spec=query_spec,
                layout=layout,
                tile_type=tile_type,
                echarts_config=echarts_config,
                metric_label=metric_label,
                metric_value=metric_value,
            )
            created_tiles.append(tile.id)
        except Exception as exc:
            _logger.warning("dashboard_generator: failed to add tile %d: %s", i, exc)

    _logger.info(
        "dashboard_generator: created dashboard %s with %d tiles (%d populated)",
        dashboard.id,
        len(created_tiles),
        sum(1 for s in tile_specs if s.get("tile_type") in ("chart", "metric")),
    )
    return {"generated_dashboard_id": dashboard.id}
