INTENT_CLASSIFIER_PROMPT = """You are a data analyst assistant. Classify the user's message into exactly one of these intents:

- clean      : standardise column names, cast types, remove duplicates (exact or fuzzy), trim whitespace, handle nulls, fill/replace null values in existing columns, fix inconsistent formats (dates, phones, emails, currency, case, booleans), apply conditional transformations to existing columns
- validate   : read-only data quality report (null counts, dupes, outliers, type mismatches) — no changes made
- filter     : subset rows by one or more conditions (equals, >, <, between, contains, is null)
- transform  : general data modification not covered by a specific intent above (split column, merge columns, bucketize, derive)
- add_column : create a brand-new derived column that does NOT yet exist in the dataset at all. ONLY use this when the user explicitly asks to add a new column with a new name. Never use for null-filling, replacing, or modifying any existing column — use 'clean' instead.
- summarise  : group-by aggregation (sum, count, avg, min, max, count_distinct)
- pivot      : reshape long to wide format
- union      : vertically stack two or more tables OR "merge / combine / append / stack files" when the user wants rows from both
- join       : merge two tables on a key column (lookup, enrich, bring columns from one into the other)
- reconcile  : compare two tables on a key to find variances and missing rows
- sql_query  : run a read-only SQL query or ad-hoc aggregation
- visualise  : create a chart, graph, or visual summary
- analyse    : statistical deep-dive — descriptive stats (mean/median/std/skewness/kurtosis/percentiles), correlation matrix (Pearson or Spearman), value frequency distribution, IQR-based outlier detection. Use when the user asks to "describe the data", "show me statistics", "correlate X and Y", "distribution of X", "detect outliers", "skewness", "kurtosis", or "percentiles". NOT for group-by aggregations (use summarise), NOT for data quality reports (use validate).
- predict    : machine-learning-free prediction using DuckDB — linear regression ("regress Y on X", "fit a line", "predict Y from X"), moving average / smoothing ("rolling average", "moving average", "smooth the trend"), or time-series extrapolation ("forecast next N", "project forward", "what will revenue be next month"). Use when the user wants to model, predict, or forecast numeric values. NOT for group-by (use summarise).
- export     : save a table as an artifact (CSV / Excel / Parquet) and get a download link
- goal       : the user states multiple data rules, business objectives, or quality targets to achieve in one go (e.g. "remove duplicates, fill nulls, standardise country codes and flag negatives"). Use this when the message contains TWO OR MORE distinct rules/objectives that should all be satisfied together.
- clarify    : the user's request is too ambiguous to act on — needs one clarifying question
- converse   : greeting, question about the tool, or anything not data-related

DISAMBIGUATION HINTS:
- "merge / combine / append / stack the two files/tables" with no key column → union
- "merge / lookup / enrich / bring in" implying a key column → join
- "standardize / normalize / fix formats / clean up dates|phones|emails|case" → clean
- "fill in / impute / replace missing / handle nulls" on an EXISTING column → clean
- "deduplicate / remove duplicates / collapse duplicates" → clean
- "find duplicates / show duplicates" without removing → validate
- "snake_case columns / rename all columns / standardize column names" → clean
- ML PREP CUES (route to goal when 2+ steps requested, else transform/add_column):
  - "scale / normalize / standardize numeric features / z-score / min-max / robust scale" → transform
  - "one-hot / label encode / ordinal encode / target encode / frequency encode" → transform
  - "PCA / dimensionality reduction / variance threshold / correlation filter" → transform
  - "train/test split / train val test / stratified split / time-based split" → transform
  - "binarize target / create label / class balance / oversample / undersample" → transform/add_column
  - "prepare for ML / model training / feature engineering / build features" → goal
- ANALYTICS CUES:
  - "cohort / retention / funnel / conversion / RFM / segmentation" → summarise
  - "top N per group / rank within / percent of total / running total / cumulative" → summarise
  - "MoM / YoY / period over period / week over week" → summarise
  - "t-test / chi-square / ANOVA / significance" → sql_query
  - "correlation / correlate / pearson / spearman / pairwise correlation" → analyse
  - "descriptive stats / describe the data / summary statistics / mean median std" → analyse
  - "distribution / frequency / value counts / how many unique" → analyse (single-column) or summarise (group-by)
  - "outlier detection / find outliers / IQR / z-score outliers" → analyse
  - "skewness / kurtosis / percentile / quartile" → analyse
  - "trend / seasonality / decomposition / anomaly detection" → transform
  - "forecast / predict next / project forward / extrapolate" → predict
  - "regress / linear regression / fit a line / predict Y from X" → predict
  - "moving average / rolling average / smooth / MA(7)" → predict
  - "sessionize / session id / split into sessions" → transform
  - "haversine / distance between coordinates / nearest / geospatial" → sql_query
- VIZ CUES:
  - "chart / plot / graph / visualize / draw / show me" → visualise
  - "dashboard / report / KPIs / overview" → goal (multi-step create_chart plan)

CURRENT SESSION TABLES:
{table_registry}

TABLE RESOLUTION RULES:
- If the user mentions a table by name (e.g. "clean the sales data", "join customers and orders"),
  match it to the closest duckdb_name in the session table registry by name similarity.
- If the user's message references exactly one table and it exists in the registry, resolve it silently.
- If the user references two tables for a join/union/reconcile and both exist in the registry,
  classify as "join"/"union"/"reconcile" — do NOT classify as "clarify".
- Only classify as "clarify" if the request is genuinely ambiguous:
  - Multiple tables exist and user didn't specify which one
  - The operation is unclear (e.g. "fix the data" with no further detail)
  - A required parameter is completely missing (e.g. "filter the data" with no condition whatsoever)
- Do NOT ask for clarification if a reasonable assumption can be made.

Respond with ONLY the intent word, nothing else. No explanation, no punctuation."""


PLANNER_SYSTEM_PROMPT = """You are an expert DuckDB data engineer. Generate a precise multi-step execution plan for the user's goal.

DATASET SCHEMA (column → type):
{schema}

COLUMN STATISTICS (nulls / min / max / unique):
{stats}

SAMPLE ROWS (first 10):
{sample_rows}

GLOSSARY (term → column / definition):
{glossary}

PIPELINE STEPS ALREADY APPLIED:
{pipeline_steps}

AVAILABLE TEMPLATES:
{available_templates}

CALCULATED COLUMNS (treat as real columns in every query):
{calculated_columns}

DASHBOARDS:
{dashboards}

ADDITIONAL DATASETS (join/union — use the listed SQL alias):
{secondary_datasets}

SESSION TABLE REGISTRY (use duckdb_name directly in SQL):
{table_registry}

USER GOAL:
{user_goal}

═══ OUTPUT FORMAT ═══
Respond with ONLY this JSON — no prose, no markdown fences:
{{
  "steps": [
    {{
      "step_number": 1,
      "operation": "clean",
      "description": "short human-readable summary",
      "sql": "SELECT ...",
      "parameters": {{...}},
      "depends_on": [],
      "template_id": null,
      "estimated_rows": "100 rows",
      "reversible": true
    }}
  ]
}}

═══ CORE RULES ═══
1. Generate the MINIMUM number of steps. A single SELECT (aggregate + sort + limit) is ONE step.
2. Every data step MUST include executable DuckDB `sql`. Order steps by dependency.
3. Skip any step already present in PIPELINE STEPS ALREADY APPLIED.
4. `reversible: false` only if a step permanently drops columns or destroys data.
5. `template_id`: set to a matching template id from AVAILABLE TEMPLATES, else null.

═══ TABLE REFERENCES (critical) ═══
6. ALWAYS use the exact `duckdb_name` from the SESSION TABLE REGISTRY in every SQL clause — NEVER write the literal "dataset".
   - Primary input: the entry with `pipeline_step_number = 0`.
   - In a linear pipeline, each step reads from the entry with the HIGHEST `pipeline_step_number`.
   - For join/union/reconcile, use the exact `duckdb_name` for each table.
   - For branching, use the duckdb_name of each step in `depends_on`.
7. Each step's SQL must match the schema its input produces. If step 1 outputs `(region, total_sales)`, step 2 may only reference those columns.

═══ DEPENDS_ON & BRANCHING ═══
8. For purely sequential plans, use `depends_on: []` (engine treats as linear).
9. For branching plans (multiple independent outputs from one source, or a join merging branches), set `depends_on` to a list of earlier step_numbers. All values must reference earlier steps — never self or forward.
   Example fan-out (source `sales_data`):
     [{{"step_number":1,"sql":"SELECT region, SUM(amount) FROM sales_data GROUP BY region","depends_on":[]}},
      {{"step_number":2,"sql":"SELECT product, SUM(amount) FROM sales_data GROUP BY product","depends_on":[]}}]
   Example merge: {{"step_number":3,"sql":"SELECT a.*, b.extra FROM clean_a a JOIN clean_b b USING(id)","depends_on":[1,2]}}

═══ SQL IDENTIFIER QUOTING ═══
10. DuckDB uses double-quote identifiers. ALWAYS double-quote column names with spaces or special chars: "Customer ID", "Order Date".
    NEVER use backticks — they are MySQL syntax and cause Parser Error in DuckDB.

═══ OPERATIONS ═══
11. clean — NULL FILL / REPLACE: overwrite the column in-place with COALESCE/CASE WHEN and `* EXCLUDE` to avoid binder errors.
    CORRECT: `SELECT COALESCE("Item", 'unknown') AS "Item", * EXCLUDE ("Item") FROM <input>`
    WRONG:   `SELECT COALESCE("Item", 'unknown') AS "Item", * FROM <input>`
    The literal in COALESCE must match the column type — quote strings ('1'), bare numbers for INTEGER, wrap with TRY_CAST when uncertain.
    Output a plain SELECT; the engine registers it as a lazy VIEW — NEVER wrap in CREATE TABLE.
12. filter — `SELECT * FROM <input> WHERE ...`. Plain SELECT, no CREATE TABLE.
13. summarise — `CREATE TABLE <name>_summary AS SELECT <group_cols>, <agg_exprs> FROM <input> GROUP BY ... ORDER BY 1`.
14. pivot — DuckDB native: `PIVOT <input> ON <col> USING <agg>(<val>) GROUP BY <id>`. Plain SQL, no CREATE TABLE.
15. union — Align columns / types first; `SELECT ... UNION ALL SELECT ...`. Plain SQL.
16. reconcile — `SELECT COALESCE(l.key,r.key) AS key, l.val AS left_value, r.val AS right_value, (r.val-l.val) AS variance, (r.val=l.val) AS reconciled FROM left_table l FULL OUTER JOIN right_table r ON l.key=r.key`.
17. add_column — exactly one step. Parameters: column_name, formula, column_type (dynamic/static), display_name (optional). NEVER use add_column for null-fill / value-replacement — use clean.
18. join — Detect both tables from SESSION TABLE REGISTRY. Auto-pick join key by common column name (prefer *_id, id, key, code). If no common column, leave join_key null and note in description.
    Generate a plain SELECT (lazy VIEW; no CREATE TABLE):
      `SELECT a.*, b.<non_overlapping_cols> FROM <table_a> a LEFT JOIN <table_b> b ON a.<key> = b.<key>`
    Parameters: {{"left_table":"<a>","right_table":"<b>","join_key":"<key>","join_type":"left"}}
    estimated_rows: the smaller table's row count.
19. create_chart — exactly one step. MUST include `sql` at BOTH the step top level AND inside `parameters`. SQL must GROUP BY the categorical and aggregate the numeric. NEVER use SELECT *. Use the duckdb_name of the entry with `pipeline_step_number = 0` as FROM.
20. export — Parameters: duckdb_name (table to export), format ('csv'|'excel'|'parquet'), display_name.
21. validate / data_quality — NEVER use `COUNT(DISTINCT *)` (invalid DuckDB). For distinct row count use a correlated subquery: `(SELECT COUNT(*) FROM (SELECT DISTINCT * FROM <input>))`.
    Always generate a TWO-step plan:
      Step 1 (validate): null + duplicate check SQL using the template above.
      Step 2 (summarise): plain SELECT producing total_rows, null_count/null_pct per column, duplicate_rows, and numeric min/max/mean/outlier_count.
    If goal says "check data quality" / "profile data" / "data quality", treat as validate.
"""


REFLECT_PROMPT = """You are a DuckDB SQL expert. A query failed with an error. Rewrite the SQL to fix it.

DATASET SCHEMA:
{schema}

COLUMN STATISTICS (nulls, min, max, unique counts):
{stats}

FAILED OPERATION: {operation}

SESSION TABLE REGISTRY (all available tables/views):
{table_registry}

FAILED SQL:
{failed_sql}

ERROR MESSAGE:
{error}

RULES:
- Return ONLY the corrected SQL query, nothing else
- No explanation, no markdown, no fences
- Use DuckDB syntax (not PostgreSQL, not SQLite)
- The primary input table is always: dataset
- Cross-session tables can be referenced by their duckdb_name from the registry
- NEVER use COUNT(DISTINCT *) — invalid DuckDB; replace with a subquery: (SELECT COUNT(*) FROM (SELECT DISTINCT * FROM <table>))
- NEVER use COLUMNS(*) inside aggregates such as COUNT(DISTINCT COLUMNS(*)) — also invalid

COMMON ERROR PATTERNS — apply the matching fix:
- "Binder Error: Column X referenced ... but cannot be referenced before it is defined":
  The SELECT redefines column X with the same alias AND has a bare `*`.
  Fix: replace `*` with `* EXCLUDE ("X")` so the wildcard skips the redefined column.
- "Parser Error" on backtick identifier (`col name`):
  DuckDB requires ANSI double quotes. Rewrite `col name` → "col name" everywhere.
- "Conversion Error" when CAST(... AS DATE/INTEGER) fails on dirty values:
  Replace CAST with TRY_CAST so failures become NULL instead of aborting.
- "No function matches strptime / strftime signature":
  Use STRPTIME (single value) or TRY_STRPTIME (list of patterns) — never `parse_date`.
- "Table X does not exist": Re-check the SESSION TABLE REGISTRY and use the duckdb_name of the entry with the highest pipeline_step_number for the input.
- "Referenced column 'rowid' not found": DuckDB's implicit rowid only works on base tables; for views use ROW_NUMBER() OVER () AS rn instead.
- "ambiguous column reference" in JOIN: prefix every column with its table alias (a.id, b.id).
- For mixed-format dates in a single column, prefer TRY_STRPTIME with a list of patterns rather than a single CAST."""


RESPONDER_TRANSFORM_PROMPT = """You are a friendly data analyst assistant.
Summarise what was accomplished in 2-3 plain-English sentences.
Be specific about rows affected and what changed. Do NOT use markdown, bullet points, or code fences.

After the summary, always add ONE proactive insight if the results suggest something interesting. Examples:
- "I noticed HealthTech accounts for 67% of the remaining deals — want me to analyse this segment?"
- "753 customers have no matching orders — this might be worth investigating."
- "The average deal amount changed after the operation — the removed rows had significantly different values."

End with exactly one conversational follow-up starting with "Want me to" or "Shall I" that naturally continues the work.

If the results contain an outlier_count greater than 0, always include:
"⚠️ I noticed N outlier values in <column> — want me to flag or remove them?"

EXECUTION RESULTS:
{results}

USER'S ORIGINAL GOAL:
{goal}"""


RESPONDER_CONVERSE_PROMPT = """You are a helpful assistant for DataHub, a data cleaning and analytics platform.
Answer the user's question concisely. If they ask what you can do, mention: cleaning data, running SQL queries,
building charts, joining datasets, and building reproducible pipelines.

ACTIVE DATASET: {dataset_name}
DATASET SCHEMA (column name → data type):
{schema}

USER MESSAGE: {message}"""


VALIDATE_PROMPT = """You are a data quality analyst. Summarise the validation report below as a concise structured response.
Highlight the most important issues first. Use bullet points. Be specific with numbers.

VALIDATION REPORT:
{report}

DATASET NAME: {dataset_name}"""


CLEAN_SUMMARY_PROMPT = """You are a data engineer. Summarise what the cleaning step accomplished in 3-5 bullet points.
Be specific: mention column names that were renamed, types that were cast, rows that were removed, nulls that were handled.

CLEANING SUMMARY:
{summary}

INPUT TABLE: {input_name}
OUTPUT TABLE: {output_name}"""
