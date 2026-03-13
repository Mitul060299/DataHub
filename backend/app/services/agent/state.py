from typing import Annotated, NotRequired, Optional, TypedDict

from langgraph.graph.message import add_messages


class PlanStep(TypedDict):
    step_number: int
    operation: str
    description: str
    parameters: dict
    sql: NotRequired[str]
    template_id: Optional[str]
    estimated_rows: str
    reversible: bool


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
    tile_created: NotRequired[dict]


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]

    dataset_id: str
    schema: dict
    stats: dict
    sample_rows: list
    available_templates: list[dict]
    calculated_columns: list[dict]
    dashboards: list[dict]

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

    final_response: str
    chart_config: Optional[dict]
    query_results: Optional[list]
