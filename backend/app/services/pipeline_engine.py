"""
Pipeline Engine - Orchestrates reproducible workflow execution
Handles: Pipeline creation, execution, monitoring, scheduling
"""

import json
import uuid
import hashlib
import time
import copy
from datetime import datetime
from typing import Optional, Dict, Any, AsyncGenerator, List

import pandas as pd
from sqlalchemy.orm import Session as DBSession

from app.models_db import (
    PipelineV2DB,
    PipelineRunV2DB,
    TransformationStepDB,
    ChatSessionDB,
    DatasetMetaDB,
    DatasetChunkDB,
    DatasetDataDB,
)
from app.services.chat_engine import ChatEvent, EventType
from app.services.data_conversion import DataConversionService
from app.services.duckdb_service import DuckDBService


# ---------------------------------------------------------------------------
# Standalone helpers for template transform / ai_transform operations
# ---------------------------------------------------------------------------

def _apply_pipeline_operation(
    df: pd.DataFrame,
    step_type: str,
    operation: str,
    config: Dict[str, Any],
) -> pd.DataFrame:
    """Execute a named transform or ai_transform operation on a DataFrame."""
    import re as _re
    import numpy as _np

    if step_type == "transform":
        if operation == "drop_duplicates":
            keep = config.get("keep", "first")
            return df.drop_duplicates(keep=keep)

        elif operation == "trim_string_columns":
            for col in df.select_dtypes(include="object").columns:
                df[col] = df[col].str.strip()
            return df

        elif operation == "drop_null_columns":
            threshold = float(config.get("threshold", 0.5))
            min_count = max(1, int(len(df) * (1 - threshold)))
            return df.dropna(thresh=min_count, axis=1)

        elif operation == "rename_snake_case":
            def _to_snake(s: str) -> str:
                s = _re.sub(r"[^A-Za-z0-9]+", "_", str(s)).strip("_").lower()
                return s or "col"
            return df.rename(columns=_to_snake)

        elif operation == "parse_dates":
            for col in df.columns:
                if df[col].dtype == object:
                    try:
                        parsed = pd.to_datetime(df[col], errors="coerce")
                        if len(df) > 0 and parsed.notna().sum() / len(df) > 0.5:
                            df[col] = parsed
                    except Exception:
                        pass
            return df

        elif operation == "resample_timeseries":
            freq = config.get("freq", "D")
            agg = config.get("agg", "sum")
            date_col = None
            for col in df.columns:
                try:
                    parsed = pd.to_datetime(df[col], errors="coerce")
                    if len(df) > 0 and parsed.notna().sum() / len(df) > 0.5:
                        df[col] = parsed
                        date_col = col
                        break
                except Exception:
                    pass
            if date_col:
                numeric_cols = df.select_dtypes(include="number").columns.tolist()
                if numeric_cols:
                    df = (
                        df.set_index(date_col)[numeric_cols]
                        .resample(freq)
                        .agg(agg)
                        .reset_index()
                    )
            return df

    elif step_type == "ai_transform":
        if operation == "sentiment":
            input_col = config.get("input_column", "text")
            output_col = config.get("output_column", "sentiment_score")
            if input_col in df.columns:
                _POS = {"good", "great", "excellent", "positive", "love", "amazing",
                        "best", "happy", "wonderful", "fantastic", "superb", "perfect",
                        "outstanding", "brilliant", "nice", "awesome"}
                _NEG = {"bad", "terrible", "awful", "negative", "hate", "worst",
                        "poor", "horrible", "disappointing", "sad", "dreadful",
                        "mediocre", "disgusting", "nasty", "failure", "wrong"}

                def _score(text: Any) -> float:
                    if not isinstance(text, str):
                        return 0.0
                    words = set(_re.findall(r"[a-z]+", text.lower()))
                    pos = len(words & _POS)
                    neg = len(words & _NEG)
                    total = pos + neg
                    return round((pos - neg) / total, 2) if total else 0.0

                df[output_col] = df[input_col].apply(_score)
                label_col = output_col.replace("_score", "_label") if "_score" in output_col else output_col + "_label"
                df[label_col] = df[output_col].apply(
                    lambda s: "positive" if s > 0 else ("negative" if s < 0 else "neutral")
                )
            return df

        elif operation == "keywords":
            input_col = config.get("input_column", "text")
            output_col = config.get("output_column", "keywords")
            top_k = int(config.get("top_k", 5))
            _STOP = {
                "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
                "have", "has", "had", "do", "does", "did", "will", "would", "shall",
                "should", "may", "might", "must", "can", "could", "to", "of", "in",
                "on", "at", "by", "for", "with", "about", "and", "but", "or", "not",
                "this", "that", "it", "its", "from", "as", "into", "so", "if",
            }
            if input_col in df.columns:
                def _keywords(text: Any) -> str:
                    if not isinstance(text, str):
                        return ""
                    words = _re.findall(r"\b[a-z]{3,}\b", text.lower())
                    freq: Dict[str, int] = {}
                    for w in words:
                        if w not in _STOP:
                            freq[w] = freq.get(w, 0) + 1
                    return ", ".join(sorted(freq, key=freq.get, reverse=True)[:top_k])  # type: ignore[arg-type]
                df[output_col] = df[input_col].apply(_keywords)
            return df

        elif operation == "anomaly_detection":
            method = config.get("method", "zscore")
            threshold = float(config.get("threshold", 3.0))
            output_col = config.get("output_column", "is_anomaly")
            numeric_cols = df.select_dtypes(include="number").columns.tolist()
            if method == "zscore" and numeric_cols:
                means = df[numeric_cols].mean()
                stds = df[numeric_cols].std(ddof=0).replace(0, _np.nan)
                z_scores = ((df[numeric_cols] - means) / stds).abs().fillna(0)
                df[output_col] = (z_scores > threshold).any(axis=1)
                df["anomaly_score"] = z_scores.max(axis=1).round(3)
            else:
                df[output_col] = False
            return df

    # Unknown operation — pass through unchanged
    return df


class PipelineEngine:
    """Executes reproducible pipelines with monitoring and error handling"""

    _CHUNK_SIZE = 1000
    
    def __init__(self, db: DBSession, user_id: str, user_plan: str):
        self.db = db
        self.user_id = user_id
        self.user_plan = user_plan
    
    def create_pipeline(
        self,
        name: str,
        steps: List[Dict[str, Any]],
        description: Optional[str] = None,
        workspace_id: str = "default",
        execution_config: Optional[Dict[str, Any]] = None,
        is_public: bool = False,
    ) -> PipelineV2DB:
        """Create a new pipeline from steps"""
        normalized_config = self._normalize_execution_config(execution_config)
        
        pipeline = PipelineV2DB(
            id=str(uuid.uuid4()),
            user_id=self.user_id,
            workspace_id=workspace_id,
            name=name,
            description=description,
            type='manual',
            status='draft',
            steps=steps,
            execution_config=normalized_config,
            version=1,
            checksum=self._compute_checksum(steps, normalized_config),
            is_public=is_public,
        )
        
        self.db.add(pipeline)
        self.db.commit()
        return pipeline
    
    def _compute_checksum(
        self,
        steps: List[Dict[str, Any]],
        execution_config: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Compute SHA256 checksum of pipeline definition for integrity tracking"""
        payload = {
            "steps": steps,
            "execution_config": execution_config or {},
        }
        pipeline_json = json.dumps(payload, sort_keys=True)
        return hashlib.sha256(pipeline_json.encode()).hexdigest()

    @staticmethod
    def _normalize_execution_config(
        execution_config: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        normalized = copy.deepcopy(execution_config or {})
        default_parameters = normalized.get("default_parameters")
        if not isinstance(default_parameters, dict):
            normalized["default_parameters"] = {}
        return normalized

    def _resolve_runtime_parameters(
        self,
        pipeline: PipelineV2DB,
        runtime_parameters: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        config = self._normalize_execution_config(
            pipeline.execution_config if isinstance(pipeline.execution_config, dict) else None
        )
        defaults = config.get("default_parameters") or {}
        resolved = dict(defaults)
        if isinstance(runtime_parameters, dict):
            resolved.update(runtime_parameters)
        return resolved
    
    def get_pipeline(self, pipeline_id: str) -> Optional[PipelineV2DB]:
        """Fetch pipeline by ID"""
        return self.db.query(PipelineV2DB).filter(
            PipelineV2DB.id == pipeline_id,
            PipelineV2DB.user_id == self.user_id
        ).first()
    
    def list_pipelines(
        self,
        workspace_id: str = "default",
        status: Optional[str] = None,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple:
        """List user's pipelines"""
        
        query = self.db.query(PipelineV2DB).filter(
            PipelineV2DB.workspace_id == workspace_id,
            PipelineV2DB.user_id == self.user_id
        )
        
        if status:
            query = query.filter(PipelineV2DB.status == status)
        
        total = query.count()
        pipelines = query.limit(limit).offset(offset).all()
        
        return pipelines, total
    
    def update_pipeline(
        self,
        pipeline_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        steps: Optional[List[Dict[str, Any]]] = None,
        execution_config: Optional[Dict[str, Any]] = None,
    ) -> PipelineV2DB:
        """Update pipeline"""
        
        pipeline = self.get_pipeline(pipeline_id)
        if not pipeline:
            raise ValueError("Pipeline not found")
        
        definition_changed = False

        if name is not None:
            pipeline.name = name
        if description is not None:
            pipeline.description = description
        if steps is not None:
            pipeline.steps = steps
            definition_changed = True
        if execution_config is not None:
            pipeline.execution_config = self._normalize_execution_config(execution_config)
            definition_changed = True

        if definition_changed:
            pipeline.version = int(pipeline.version or 1) + 1
            pipeline.checksum = self._compute_checksum(
                pipeline.steps or [],
                pipeline.execution_config if isinstance(pipeline.execution_config, dict) else {},
            )
        
        pipeline.updated_at = datetime.utcnow()
        self.db.commit()
        
        return pipeline
    
    def publish_pipeline(self, pipeline_id: str) -> PipelineV2DB:
        """Publish pipeline for execution/sharing"""
        
        pipeline = self.get_pipeline(pipeline_id)
        if not pipeline:
            raise ValueError("Pipeline not found")
        
        if pipeline.status not in ['draft', 'saved']:
            raise ValueError(f"Cannot publish pipeline in {pipeline.status} status")
        
        pipeline.status = 'published'
        pipeline.updated_at = datetime.utcnow()
        self.db.commit()
        
        return pipeline

    def clone_pipeline(
        self,
        pipeline_id: str,
        name: Optional[str] = None,
        description: Optional[str] = None,
        workspace_id: Optional[str] = None,
    ) -> PipelineV2DB:
        """Clone an existing pipeline into a new draft pipeline."""

        source = self.get_pipeline(pipeline_id)
        if not source:
            raise ValueError("Pipeline not found")

        cloned_steps = copy.deepcopy(source.steps or [])
        cloned_config = self._normalize_execution_config(
            source.execution_config if isinstance(source.execution_config, dict) else {}
        )

        clone = PipelineV2DB(
            id=str(uuid.uuid4()),
            user_id=self.user_id,
            workspace_id=workspace_id or source.workspace_id or "default",
            name=name or f"{source.name} (copy)",
            description=description if description is not None else source.description,
            type=source.type or "manual",
            status='draft',
            steps=cloned_steps,
            execution_config=cloned_config,
            version=1,
            parent_pipeline_id=str(source.id),
            checksum=self._compute_checksum(cloned_steps, cloned_config),
            tags=copy.deepcopy(source.tags),
            is_public=False,
        )

        self.db.add(clone)
        self.db.commit()
        self.db.refresh(clone)
        return clone
    
    async def execute_pipeline(
        self,
        pipeline_id: str,
        input_dataset_id: str,
        session_id: Optional[str] = None,
        runtime_parameters: Optional[Dict[str, Any]] = None,
        triggered_by: str = "manual",
        extra_input_dataset_ids: Optional[List[str]] = None,
    ) -> AsyncGenerator[ChatEvent, None]:
        """
        Execute pipeline steps with monitoring.
        Yields progress events to frontend.

        ``input_dataset_id`` becomes the primary ``dataset`` relation in every SQL
        step.  ``extra_input_dataset_ids`` are automatically registered as named
        relations using the dataset's stored name (sanitised to a valid SQL
        identifier), e.g. a dataset named "customers" is available as the
        ``customers`` table inside SQL steps.  Callers can override or extend this
        via ``runtime_parameters["dataset_bindings"]``.
        """
        
        pipeline = self.get_pipeline(pipeline_id)
        if not pipeline:
            yield ChatEvent(type=EventType.ERROR, content="Pipeline not found")
            return

        resolved_parameters = self._resolve_runtime_parameters(
            pipeline=pipeline,
            runtime_parameters=runtime_parameters,
        )
        pipeline_snapshot = {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "version": int(pipeline.version or 1),
            "checksum": pipeline.checksum,
            "steps": pipeline.steps,
            "execution_config": pipeline.execution_config if isinstance(pipeline.execution_config, dict) else {},
        }
        
        # Auto-populate dataset_bindings from extra_input_dataset_ids so SQL
        # steps can reference extra datasets by their sanitised names.
        if extra_input_dataset_ids:
            auto_bindings: Dict[str, str] = {}
            for ds_id in extra_input_dataset_ids:
                if ds_id == input_dataset_id:
                    continue
                meta = self.db.query(DatasetMetaDB).filter(DatasetMetaDB.id == ds_id).first()
                alias = self._sanitize_alias(
                    (meta.name or ds_id) if meta else ds_id
                )
                auto_bindings[alias] = ds_id
            if auto_bindings:
                existing_bindings = resolved_parameters.get("dataset_bindings") or {}
                merged = {**auto_bindings, **existing_bindings}  # explicit bindings win
                resolved_parameters = {**resolved_parameters, "dataset_bindings": merged}

        run = PipelineRunV2DB(
            id=str(uuid.uuid4()),
            pipeline_id=pipeline_id,
            user_id=self.user_id,
            session_id=session_id,
            status='running',
            input_dataset_id=input_dataset_id,
            triggered_by=triggered_by,
            started_at=datetime.utcnow(),
            metrics={
                "pipeline_snapshot": pipeline_snapshot,
                "runtime_parameters": resolved_parameters,
                "extra_input_dataset_ids": extra_input_dataset_ids or [],
            },
        )
        
        self.db.add(run)
        self.db.commit()
        
        yield ChatEvent(
            type=EventType.MESSAGE,
            content=f"Starting pipeline: {pipeline.name}"
        )
        
        current_dataset_id = input_dataset_id
        step_results = {}
        execution_log = []
        execution_log.append(
            {
                "event": "run_started",
                "timestamp": datetime.utcnow().isoformat(),
                "pipeline_version": int(pipeline.version or 1),
                "checksum": pipeline.checksum,
                "runtime_parameters": resolved_parameters,
            }
        )
        
        try:
            yield ChatEvent(
                type=EventType.MESSAGE,
                content=f"Pipeline configured with {len(pipeline.steps)} steps"
            )
            
            for i, step in enumerate(pipeline.steps, 1):
                step_id = step.get('id', str(uuid.uuid4()))
                
                yield ChatEvent(
                    type=EventType.STEP_START,
                    content=f"Step {i}/{len(pipeline.steps)}: {step.get('description')}"
                )
                
                try:
                    result = await self._execute_step(
                        dataset_id=current_dataset_id,
                        step=step,
                        step_num=i,
                        chat_session_id=session_id,
                        pipeline_run_id=run.id,
                        runtime_parameters=resolved_parameters,
                    )
                    
                    yield ChatEvent(
                        type=EventType.STEP_RESULT,
                        content=f"✓ {step.get('description')}",
                        data={
                            'step': i,
                            'rows_before': result['input_rows'],
                            'rows_after': result['output_rows'],
                            'time_ms': result['execution_time_ms'],
                        }
                    )
                    
                    step_results[step_id] = {
                        'status': 'completed',
                        'duration_ms': result['execution_time_ms'],
                        'output_rows': result['output_rows'],
                    }
                    
                    execution_log.append({
                        'step': i,
                        'action': step.get('action_type'),
                        'status': 'success',
                        'timestamp': datetime.utcnow().isoformat(),
                    })
                    
                    current_dataset_id = result['output_dataset_id']
                    
                except Exception as e:
                    yield ChatEvent(
                        type=EventType.ERROR,
                        content=f"Step {i} failed: {str(e)}"
                    )
                    
                    step_results[step_id] = {
                        'status': 'failed',
                        'error': str(e),
                    }
                    
                    execution_log.append({
                        'step': i,
                        'action': step.get('action_type'),
                        'status': 'failed',
                        'error': str(e),
                        'timestamp': datetime.utcnow().isoformat(),
                    })
                    
                    raise
            
            yield ChatEvent(
                type=EventType.DONE,
                content=f"Pipeline completed! {len(pipeline.steps)} steps executed",
                data={
                    'steps_completed': len(pipeline.steps),
                    'final_dataset_id': current_dataset_id,
                }
            )
            
            run.status = 'completed'
            run.output_dataset_id = current_dataset_id
            run.step_results = step_results
            run.execution_log = execution_log
            run.completed_at = datetime.utcnow()
            
            if run.started_at:
                metrics_duration = (run.completed_at - run.started_at).total_seconds() * 1000
                run.metrics = {
                    **(run.metrics if isinstance(run.metrics, dict) else {}),
                    'total_duration_ms': int(metrics_duration),
                    'steps_passed': len([s for s in step_results.values() if s['status'] == 'completed']),
                    'steps_failed': len([s for s in step_results.values() if s['status'] == 'failed']),
                }
            
            self.db.commit()

            # — Email notification (best-effort) ──────────────────────────────
            try:
                from ..services.email_service import send_pipeline_complete
                from ..models_db import User as UserDB
                user_row = self.db.query(UserDB).filter(UserDB.id == self.user_id).first()
                prefs: dict = dict(user_row.notification_prefs or {}) if user_row else {}
                if prefs.get("pipeline_complete", True):  # default ON
                    to_email = (user_row.username if user_row else None) or self.user_id
                    if to_email and "@" in to_email:
                        output_rows: int | None = None
                        if current_dataset_id:
                            from ..models_db import DatasetMetaDB
                            ds = self.db.query(DatasetMetaDB).filter(
                                DatasetMetaDB.id == current_dataset_id
                            ).first()
                            if ds:
                                output_rows = ds.row_count
                        send_pipeline_complete(
                            to=to_email,
                            pipeline_name=pipeline.name,
                            pipeline_id=pipeline_id,
                            status="completed",
                            output_rows=output_rows,
                        )
            except Exception:
                pass
            # ──────────────────────────────────────────────────────────────────

        except Exception as e:
            run.status = 'failed'
            run.error_message = str(e)
            run.completed_at = datetime.utcnow()
            run.execution_log = execution_log
            self.db.commit()
            
            yield ChatEvent(
                type=EventType.ERROR,
                content=f"Pipeline failed: {str(e)}"
            )
    
    async def _execute_step(
        self,
        dataset_id: str,
        step: Dict[str, Any],
        step_num: int,
        chat_session_id: Optional[str],
        pipeline_run_id: str,
        runtime_parameters: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Execute a single pipeline step"""
        
        start_time = time.time()

        # Support both legacy format (action_type / sql at top level) and
        # template format (type + config dict)
        step_type = str(step.get('type') or '').lower()
        config = step.get('config') if isinstance(step.get('config'), dict) else {}
        operation = str(config.get('operation') or '').lower()

        action_type = str(step.get('action_type') or step_type or '').lower()
        # SQL may live at top level OR inside the config block (template format)
        sql = str(step.get('sql') or step.get('query') or config.get('sql') or '').strip()
        parameters = step.get('parameters') if isinstance(step.get('parameters'), dict) else {}

        current_meta, current_rows = self._load_dataset_rows(dataset_id)
        input_rows = len(current_rows)

        output_rows = input_rows
        output_dataset_id = dataset_id

        # ── pandas-based transform / ai_transform (template steps) ──────────
        if step_type in {'transform', 'ai_transform'} and not sql:
            df = pd.DataFrame(current_rows)
            if not df.empty:
                df = _apply_pipeline_operation(df, step_type, operation, config)
            step_result_rows = (
                df.astype(object).where(pd.notnull(df), None).to_dict(orient='records')
                if not df.empty else []
            )
            output_meta = self._persist_output_dataset(
                source_dataset=current_meta,
                rows=step_result_rows,
                step=step,
            )
            output_dataset_id = output_meta.id
            output_rows = len(step_result_rows)

        elif sql or action_type in {'sql', 'query', 'transform', 'join', 'aggregate'}:
            relation_rows = self._build_step_relations(
                current_rows=current_rows,
                step=step,
                runtime_parameters=runtime_parameters,
            )
            step_result_rows = DuckDBService.transform_named_relations(
                relation_rows=relation_rows,
                sql=sql,
                output_relation='dataset',
                dataset_id=dataset_id,
            )

            output_meta = self._persist_output_dataset(
                source_dataset=current_meta,
                rows=step_result_rows,
                step=step,
            )
            output_dataset_id = output_meta.id
            output_rows = len(step_result_rows)
        
        if chat_session_id:
            step_record = TransformationStepDB(
                id=str(uuid.uuid4()),
                chat_session_id=chat_session_id,
                pipeline_run_id=pipeline_run_id,
                step_number=step_num,
                action_type=step.get('action_type', 'unknown'),
                description=step.get('description'),
                parameters={
                    'step_parameters': parameters,
                    'runtime_parameters': runtime_parameters or {},
                },
                input_rows=input_rows,
                output_rows=output_rows,
                status='completed',
                execution_time_ms=int((time.time() - start_time) * 1000),
            )
            
            self.db.add(step_record)
            self.db.commit()
        
        return {
            'input_rows': input_rows,
            'output_rows': output_rows,
            'output_dataset_id': output_dataset_id,
            'execution_time_ms': int((time.time() - start_time) * 1000),
        }

    def _load_dataset_rows(self, dataset_id: str) -> tuple[DatasetMetaDB, list[dict[str, Any]]]:
        dataset = self.db.query(DatasetMetaDB).filter(DatasetMetaDB.id == dataset_id).first()
        if not dataset:
            raise ValueError(f"Dataset not found: {dataset_id}")

        chunks = (
            self.db.query(DatasetChunkDB)
            .filter(DatasetChunkDB.dataset_id == dataset.id)
            .order_by(DatasetChunkDB.chunk_index.asc())
            .all()
        )
        if chunks:
            rows: list[dict[str, Any]] = []
            for chunk in chunks:
                rows.extend(chunk.rows or [])
            return dataset, rows

        data = self.db.query(DatasetDataDB).filter(DatasetDataDB.id == dataset.id).first()
        if data:
            return dataset, list(data.rows or [])

        return dataset, []

    def _build_step_relations(
        self,
        current_rows: list[dict[str, Any]],
        step: Dict[str, Any],
        runtime_parameters: Optional[Dict[str, Any]],
    ) -> dict[str, list[dict[str, Any]]]:
        relations: dict[str, list[dict[str, Any]]] = {
            'dataset': current_rows,
        }

        step_parameters = step.get('parameters') if isinstance(step.get('parameters'), dict) else {}
        runtime = runtime_parameters if isinstance(runtime_parameters, dict) else {}

        bindings: dict[str, Any] = {}
        if isinstance(runtime.get('dataset_bindings'), dict):
            bindings.update(runtime.get('dataset_bindings') or {})
        if isinstance(step_parameters.get('dataset_bindings'), dict):
            bindings.update(step_parameters.get('dataset_bindings') or {})
        if isinstance(step_parameters.get('relations'), dict):
            bindings.update(step_parameters.get('relations') or {})

        for alias, binding in bindings.items():
            alias_name = str(alias).strip()
            if not alias_name or alias_name == 'dataset':
                continue

            dataset_id = self._resolve_binding_dataset_id(binding, runtime)
            if not dataset_id:
                continue

            _, rows = self._load_dataset_rows(dataset_id)
            relations[alias_name] = rows

        return relations

    @staticmethod
    def _sanitize_alias(name: str) -> str:
        """Convert a dataset name to a valid SQL identifier alias."""
        import re as _re
        sanitized = _re.sub(r"[^A-Za-z0-9_]", "_", name.strip()).lower()
        sanitized = _re.sub(r"_+", "_", sanitized).strip("_")
        if not sanitized or sanitized[0].isdigit():
            sanitized = "ds_" + sanitized
        return sanitized or "dataset_extra"

    @staticmethod
    def _resolve_binding_dataset_id(binding: Any, runtime_parameters: Dict[str, Any]) -> str:
        if binding is None:
            return ""

        if isinstance(binding, str):
            value = binding.strip()
            if value.startswith("{{") and value.endswith("}}"):
                key = value[2:-2].strip()
                resolved = runtime_parameters.get(key)
                return str(resolved).strip() if resolved is not None else ""
            return value

        return str(binding).strip()

    def _persist_output_dataset(
        self,
        source_dataset: DatasetMetaDB,
        rows: list[dict[str, Any]],
        step: Dict[str, Any],
    ) -> DatasetMetaDB:
        output_dataset_id = str(uuid.uuid4())
        df = pd.DataFrame(rows or [])
        schema = DataConversionService._infer_schema(df) if not df.empty else {}
        stats = DataConversionService._generate_stats(df, schema) if not df.empty else {}

        raw_output_name = (
            str(step.get('name') or step.get('description') or '').strip()
            or f"{source_dataset.name or 'dataset'} (pipeline)"
        )
        # Truncate long AI-generated descriptions for readable sidebar names
        output_name = raw_output_name if len(raw_output_name) <= 40 else raw_output_name[:38] + "\u2026"

        meta = DatasetMetaDB(
            id=output_dataset_id,
            user_id=source_dataset.user_id,
            workspace_id=source_dataset.workspace_id or "default",
            name=output_name,
            description=source_dataset.description,
            source_type="pipeline_v2",
            storage_provider=source_dataset.storage_provider,
            storage_path=None,
            file_format=source_dataset.file_format,
            schema_json=schema,
            stats_json=stats,
            columns=list(df.columns),
            row_count=int(df.shape[0]),
            status="ready",
            error_message=None,
            access_tier=source_dataset.access_tier or "hot",
            parent_id=source_dataset.id,
        )
        self.db.add(meta)

        normalized_rows = (
            df.astype(object).where(pd.notnull(df), None).to_dict(orient='records')
            if not df.empty
            else []
        )

        self.db.query(DatasetChunkDB).filter(DatasetChunkDB.dataset_id == output_dataset_id).delete()
        self.db.query(DatasetDataDB).filter(DatasetDataDB.id == output_dataset_id).delete()

        for index in range(0, len(normalized_rows), self._CHUNK_SIZE):
            self.db.add(
                DatasetChunkDB(
                    id=f"{output_dataset_id}:{index // self._CHUNK_SIZE}",
                    dataset_id=output_dataset_id,
                    chunk_index=index // self._CHUNK_SIZE,
                    rows=normalized_rows[index:index + self._CHUNK_SIZE],
                )
            )

        if len(normalized_rows) <= 5000:
            self.db.add(
                DatasetDataDB(
                    id=output_dataset_id,
                    rows=normalized_rows,
                )
            )

        self.db.commit()
        self.db.refresh(meta)
        return meta
    
    def get_pipeline_runs(
        self,
        pipeline_id: str,
        limit: int = 20,
        offset: int = 0,
    ) -> tuple:
        """Get execution history for a pipeline"""
        
        query = self.db.query(PipelineRunV2DB).filter(
            PipelineRunV2DB.pipeline_id == pipeline_id,
            PipelineRunV2DB.user_id == self.user_id
        )
        
        total = query.count()
        runs = query.order_by(PipelineRunV2DB.created_at.desc()).limit(limit).offset(offset).all()
        
        return runs, total
    
    def get_run_details(self, run_id: str) -> Optional[PipelineRunV2DB]:
        """Get details of a specific run"""
        return self.db.query(PipelineRunV2DB).filter(
            PipelineRunV2DB.id == run_id,
            PipelineRunV2DB.user_id == self.user_id
        ).first()

    def get_run_artifact(self, run_id: str, preview_limit: int = 100) -> Dict[str, Any]:
        """Build a generic artifact package for a run (snapshot, params, outputs)."""
        run = self.get_run_details(run_id)
        if not run:
            raise ValueError("Run not found")

        pipeline = self.get_pipeline(str(run.pipeline_id))
        if not pipeline:
            raise ValueError("Pipeline not found")

        metrics = run.metrics if isinstance(run.metrics, dict) else {}
        snapshot = metrics.get("pipeline_snapshot") if isinstance(metrics.get("pipeline_snapshot"), dict) else {
            "id": str(pipeline.id),
            "name": pipeline.name,
            "version": int(pipeline.version or 1),
            "checksum": pipeline.checksum,
            "steps": pipeline.steps,
            "execution_config": pipeline.execution_config if isinstance(pipeline.execution_config, dict) else {},
        }
        runtime_parameters = metrics.get("runtime_parameters") if isinstance(metrics.get("runtime_parameters"), dict) else {}

        output_preview: list[dict[str, Any]] = []
        output_columns: list[str] = []
        output_row_count = 0
        if run.output_dataset_id:
            _, rows = self._load_dataset_rows(str(run.output_dataset_id))
            output_row_count = len(rows)
            output_preview = rows[: max(1, min(preview_limit, 1000))]
            output_columns = list(output_preview[0].keys()) if output_preview else []

        return {
            "run": {
                "id": str(run.id),
                "pipeline_id": str(run.pipeline_id),
                "status": run.status,
                "triggered_by": run.triggered_by,
                "input_dataset_id": str(run.input_dataset_id) if run.input_dataset_id else None,
                "output_dataset_id": str(run.output_dataset_id) if run.output_dataset_id else None,
                "started_at": run.started_at.isoformat() if run.started_at else None,
                "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            },
            "pipeline_snapshot": snapshot,
            "runtime_parameters": runtime_parameters,
            "step_results": run.step_results if isinstance(run.step_results, dict) else {},
            "execution_log": run.execution_log if isinstance(run.execution_log, list) else [],
            "metrics": metrics,
            "output": {
                "row_count": output_row_count,
                "columns": output_columns,
                "preview_rows": output_preview,
            },
        }
