"""
Full Auto Agent Service
Autonomous orchestration layer that understands natural language requests
and executes entire data pipelines autonomously.
"""

import json
import asyncio
import uuid
from typing import Optional, Any, Dict, List
from dataclasses import dataclass, asdict
from enum import Enum

from fastapi import HTTPException
import pandas as pd
import numpy as np

from services.db_service import DatabaseService
from services.data_service import DataService
from services.utils import _get_client


@dataclass
class AgentEvent:
    """Event emitted by the agent during execution"""
    type: str  # 'message'|'plan'|'step_start'|'step_result'|'chart'|'insight'|'error'|'done'
    content: str
    data: Optional[Dict[str, Any]] = None
    timestamp: float = None

    def __post_init__(self):
        if self.timestamp is None:
            import time
            self.timestamp = time.time()

    def to_sse(self) -> str:
        """Convert to SSE format"""
        event = {
            'type': self.type,
            'content': self.content,
            'data': self.data or {},
            'timestamp': self.timestamp
        }
        return f"data: {json.dumps(event)}\n\n"


class DataQualityLevel(str, Enum):
    GOOD = "good"
    FAIR = "fair"
    POOR = "poor"


class ToolExecutor:
    """Executes tools by routing to appropriate services"""

    def __init__(self, user_id: str, dataset_id: str, df: pd.DataFrame):
        self.user_id = user_id
        self.dataset_id = dataset_id
        self.df = df
        self.db_service = DatabaseService()
        self.data_service = DataService()
        self.state = {
            'quality_checked': False,
            'data_cleaned': False,
            'stats_computed': False,
            'model_trained': False,
            'chart_created': False,
            'dataframes': {},  # intermediate DataFrames
        }

    async def assess_quality(self, args: Dict) -> Dict[str, Any]:
        """Assess data quality - missing values, duplicates, outliers"""
        df = self.df

        quality_metrics = {
            'total_rows': len(df),
            'total_cols': len(df.columns),
            'completeness': {
                col: float(df[col].notna().sum() / len(df) * 100)
                for col in df.columns
            },
            'duplicates': len(df) - len(df.drop_duplicates()),
            'numeric_cols': list(df.select_dtypes(include=[np.number]).columns),
            'categorical_cols': list(df.select_dtypes(include=['object']).columns),
            'memory_usage_mb': float(df.memory_usage(deep=True).sum() / 1024 ** 2),
        }

        # Detect outliers in numeric columns
        numeric_df = df.select_dtypes(include=[np.number])
        outliers = {}
        for col in numeric_df.columns:
            Q1, Q3 = numeric_df[col].quantile([0.25, 0.75])
            IQR = Q3 - Q1
            outlier_count = len(numeric_df[(numeric_df[col] < Q1 - 1.5 * IQR) |
                                          (numeric_df[col] > Q3 + 1.5 * IQR)])
            outliers[col] = int(outlier_count)

        quality_metrics['outliers'] = outliers

        # Determine quality level
        missing_pct = sum(quality_metrics['completeness'].values()) / len(df.columns)
        if missing_pct >= 95 and quality_metrics['duplicates'] == 0:
            level = DataQualityLevel.GOOD
        elif missing_pct >= 80:
            level = DataQualityLevel.FAIR
        else:
            level = DataQualityLevel.POOR

        quality_metrics['overall_level'] = level.value

        self.state['quality_checked'] = True
        return quality_metrics

    async def clean_data(self, args: Dict) -> Dict[str, Any]:
        """Clean data - handle missing values, duplicates, outliers"""
        df = self.df.copy()
        operations = []

        # Remove duplicates
        dup_count = len(df) - len(df.drop_duplicates())
        if dup_count > 0:
            df = df.drop_duplicates(keep='first')
            operations.append(f'Removed {dup_count} duplicate rows')

        # Handle missing values
        for col in df.columns:
            missing = df[col].isna().sum()
            if missing > 0:
                if df[col].dtype in [np.float64, np.int64]:
                    df[col].fillna(df[col].median(), inplace=True)
                    operations.append(f'Filled {missing} missing values in {col} with median')
                else:
                    df[col].fillna(df[col].mode()[0] if len(df[col].mode()) > 0 else 'Unknown',
                                   inplace=True)
                    operations.append(f'Filled {missing} missing values in {col} with mode')

        # Handle outliers in numeric columns
        numeric_cols = df.select_dtypes(include=[np.number]).columns
        for col in numeric_cols:
            Q1, Q3 = df[col].quantile([0.25, 0.75])
            IQR = Q3 - Q1
            lower_bound = Q1 - 1.5 * IQR
            upper_bound = Q3 + 1.5 * IQR

            outlier_mask = (df[col] < lower_bound) | (df[col] > upper_bound)
            if outlier_mask.sum() > 0:
                df.loc[outlier_mask, col] = df[col].median()
                operations.append(f'Capped outliers in {col}')

        self.df = df  # update main dataframe
        self.state['data_cleaned'] = True
        self.state['dataframes']['cleaned'] = df

        return {
            'rows_after': len(df),
            'cols_after': len(df.columns),
            'operations': operations,
        }

    async def transform_data(self, args: Dict) -> Dict[str, Any]:
        """Transform data - filter, aggregate, pivot"""
        df = self.df.copy()
        operations = []

        # Example transformations based on args
        if 'filter' in args:
            # E.g., {'column': 'age', 'operator': '>', 'value': 30}
            filter_op = args['filter']
            col, op, val = filter_op['column'], filter_op['operator'], filter_op['value']

            if op == '>':
                df = df[df[col] > val]
            elif op == '<':
                df = df[df[col] < val]
            elif op == '==':
                df = df[df[col] == val]
            elif op == '!=':
                df = df[df[col] != val]

            operations.append(f'Applied filter: {col} {op} {val}')

        if 'aggregate' in args:
            # E.g., {'group_by': 'category', 'aggregations': {'price': 'mean'}}
            agg_op = args['aggregate']
            df = df.groupby(agg_op['group_by']).agg(
                agg_op.get('aggregations', {})
            ).reset_index()
            operations.append(f'Aggregated by {agg_op["group_by"]}')

        self.state['dataframes']['transformed'] = df
        return {
            'rows_after': len(df),
            'cols_after': len(df.columns),
            'operations': operations,
        }

    async def compute_statistics(self, args: Dict) -> Dict[str, Any]:
        """Compute statistics - descriptive, correlation, distribution"""
        df = self.df
        numeric_df = df.select_dtypes(include=[np.number])

        stats = {
            'descriptive': {
                col: {
                    'mean': float(numeric_df[col].mean()),
                    'median': float(numeric_df[col].median()),
                    'std': float(numeric_df[col].std()),
                    'min': float(numeric_df[col].min()),
                    'max': float(numeric_df[col].max()),
                    'q25': float(numeric_df[col].quantile(0.25)),
                    'q75': float(numeric_df[col].quantile(0.75)),
                }
                for col in numeric_df.columns
            },
            'correlation': numeric_df.corr().to_dict(),
            'skewness': {
                col: float(numeric_df[col].skew())
                for col in numeric_df.columns
            },
        }

        self.state['stats_computed'] = True
        self.state['dataframes']['stats'] = stats
        return stats

    async def train_ml_model(self, args: Dict) -> Dict[str, Any]:
        """Train ML model - AutoML orchestration"""
        # Import ML services
        from services.ml_service import MLService
        from services.automl_service import AutoMLService

        ml_service = MLService()
        automl_service = AutoMLService()

        df = self.df
        request = args.get('request', 'predict target')
        target_col = args.get('target_column', None)
        task_type = args.get('task_type', 'classification')

        # Infer task type if not specified
        if not target_col and len(df.columns) > 0:
            target_col = df.columns[-1]  # use last column as target

        try:
            # Use AutoML to understand request
            task_config = await automl_service.understand_request(request, df.columns.tolist())

            if 'target_column' in task_config:
                target_col = task_config['target_column']
            if 'task_type' in task_config:
                task_type = task_config['task_type']

            # Run AutoML
            result = await automl_service.run_automl(df, target_col, task_type)

            self.state['model_trained'] = True
            self.state['dataframes']['model_result'] = result

            return {
                'task_type': task_type,
                'target': target_col,
                'best_model': result.get('best_model', 'ensemble'),
                'accuracy': result.get('accuracy', 0),
                'features_used': result.get('feature_names', []),
            }
        except Exception as e:
            return {
                'error': str(e),
                'task_type': task_type,
                'target': target_col,
            }

    async def create_visualization(self, args: Dict) -> Dict[str, Any]:
        """Create visualization - bar, line, scatter, heatmap"""
        df = self.df
        viz_type = args.get('type', 'bar')  # bar, line, scatter, histogram
        x_col = args.get('x_column', df.columns[0] if len(df.columns) > 0 else None)
        y_col = args.get('y_column', df.columns[1] if len(df.columns) > 1 else None)

        if not x_col or not y_col:
            return {'error': 'Need at least 2 columns for visualization'}

        # Prepare data based on viz_type
        if viz_type == 'bar':
            data = df.groupby(x_col)[y_col].mean().reset_index()
            chart_data = {
                'type': 'bar',
                'data': data.to_dict('records'),
                'x': x_col,
                'y': y_col,
            }
        elif viz_type == 'scatter':
            chart_data = {
                'type': 'scatter',
                'data': df[[x_col, y_col]].to_dict('records'),
                'x': x_col,
                'y': y_col,
            }
        else:  # histogram / line
            chart_data = {
                'type': viz_type,
                'data': df[[x_col, y_col]].to_dict('records'),
                'x': x_col,
                'y': y_col,
            }

        self.state['chart_created'] = True
        return chart_data

    async def generate_insights(self, args: Dict) -> Dict[str, Any]:
        """Generate AI insights using GPT-4"""
        client = _get_client()
        context = args.get('context', 'data analysis')
        
        # Build prompt from state
        insights_prompt = f"""
        Based on the analysis of the dataset, generate 3-5 key insights:
        
        Context: {context}
        Quality checked: {self.state['quality_checked']}
        Data cleaned: {self.state['data_cleaned']}
        Stats computed: {self.state['stats_computed']}
        Model trained: {self.state['model_trained']}
        
        Provide specific, actionable insights in plain English.
        """

        try:
            response = client.chat.completions.create(
                model='gpt-4',
                messages=[{'role': 'user', 'content': insights_prompt}],
                temperature=0.7,
                max_tokens=1000,
            )
            insights_text = response.choices[0].message.content
            return {
                'insights': insights_text,
                'sources': ['quality_check', 'cleaning', 'statistics', 'ml_model'],
            }
        except Exception as e:
            return {
                'error': str(e),
                'insights': 'Could not generate insights',
            }

    async def make_plan(self, args: Dict) -> Dict[str, Any]:
        """Create execution plan from user request"""
        request = args.get('request', '')
        df = self.df

        plan_prompt = f"""
        User request: {request}
        
        Dataset info: {len(df)} rows, {len(df.columns)} columns
        Columns: {', '.join(df.columns.tolist())}
        
        Create a step-by-step execution plan. Return JSON array of steps.
        Each step should have: action, description, estimated_duration_seconds
        """

        client = _get_client()
        try:
            response = client.chat.completions.create(
                model='gpt-4',
                messages=[{'role': 'user', 'content': plan_prompt}],
                temperature=0.7,
                max_tokens=1500,
            )
            plan_text = response.choices[0].message.content

            # Try to parse JSON from response
            try:
                import re
                json_match = re.search(r'\[.*\]', plan_text, re.DOTALL)
                if json_match:
                    plan = json.loads(json_match.group())
                else:
                    plan = [{'action': 'analyze', 'description': plan_text}]
            except:
                plan = [{'action': 'analyze', 'description': plan_text}]

            return {'plan': plan}
        except Exception as e:
            return {
                'error': str(e),
                'plan': [
                    {'action': 'assess_quality', 'description': 'Check data quality'},
                    {'action': 'clean_data', 'description': 'Clean and prepare data'},
                    {'action': 'compute_statistics', 'description': 'Compute statistics'},
                    {'action': 'create_visualization', 'description': 'Create visualizations'},
                    {'action': 'generate_insights', 'description': 'Generate insights'},
                ]
            }

    async def ask_user(self, args: Dict) -> Dict[str, Any]:
        """Ask user for clarification - handled by frontend"""
        question = args.get('question', 'Please provide more information')
        return {
            'question': question,
            'awaiting_response': True,
        }

    async def execute(self, tool_name: str, tool_args: Dict) -> Dict[str, Any]:
        """Execute a tool by name"""
        tools = {
            'assess_quality': self.assess_quality,
            'clean_data': self.clean_data,
            'transform_data': self.transform_data,
            'compute_statistics': self.compute_statistics,
            'train_ml_model': self.train_ml_model,
            'create_visualization': self.create_visualization,
            'generate_insights': self.generate_insights,
            'make_plan': self.make_plan,
            'ask_user': self.ask_user,
        }

        if tool_name not in tools:
            raise ValueError(f"Unknown tool: {tool_name}")

        return await tools[tool_name](tool_args)


class FullAutoAgent:
    """Main autonomous agent that orchestrates the entire pipeline"""

    SYSTEM_PROMPT = """You are an expert data analyst AI agent. Your job is to help users analyze their datasets autonomously.
    
Given a user request and dataset, you should:
1. Understand what the user is asking for
2. Create a step-by-step plan
3. Execute tools to gather information and transform data
4. Reason about results and decide next steps (ReAct pattern)
5. Generate actionable insights
6. Return a comprehensive report

Available tools:
- assess_quality: Check data quality metrics
- clean_data: Handle missing values, duplicates, outliers
- transform_data: Filter, aggregate, pivot data
- compute_statistics: Descriptive stats, correlation, distribution
- train_ml_model: Train classification/regression/clustering/forecasting models
- create_visualization: Create bar/line/scatter/histogram charts
- generate_insights: Generate AI insights using GPT-4
- make_plan: Create execution plan from request
- ask_user: Ask for clarification

Guidelines:
- Think step-by-step before using tools
- Use tools sequentially, not all at once
- Based on results, decide if more tools are needed
- Max 10 iterations to prevent loops
- Always generate insights at the end
- Provide plain English explanations for all findings
    """

    AGENT_TOOLS = [
        {
            'type': 'function',
            'function': {
                'name': 'assess_quality',
                'description': 'Assess dataset quality - check for missing values, duplicates, outliers',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'focus': {
                            'type': 'string',
                            'description': 'What aspect to focus on: all, completeness, duplicates, outliers'
                        }
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'clean_data',
                'description': 'Clean data by handling missing values, removing duplicates, capping outliers',
                'parameters': {
                    'type': 'object',
                    'properties': {}
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'transform_data',
                'description': 'Transform data with filtering, aggregation, or pivot operations',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'filter': {'type': 'object', 'description': 'Filter condition'},
                        'aggregate': {'type': 'object', 'description': 'Aggregation config'}
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'compute_statistics',
                'description': 'Compute descriptive statistics, correlation, and distribution analysis',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'include_correlation': {
                            'type': 'boolean',
                            'description': 'Include correlation matrix'
                        }
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'train_ml_model',
                'description': 'Train ML model using AutoML - classification, regression, clustering, forecasting',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'request': {'type': 'string', 'description': 'Natural language request'},
                        'target_column': {'type': 'string', 'description': 'Target column name'},
                        'task_type': {
                            'type': 'string',
                            'enum': ['classification', 'regression', 'clustering', 'forecasting']
                        }
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'create_visualization',
                'description': 'Create chart visualization - bar, line, scatter, histogram',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'type': {
                            'type': 'string',
                            'enum': ['bar', 'line', 'scatter', 'histogram']
                        },
                        'x_column': {'type': 'string'},
                        'y_column': {'type': 'string'}
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'generate_insights',
                'description': 'Generate AI-powered insights from the data analysis',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'context': {
                            'type': 'string',
                            'description': 'Context for insight generation'
                        }
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'make_plan',
                'description': 'Create a step-by-step execution plan based on user request',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'request': {'type': 'string', 'description': 'User request'}
                    }
                }
            }
        },
        {
            'type': 'function',
            'function': {
                'name': 'ask_user',
                'description': 'Ask user for clarification or additional information',
                'parameters': {
                    'type': 'object',
                    'properties': {
                        'question': {'type': 'string', 'description': 'Question to ask user'}
                    }
                }
            }
        }
    ]

    def __init__(self, user_id: str, dataset_id: str, df: pd.DataFrame):
        self.user_id = user_id
        self.dataset_id = dataset_id
        self.df = df
        self.executor = ToolExecutor(user_id, dataset_id, df)
        self.client = _get_client()
        self.iteration = 0
        self.max_iterations = 10

    async def run(self, user_request: str, event_callback=None):
        """
        Run the agent with the user request.
        Yields AgentEvent objects to be streamed to frontend via SSE.
        """
        # Initial message
        yield AgentEvent(
            type='message',
            content=f'Starting analysis for: "{user_request}"'
        )

        # Build conversation
        messages = [
            {
                'role': 'system',
                'content': self.SYSTEM_PROMPT
            },
            {
                'role': 'user',
                'content': f'User request: {user_request}\n\nDataset has {len(self.df)} rows and {len(self.df.columns)} columns. Columns: {", ".join(self.df.columns.tolist())}'
            }
        ]

        self.iteration = 0

        # ReAct loop
        while self.iteration < self.max_iterations:
            self.iteration += 1

            try:
                # Call GPT-4 with function calling
                response = self.client.chat.completions.create(
                    model='gpt-4',
                    messages=messages,
                    tools=self.AGENT_TOOLS,
                    tool_choice='auto',
                    temperature=0.7,
                    max_tokens=2000,
                )

                response_msg = response.choices[0].message

                # Check if we're done (no tool calls)
                if not response_msg.tool_calls:
                    # Agent decided to stop
                    yield AgentEvent(
                        type='message',
                        content=response_msg.content or 'Analysis complete'
                    )
                    yield AgentEvent(
                        type='done',
                        content='Analysis finished successfully'
                    )
                    break

                # Add assistant response to messages
                messages.append(response_msg)

                # Process tool calls
                for tool_call in response_msg.tool_calls:
                    tool_name = tool_call.function.name
                    tool_args = json.loads(tool_call.function.arguments)

                    yield AgentEvent(
                        type='step_start',
                        content=f'Running {tool_name}...',
                    )

                    try:
                        # Execute tool
                        result = await self.executor.execute(tool_name, tool_args)

                        yield AgentEvent(
                            type='step_result',
                            content=f'Completed {tool_name}',
                            data=result,
                        )

                        # Add to conversation
                        messages.append({
                            'role': 'tool',
                            'tool_call_id': tool_call.id,
                            'name': tool_name,
                            'content': json.dumps(result)
                        })

                        # Special handling for certain tools
                        if tool_name == 'create_visualization' and 'type' in result:
                            yield AgentEvent(
                                type='chart',
                                content=f'Chart created',
                                data=result,
                            )
                        elif tool_name == 'generate_insights':
                            yield AgentEvent(
                                type='insight',
                                content=result.get('insights', ''),
                            )
                        elif tool_name == 'make_plan':
                            yield AgentEvent(
                                type='plan',
                                content='Execution plan created',
                                data=result,
                            )
                        elif tool_name == 'ask_user':
                            yield AgentEvent(
                                type='ask_user',
                                content=result.get('question', ''),
                            )

                    except Exception as e:
                        error_msg = str(e)
                        yield AgentEvent(
                            type='error',
                            content=f'Error in {tool_name}: {error_msg}',
                        )
                        messages.append({
                            'role': 'tool',
                            'tool_call_id': tool_call.id,
                            'name': tool_name,
                            'content': f'Error: {error_msg}'
                        })

            except Exception as e:
                error_msg = str(e)
                yield AgentEvent(
                    type='error',
                    content=f'Agent error: {error_msg}',
                )
                break

        if self.iteration >= self.max_iterations:
            yield AgentEvent(
                type='done',
                content='Max iterations reached'
            )
