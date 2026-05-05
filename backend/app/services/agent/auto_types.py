"""
auto_types.py
=============
TypedDicts and Literals for Auto Mode.

These are shared across all auto-mode nodes and the API layer.
All fields use snake_case to match the DB column names in agent_auto_runs.
"""
from __future__ import annotations

from typing import Any, Literal, NotRequired, TypedDict


# ---------------------------------------------------------------------------
# DQ Assertion DSL
# ---------------------------------------------------------------------------

class DQAssertion(TypedDict):
    """A single data-quality assertion that compiles to a single SELECT COUNT(*)."""
    kind: Literal["not_null", "unique", "regex", "range", "in_set", "sql"]
    column: NotRequired[str]          # None/absent for "sql" kind
    params: NotRequired[dict[str, Any]]   # kind-specific: {"pattern": ...}, {"min": ..., "max": ...}, etc.
    tolerance: NotRequired[int]       # max residual rows before the assertion fails; default 0


# ---------------------------------------------------------------------------
# Goal parsing outputs
# ---------------------------------------------------------------------------

class AutoRule(TypedDict):
    rule_id: int
    description: str
    target_columns: list[str]
    operation_hint: NotRequired[str | None]  # registered op name or None
    assertion: DQAssertion
    depends_on: list[int]                     # rule_ids that must complete first
    complexity: Literal["simple", "moderate", "complex"]
    confidence: float                         # 0.0 – 1.0


class AutoGoal(TypedDict):
    rules: list[AutoRule]
    total_rules: int
    goal_summary: str   # one-sentence rephrasing of the user goal


# ---------------------------------------------------------------------------
# Auto plan — extends existing PlanStep with two extra fields
# ---------------------------------------------------------------------------

class AutoPlanStep(TypedDict):
    """A PlanStep with additional Auto Mode metadata."""
    step_number: int
    operation: str
    description: str
    parameters: dict[str, Any]
    sql: NotRequired[str]
    depends_on: NotRequired[list[int]]    # step_numbers
    rule_id: int                          # which AutoRule this step satisfies
    rule_ids: NotRequired[list[int]]      # if step covers multiple rules
    justification: str
    needs_validator: bool                 # False for rename/cast/select-only ops


AutoPlan = list[AutoPlanStep]


# ---------------------------------------------------------------------------
# Step validation result
# ---------------------------------------------------------------------------

class StepValidationResult(TypedDict):
    step_number: int
    rule_id: int
    passed: bool
    residual_count: int
    tolerance: int
    sample_failures: list[dict[str, Any]]
    assertion_sql: str


# ---------------------------------------------------------------------------
# Interrupt question
# ---------------------------------------------------------------------------

class InterruptOption(TypedDict):
    option_id: str
    label: str
    implication: str


class InterruptQuestion(TypedDict):
    rule_id: int
    question: str
    options: list[InterruptOption]
    sample_rows: list[dict[str, Any]]
    allow_freeform: bool
    blocks_other_rules: bool


# ---------------------------------------------------------------------------
# Goal verification outputs
# ---------------------------------------------------------------------------

class RuleFailure(TypedDict):
    rule_id: int
    description: str
    residual_count: int
    sample: list[dict[str, Any]]


class GoalReport(TypedDict):
    rules_satisfied: int
    rules_failed: int
    rules_skipped: int
    total_rules: int
    failures: list[RuleFailure]
    duration_seconds: float
    tokens_used: int


# ---------------------------------------------------------------------------
# Prior pipeline / drift detection types
# ---------------------------------------------------------------------------

class ReferenceStep(TypedDict):
    order: int
    operation: str            # registered op name or "custom_sql"
    parameters: dict[str, Any]
    source_quote: str         # snippet of original SQL/code for audit
    covers_rules: list[int]   # filled in by goal_parser join pass
    confidence: float


class ColumnExpectation(TypedDict):
    column: str
    kind: str   # not_null | in_set | range | regex | unique | type | format
    params: dict[str, Any]
    tolerance: float
    source: Literal["user", "inferred"]


class NovelValue(TypedDict):
    column: str
    value: str
    count: int
    rules_affected: list[int]


class ColumnDrift(TypedDict):
    column: str
    status: Literal["green", "amber", "red"]
    expectation: ColumnExpectation
    actual_value: Any
    deviation: float          # 0.0 = no drift, 1.0 = complete violation
    auto_adjustment: NotRequired[dict[str, Any]]   # suggested param adjustment
    novel_values: NotRequired[list[NovelValue]]


class DriftReport(TypedDict):
    columns: list[ColumnDrift]
    green_count: int
    amber_count: int
    red_count: int
    auto_adjustments: list[dict[str, Any]]  # passed to auto_planner as hints
    novel_values: list[NovelValue]
    schema_changes: list[dict[str, Any]]    # added/dropped/type-changed columns


# ---------------------------------------------------------------------------
# Prior pipeline input shape
# ---------------------------------------------------------------------------

class PriorPipeline(TypedDict):
    format: Literal["sql", "python", "text", "dbt", "recipe_id", "pipeline_run_id"]
    content: str
    trust_level: Literal["strict", "guide", "reference"]


class ExpectedColumn(TypedDict):
    name: str
    null_rate_pct: NotRequired[float]
    cardinality_min: NotRequired[int]
    value_set: NotRequired[list[str]]
    format: NotRequired[str]
    tz: NotRequired[str]


class ExpectedProfile(TypedDict):
    columns: list[ExpectedColumn]


# ---------------------------------------------------------------------------
# Auto run request body
# ---------------------------------------------------------------------------

class AutoRunGoal(TypedDict):
    """Structured goal object (alternative to plain string)."""
    goal_text: str
    prior_pipeline: NotRequired[PriorPipeline]
    expected_profile: NotRequired[ExpectedProfile]
