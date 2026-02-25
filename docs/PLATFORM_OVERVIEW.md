# DataHub Platform – Capabilities, Architecture, Workflow, and Deployment

## 1. Capabilities

### Messy Data Handling
- AI-assisted profiling, auto-cleaning of missing/invalid values.
- Schema repair, smart type inference, outlier detection.
- User feedback loop to correct/confirm fixes.
- Chart-ready profiling summaries available per column.
- Dataset listing and CSV export for downstream usage.
- Dataset metadata persisted in Postgres.
- Dataset rows stored as JSONB and chunked for larger datasets.
- CSV export streams from chunks without loading full datasets in memory.

### Proactive, Autonomous AI Agents
- LLM-assisted suggestions supported via Groq API when configured.
- Fallback rule-based suggestions if no LLM is configured.

### Business Context Memory
- Context API with optional Chroma-backed persistence.
- Default workspace context used for agent prompts.
- Context persisted in Postgres with optional local JSON fallback.

### Deep Transformation Recipes
- Recipe API supports multi-step definitions and apply.
- Provenance and reversibility tracked in Phase 3.

### Rich, Interactive Visualizations
- Dashboard CRUD scaffold available (Phase 3).
- Advanced layout, drill-down, and charting in Phase 3+.
- Dashboards persisted in Postgres.

### Open Ecosystem & Integration
- Plugin interface scaffolding and plugin listing endpoint.
- Webhooks and scheduled job endpoints available (Phase 4).
- Connector import API with inline CSV connector available.

### Enterprise-Grade Security & Deployment
- Audit logging middleware and RBAC scaffolding available.
- SSO and compliance modules in Phase 3+.
- Compliance scaffolds available in docs/COMPLIANCE.md.
- User and workspace records stored in Postgres via SQLAlchemy.
- Audit logs stored in Postgres.

## 2. Underlying Solutions / Tech Map

| Capability | Solution / Tech |
| --- | --- |
| Data Cleaning & Profiling | Pandas, pyjanitor, AI/LLM agents |
| Auto Insight/Trends | AI pipelines (Phase 2+) |
| Context/Memory | Vector DB (Chroma) and encrypted storage |
| AI Agents/Autowrangling | LangChain/RAG (Phase 2+) |
| Visualization | React + charting libraries (Phase 3+) |
| API + Connectors | FastAPI, REST, plugins/adapters |
| Permissions & Security | JWT, RBAC, audit logging (Phase 3+) |
| Deployment | Docker Compose, CI/CD, Helm (Phase 5+) |

## 3. Typical User Workflow
1. Connect data sources via UI or API.
2. Profile and clean with AI-assisted suggestions.
3. Teach business context and validate rules.
4. Analyze and transform with recipes.
5. Visualize and iterate via dashboards.
6. Export or deploy outputs with automation.
7. Monitor with governance and audit trails.

## 4. Deployment Approach
- Docker Compose for local/dev.
- Helm and cloud deployment artifacts planned in infra/.
- SSO, encryption-at-rest, and audit logs in Phase 3+.

## 5. How It Works (Under the Hood)
- Profiling and transformation pipelines run in the backend.
- Context memory stored in vector DB for reuse.
- Agents propose transformations and insights with traceability.
- UI consumes API for previews, dashboards, and export flows.
