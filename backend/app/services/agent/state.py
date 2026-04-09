from typing import Annotated, Any, NotRequired, Optional, TypedDict

from langgraph.graph.message import add_messages


class TableRegistryEntry(TypedDict):
    """Tracks every table/view the agent has created or registered this session."""
    duckdb_name: str          # name usable directly in DuckDB SQL
    dataset_id: str           # Supabase dataset_meta id (may be ephemeral uuid)
    display_name: str         # human-readable label
    source_intent: str        # intent that created this entry
    parent_tables: list[str]  # duckdb_names of inputs
    row_count: int
    column_names: list[str]
    pipeline_step_number: int
    is_artifact: bool
    artifact_url: NotRequired[str]  # signed download URL if exported
    is_view: bool             # True=lazy VIEW, False=materialised TABLE


class PlanStep(TypedDict):
    step_number: int
    operation: str
    description: str
    parameters: dict
    sql: NotRequired[str]
    template_id: Optional[str]
    estimated_rows: str
    reversible: bool
    depends_on: NotRequired[list[int]]  # step_numbers this step depends on; [] = linear (depends on previous)


class ExecutionResult(TypedDict):
    step_number: int
    operation: str
    success: bool
    rows_affected: Optional[int]
    run_id: Optional[str]
    output_dataset_id: Optional[str]
    sql: Optional[str]
    error: Optional[str]
    column_added: NotRequired[dict]
    tile_created: NotRequired[dict]    # {id, dashboard_id, title, chart_type, echarts_config, saveable}
    query_results: NotRequired[list]   # rows from summarise / validate
    artifact_url: NotRequired[str]     # export URL
    kpi_candidates: NotRequired[list[dict]]  # [{label, value, trend}] from reconcile/summarise


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

    root_dataset_id: str
    dataset_id: str
    user_id: str
    workspace_id: str
    schema: dict
    stats: dict
    sample_rows: list
    available_templates: list[dict]
    calculated_columns: list[dict]
    dashboards: list[dict]

    # Optional list of additional dataset IDs to make available for JOIN/UNION
    secondary_dataset_ids: NotRequired[list[str]]
    # Schemas loaded for secondary datasets – keyed by dataset name/alias
    secondary_schemas: NotRequired[dict[str, dict]]

    # Session workspace
    session_id: NotRequired[str]           # f"{user_id}:{chat_session_id}"
    table_registry: NotRequired[dict[str, TableRegistryEntry]]  # duckdb_name -> entry

    pipeline_steps: list[dict]

    intent: str
    plan: list[PlanStep]
    plan_approved: bool
    current_step_index: int

    execution_results: list[ExecutionResult]
    retry_count: int
    error: Optional[str]
    run_id: Optional[str]
    output_dataset_id: Optional[str]
    run_steps: list[dict]
    completed_step_numbers: NotRequired[list[int]]  # step_numbers that have finished executing
    plan_type: NotRequired[str]  # "linear" | "dag"

    final_response: str
    chart_config: Optional[dict]   # legacy; prefer execution_results[].tile_created
    query_results: Optional[list]
    kpi_candidates: NotRequired[list[dict]]  # [{label, value, trend}] offered to user
    join_suggestions: NotRequired[list[dict]]  # [{secondary_id, secondary_name, on_column}] from context_loader
    needs_clarification: NotRequired[bool]
    plan_pending_modification: NotRequired[bool]
