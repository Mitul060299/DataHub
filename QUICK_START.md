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
export GROQ_MODEL=llama-3.1-70b-versatile
export DATABASE_URL=postgresql+psycopg://...

# Verify migrations applied:
python -m alembic current
# Expected output: (head)

# Verify tables exist:
psql $DATABASE_URL -c "SELECT * FROM chat_sessions LIMIT 1;"
```

---

## 🧪 Quick Test Flow

### 1. Create Chat Session (Backend)
```bash
curl -X POST http://localhost:8000/api/chat/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"dataset_id":"test_data","workspace_id":"default"}'

# Expected:
{
  "success": true,
  "data": {
    "id": "uuid-here",
    "title": "Chat Session",
    "status": "active",
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

### 2. Send Chat Message (SSE Streaming)
```bash
# Keep terminal open and stream events:
curl -X POST http://localhost:8000/api/chat/sessions/{session_id}/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"content":"Remove duplicate rows"}' \
  -N

# Watch for events like:
# data: {"type":"thinking","content":"..."}
# data: {"type":"plan","data":{"steps":[...]}}
```

### 3. Open Frontend (Browser)
```
Open: http://localhost:5173/app
- Click "Workspaces" → Create project
- Click project → Chat interface appears
- Type message in left panel
- Watch steps appear in right panel
- View data table in center
```

---

## 📊 Database Schema Quick Ref

```sql
-- Check migration applied
SELECT version_num FROM alembic_version;

-- View key tables
\dt chat_sessions pipelines_v2 pipeline_runs_v2 transformation_steps

-- Sample queries:
SELECT id, user_id, status FROM chat_sessions LIMIT 5;
SELECT id, name, version FROM pipelines_v2 LIMIT 5;
SELECT status, COUNT(*) FROM pipeline_runs_v2 GROUP BY status;
```

---

## 🔧 Troubleshooting

### Issue: "No module named 'app.routers.chat_sessions'"
**Solution**: Verify file exists at `backend/app/routers/chat_sessions.py`
```bash
ls -la backend/app/routers/chat_sessions.py
```

### Issue: "SSE stream not connecting"
**Solution**: Check browser DevTools → Network tab
- Look for request to `/api/chat/sessions/{id}/messages`
- Status should be 200, not 304 or 500
- Content-Type should be `text/event-stream`

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

### Issue: "Rate limiting not triggered for Free tier"
**Solution**: Currently hardcoded `user_plan='free'` in routers
- Edit: `backend/app/routers/chat_sessions.py` line ~40
- Change: `user_plan = 'free'` to `user_plan = current_user.plan`

### Issue: "Chat interface shows no messages"
**Solution**: Check browser console for errors
- Verify AuthToken is in localStorage
- Check API response has 200 status
- Verify EventSource is created (DevTools → Network)

---

## 📈 Performance Checks

### Query Performance
```sql
-- Session retrieval (should be <10ms)
EXPLAIN ANALYZE
SELECT * FROM chat_sessions WHERE user_id = 'user-id' LIMIT 10;

-- Rate limit check (should be <5ms)
EXPLAIN ANALYZE
SELECT COUNT(*) FROM chat_sessions WHERE user_id = 'user-id' 
AND created_at > NOW() - INTERVAL '1 month';
```

### API Latency
```bash
# Time a request
time curl -X GET http://localhost:8000/api/chat/sessions \
  -H "Authorization: Bearer $TOKEN"

# Expected: <100ms
```

### Frontend Rendering
- DevTools → Performance tab
- Record loading a session
- Chat interface should render in <500ms

---

## 📚 Key File Locations

| Component | File | Lines |
|-----------|------|-------|
| Database | backend/alembic/versions/0020_chat_pipelines.py | 280 |
| Chat Service | backend/app/services/chat_engine.py | 250 |
| Pipeline Service | backend/app/services/pipeline_engine.py | 340 |
| Chat Router | backend/app/routers/chat_sessions.py | 350 |
| Pipeline Router | backend/app/routers/pipelines_v2.py | 310 |
| Chat UI | frontend/src/components/ChatInterface.tsx | 300 |
| Steps UI | frontend/src/components/StepsPanel.tsx | 200 |
| Layout | frontend/src/components/ChatWorkspaceContent.tsx | 200 |

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
curl https://yourdomain.com | grep "ChatWorkspaceContent"

# 4. SSE works
curl -N https://api.yourdomain.com/api/chat/sessions/test-id/messages \
  -H "Authorization: Bearer $TOKEN" \
  -X POST \
  -d '{"content":"test"}'
```

---

**Last Updated**: January 2024
**Version**: 0.1 (MVP)
**Status**: Ready for Production (Except LLM Integration)
