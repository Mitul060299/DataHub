# AI Agent — Auto Mode: Planning Document

> **Status:** Planning / Pre-development
> **Scope:** Backend (extend agent graph, consolidate existing auto scaffolding, new service nodes), Frontend (mode switcher, live feed, interrupt card), API (extend existing endpoints), DB (one new table + two new step columns)
> **Prerequisite reading:** [ARCHITECTURE.md](ARCHITECTURE.md), [CAPABILITIES.md](CAPABILITIES.md)
> **Last updated:** 2026-04-23

---

## 0. Relationship to Existing Code

Before discussing the design, it is critical to acknowledge what already exists in the codebase so this plan extends rather than duplicates it.

### 0.1 What is already implemented

| Component | File | What it does today |
|---|---|---|
| Manual-mode graph | [backend/app/services/agent/graph.py](backend/app/services/agent/graph.py) | The 9-node LangGraph state machine described in [ARCHITECTURE.md](ARCHITECTURE.md) |
| Agent state | [backend/app/services/agent/state.py](backend/app/services/agent/state.py) | `AgentState` TypedDict — already includes `plan_pending_modification`, `completed_step_numbers`, `secondary_dataset_ids`, `table_registry` |
| Conditional routing | [backend/app/services/agent/edges.py](backend/app/services/agent/edges.py) | `route_intent`, `route_after_present`, `route_after_execute`, `route_after_reflect` — already supports DAG-style step ordering via `_next_ready_step()` |
| Step dispatcher | [backend/app/services/agent/nodes/execute_step.py](backend/app/services/agent/nodes/execute_step.py) and [backend/app/services/step_engine.py](backend/app/services/step_engine.py) | Operation registry covering 30+ pipeline ops |
| Streaming chat SSE | [backend/app/routers/cleaning.py](backend/app/routers/cleaning.py) → `POST /api/cleaning/datasets/{dataset_id}/chat` | The current production agent endpoint (rate-limited 60/min) |
| Full-auto scaffolding | [backend/app/services/full_auto_agent.py](backend/app/services/full_auto_agent.py), [backend/app/controllers/full_auto_controller.py](backend/app/controllers/full_auto_controller.py), [backend/app/routers/full_auto_routes.py](backend/app/routers/full_auto_routes.py) → `GET /api/auto/run` | An incomplete autonomous-execution prototype with `AgentEvent` SSE dataclass, in-memory session/event-queue tracking, and a partial `ToolExecutor` |
| Automation guardrails | [backend/app/services/automation_guardrails.py](backend/app/services/automation_guardrails.py) | Pre-execution policy check (max_rows, max_columns, max_request_chars, max_steps, allow_ml_training) — already invoked by `FullAutoController` |
| DuckDB session model | [backend/app/services/duckdb_session.py](backend/app/services/duckdb_session.py) | Disk-backed sessions, 30-min TTL, blocked DML regex, query timeout (60s default) |
| Snapshot replay | `PipelineStepDB.snapshot_path` (S3 Parquet per step) | Crash-recovery free for any step the agent runs |
| Profiling stats | [backend/app/services/profiler.py](backend/app/services/profiler.py) | Column completeness, duplicates, outlier counts, per-column histograms — useful as input to the goal parser |
| Frontend chat panel | [frontend/src/components/AIPanel.tsx](frontend/src/components/AIPanel.tsx), [frontend/src/hooks/useChatSession.ts](frontend/src/hooks/useChatSession.ts) | SSE consumer with plan-approval card, plan modification, message history |

### 0.2 What this plan changes

- **Consolidate** the partial `full_auto_agent.py` / `FullAutoController` prototype and the manual-mode `agent/graph.py` into a single agent that supports a `mode` flag (`manual` vs `auto`). The `AgentEvent` dataclass and SSE format from `full_auto_agent.py` are reusable; the `ToolExecutor` is superseded by the existing `StepEngine`.
- **Extend** the existing `AgentState` with auto-mode-only fields (backward compatible — Manual Mode ignores them).
- **Add** eight new graph nodes (goal_parser, auto_planner, step_validator, reflection_v2, interrupt_asker, goal_verifier, **prior_pipeline_parser**, **drift_detector**) that branch off the existing graph when `auto_mode=True`.
- **Reuse** the existing `automation_guardrails.py` policy engine, the existing `slowapi` rate limiter, the existing snapshot-replay machinery, the existing `pipeline_recorder` node, and the existing `profiler.py` for drift detection.
- **Two new DB tables** (`agent_auto_runs`, `agent_recipes` for one-click reusable monthly pipelines), **two new columns** on `pipeline_steps` (note: the actual table name is `pipeline_steps`, not `pipeline_steps_v2` as some docs claim).

### 0.3 What this plan deliberately does **not** do

- It does not introduce a second SSE format or a second LLM library (sticks with `langchain_groq.ChatGroq`).
- It does not introduce a new session model — Auto Mode runs in the same DuckDB session as the user's chat session, using the same `f"{user_id}:{chat_session_id}"` key.
- It does not change Manual Mode behaviour at all.

---

## 1. Context and Motivation

### 1.1 Current State — Manual Mode

The DataHub AI agent today is a 9-node LangGraph state machine ([backend/app/services/agent/graph.py](backend/app/services/agent/graph.py)):

```
context_loader → intent_classifier → [clarify_step?]
  → planner → plan_presenter (gate) → execute_step (loop, with DAG routing)
  → reflect (on SQL failure, max 3 retries) → pipeline_recorder → responder
```

The flow is deliberately **human-in-the-loop**:

1. User types a single intent in plain English.
2. Agent classifies the intent with the lightweight model (`llama-3.1-8b-instant`).
3. Planner generates an ordered plan (each step is a `PlanStep` TypedDict with `step_number`, `operation`, `description`, `parameters`, `sql?`, `depends_on?`).
4. The plan is presented to the user for **approval** via the `agent.plan` SSE event.
5. On approval (`plan_approved=True` on the next request), each step is executed; on SQL failure the `reflect` node rewrites the SQL up to 3 times.
6. `pipeline_recorder` writes `PipelineRunV2DB` + `PipelineStepDB` rows; results stream back as `agent.step.start`, `agent.done`, etc.

This is safe, auditable, and well-suited to exploratory analysis. For complex, rule-driven transformation work — e.g. "clean this dataset to meet these 12 business rules before the ETL window closes" — the back-and-forth becomes friction.

### 1.2 The Gap

Modern LLM reasoning is now strong enough to:

- Parse multi-constraint goals expressed in natural language or pasted business-rule documents.
- **Ingest the team's existing transformation logic** (last month's SQL job, a Python notebook, a Confluence runbook) and use it as a strong prior, so the agent replicates established practice instead of reinventing it.
- **Detect data drift upfront** — profile this month's file against the assumptions baked into the prior pipeline and the rules, and adjust step parameters automatically when the drift is small.
- Plan multi-step transformation sequences to satisfy those constraints.
- Detect when a step partially or fully fails, reason about why (drift vs ambiguity vs novel value), and attempt an alternative strategy.
- Know when it is stuck and surface a precise, actionable question — rather than failing silently or looping indefinitely.
- **Save the whole thing as a one-click reusable Recipe** so the next month's run takes 30 seconds, not 30 minutes.

The goal of this document is to design **Auto Mode** — exploiting these capabilities while retaining the ability to pause and ask the user when the agent genuinely cannot proceed (similar to how GitHub Copilot surfaces inline suggestions and clarifying prompts inside VS Code). The user pastes once, the agent plans the entire DAG with drift adjustments, runs it end-to-end, and the user gets a finished pipeline + a cleaned dataset + a Recipe for next month.

---

## 2. Product Vision — Two Modes

| Dimension | Manual Mode (existing) | Auto Mode (planned) |
|---|---|---|
| **Trigger input** | Single intent, per-turn | End goal + business rules, once |
| **Plan approval** | Required before every execution | Optional pre-run review (toggle); otherwise skipped |
| **Execution** | One approved step at a time | Autonomous multi-step loop with DAG-parallel rule execution |
| **Error recovery** | Reflect rewrites SQL; user re-engages | Three-tier escalation (param adjust → op substitute → decompose); only blocks user when all tiers fail |
| **User interrupt** | N/A — user always in control | Agent pauses and asks one specific question (VS Code Copilot style) |
| **Pipeline output** | Steps recorded turn-by-turn | Same `pipeline_steps` rows, tagged with `auto_run_id` and `rule_justification` |
| **Checkpoint** | User clicks "Save Checkpoint" | Agent proposes auto-checkpoint after goal verification passes |
| **Audit trail** | Step log + reflect log | Same + goal text + parsed rules + reflection-tier log + interrupt log |
| **Failure surface** | Plan presenter / reflect message | Goal completion report with per-rule pass/fail and recommended manual actions |

Both modes share the same DuckDB session, the same operation registry, the same `pipeline_recorder` node, the same SSE event format (`data: {JSON}\n\n`), the same auth/RBAC, and the same rate-limit infrastructure.

---

## 3. Auto Mode — Detailed Design

### 3.1 Goal Specification Interface

The user describes **what the data should look like at the end**, not how to get there. Acceptable input formats (all consumed as a single payload — the parser figures out the shape):

- **Free-text natural language** — "Remove all nulls, standardise the date column to ISO 8601, deduplicate by `customer_id` keeping the most recent record."
- **Pasted business rules document** — a numbered or bulleted list copied from a spec, Confluence page, or internal wiki.
- **Acceptance criteria (DQ assertions)** — "all values in `revenue` must be positive; `email` must match RFC 5322; `country_code` must be in the ISO 3166-1 alpha-2 list."
- **Prior pipeline (NEW — see §3.9)** — what the team has historically done to the previous version of this data: pasted SQL, pasted Python, plain-English steps copied from a runbook, or a reference to an existing DataHub `pipeline_run_id` / saved Recipe. The agent treats this as a strong prior — it will try to replicate the same logic and only deviate when the new data forces it.
- **Reference dataset schema** (Phase 4 stretch) — "the output must conform to this schema" with an attached Parquet/CSV schema sample.
- **Project glossary references** — the existing context loader already injects glossary terms into agent state; the goal parser should resolve glossary aliases (e.g. "active customer" → the project's saved definition).

The agent parses **everything** in a single request before doing anything — it does not start executing until it has a coherent understanding of the goal, the rules, and the prior pipeline (if provided). The user pastes once; the agent plans the full DAG, runs the upfront **drift check** (§3.9), shows the adapted plan, and after a single optional approval executes end-to-end. There is no back-and-forth turn-by-turn approval loop in Auto Mode — that is the whole point.

### 3.2 High-Level Execution Loop

```
          ┌──────────────────────────────────────┐
          │     [reuse] context_loader           │  loads schema, stats, glossary
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │     [reuse] automation_guardrails    │  pre-flight: row/col/step caps
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │   prior_pipeline_parser  (NEW §3.9)  │  optional — only if prior steps/SQL/recipe pasted
          │  - Normalises pasted SQL/Python/text │
          │    into reference DataHub ops        │
          │  - Extracts data assumptions per step│
          │    (expected types, null %, key card)│
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │          goal_parser  (NEW)          │
          │  - Splits goal into atomic rules     │
          │  - Resolves glossary aliases         │
          │  - Scores each rule by complexity    │
          │  - Orders rules by dependency        │
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │     drift_detector  (NEW §3.9)       │  upfront, no LLM — pure profiling diff
          │  - Compares new dataset profile vs   │
          │    expectations from prior pipeline  │
          │    + rule assumptions                │
          │  - Flags drifted columns + magnitude │
          │  - Auto-relaxes step params where    │
          │    safe (e.g. tolerance bumps)       │
          │  - Surfaces high-risk drift to       │
          │    interrupt_asker pre-emptively     │
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │         auto_planner  (NEW)          │
          │  - Generates DAG of pipeline steps   │
          │    seeded by prior pipeline (if any) │
          │  - Each step references one rule_id  │
          │    and a needs_validator flag        │
          │  - Independent rules → parallel      │
          └──────────────────┬───────────────────┘
                             ▼
                   ┌─────────▼──────────┐
                   │  Pre-run Review?   │  user setting (default: off)
                   │  Show plan + drift │
                   │  diff vs prior +   │
                   │  DQ estimate;      │
                   │  await approve     │
                   └─────────┬──────────┘
                             │  approved (or skipped)
                             ▼
          ┌──────────────────────────────────────┐
          │   Autonomous Executor Loop           │
          │   (extends existing execute_step     │
          │    + edges._next_ready_step DAG)     │
          │                                      │
          │   for each ready step in plan:       │
          │     1. execute_step    (reuse)       │
          │     2. step_validator  (skip if      │
          │          needs_validator=false —     │
          │          rename/cast/select-only ops)│
          │     3a. PASS → mark satisfied        │
          │     3b. PARTIAL/FAIL → reflection_v2 │
          │            tier 0: drift adjust      │
          │            tier 1: param tweak       │
          │            tier 2: op substitute     │
          │            tier 3: decompose         │
          │     3c. tiers exhausted →            │
          │            interrupt_asker (NEW)     │
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │         goal_verifier  (NEW)         │
          │  - Re-runs all rule assertions on    │
          │    the final session table           │
          │  - If gaps remain → 1 micro-plan     │
          │    (max recursion = 1)               │
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │   [reuse] pipeline_recorder          │  writes pipeline_runs_v2 + pipeline_steps
          └──────────────────┬───────────────────┘
                             ▼
          ┌──────────────────────────────────────┐
          │   Report + Optional Auto-Checkpoint  │
          │  - Goal completion report (SSE)      │
          │  - Offer Save as Dataset (existing   │
          │    /api/artifacts/save-checkpoint)   │
          │  - Offer Save as Recipe (NEW §3.9)   │
          │    so next month's data can be       │
          │    cleaned in one click              │
          └──────────────────────────────────────┘
```

### 3.3 New Agent Nodes

The following nodes are additive — they extend the existing graph without replacing any Manual Mode node. All LLM calls use the existing `langchain_groq.ChatGroq` wrapper with `response_format={"type": "json_object"}` (same pattern as `backend/app/services/llm.py`).

#### `goal_parser`
- **Input:** raw goal text + dataset schema + column stats (already in `AgentState`)
- **Model:** `llama-3.3-70b-versatile`, temperature `0`, JSON mode
- **Output:** `AutoGoal` object stored in agent state, where each rule is:
  ```python
  AutoRule = TypedDict('AutoRule', {
      'rule_id': int,
      'description': str,             # human-readable
      'target_columns': list[str],
      'operation_hint': str | None,   # one of the 30+ registered op names, or None
      'assertion': DQAssertion,       # see §3.5 — the post-step check
      'depends_on': list[int],        # rule_ids that must complete first
      'complexity': Literal['simple', 'moderate', 'complex'],
      'confidence': float,            # 0.0 – 1.0; below 0.6 routes to interrupt_asker pre-emptively
  })
  ```
- **Validation:** every `target_columns` entry must exist in the schema; `operation_hint` (when present) must be in the registered operation set; otherwise the parser is asked to revise once before erroring.

#### `auto_planner`
- **Input:** `AutoGoal` + dataset schema + column stats + existing operation registry signatures
- **Model:** `llama-3.3-70b-versatile`, temperature `0`, JSON mode
- **Output:** an `AutoPlan` — a list of `PlanStep` entries (the existing TypedDict from [backend/app/services/agent/prompts.py](backend/app/services/agent/prompts.py)) with two added fields:
  - `rule_id: int` — which `AutoRule` this step is satisfying
  - `justification: str` — short natural-language reason
- **Reuses** the existing planner prompt's templates and DAG `depends_on` semantics, so the executor edge logic (`_next_ready_step`) works without modification.
- **Step deduplication:** if two rules collapse to the same operation+params, the planner emits a single shared step linked to both rule_ids.

#### `step_validator`
- **Input:** the rule's `DQAssertion` + the DuckDB session table produced by the step
- **No LLM call** — pure SQL execution against the session
- **Output:** `{passed: bool, residual_count: int, sample_failures: list[dict], assertion_sql: str}`
- **Blocked DML guard:** the validator only runs `SELECT` statements; the existing `_BLOCKED_DML` regex in `duckdb_session.py` already enforces this.

#### `reflection_v2`
- **Trigger:** `step_validator.passed = False`
- **Model:** `llama-3.3-70b-versatile`, temperature `0.2`, JSON mode
- **Inputs:** original step, assertion failure sample (capped at 20 rows), column stats, attempt history (so successive tiers don't re-propose the same fix)
- **Output:** a new `PlanStep` with the same `rule_id` and an incremented `attempt` counter
- **Hard limit:** 3 attempts per rule (enforced in `AgentState.reflection_attempts`); on the third failure → `interrupt_asker`
- **Tier strategy:** see §3.6
- **Distinct from existing `reflect`:** the existing node only rewrites failing SQL syntax; `reflection_v2` reasons about a *semantically* failing assertion.

#### `interrupt_asker`
- **Trigger:** reflection exhausted, OR `goal_parser` flagged a rule with `confidence < 0.6`, OR the rule's `complexity = complex` and the planner could not pick an `operation_hint`.
- **Model:** `llama-3.3-70b-versatile`, temperature `0.3`, JSON mode
- **Output:**
  ```python
  InterruptQuestion = TypedDict('InterruptQuestion', {
      'rule_id': int,
      'question': str,                    # one specific question
      'options': list[InterruptOption],   # 2–3 concrete choices
      'sample_rows': list[dict],          # 5–10 problematic rows
      'allow_freeform': bool,             # default True
      'blocks_other_rules': bool,         # if False, executor continues with independent rules
  })
  ```
- **Flow:** emits the SSE event (`auto.interrupt.question`), persists the pending question to `agent_auto_runs.interrupt_log`, and the LangGraph thread suspends at this node.
- **Resume:** when the user answers via `POST .../auto-run/resume`, the response is injected into `AgentState.interrupt_response`, the rule's `attempt` counter is reset, and the loop re-enters `auto_planner` for that rule only (not the whole plan).
- **Examples of well-formed interrupt questions** (LLM is prompted with these as few-shot examples):
  - "Column `phone_number` has 3 distinct formats (E.164, local, extensions). Pick one to keep, or normalise all to E.164."
  - "Rule 7 says deduplicate by `order_id` but 12% of duplicates have conflicting `status` values. Keep the latest by `created_at`, or flag these as errors?"
  - "I cannot infer the target encoding for `country` — values include both ISO alpha-2 codes and full names. Provide a mapping, or confirm I should use a built-in lookup table."

#### `goal_verifier`
- **Trigger:** runs after the executor loop reports all rules either satisfied or marked-for-skip
- **No LLM call** — pure SQL: re-evaluates every rule's `DQAssertion` against the final session table
- **Output:** `GoalReport`:
  ```python
  GoalReport = TypedDict('GoalReport', {
      'rules_satisfied': int,
      'rules_failed': int,
      'rules_skipped': int,
      'total_rules': int,
      'failures': list[RuleFailure],   # rule_id, description, residual_count, sample
      'duration_seconds': float,
      'tokens_used': int,
  })
  ```
- **Gap micro-plan:** if `rules_failed > 0` and the failures look addressable (no prior interrupt for that rule), spawn one corrective sub-plan (max recursion = 1; tracked via `goal_verifier_recursions: int` in `AgentState`).
- **Final state:** failures that survive the micro-plan are surfaced in the report with recommended manual actions.

### 3.4 Agent State Extensions

Extend the existing `AgentState` ([backend/app/services/agent/state.py](backend/app/services/agent/state.py)) with the following — all use `NotRequired` so Manual Mode is unaffected:

```python
# Auto Mode extensions
auto_mode: NotRequired[bool]                              # False = manual, True = auto
auto_run_id: NotRequired[str]                             # FK to agent_auto_runs.id
auto_goal_raw: NotRequired[str]                           # original user input
auto_goal: NotRequired[AutoGoal]                          # parsed goal object
auto_plan: NotRequired[AutoPlan]                          # generated plan (extends existing plan)
current_rule_index: NotRequired[int]
reflection_attempts: NotRequired[dict[int, int]]          # rule_id → attempt count
reflection_history: NotRequired[dict[int, list[dict]]]    # rule_id → prior attempts (for tier-aware prompts)
interrupt_pending: NotRequired[bool]
interrupt_question: NotRequired[InterruptQuestion]
interrupt_response: NotRequired[str]
goal_report: NotRequired[GoalReport]
goal_verifier_recursions: NotRequired[int]                # bounded at 1
auto_pre_run_review: NotRequired[bool]                    # honour the user's toggle
```

### 3.5 DQ Assertion DSL

Today the codebase has a `validate` operation but no general-purpose data-quality assertion engine. Auto Mode introduces a small JSON DSL that compiles to a single `SELECT COUNT(*)` against the session table. The DSL is designed so the LLM can emit it directly and so it is trivially auditable.

```jsonc
{
  "kind": "not_null",          // not_null | unique | regex | range | in_set | sql
  "column": "email",
  "params": { "pattern": "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" },
  "tolerance": 0               // residual rows allowed before the assertion is "failed"
}
```

Built-in `kind` values:

| Kind | Compiles to |
|---|---|
| `not_null` | `SELECT COUNT(*) FROM t WHERE col IS NULL` |
| `unique` | `SELECT COUNT(*) - COUNT(DISTINCT col) FROM t` (or composite via array) |
| `regex` | `SELECT COUNT(*) FROM t WHERE NOT regexp_matches(col, ?)` |
| `range` | `SELECT COUNT(*) FROM t WHERE col < ? OR col > ?` |
| `in_set` | `SELECT COUNT(*) FROM t WHERE col NOT IN (?)` |
| `sql` | a free-form `SELECT COUNT(*) ...` (last-resort escape hatch; restricted to `SELECT` only by the existing `_BLOCKED_DML` regex) |

`tolerance > 0` means the assertion is satisfied as long as residual count is ≤ tolerance — useful for "remove >95% of nulls" semantics.

### 3.6 Four-Tier Reflection Strategy

Each failing rule goes through:

| Tier | Trigger | Action |
|---|---|---|
| 0 — Drift Adjustment | `drift_detector` flagged the affected column AND the failure pattern matches the drift signature | Re-issue the same operation with parameters auto-adjusted from the drift report (e.g. expected null-rate 2% but actual is 18% → bump `tolerance` to 20%, or switch fill strategy from `mode` to `median` because cardinality changed). No LLM call — deterministic transform. |
| 1 — Parameter Adjustment | Step ran, assertion failed but residual < 10% of rows | Tweak the same operation's parameters (different fill strategy, looser threshold, etc.) |
| 2 — Operation Substitution | Tier 1 fails OR residual ≥ 10% | Replace the operation with an alternative from the same category (e.g. `fill_nulls` → `filter_nulls` + `add_calculated_column`) |
| 3 — Decomposition | Tier 2 fails | Break the single op into multiple sub-steps; planner re-runs scoped to this rule only |

After Tier 3 fails → `interrupt_asker`. The reflection prompt is given the full attempt history so it does not re-propose tried-and-failed strategies. Tier 0 is cheap and deterministic — it handles the 80% case where the new data is "the same shape, slightly different distribution" (the user's stated concern about month-over-month drift).

### 3.7 Interrupt Questions — Design Principles

The interrupt mechanism is the most user-visible part of Auto Mode. Quality requirements:

1. **One question at a time per dependency branch** — never a flat list of unrelated questions. The agent picks the most blocking ambiguity per DAG branch. **Independent ambiguities** (different rules with no shared dependencies) **may be batched into a single card** with each question rendered as its own section, so the user resolves them in one sitting instead of N round-trips.
2. **Specific, not general** — reference actual column names, actual values, actual counts from the data.
3. **Offer concrete options** — present 2–3 options, each with a brief implication; allow free-text alongside.
4. **Context card** — alongside the question, ship a small data sample (5–10 rows) that illustrates the problem.
5. **Non-blocking for independent rules** — if `blocks_other_rules=False`, the executor continues running ready steps in parallel while waiting for the answer. The interrupt only blocks the affected branch.
6. **Auto-resume timeout** — if no response after 30 minutes, the run is marked `interrupted`, persisted, and can be resumed later via the run history.
7. **Drift-originated interrupts get a "use prior" shortcut** — when an interrupt is raised because of detected drift, one of the offered options is always "Use the prior pipeline's behaviour and accept the drift" (one-click), so users who trust the prior runbook don't have to read the full diff.

### 3.8 SSE Event Schema

Auto Mode follows the **existing dot-delimited convention** used by the manual graph (`agent.thinking`, `agent.plan`, `agent.step.start`, `agent.done`, `agent.error`). All existing events are reused unchanged; new events are namespaced under `auto.*`:

| Event type | When emitted | Payload fields |
|---|---|---|
| `auto.guardrails.passed` | After `automation_guardrails` check | `policy: dict` |
| `auto.goal.parsed` | Goal parsing complete | `auto_run_id`, `rules: AutoRule[]`, `total_rules: int` |
| `auto.plan.ready` | Plan generation complete | `steps: AutoStep[]`, `requires_approval: bool` |
| `auto.step.start` | Before each step | `step_index`, `rule_id`, `description`, `attempt` |
| `auto.step.validated` | After `step_validator` | `step_index`, `rule_id`, `passed`, `residual_count`, `assertion_sql` |
| `auto.reflection.start` | Before `reflection_v2` | `tier: 1|2|3`, `rule_id`, `reason` |
| `auto.interrupt.question` | `interrupt_asker` fires | `rule_id`, `question`, `options`, `sample_rows`, `blocks_other_rules` |
| `auto.interrupt.resolved` | After resume | `rule_id`, `response: str` |
| `auto.goal.report` | `goal_verifier` complete | `GoalReport` |
| `auto.done` | Full loop complete | `auto_run_id`, `pipeline_run_id`, `rules_satisfied`, `total_rules`, `output_table_name` |
| `auto.error` | Fatal error | `auto_run_id`, `error`, `recoverable: bool` |

Event payloads are JSON-serialised through the existing `AgentEvent.to_sse()` helper from [backend/app/services/full_auto_agent.py](backend/app/services/full_auto_agent.py).

Two additional events are emitted when a prior pipeline / Recipe is provided:

| Event type | When emitted | Payload fields |
|---|---|---|
| `auto.prior.parsed` | After `prior_pipeline_parser` | `reference_steps: ReferenceStep[]`, `expectations: ColumnExpectation[]`, `source_format: 'sql' \| 'python' \| 'text' \| 'recipe_id'` |
| `auto.drift.report` | After `drift_detector` | `drift_summary: DriftReport`, `auto_adjusted_steps: int`, `escalations: int` |

---

## 3.9 Prior-Pipeline Ingestion, Drift Detection, and Reusable Recipes

This section is the heart of the "real-world workflow" improvement. The premise: companies do not start from a blank slate every month. They have:

- A **previous transformation script** (SQL job, Python notebook, dbt model, runbook in Confluence) that ran on last month's file.
- A set of **business rules** that the cleaned data must satisfy.
- A **new file this month** that is *almost* the same as last month's — same columns, same semantics — but with subtle drift (a few new categorical values, slightly different null rates, an extra trailing-whitespace bug, a date-format change for one source system, etc.).

Today the user has to redo the work. With this design, the user pastes the prior pipeline + rules **once**, the agent adapts it to the new file, surfaces only the genuine ambiguities, and saves the result as a one-click reusable Recipe for next month.

### 3.9.1 Inputs

The `goal` field on `POST /api/auto/run` is widened to accept a structured payload (still backward-compatible with the plain-string form):

```json
{
  "goal_text": "Free-text or pasted business rules (existing field)",
  "prior_pipeline": {
    "format": "sql | python | text | dbt | recipe_id | pipeline_run_id",
    "content": "string — pasted code/text, OR the id when format is recipe_id/pipeline_run_id",
    "trust_level": "strict | guide | reference"
  },
  "expected_profile": {
    "columns": [
      { "name": "email",      "null_rate_pct": 2,   "cardinality_min": 1000 },
      { "name": "country",    "value_set": ["IN", "US", "GB", "DE", "BR"] },
      { "name": "created_at", "format": "ISO 8601", "tz": "UTC" }
    ]
  }
}
```

`trust_level` controls how aggressively the agent diverges from the prior pipeline:

- `strict` — replicate exactly; any drift requiring deviation triggers `interrupt_asker`.
- `guide` — use as a strong prior; auto-adjust within Tier 0 / Tier 1 reflection bounds; escalate Tier 2+.
- `reference` — informational only; the agent plans freshly but considers the prior steps for vocabulary/operation-name alignment.

`expected_profile` is optional. If absent, expectations are inferred by `prior_pipeline_parser` from the prior code's implicit assumptions (e.g. a `WHERE email IS NOT NULL` filter implies an expectation that `email` should rarely be null).

### 3.9.2 New Node — `prior_pipeline_parser`

- **Trigger:** `prior_pipeline` field present in the request
- **Model:** `llama-3.3-70b-versatile`, temperature `0`, JSON mode
- **Two-pass:**
  1. **Normalise** the pasted artefact (SQL / Python / dbt / runbook text) into an ordered list of `ReferenceStep` objects, each mapping to one or more DataHub registered operations. Unmappable steps are flagged as `kind: "custom_sql"` and preserved verbatim.
  2. **Extract expectations** — read the prior code for implicit assumptions about each column (filter clauses → `not_null` / `in_set` / `range` expectations; window functions over a key → `unique` expectation on that key; cast to a type → `type` expectation; etc.). Merge with any user-provided `expected_profile`.
- **Output:**
  ```python
  ReferenceStep = TypedDict('ReferenceStep', {
      'order': int,
      'operation': str,                    # registered op name, or "custom_sql"
      'parameters': dict,
      'source_quote': str,                 # snippet of the original artefact (audit)
      'covers_rules': list[int],           # filled in after goal_parser by a join pass
      'confidence': float,
  })

  ColumnExpectation = TypedDict('ColumnExpectation', {
      'column': str,
      'kind': str,                         # not_null | in_set | range | regex | unique | type | format
      'params': dict,
      'tolerance': float,                  # how far the new data may drift before it's "drift"
      'source': Literal['user', 'inferred'],
  })
  ```
- **Recipe shortcut:** when `format = "recipe_id"` or `pipeline_run_id`, the parser bypasses the LLM call and loads the stored `ReferenceStep[]` + `ColumnExpectation[]` directly from `agent_recipes` / `pipeline_steps`.
- **No execution side-effects** — this node only reads; it never mutates the dataset.

### 3.9.3 New Node — `drift_detector`

- **Trigger:** runs after `goal_parser` and after `prior_pipeline_parser` (if any)
- **No LLM call** — pure SQL profiling against the new dataset, using the existing `profiler.py` as the building block
- **Algorithm:** for each `ColumnExpectation`, query the new dataset and compute the actual value, then bucket into:
  - **`green`** — within tolerance, no action
  - **`amber`** — drifted within "auto-adjustable" range; record adjustment to apply at Tier 0 reflection (e.g. expected null-rate 2%, actual 8%, tolerance 10% → store `{column, suggested_param: {fill_strategy: "median_then_drop"}}` as a hint)
  - **`red`** — drifted beyond auto-adjustable range OR a categorical value appeared that has no matching rule (e.g. new `country = "ZZ"`, expected set was IN/US/GB) → mark for pre-emptive `interrupt_asker` BEFORE any step runs
- **Output:**
  ```python
  DriftReport = TypedDict('DriftReport', {
      'columns': list[ColumnDrift],     # one per analysed column
      'green_count': int,
      'amber_count': int,
      'red_count': int,
      'auto_adjustments': list[dict],   # passed to auto_planner as planner hints
      'novel_values': list[NovelValue], # value, column, count, rules_affected
      'schema_changes': list[dict],     # added cols, dropped cols, type changes
  })
  ```
- **Schema-change handling:** if the new dataset has a column the prior pipeline references, but the type changed (e.g. `created_at` was `DATE`, now `VARCHAR`), an automatic `cast_column` step is inserted at position 0 of the plan with a `system_inserted: true` flag.
- **Cost:** single SQL pass per column (most are aggregate `COUNT/MIN/MAX/COUNT DISTINCT/regexp_matches`) — typically <2s for a 10M-row dataset on DuckDB.

### 3.9.4 Planner Integration

`auto_planner` takes three new inputs alongside the existing `AutoGoal` and schema:
- `reference_steps` from `prior_pipeline_parser` (if any)
- `drift_adjustments` from `drift_detector`
- `trust_level` from the request

The planner prompt is updated with the rule: "When a `ReferenceStep` matches a rule's `operation_hint` and the relevant column is `green` in the drift report, copy the reference step's parameters verbatim. When the column is `amber`, copy the operation but apply the suggested adjustment. When `red`, plan around the rule and let `interrupt_asker` resolve it."

This means: **for the steady-state monthly-rerun case (most columns are green, a few amber), the agent generates a plan that is byte-identical to the prior pipeline except for the amber-column parameters. No surprises, no "creative" deviations.** When the user runs the same Recipe next month, output is deterministic given the same data.

### 3.9.5 Reusable Recipes — New Concept

A **Recipe** is a saved `(rules, prior_pipeline, expectations)` bundle that can be re-applied to a fresh dataset in one click. After a successful auto-run, the user is offered:

> ✅ Run completed in 47s. Save as Recipe so you can apply this to next month's file in one click?

If accepted, the agent stores:
- The original `goal_text` and parsed `AutoRule[]`
- The final executed `ReferenceStep[]` (the prior pipeline for the next run)
- The final `ColumnExpectation[]` (refined with what was actually observed)
- A pointer to the dataset's column schema fingerprint

A new lightweight table `agent_recipes` holds these; reuse counters and last-run-id are stored alongside for analytics ("this Recipe ran 47 times, success rate 96%").

### 3.9.6 New Table — `agent_recipes`

```sql
CREATE TABLE IF NOT EXISTS agent_recipes (
    id                 TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL,
    created_by         TEXT NOT NULL,
    name               TEXT NOT NULL,
    description        TEXT,
    schema_fingerprint TEXT NOT NULL,    -- hash of (column_name, column_type) tuples
    goal_text          TEXT NOT NULL,
    rules              JSONB NOT NULL,   -- AutoRule[]
    reference_steps    JSONB NOT NULL,   -- ReferenceStep[]
    expectations       JSONB NOT NULL,   -- ColumnExpectation[]
    trust_level        TEXT NOT NULL DEFAULT 'guide',
    run_count          INTEGER NOT NULL DEFAULT 0,
    success_count      INTEGER NOT NULL DEFAULT 0,
    last_run_id        TEXT REFERENCES agent_auto_runs(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_recipes_workspace ON agent_recipes (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_recipes_fingerprint ON agent_recipes (schema_fingerprint);
```

### 3.9.7 New Endpoints

```
POST   /api/auto/recipes                 # save the just-completed run as a recipe
GET    /api/auto/recipes?project_id=…  # list project recipes
GET    /api/auto/recipes/{id}            # full detail
POST   /api/auto/recipes/{id}/apply      # body: {dataset_id, session_id, pre_run_review?}
                                         # returns SSE stream (same as /auto/run)
DELETE /api/auto/recipes/{id}
```

`apply` is implemented as a thin wrapper that constructs the `POST /api/auto/run` body with `prior_pipeline = {format: "recipe_id", content: id, trust_level: recipe.trust_level}`. No new agent code is needed — the existing nodes handle the rest.

### 3.9.8 Efficiency Improvements (free with this design)

- **Skip-validator flag:** `auto_planner` marks steps whose operation type cannot fail an assertion (`rename_column`, `cast_column` with explicit type, `select_columns`, `drop_columns`) with `needs_validator: false`. The executor skips `step_validator` for these, cutting validator-SQL load by ~40% on typical pipelines.
- **Parallel validation:** `step_validator` is pure-SQL and idempotent. When multiple independent steps complete in the same DAG layer, their validators run concurrently against the DuckDB session (DuckDB supports concurrent reads).
- **Single-pass planning:** when a Recipe is being applied (no prior_pipeline parsing needed because steps are already structured), `goal_parser` and `auto_planner` are merged into one LLM call. Saves ~1.5s per run.
- **Tier 0 deterministic adjustments** (see §3.6) handle ~70% of failures without an LLM call.
- **Snapshot-based reflection rerun:** when Tier 1+ fires, only the failing step is re-executed against the previous step's snapshot — not the whole pipeline. The existing `PipelineStepDB.snapshot_path` machinery already supports this.

---

## 4. API Changes

### 4.1 Consolidate the existing `/api/auto/run` endpoint

The current `GET /api/auto/run?dataset_id=...&user_request=...` endpoint in [backend/app/routers/full_auto_routes.py](backend/app/routers/full_auto_routes.py) is a partial prototype. Replace it with a `POST` (so the body can carry a long pasted business-rules document without URL-length limits) and align its request shape with `CommandRequest` from `cleaning.py`:

```
POST /api/auto/run
```

**Request body:**
```json
{
  "dataset_id": "string",
  "project_id": "string",
  "session_id": "string",
  "goal": "string OR object — see §3.9.1 for the structured form (goal_text + prior_pipeline + expected_profile); the plain-string form is still accepted and treated as goal_text only",
  "pre_run_review": false,
  "secondary_dataset_ids": []
}
```

**Response:** `text/event-stream` SSE — same format as the cleaning chat endpoint, with the events listed in §3.8.

**Auth/RBAC:** identical to `/api/cleaning/datasets/{id}/chat` — Bearer JWT, role ≥ editor required (viewers cannot run write ops).

### 4.2 Resume After Interrupt

```
POST /api/auto/run/resume
```

**Request body:**
```json
{
  "session_id": "string",
  "auto_run_id": "string",
  "interrupt_response": "string",
  "selected_option_id": "string | null"
}
```

**Response:** SSE stream that resumes the suspended LangGraph thread (the existing `MemorySaver` checkpointer handles the suspension state — no new infrastructure needed).

### 4.3 Run History

```
GET  /api/auto/runs?dataset_id=&project_id=&limit=20&cursor=...
GET  /api/auto/runs/{auto_run_id}
GET  /api/auto/runs/{auto_run_id}/report   → downloadable JSON or markdown
```

### 4.4 Manual Mode endpoint — unchanged

`POST /api/cleaning/datasets/{dataset_id}/chat` is **not** modified. The previous draft of this document suggested adding a `mode` field there; on review that adds coupling for no benefit. Auto Mode lives at its own endpoint with its own request schema.

### 4.5 Existing supporting endpoints — reuse

- `POST /api/artifacts/save-checkpoint` — reused unchanged for "Save as Dataset".
- `GET /profiling/{dataset_id}` — already invoked by `context_loader`; reused unchanged.
- `GET /api/auto/guardrails/check` — already exists; reused unchanged.

---

## 5. Frontend Changes

### 5.1 Mode Switcher

Add a segmented control to the header of [frontend/src/components/AIPanel.tsx](frontend/src/components/AIPanel.tsx):

```
[ Manual ]  [ Auto ]
```

- **Manual** (default): current `useChatSession` flow, completely unchanged.
- **Auto**: mounts a new `AutoGoalPanel` component in place of the chat composer; uses a new `useAutoRunSession` hook that mirrors `useChatSession` but consumes `auto.*` SSE events.

### 5.2 Goal Input Panel (`AutoGoalPanel.tsx` — new)

- Multi-line textarea, monospace, scrollable; placeholder "Describe your end goal or paste business rules…" with example chips.
- Pre-run review toggle (`pre_run_review`) — default OFF for plans where the user has run Auto Mode ≥ 3 times before, ON otherwise (stored in user prefs).
- Dry-run toggle — runs the planner + validator only, with sample data, without committing (see §8.3).
- Run button — `POST /api/auto/run`.

### 5.3 Auto Run Live Feed (`AutoRunFeed.tsx` — new)

Replaces the manual plan-approval card while in Auto Mode:

- Progress bar — `Rules completed: 4 / 11` (driven by `auto.step.validated` events).
- Step timeline (CI/CD job log style):
  - Each rule is a collapsible row with a status icon: `running` (spinner), `passed` (green), `retrying` (amber, shows tier number), `waiting` (paused), `skipped` (grey), `failed` (red).
  - Expanding a row shows the generated SQL, the `assertion_sql`, the `residual_count`, and any reflection notes for that rule.
- DAG visualisation (Phase 4): a small read-only flow chart showing rule dependencies; nodes light up as they complete.

### 5.4 Interrupt Card (`AutoInterruptCard.tsx` — new)

When `auto.interrupt.question` arrives:

- The affected rule row in the timeline switches to `waiting` and stops its spinner.
- A card slides into the chat area styled like a VS Code Copilot suggestion:
  - The specific question (large text).
  - 2–3 option buttons (quick select, with `selected_option_id` posted back).
  - A free-text input below the buttons for custom answers.
  - A small inline data table showing the problematic `sample_rows`.
  - A "Skip this rule" secondary action (marks the rule as skipped in the report).
- On submit → `POST /api/auto/run/resume`.
- The card collapses after submission and is preserved in the run history.

### 5.5 Goal Completion Report (`AutoGoalReport.tsx` — new)

When `auto.goal.report` arrives:

- Header: "11 of 11 rules satisfied" (green) or "9 of 11 rules satisfied — 2 require attention" (amber) or "5 of 11 rules satisfied — review required" (red).
- Expandable list of rule outcomes with sample failures.
- Total LLM tokens, duration, total steps actually executed.
- Primary action: **Save as Dataset** → triggers existing `/api/artifacts/save-checkpoint` flow.
- Secondary actions: **Open Pipeline** (opens the pipeline editor pre-populated), **Download Report** (markdown), **Re-run with edits** (pre-fills the goal input with the original goal).

### 5.6 Run History (Settings)

Add a new tab to project settings: `Auto Runs`. Shows the last N runs with status, duration, rules satisfied, and a button to view the full report.

---

## 6. Data Model Changes

### 6.1 New Table — `agent_auto_runs`

Created via the existing idempotent DDL guard in [backend/app/main.py](backend/app/main.py) (the same pattern used for `pipeline_schedules`, `table_snapshots`, etc.):

```sql
CREATE TABLE IF NOT EXISTS agent_auto_runs (
    id                 TEXT PRIMARY KEY,
    user_id            TEXT NOT NULL,
    project_id       TEXT NOT NULL,
    dataset_id         TEXT NOT NULL,
    session_id         TEXT NOT NULL,                 -- f"{user_id}:{chat_session_id}"
    goal_raw           TEXT NOT NULL,
    goal_parsed        JSONB,                         -- AutoGoal
    plan               JSONB,                         -- AutoPlan
    status             TEXT NOT NULL DEFAULT 'running',
                       -- running | interrupted | completed | failed | cancelled | dry_run
    rules_total        INTEGER,
    rules_satisfied    INTEGER,
    rules_failed       INTEGER,
    rules_skipped      INTEGER,
    pipeline_run_id    TEXT REFERENCES pipeline_runs_v2(id) ON DELETE SET NULL,
    output_table_name  TEXT,                          -- DuckDB session table
    output_dataset_id  TEXT,                          -- if Save as Dataset triggered
    interrupt_log      JSONB DEFAULT '[]',            -- [{rule_id, question, response, ts}]
    reflection_log     JSONB DEFAULT '[]',            -- [{rule_id, tier, reason, outcome, ts}]
    goal_report        JSONB,
    tokens_used        INTEGER DEFAULT 0,
    duration_ms        INTEGER,
    error_message      TEXT,
    pre_run_review     BOOLEAN NOT NULL DEFAULT FALSE,
    dry_run            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_user      ON agent_auto_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_workspace ON agent_auto_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_session   ON agent_auto_runs (session_id);
CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_dataset   ON agent_auto_runs (dataset_id);
CREATE INDEX IF NOT EXISTS idx_agent_auto_runs_status    ON agent_auto_runs (status);
```

### 6.2 Modified Table — `pipeline_steps`

Note: the actual table name is `pipeline_steps`, not `pipeline_steps_v2`. Add two columns via the same idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` pattern:

```sql
ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS auto_run_id        TEXT;
ALTER TABLE pipeline_steps ADD COLUMN IF NOT EXISTS rule_justification TEXT;
CREATE INDEX IF NOT EXISTS idx_pipeline_steps_auto_run ON pipeline_steps (auto_run_id);
```

(Foreign key constraint omitted to keep the migration cheap; integrity enforced application-side, consistent with existing `pipeline_run_id` column.)

This links every auto-generated step back to the specific business rule it satisfies, giving end-to-end audit traceability.

### 6.3 No changes to other tables

- `artifacts` — unchanged; reused by the existing checkpoint flow.
- `pipeline_runs_v2` — unchanged; Auto Mode runs use `triggered_by = 'agent'` (already supported).
- `audit_logs` — unchanged; one row per auto-run (action `auto_run.start` and `auto_run.complete`).

---

## 7. LLM Prompt Strategy

All prompts use `langchain_groq.ChatGroq` with `response_format={"type": "json_object"}` and live in a new file `backend/app/services/agent/auto_prompts.py` mirroring the existing `prompts.py` layout.

### 7.1 Goal Parser Prompt
- Model: `llama-3.3-70b-versatile`, temperature `0`.
- System: "You are a data quality analyst. Parse the user's goal into an ordered list of atomic, testable rules. For each rule output `{rule_id, description, target_columns, operation_hint, assertion (DQAssertion DSL), depends_on, complexity, confidence}`. Only reference columns from the provided schema. Only use operation hints from the provided list. If a rule references an undefined glossary term, set `confidence < 0.6`."
- User context: schema, column stats, glossary terms, supported operations and their parameter signatures, the DQAssertion DSL spec.

### 7.2 Auto Planner Prompt
- Model: `llama-3.3-70b-versatile`, temperature `0`.
- System: "You are a data pipeline engineer. Given the parsed rules and the dataset schema, generate an ordered DAG of pipeline operations. Each step references a `rule_id` and a `justification`. Use `depends_on` for ordering. Independent rules MUST not depend on each other so they can run in parallel."
- Reuse the templates section of the existing `PLANNER_SYSTEM_PROMPT`.

### 7.3 Reflection v2 Prompt
- Model: `llama-3.3-70b-versatile`, temperature `0.2`.
- System: "A pipeline step failed to satisfy a data quality assertion. You are on tier {1|2|3}. Tier rules: {tier-specific instructions}. Do NOT propose any of the previously-tried strategies in `attempt_history`."
- Inputs: original step, assertion result, failure sample (capped 20 rows), column stats, attempt_history.

### 7.4 Interrupt Asker Prompt
- Model: `llama-3.3-70b-versatile`, temperature `0.3`.
- System: "Generate one specific, actionable question to unblock the current rule. Reference real column names and real values from the failure sample. Provide 2–3 concrete option strings and brief implications. Set `blocks_other_rules` based on whether downstream rules depend on this one."
- Few-shot examples included inline (see §3.3 for the canonical examples).

---

## 8. Safety, Guardrails, and Governance

### 8.1 Scope Constraints

- Auto Mode operates **only on the dataset the user explicitly selects** (plus declared `secondary_dataset_ids`). It cannot touch other datasets, other projects, or external connectors.
- RBAC: `editor` or higher required (matches existing chat endpoint); `viewer` is rejected at the router.
- All generated SQL is logged to `audit_logs` and to `pipeline_steps.sql` before execution.
- The existing `_BLOCKED_DML` regex applies — Auto Mode cannot issue `DROP/DELETE/INSERT/UPDATE/TRUNCATE` against the session.

### 8.2 Execution Limits — extend `automation_guardrails.py`

| Guard | Default | Env override | Rationale |
|---|---|---|---|
| Max steps per auto-run | 50 | `AUTO_MAX_STEPS` | Prevent runaway pipelines |
| Max reflection attempts per rule | 3 | `AUTO_MAX_REFLECTION_TIERS` | Bounded compute cost |
| Max interrupt questions per run | 10 | `AUTO_MAX_INTERRUPTS` | Force goal decomposition above 10 ambiguities |
| Max parallel steps | 4 | `AUTO_MAX_PARALLEL` | Respect DuckDB session concurrency |
| Auto-run wall-clock timeout | 10 min | `AUTO_RUN_TIMEOUT_S` | Render instance CPU budget |
| Max goal length (chars) | 32 768 | `AUTO_MAX_GOAL_CHARS` | Avoid abusive payloads; comfortably fits LLM context |
| Max LLM tokens per run | 200 000 | `AUTO_MAX_TOKENS` | Cost containment |
| Pre-flight row limit | inherits existing `automation_guardrails.max_rows` | — | Already enforced |

### 8.3 Dry-Run Mode

When `dry_run=True` is sent on `/api/auto/run`:
- All nodes execute against a **5 000-row random sample** of the dataset (via `USING SAMPLE 5000 ROWS` in DuckDB).
- `step_validator` runs as normal so the user sees realistic pass/fail signals.
- `pipeline_recorder` is skipped; nothing is written to `pipeline_steps`.
- The `agent_auto_runs.status` is set to `dry_run`.
- The response report includes the projected full-dataset impact (extrapolated from the sample).

### 8.4 Audit Trail

- One `audit_logs` row at run start (`action = "auto_run.start"`) and one at completion (`action = "auto_run.complete"`).
- `agent_auto_runs` row holds the full goal, parsed plan, interrupt log, reflection log, and final report.
- Each `pipeline_steps` row generated during the run carries `auto_run_id` and `rule_justification`.
- Snapshot replay (`PipelineStepDB.snapshot_path`) gives the user crash-recovery for free — same mechanism as Manual Mode.

### 8.5 Rate Limiting

Auto Mode runs are LLM-heavy. Apply a stricter `slowapi` limit at the router using the same `_get_user_or_ip` key function:

- `POST /api/auto/run`: **5 / minute / user** (env `AI_AUTO_RUN_RATE_LIMIT`)
- `POST /api/auto/run/resume`: **30 / minute / user** (env `AI_AUTO_RESUME_RATE_LIMIT`)
- `GET /api/auto/runs*`: inherits global default (60 / min)

### 8.6 Cost & Quota Integration

- Add a usage counter `auto_runs_this_month` to `user_usage`.
- Enforce per-plan caps (initial proposal: Starter 0/month, Professional 100/month, Team 500/month, Enterprise unlimited) — final numbers TBD by Product (see §10 Q1).
- Token usage per run is recorded in `agent_auto_runs.tokens_used` and rolled up monthly for billing.

### 8.7 Cancellation

- `POST /api/auto/run/{auto_run_id}/cancel` — graceful stop after the current step finishes; sets status `cancelled`.
- Triggered by a "Stop" button in the live feed.
- The partial pipeline up to the cancellation point is still recorded.

### 8.8 Idempotency / Replay Safety

- Each `auto_run` carries a client-supplied `idempotency_key` in the request header (`X-Idempotency-Key`); duplicate POSTs within 60s return the existing `auto_run_id` instead of starting a new run.
- This prevents double-billing and double-execution from accidental browser retries.

---

## 9. Phased Rollout Plan

### Phase 1 — Foundation (Backend, ~1.5 weeks of work)
- [ ] Add `agent_auto_runs` table + `pipeline_steps` columns via DDL guard in `main.py`.
- [ ] Define `AutoGoal`, `AutoRule`, `AutoPlan`, `DQAssertion`, `GoalReport`, `InterruptQuestion` TypedDicts in a new `backend/app/services/agent/auto_types.py`.
- [ ] Implement `step_validator` node (pure SQL, no LLM — easiest to unit-test first).
- [ ] Implement `goal_parser` node + `auto_prompts.py`.
- [ ] Implement `auto_planner` node.
- [ ] Implement `goal_verifier` node (no LLM; pure assertion runner).
- [ ] Wire the new nodes into `agent/graph.py` behind an `auto_mode` flag — Manual Mode unchanged.
- [ ] Replace the prototype `GET /api/auto/run` with `POST /api/auto/run` (SSE).
- [ ] Unit tests for goal_parser and auto_planner against a fixed schema fixture (mock LLM responses).

### Phase 2 — Resilience (Backend, ~1 week)
- [ ] Implement `reflection_v2` with the three-tier escalation.
- [ ] Implement `interrupt_asker` + LangGraph thread suspension.
- [ ] Implement `POST /api/auto/run/resume`.
- [ ] Extend `automation_guardrails.py` with the §8.2 limits; wire into the run-start path.
- [ ] Implement `POST /api/auto/run/{id}/cancel` + idempotency-key handling.
- [ ] Goal-verifier gap micro-plan (max 1 recursion).
- [ ] Integration tests: end-to-end auto-run on `samples/customers.csv` with deliberately injected DQ issues; assert pass/fail/interrupt outcomes.
- [ ] Snapshot-replay test: kill the worker mid-run, restart, verify Auto Mode resumes correctly.

### Phase 3 — Frontend (~1.5 weeks)
- [ ] Mode switcher in `AIPanel.tsx` header.
- [ ] `AutoGoalPanel.tsx` (textarea, toggles, Run button, dry-run toggle).
- [ ] `useAutoRunSession.ts` hook (mirrors `useChatSession` but for `auto.*` events).
- [ ] `AutoRunFeed.tsx` (progress bar, step timeline, collapsible rule rows).
- [ ] `AutoInterruptCard.tsx` (question + options + sample table; Skip and Submit actions).
- [ ] `AutoGoalReport.tsx` (rules satisfied, Save as Dataset, Open Pipeline, Download Report).
- [ ] `GET /api/auto/runs` history view in project settings.
- [ ] e2e test (Playwright): goal → execution → interrupt → resume → report → save.

### Phase 4 — Polish, Observability, Billing (~1 week)
- [ ] Prometheus counter `datahub_auto_run_total{status}`.
- [ ] Prometheus histogram `datahub_auto_run_duration_seconds`.
- [ ] Prometheus counter `datahub_auto_run_interrupts_total{rule_complexity}`.
- [ ] Prometheus counter `datahub_auto_run_reflection_total{tier,outcome}`.
- [ ] Add `auto_runs_this_month` to `user_usage` + billing rollup.
- [ ] Per-plan quota enforcement.
- [ ] Email notification on long-paused interrupts (>30 min idle).
- [ ] Optional DAG visualisation in the live feed.
- [ ] Reference-schema goal input (attach a sample file → goal_parser uses it as a target schema).

---

## 10. Open Questions

| # | Question | Impact | Owner |
|---|---|---|---|
| 1 | Plan availability — gate to Professional+, or allow Starter with low monthly cap (e.g. 5/mo)? | Billing, GTM | Product |
| 2 | Default for `pre_run_review` — off (faster, trusting), on (safer, slower)? Offer per-user pref? | UX trust | Design |
| 3 | Persist interrupt responses to a per-dataset "decision log" so future runs reuse them automatically? | LLM cost, UX consistency | Engineering |
| 4 | Should Auto Mode propose schema changes (add/drop columns) as part of goal fulfilment? Today only value transformations. | Scope | Engineering |
| 5 | Goals referencing external lookup tables not yet uploaded — how to handle (block, allow upload-in-flow, suggest)? | UX | Product |
| 6 | Multi-dataset goals (join two datasets as part of the goal) — Phase 4 or post-launch? | Complexity | Engineering |
| 7 | Recursion limit for the gap micro-plan in `goal_verifier` — keep at 1 or allow 2 with stricter token cap? | Safety vs success rate | Engineering |
| 8 | Should `goal_parser` be allowed to ask its first clarifying question *before* execution starts (pre-emptive interrupt) when overall goal confidence is low? | UX | Design |
| 9 | When a rule's `confidence < 0.6`, do we still try to execute (and likely interrupt at runtime) or always pre-empt? | UX | Engineering |
| 10 | Separate Groq model tier for Auto Mode (e.g. always 70B for planner, but consider 405B for goal_parser when long business-rule docs are pasted)? | Quality vs cost | Engineering |
| 11 | Where does the "decision log" from Q3 live — `agent_auto_runs.interrupt_log` only, or a denormalised `dataset_decisions` table? | Data model | Engineering |

---

## 11. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| LLM hallucinates an operation that doesn't exist | Med | High (run fails late) | Validator in `auto_planner` checks every `operation` against the registered set; one retry, then error before execution starts |
| LLM emits valid SQL that produces unintended rows | Med | High (data corruption) | `step_validator` immediately catches it via the rule's assertion; reflection_v2 + interrupt safety net |
| Run hangs at interrupt for hours, holding DuckDB session | High | Med (memory) | 30-min auto-resume timeout; existing 30-min DuckDB session TTL still applies; on session loss, snapshot replay restores |
| Cost runaway from reflection loops on a hard goal | Med | Med | Hard token cap per run + 3-tier reflection cap + 50-step cap |
| User pastes a 1 MB business-rules document | Low | High (token blow-up) | 32 KB hard limit at the router; 413 error |
| Two browser tabs trigger the same auto-run | Low | Med (double billing) | Idempotency-key handling (§8.8) |
| Interrupt question is too vague to be actionable | Med | Med (UX failure) | Few-shot examples in prompt; CI eval set of 20 hand-crafted cases scored by LLM-as-judge |
| Goal parser misses a rule that was in the input | Med | High (silent gap) | Goal verifier re-runs every parsed assertion; if `total_rules` looks suspiciously low compared to input length, surface a "Did I miss anything?" confirmation card before execution |

---

## 12. Success Metrics

After 4 weeks of GA, we should be able to answer:

- **Goal satisfaction rate** — % of auto-runs where `rules_satisfied / rules_total == 1.0`. Target: ≥ 70%.
- **Interrupt rate** — average interrupts per run. Target: ≤ 1.0 across the median run.
- **Time saved** — wall-clock for an Auto run vs. an estimated equivalent Manual run with the same step count. Target: ≥ 5× faster.
- **Save-as-Dataset conversion** — % of completed runs the user actually checkpoints. Target: ≥ 50% (low conversion → quality issue).
- **Cost per run** — median Groq token spend. Watch for outliers in the long tail.

---

## 13. References

- [ARCHITECTURE.md](ARCHITECTURE.md) — current agent state machine, LLM provider config, pipeline data model
- [CAPABILITIES.md](CAPABILITIES.md) — full list of supported pipeline operations and parameters
- [ROADMAP.md](ROADMAP.md) — broader product roadmap context
- [backend/app/services/agent/graph.py](backend/app/services/agent/graph.py) — current LangGraph graph definition
- [backend/app/services/agent/state.py](backend/app/services/agent/state.py) — `AgentState` TypedDict to be extended
- [backend/app/services/agent/edges.py](backend/app/services/agent/edges.py) — DAG routing reused by Auto Mode
- [backend/app/services/agent/nodes/execute_step.py](backend/app/services/agent/nodes/execute_step.py) — step dispatcher reused by Auto Mode
- [backend/app/services/step_engine.py](backend/app/services/step_engine.py) — DuckDB step executor reused by Auto Mode
- [backend/app/services/duckdb_session.py](backend/app/services/duckdb_session.py) — session model reused by Auto Mode
- [backend/app/services/full_auto_agent.py](backend/app/services/full_auto_agent.py) — `AgentEvent` SSE dataclass reused; `ToolExecutor` superseded
- [backend/app/controllers/full_auto_controller.py](backend/app/controllers/full_auto_controller.py) — to be refactored into the new graph node set
- [backend/app/routers/full_auto_routes.py](backend/app/routers/full_auto_routes.py) — endpoints replaced per §4.1–4.3
- [backend/app/services/automation_guardrails.py](backend/app/services/automation_guardrails.py) — extended per §8.2
- [backend/app/routers/cleaning.py](backend/app/routers/cleaning.py) — Manual Mode chat endpoint, unchanged
- [frontend/src/components/AIPanel.tsx](frontend/src/components/AIPanel.tsx) — host for the mode switcher
- [frontend/src/hooks/useChatSession.ts](frontend/src/hooks/useChatSession.ts) — pattern to mirror for `useAutoRunSession`
