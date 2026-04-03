# Quick Start Guide - Chat Platform Deployment

## ⚡ 60-Second Setup

### Backend Setup
```bash
cd backend

# Install dependencies (if needed)
pip install -r requirements.txt

# Apply database migration
python -m alembic upgrade head

# Start server
uvicorn app.main:app --reload

# Verify it's working
curl http://localhost:8000/health
```

### Frontend Setup
```bash
cd frontend

# Install dependencies (if needed)
npm install

# Start dev server
npm run dev

# Opens: http://localhost:5173
```

### Environment Verification
```bash
# Check that .env has these:
export GROQ_API_KEY=gsk_...
export GROQ_MODEL=llama-3.3-70b-versatile
export GROQ_INTENT_MODEL=llama-3.1-8b-instant
export DATABASE_URL=postgresql+psycopg://...

# Verify migrations applied:
python -m alembic current
# Expected output: (head)
```

---

## 🧪 Quick Test Flow

### 1. Verify Health
```bash
curl http://localhost:8000/health
# Expected: {"status":"ok"}
```

### 2. Send Chat Message (SSE Streaming)
```bash
# Stream events from the AI agent:
curl -X POST http://localhost:8000/api/cleaning/datasets/{dataset_id}/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"Remove duplicate rows","session_id":"test-session","workspace_id":"default","pipeline_steps":[],"plan_approved":false,"conversation_history":[]}' \
  -N

# SSE events you will see:
# data: {"type":"agent.thinking","message":"Loading dataset context..."}
# data: {"type":"agent.plan","plan":[{"step_number":1,"operation":"clean",...}]}
# data: {"type":"agent.step.start","step_number":1,"operation":"clean","total_steps":1}
# data: {"type":"agent.step.done","step":1,"row_count_before":500,"row_count_after":492}
# data: {"type":"agent.done","response":"Removed 8 duplicate rows...","run_id":"..."}
```

### 3. Open Frontend (Browser)
```
Open: http://localhost:5173/app
- Select a workspace and upload a CSV.
- The AI Agent panel opens on the right.
- Type a message (or press / to focus the input from anywhere).
- Review the plan, click Approve & Run.
- Watch per-step progress in the thinking indicator.
```

---

## 📊 Database Schema Quick Ref

```sql
-- Check migration applied
SELECT version_num FROM alembic_version;

-- View key tables
\dt datasets workspaces users pipeline_runs_v2 transformation_steps

-- Sample queries:
SELECT id, name, status FROM datasets LIMIT 5;
SELECT id, name, version FROM pipelines_v2 LIMIT 5;
SELECT status, COUNT(*) FROM pipeline_runs_v2 GROUP BY status;
```

---

## 🔧 Troubleshooting

### Issue: "SSE stream not connecting"
**Solution**: Check browser DevTools → Network tab
- Look for request to `/api/cleaning/datasets/{id}/chat`
- Status should be 200 (SSE stays open)
- Content-Type should be `text/event-stream`

### Issue: "Rate limit exceeded on chat"
**Solution**: The AI chat endpoint is limited to **20 requests/minute** per user.
Wait 60 seconds before retrying, or reduce the message frequency.

### Issue: "Database migration failed"
**Solution**: Check migration status
```bash
python -m alembic history
python -m alembic current

# If stuck, rollback:
python -m alembic downgrade -1

# Then upgrade again:
python -m alembic upgrade head
```

### Issue: "Chat interface shows no messages"
**Solution**: Check browser console for errors
- Verify Auth token is present (localStorage → `auth_token`)
- Check that the POST to `/api/cleaning/datasets/{id}/chat` returns 200
- Open DevTools → Network → filter by `EventStream` to see SSE events

---

## 📈 Performance Checks

### Query Performance
```sql
-- Dataset listing (should be <10ms)
EXPLAIN ANALYZE
SELECT * FROM datasets WHERE workspace_id = 'workspace-id' LIMIT 20;

-- User plan check (should be <5ms)
EXPLAIN ANALYZE
SELECT plan FROM users WHERE id = 'user-id';
```

### API Latency
```bash
# Time a dataset list request
time curl -X GET http://localhost:8000/api/datasets \
  -H "Authorization: Bearer $TOKEN"

# Expected: <100ms
```

### Frontend Rendering
- DevTools → Performance tab
- Record loading the app
- Explorer + AI panel should render in <500ms

---

## 📚 Key File Locations

| Component | File |
|-----------|------|
| AI Agent (LangGraph) | `backend/app/services/agent_graph.py` |
| Cleaning Router | `backend/app/routers/cleaning.py` |
| AI Controller | `backend/app/controllers/agent_controller.py` |
| AI Panel (Frontend) | `frontend/src/components/AIPanel.tsx` |
| Chat Session Hook | `frontend/src/hooks/useChatSession.ts` |
| Dataset Explorer | `frontend/src/components/DatasetExplorer.tsx` |
| Alembic Migrations | `backend/alembic/versions/` |

---

## 🚀 Production Deployment

### Checklist
- [ ] Database: Run `alembic upgrade head` on production DB
- [ ] Backend: Set `LLM_PROVIDER=groq` in prod env
- [ ] Backend: Verify `GROQ_API_KEY` is set
- [ ] Frontend: Set `VITE_API_URL=https://api.yourdomain.com`
- [ ] CORS: Update allowed origins in `config.py`
- [ ] SSL: Enable HTTPS for SSE streaming
- [ ] Load Testing: Test concurrent sessions

### Docker
```bash
# Backend image already has Dockerfile
docker build -f backend/Dockerfile -t datahub-api:latest .
docker run -e DATABASE_URL=$DATABASE_URL datahub-api:latest

# Frontend
docker build -f frontend/Dockerfile.prod -t datahub-web:latest .
docker run -p 80:80 datahub-web:latest
```

---

## 🔐 Security Checklist

- [ ] All endpoints require `get_current_subject` auth
- [ ] Rate limiting enforced per user_plan
- [ ] CORS origins whitelisted (not "*")
- [ ] Sensitive data not logged in execution_log
- [ ] Pipeline parameters sanitized before execution
- [ ] Session visibility scoped to current_user_id

---

## 📞 Support Resources

| Issue | Resource |
|-------|----------|
| SSE Streaming | See `CHAT_PLATFORM_IMPLEMENTATION.md` Streaming section |
| API Contract | See `IMPLEMENTATION_SUMMARY.md` API Contract |
| Database Schema | See `CHAT_PLATFORM_IMPLEMENTATION.md` Database Schema |
| Component Props | Check TypeScript interfaces in component files |
| CSS Responsive | Check media queries in CSS files (@media 768px) |

---

## ✅ Deployment Verification

```bash
# After deployment, verify with:

# 1. Health check
curl https://api.yourdomain.com/health

# 2. Database connected
curl https://api.yourdomain.com/api/datasets \
  -H "Authorization: Bearer $TOKEN"

# 3. Frontend loads
curl https://yourdomain.com | grep "DataHub"

# 4. AI chat SSE works
curl -N https://api.yourdomain.com/api/cleaning/datasets/{dataset_id}/chat \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{"message":"test","session_id":"smoke-test","workspace_id":"default","pipeline_steps":[],"plan_approved":false,"conversation_history":[]}'
```

---

**Last Updated**: Phase 7 (AI Agent Enrichment)
**Version**: 2.0
**Status**: Production-ready with LLM integration
