# Next Steps: Completing the Chat Platform

## 🎯 Immediate Priorities (This Week)

### Priority 1: Test Current Implementation (2-3 hours)

**Objective**: Verify backend APIs and frontend components work end-to-end

**Checklist**:
- [ ] Start backend: `uvicorn app.main:app --reload`
- [ ] Verify `/health` endpoint responds
- [ ] Verify migrations applied: `python -m alembic current`
- [ ] Start frontend: `npm run dev`
- [ ] Create new workspace and project
- [ ] Open project → Chat interface should render
- [ ] Check browser console for errors (no red messages)
- [ ] Send test chat message
- [ ] Verify request appears in backend logs
- [ ] Check EventSource stream in DevTools Network tab

**Success Criteria**:
- Backend starts without import errors
- Frontend renders without TypeScript errors
- Chat message POSTs to correct endpoint
- No errors in browser console or backend logs

**If Issues**:
- Missing imports? Check main.py has `chat_sessions` and `pipelines_v2`
- TypeScript errors? Check component file syntax
- SSE not connecting? Check Authorization header is set

---

### Priority 2: Integrate Groq LLM (2-3 hours)

**Objective**: Replace mock plan generation with real LLM calls

**Files to Modify**:
- `backend/app/services/chat_engine.py` - `_generate_plan()` method (line ~150)

**Current Code** (Mock Implementation):
```python
def _generate_plan(self, user_message: str) -> list[dict]:
    # TODO: Call Groq API
    return [
        {
            "action_type": "analyze",
            "description": user_message,
            "parameters": {}
        }
    ]
```

**Update To** (Real LLM Call):
```python
import os
from groq import Groq  # pip install groq

def _generate_plan(self, user_message: str) -> list[dict]:
    """Generate transformation steps using Groq LLM"""
    try:
        client = Groq(api_key=os.getenv("GROQ_API_KEY"))
        
        prompt = f"""You are a data transformation expert. User wants to: {user_message}

Generate a JSON array of transformation steps. Each step should have:
- "action_type": one of [filter, clean, aggregate, pivot, join, dedup, sort, sample]
- "description": human-readable description
- "parameters": dict with action-specific params

Example for "Remove rows where age < 18":
[{{"action_type": "filter", "description": "Remove rows where age < 18", "parameters": {{"column": "age", "operator": ">", "value": 18}}}}]

Generate steps for: {user_message}
Return ONLY the JSON array, no markdown."""

        response = client.messages.create(
            model="llama-3.1-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1024,
            temperature=0.3
        )
        
        response_text = response.content[0].text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
            response_text = response_text.strip()
        
        import json
        steps = json.loads(response_text)
        
        # Validate and limit steps per tier
        max_steps = self._get_max_steps_for_tier()
        if len(steps) > max_steps:
            steps = steps[:max_steps]
        
        return steps
    except Exception as e:
        self.logger.error(f"LLM plan generation failed: {e}")
        # Fallback: return analysis-only step
        return [{"action_type": "analyze", "description": user_message, "parameters": {}}]
```

**Testing**:
```python
# Test in Python shell
from app.services.chat_engine import ChatEngine
engine = ChatEngine(db=None, user_id="test", workspace_id="test", user_plan="professional")
steps = engine._generate_plan("Remove duplicate rows")
print(steps)
# Expected: Array of steps with action_type, description, parameters
```

**Integration Test**:
1. Send chat message: "Remove rows where salary > 100000"
2. Check `/api/chat/sessions/{id}` GET response
3. Verify `messages` array contains plan with actual steps (not mock)

**Troubleshooting**:
- ImportError for Groq? → `pip install groq`
- API key not set? → `export GROQ_API_KEY=gsk_...`
- LLM returns non-JSON? → Add try-catch, log response, return fallback
- Rate limited by Groq? → Implement exponential backoff

---

### Priority 3: Connect Data Transformation Execution (2-3 hours)

**Objective**: Replace mock data execution with real step processing

**Files to Modify**:
- `backend/app/services/pipeline_engine.py` - `_execute_step()` method (line ~200)

**Current Code** (Mock):
```python
async def _execute_step(self, step: dict, input_data: Any) -> dict:
    """Execute a single transformation step (MOCK)"""
    await asyncio.sleep(0.1)  # Simulate processing
    return {
        "input_rows": 100,
        "output_rows": 100,
        "execution_time_ms": 100,
        "status": "completed"
    }
```

**Update To** (Real Execution):
```python
async def _execute_step(self, step: dict, input_data: Any) -> dict:
    """Execute a single transformation step"""
    import time
    import duckdb  # Fast SQL execution
    
    start_time = time.time()
    action_type = step.get("action_type", "analyze")
    params = step.get("parameters", {})
    
    try:
        # Convert input_data to DuckDB relation if needed
        if isinstance(input_data, dict):
            rel = duckdb.from_df(input_data)
        else:
            rel = input_data
        
        input_rows = rel.count().fetchall()[0][0]
        
        # Route to correct transformation
        if action_type == "filter":
            # Example: filter out rows
            column = params.get("column")
            operator = params.get("operator", "=")
            value = params.get("value")
            query = f'SELECT * FROM rel WHERE "{column}" {operator} {value!r}'
            result = duckdb.sql(query).df()
            
        elif action_type == "dedup":
            # Remove duplicates
            columns = params.get("columns", [])
            if columns:
                result = rel.distinct().df()
            else:
                result = rel.df()
            
        elif action_type == "clean":
            # Data cleaning (fill nulls, convert types)
            import pandas as pd
            result = input_data.fillna(params.get("fill_value", ""))
            
        elif action_type == "aggregate":
            # Aggregation (group by, sum, average)
            group_columns = params.get("group_columns", [])
            agg_column = params.get("agg_column")
            agg_func = params.get("agg_func", "sum")
            # Implementation...
            result = input_data
            
        elif action_type == "sort":
            # Sorting
            sort_column = params.get("column")
            ascending = params.get("ascending", True)
            result = input_data.sort_values(by=sort_column, ascending=ascending)
            
        else:
            # Unknown action - pass through
            result = input_data
        
        output_rows = len(result) if hasattr(result, "__len__") else 0
        execution_time_ms = int((time.time() - start_time) * 1000)
        
        return {
            "input_rows": input_rows,
            "output_rows": output_rows,
            "execution_time_ms": execution_time_ms,
            "status": "completed",
            "result": result
        }
        
    except Exception as e:
        execution_time_ms = int((time.time() - start_time) * 1000)
        self.logger.error(f"Step execution failed: {e}")
        return {
            "status": "failed",
            "error": str(e),
            "execution_time_ms": execution_time_ms
        }
```

**Installation**:
```bash
pip install duckdb
```

**Testing**:
```python
import pandas as pd
from app.services.pipeline_engine import PipelineEngine

df = pd.DataFrame({"id": [1,1,2,3], "name": ["A","A","B","C"]})
engine = PipelineEngine(db=None, user_id="test", user_plan="professional")

step = {
    "action_type": "dedup",
    "description": "Remove duplicates",
    "parameters": {"columns": ["id"]}
}

result = await engine._execute_step(step, df)
print(result)
# Expected: {"input_rows": 4, "output_rows": 3, "status": "completed", ...}
```

---

### Priority 4: Hook User Plan from Database (30 mins)

**Objective**: Use actual user tier instead of hardcoded 'free'

**Files to Modify**:
- `backend/app/routers/chat_sessions.py` - Line ~40
- `backend/app/routers/pipelines_v2.py` - Line ~30

**Current Code**:
```python
@router.post("/sessions")
async def create_session(..., current_user_id: str = Depends(get_current_subject)):
    user_plan = 'free'  # TODO: Get from database
```

**Update To**:
```python
@router.post("/sessions")
async def create_session(..., current_user_id: str = Depends(get_current_subject), db: Session = Depends(get_db)):
    from app.models_db import User  # Or your user model
    
    user = db.query(User).filter(User.id == current_user_id).first()
    user_plan = user.plan if user else 'free'
```

**If User Model Not Found**:
- Check `backend/app/models_db.py` for User class
- Or create simple User reference in ChatEngine:
```python
class UserPlan:
    def __init__(self, db, user_id):
        self.db = db
        self.user_id = user_id
    
    def get_plan(self):
        # Query user table for plan
        result = self.db.execute(f"SELECT plan FROM users WHERE id = '{self.user_id}'")
        return result.fetchone()[0] if result else 'free'
```

---

## 🔧 Technical Deep Dives

### Understanding SSE Streaming

**How It Works**:
1. Client opens connection: `EventSource("/api/chat/sessions/{id}/messages")`
2. Server yields events: `data: {"type": "...", "content": "..."}\n\n`
3. Browser parses and fires `onmessage` events
4. JavaScript handles each event (update UI, render table, etc.)

**Debugging**:
```javascript
// In browser console:
const source = new EventSource("/api/chat/sessions/test/messages");
source.onmessage = (e) => console.log("Received:", JSON.parse(e.data));
source.onerror = () => console.log("Connection closed");
```

### Rate Limiting Logic

**Free Tier**: 50 messages/month
```sql
SELECT COUNT(*) FROM chat_sessions 
WHERE user_id = 'user-123' 
AND created_at > NOW() - INTERVAL '1 month'
```

**Pro Tier**: 500 messages/month
- Same query, different limit

**Team+**: Unlimited

**Implementation Location**: `ChatEngine.check_rate_limit()` in chat_engine.py

---

## 📋 Detailed Checklist

### Week 1: Core Testing & LLM
- [ ] Day 1: Full system test (2-3 hours)
  - [ ] Backend starts without errors
  - [ ] Frontend renders without TypeScript errors  
  - [ ] Chat message sends via API
  - [ ] EventSource streaming works
  
- [ ] Day 2: Groq LLM Integration (2-3 hours)
  - [ ] Install Groq SDK: `pip install groq`
  - [ ] Update `_generate_plan()` method
  - [ ] Test with sample prompts
  - [ ] Verify step structure
  
- [ ] Day 3: Data Execution (2-3 hours)
  - [ ] Install DuckDB: `pip install duckdb`
  - [ ] Implement `_execute_step()` for each action type
  - [ ] Test with sample data
  - [ ] Verify row counts and metrics
  
- [ ] Day 4: User Plan (30 mins)
  - [ ] Hook user.plan from database
  - [ ] Test rate limiting
  - [ ] Verify tier-based feature gates

### Week 2: E2E & Polish
- [ ] Day 5: End-to-end workflow test (3-4 hours)
  - [ ] Upload CSV → Create session
  - [ ] Send chat message → See LLM plan
  - [ ] Execute → See transformations
  - [ ] Save as pipeline
  - [ ] Reuse on new dataset
  
- [ ] Day 6: Error handling (2 hours)
  - [ ] Test with bad data
  - [ ] Test with bad LLM responses
  - [ ] Ensure graceful failures
  - [ ] Good error messages in UI
  
- [ ] Day 7: Performance & Polish (2-3 hours)
  - [ ] Test with 10k+ row dataset
  - [ ] Measure API latency
  - [ ] Optimize slow queries
  - [ ] Final UI/UX tweaks

### Week 3: Advanced Features
- [ ] Scheduling service (Business tier)
- [ ] Collaboration features (Team tier)
- [ ] Advanced error recovery (Business tier)

---

## 🐛 Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "ImportError: No module named 'groq'" | Groq SDK not installed | `pip install groq` |
| LLM returns non-JSON | Model confusion, timeout | Add try-catch, log response, return fallback |
| SSE not streaming | Missing Content-Type header | Check middleware headers aren't stripped |
| Rate limit not working | Hardcoded 'free' tier | Update router to query user.plan |
| Data not executing | _execute_step not implemented | Implement transformation logic with DuckDB |
| Frontend TypeScript errors | Import paths wrong | Check component paths in Chat*.tsx |

---

## 🎓 Learning Resources

- **SSE**: [https://developer.mozilla.org/en-US/docs/Web/API/EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- **Groq API**: [https://console.groq.com/docs](https://console.groq.com/docs)
- **DuckDB**: [https://duckdb.org/docs/](https://duckdb.org/docs/)
- **FastAPI Async**: [https://fastapi.tiangolo.com/async-tests/](https://fastapi.tiangolo.com/async-tests/)
- **React Hooks**: [https://react.dev/reference/react/hooks](https://react.dev/reference/react/hooks)

---

## 🚀 Deployment After Completion

Once all pieces are integrated:

```bash
# Backend
docker build -f backend/Dockerfile -t datahub-api:latest .
docker push datahub-api:latest

# Database (production)
python -m alembic upgrade head

# Frontend
npm run build
docker build -f frontend/Dockerfile.prod -t datahub-web:latest .
docker push datahub-web:latest

# Deploy to production
kubectl apply -f infra/k8s/datahub-backend-secret.yaml
# (or Vercel for frontend)
```

---

## 📞 Getting Help

If stuck on any step:
1. Check `CHAT_PLATFORM_IMPLEMENTATION.md` for architecture
2. Check `IMPLEMENTATION_SUMMARY.md` for file locations
3. Run component in isolation (test service before router)
4. Add logging to trace execution flow
5. Check database state (query tables directly)
6. Use browser DevTools for frontend debugging

---

**Estimated Time to Completion**: 5-7 days (two developers)
**Remaining Work**: ~40-50 hours
**Current Status**: 85% complete (core infrastructure done)

Good luck! 🎉
