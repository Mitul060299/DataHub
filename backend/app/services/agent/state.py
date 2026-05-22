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
    project_id: str
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

    # Cross-pipeline step inputs loaded for this session.  Each entry is:
    # { alias, source_step_id, source_dataset_id, source_dataset_name, description, snapshot_path }
    # The agent can reference these by alias in any SQL it generates.
    cross_pipeline_inputs: NotRequired[list[dict]]

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
    # Tracks which dataset_ids have already been charged for data scan this run,
    # so we don't count the same source dataset multiple times across pipeline steps.
    scan_charged_dataset_ids: NotRequired[list[str]]

    # -----------------------------------------------------------------------
    # Auto Mode fields  (all NotRequired — absent in Manual Mode)
    # -----------------------------------------------------------------------
    auto_mode: NotRequired[bool]
    auto_run_id: NotRequired[str]           # agent_auto_runs.id
    auto_goal_raw: NotRequired[str]         # user's raw goal text
    auto_goal: NotRequired[dict]            # AutoGoal (parsed rules)
    auto_plan: NotRequired[list[dict]]      # list[AutoPlanStep]
    current_rule_index: NotRequired[int]    # index into auto_plan
    reflection_attempts: NotRequired[dict]  # {step_number: tier_reached}
    reflection_history: NotRequired[dict]   # {step_number: [rationale strings]}
    last_validation: NotRequired[dict]      # StepValidationResult
    interrupt_pending: NotRequired[bool]
    interrupt_question: NotRequired[dict]   # InterruptQuestion | None
    interrupt_response: NotRequired[str]    # user's answer, set by /resume endpoint
    goal_report: NotRequired[dict]          # GoalReport
    goal_verifier_recursions: NotRequired[int]
    auto_pre_run_review: NotRequired[bool]  # show plan before executing
    prior_pipeline: NotRequired[dict]       # PriorPipeline | None
    reference_steps: NotRequired[list[dict]]    # list[ReferenceStep]
    inferred_expectations: NotRequired[list[dict]]  # list[ColumnExpectation]
    expected_profile: NotRequired[dict]     # ExpectedProfile | None
    drift_report: NotRequired[dict]         # DriftReport | None
    prior_trust_level: NotRequired[str]     # "strict"|"guide"|"reference"
    active_table_name: NotRequired[str]     # current output DuckDB table name
    duckdb_conn_path: NotRequired[str]      # DuckDB file path (for validators)
    total_tokens_used: NotRequired[int]     # running token total for this auto run
    dry_run: NotRequired[bool]              # SAMPLE 5000 ROWS mode
    # Internal signals (not persisted)
    _verifier_trigger_replan: NotRequired[list[int]]  # rule_ids to re-plan
