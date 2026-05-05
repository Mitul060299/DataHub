# AI Agent — Unified Mode: Implementation Reference

> **Status:** Implemented and live
> **Last updated:** 2026-05-05
> **Prerequisite reading:** [ARCHITECTURE.md](ARCHITECTURE.md), [CAPABILITIES.md](CAPABILITIES.md)

---

## Summary of Changes (April–May 2026)

The original design proposed two separate user-facing modes ("Manual" and "Auto") distinguished by a frontend toggle. After implementation review, this was simplified: **the routing decision is made entirely by the backend** based on what the user types. There is no mode switch in the UI. Both single-command and multi-rule inputs share the same chat box, the same plan card UI, and the same pipeline panel.

### What changed

| Commit | Description |
|---|---|
| `b1f3629` | Mode merge — removed frontend mode toggle and `AutoGoalPanel` mount; `"goal"` intent added to classifier |
| `c729563` | Full merge implementation — backend routing, `AIPanel` refactor, auto SSE event handlers |
| `0ffde5d` | Plan approval wired into the auto/goal path — `auto_planner → plan_presenter` |
| `0b0ad71` | Dead code removal — `execute_step_auto` alias removed; routing unified to single `execute_step` node |
| `a365e63` | Counter semantics fix — `current_rule_index` and `_step_counter` off-by-one bugs fixed |
| `8132ac7` | `needs_validator` routing fix; `auto_mode` no longer mutated inside routing function; set in `auto_planner` return dict instead |

---


## 1. Architecture — Unified Graph

The agent is a single LangGraph `StateGraph` compiled with `MemorySaver`. Both simple single-command requests and complex multi-rule goals run through the same graph. The intent classifier decides which branch to take.

```
context_loader
      │
intent_classifier
      │
      ├─── (single op intents) ──► planner ──► plan_presenter ──► execute_step
      │                                                                │
      │                                                           (manual path)
      │                                                     reflect / pipeline_recorder
      │
      ├─── (goal / multi-rule) ──► [prior_pipeline_parser?] ──► goal_parser
      │                                 │
      │                            [drift_detector?]
      │                                 │
      │                           auto_planner ──► plan_presenter ──► execute_step
      │                                                                     │
      │                                                              (auto path)
      │                                                  step_validator / reflection_v2
      │                                                  goal_verifier / pipeline_recorder
      │
      └─── (converse / clarify) ──► clarify_step / responder
```

### 1.1 Intent routing

`intent_classifier` (LLM, `llama-3.1-8b-instant`) classifies the user's message into one of:

| Intent | Route |
|---|---|
| `clean`, `filter`, `transform`, `add_column`, `pivot`, `union`, `join`, `reconcile`, `sql_query`, `visualise`, `export`, `validate`, `summarise` | `planner` → single-path execution |
| `goal` | `goal_parser` → multi-rule execution |
| `clarify` | `clarify_step` → one focused question |
| `converse` | `responder` → plain conversation |

The classifier detects `goal` when the user's message contains multiple independent transformations, pasted business rules, or compound instructions that would generate more than one pipeline step with independent purposes.

### 1.2 Single-command path (simple intents)

```
planner → plan_presenter → [approval gate] → execute_step (loop) → reflect (on error) → pipeline_recorder → responder
```

- `planner` generates a `PlanStep[]` with `step_number`, `operation`, `description`, `sql`, `depends_on`.
- `plan_presenter` emits a plan card via SSE (`agent.plan`). The graph suspends (MemorySaver checkpoint) until the user approves.
- On approval, `execute_step` runs each step in dependency order (`_next_ready_step` handles `depends_on`-based DAG routing).
- On SQL error, `reflect` rewrites the SQL up to 3 times before failing to `pipeline_recorder`.

### 1.3 Multi-rule path (`goal` intent)

```
goal_parser → [drift_detector] → auto_planner → plan_presenter → [approval gate] → execute_step (loop)
  → step_validator → [reflection_v2] → goal_verifier → pipeline_recorder
```

- `goal_parser` splits the user's text into atomic rules, each with a `rule_id`, `target_columns`, and a DQ assertion.
- `drift_detector` (optional, only if a prior pipeline exists) profiles the new dataset against expectations from the prior run and pre-adjusts step parameters.
- `auto_planner` generates a `PlanStep[]` (with `depends_on` for branching), plus sets `auto_mode = True` in state, and writes a `plan_compat` copy into the shared `plan` field so `plan_presenter` can display it with the same card UI.
- `plan_presenter` is **shared** — both paths use the same node and the same SSE event. The user sees the same Approve / Modify / Reject card regardless of path.
- After approval, `execute_step` is **shared** — it reads `current_rule_index` in auto mode, `current_step_index` in manual mode. Both index into `state["plan"]`.
- After each step in auto mode: `step_validator` runs DQ assertions on the just-executed step (only if `needs_validator=True` on that step). On failure, `reflection_v2` attempts up to 4 tiers of recovery (deterministic drift fix → LLM param adjust → LLM op substitute → LLM decompose).
- `goal_verifier` re-checks all rules against the final session table and can trigger one micro-replan if gaps remain.

---

## 2. Key Design Decisions

### 2.1 No frontend mode toggle

The original design had a "Chat / ⚡ Auto" button in `AIPanel`. This was removed because:
- Both paths take the same input (plain English text), generate the same plan card, require the same approval, and produce the same pipeline output.
- The distinction is an internal routing detail — the user should not need to know or decide.
- A toggle would have confused users who don't understand why identical inputs produce different UIs depending on which button they pressed.

### 2.2 Shared plan_presenter

`auto_planner` writes two outputs:
1. `auto_plan: list[AutoPlanStep]` — the rich internal representation with `rule_id`, `needs_validator`, `justification`.
2. `plan: list[PlanStep]` — a compatibility copy with the fields `plan_presenter` reads (`step_number`, `operation`, `description`, `estimated_rows`, `sql`, `depends_on`).

This lets `plan_presenter` remain unchanged. Both paths produce the same user-facing plan card.

### 2.3 Shared execute_step

`execute_step` supports both modes via an `auto_mode` flag in state:
- **Manual mode**: reads `idx = state["current_step_index"]`; writes `{"current_step_index": idx + 1}` via `_step_counter`.
- **Auto mode**: reads `idx = _next_ready_step(plan, completed_step_numbers)` (uses `depends_on` DAG logic for branching plans); writes `{"current_rule_index": idx}` (the just-executed index, so `step_validator` and `route_after_execute` can find the right step).

### 2.4 auto_mode set in node, not routing function

`auto_mode = True` is written by `auto_planner` in its return dict (a node), so it is persisted by MemorySaver's checkpoint. It is **not** set inside `route_intent_auto` (a routing/edge function). Routing functions in LangGraph are side-effect-free — the state they receive is not guaranteed to survive.

### 2.5 needs_validator routing

After `execute_step` runs in auto mode, `route_after_execute` checks whether to call `step_validator` by reading `auto_plan[current_rule_index].needs_validator` — the flag on the **just-executed** step. Structural operations (rename, cast, select) have `needs_validator=False` and skip directly to the next step or `goal_verifier`.

---

## 3. Graph Node Reference

| Node | Mode | Purpose |
|---|---|---|
| `context_loader` | Both | Load schema, stats, table registry, pipeline history from DB |
| `intent_classifier` | Both | Classify intent into one of 16 valid intents including `goal` |
| `clarify_step` | Both | Ask exactly one focused clarifying question |
| `planner` | Manual | Generate `PlanStep[]` for single-intent requests |
| `plan_presenter` | **Both** | Present plan card; suspend graph for approval |
| `execute_step` | **Both** | Execute one pipeline step (30+ operations); mode-aware counter |
| `reflect` | Manual | Rewrite failing SQL, up to 3 tiers |
| `pipeline_recorder` | **Both** | Write `PipelineRunV2DB` + `PipelineStepDB` rows |
| `responder` | Manual | Generate final response message |
| `goal_parser` | Auto | Split user goal into `AutoGoal` with typed rules and DQ assertions |
| `drift_detector` | Auto | Profile current dataset vs prior expectations; auto-adjust params |
| `prior_pipeline_parser` | Auto | Normalise pasted SQL/Python/runbook into reference DataHub ops |
| `auto_planner` | Auto | Generate branching `AutoPlanStep[]`; write `plan_compat` for presenter |
| `step_validator` | Auto | Run DQ assertions against just-executed step output |
| `reflection_v2` | Auto | 4-tier SQL recovery (deterministic drift fix + 3× LLM) |
| `interrupt_asker` | Auto | Suspend and surface a focused question when reflection exhausted |
| `goal_verifier` | Auto | Re-check all rules; optionally trigger one micro-replan |

---

## 4. State Fields

All fields live on the single `AgentState` TypedDict. Auto-mode-only fields are `NotRequired` and are absent/ignored during manual-mode runs.

### Shared fields (used by both paths)

| Field | Type | Description |
|---|---|---|
| `plan` | `list[PlanStep]` | The active execution plan; written by `planner` or `auto_planner` (compat copy) |
| `plan_approved` | `bool` | Set to `True` by the frontend on the approval request |
| `current_step_index` | `int` | Manual mode: index of next step to execute |
| `execution_results` | `list[ExecutionResult]` | Accumulated results from each executed step |
| `completed_step_numbers` | `list[int]` | Step numbers that have finished (used by DAG router) |

### Auto-mode-only fields

| Field | Type | Description |
|---|---|---|
| `auto_mode` | `bool` | Set by `auto_planner`; switches counter and routing logic in shared nodes |
| `auto_plan` | `list[AutoPlanStep]` | Rich plan with `rule_id`, `needs_validator`, `justification` |
| `auto_goal` | `dict` | Parsed `AutoGoal` with rules and DQ assertions |
| `current_rule_index` | `int` | Index of the **just-executed** step (used by `step_validator` and routers) |
| `reflection_attempts` | `dict[int, int]` | `{step_number: tier_reached}` tracks reflection progress per step |
| `last_validation` | `dict` | `StepValidationResult` from most recent `step_validator` run |
| `goal_report` | `dict` | Final `GoalReport` from `goal_verifier` |
| `interrupt_pending` | `bool` | Set to `True` when reflection exhausted; routes to `interrupt_asker` |
| `drift_report` | `dict` | Output of `drift_detector` |

---

## 5. SSE Event Reference

All events are streamed as `data: {JSON}\n\n` on `POST /api/cleaning/datasets/{id}/chat`.

| Event type | Emitted by node | Payload fields |
|---|---|---|
| `agent.plan` | `planner` (via `agent_graph.py` handler) | `plan: PlanStep[]`, `plan_type: "linear"\|"dag"` |
| `agent.plan_presented` | `plan_presenter` | `text: string` (narrative plan summary) |
| `agent.step.start` | `execute_step` | `step_number`, `operation`, `description` |
| `agent.step.done` | `execute_step` | `step_number`, `success`, `rows_affected`, `sql` |
| `agent.step.error` | `execute_step` | `step_number`, `error` |
| `agent.goal.parsed` | `goal_parser` | `goal_summary`, `rule_count` |
| `agent.rule.validated` | `step_validator` | `step_number`, `passed`, `residual_count` |
| `agent.goal.report` | `goal_verifier` | `all_passed`, per-rule `pass`/`fail` summary |
| `agent.done` | `responder` / `pipeline_recorder` | `final_response`, `pipeline_steps[]` |
| `agent.error` | Any node (exception) | `error` |

---

## 6. Security Constraints

These constraints apply identically in both manual and auto mode. The auto path does not relax any of them.

| Constraint | Where enforced | What it blocks |
|---|---|---|
| DML guard | `duckdb_session.execute_in_session` | `DROP`, `DELETE FROM`, `INSERT INTO`, `UPDATE`, `TRUNCATE` |
| Path guard | `duckdb.path_guard.guard_duckdb_sql_paths` | `COPY`, `ATTACH`, `read_csv`, `read_parquet`, `read_json` against unapproved paths |
| Query timeout | `duckdb_session` | Queries running longer than `DUCKDB_QUERY_TIMEOUT_S` (default 60s) |
| Session cap | `duckdb_session` | Max `DUCKDB_MAX_SESSIONS` (default 8) concurrent DuckDB connections |
| Rate limit | `slowapi` on chat endpoint | 60 requests/minute per user |
| Plan guard | `services/plan_guard.normalize_plan` | Normalises/validates plan before execution |

---

## 7. Known Limitations / Future Work

- `PipelineStepDB` has no `depends_on` column. The frontend pipeline DAG reconstructs branches by matching `input_tables` ↔ `output_table` strings. This works as long as the agent's SQL correctly names upstream tables. A future migration to add `parent_step_numbers` to `PipelineStepDB` would make the DAG explicit and reliable.
- The legacy `/api/auto/run` endpoint (in `full_auto_routes.py`) still exists for backward compatibility. It routes through the same `agent_graph` and is not planned for removal until all known callers have migrated to the chat endpoint.
- `step_validator` currently requires `duckdb_conn_path` and `active_table_name` to be set in state by `execute_step`. If either is absent, validation is skipped silently. A future hardening pass should surface this as a warning.

