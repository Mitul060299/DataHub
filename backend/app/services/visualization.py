import duckdb
from typing import Dict, List, Any, Optional
import pandas as pd
from datetime import datetime
import secrets


class VisualizationService:
    """Service for generating chart data and managing dashboard operations"""
    
    def __init__(self, duckdb_service):
        self.duckdb = duckdb_service
    
    def suggest_chart_columns(self, dataset_id: str, chart_type: str) -> Dict[str, Any]:
        """Suggest appropriate columns for a given chart type"""
        try:
            # Get dataset columns and their types
            conn = self.duckdb.get_connection(dataset_id)
            df = conn.execute("SELECT * FROM data LIMIT 1").df()
            
            suggestions = {
                "numeric_columns": [],
                "categorical_columns": [],
                "datetime_columns": [],
                "recommendations": {}
            }
            
            for col in df.columns:
                dtype = str(df[col].dtype)
                if 'int' in dtype or 'float' in dtype:
                    suggestions["numeric_columns"].append(col)
                elif 'datetime' in dtype or 'date' in dtype:
                    suggestions["datetime_columns"].append(col)
                else:
                    suggestions["categorical_columns"].append(col)
            
            # Provide chart-specific recommendations
            if chart_type == "bar":
                suggestions["recommendations"] = {
                    "x_axis": suggestions["categorical_columns"][0] if suggestions["categorical_columns"] else None,
                    "y_axis": suggestions["numeric_columns"][0] if suggestions["numeric_columns"] else None
                }
            elif chart_type == "line":
                suggestions["recommendations"] = {
                    "x_axis": suggestions["datetime_columns"][0] if suggestions["datetime_columns"] else 
                             suggestions["categorical_columns"][0] if suggestions["categorical_columns"] else None,
                    "y_axis": suggestions["numeric_columns"][0] if suggestions["numeric_columns"] else None
                }
            elif chart_type == "pie":
                suggestions["recommendations"] = {
                    "label": suggestions["categorical_columns"][0] if suggestions["categorical_columns"] else None,
                    "value": suggestions["numeric_columns"][0] if suggestions["numeric_columns"] else None
                }
            elif chart_type == "scatter":
                suggestions["recommendations"] = {
                    "x_axis": suggestions["numeric_columns"][0] if len(suggestions["numeric_columns"]) > 0 else None,
                    "y_axis": suggestions["numeric_columns"][1] if len(suggestions["numeric_columns"]) > 1 else None
                }
            
            return suggestions
            
        except Exception as e:
            raise Exception(f"Error suggesting columns: {str(e)}")
    
    def get_chart_data(self, dataset_id: str, config: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Generate chart data based on configuration"""
        try:
            conn = self.duckdb.get_connection(dataset_id)
            chart_type = config.get("chart_type")
            
            if chart_type == "bar":
                return self._get_bar_chart_data(conn, config)
            elif chart_type == "line":
                return self._get_line_chart_data(conn, config)
            elif chart_type == "pie":
                return self._get_pie_chart_data(conn, config)
            elif chart_type == "scatter":
                return self._get_scatter_chart_data(conn, config)
            elif chart_type == "heatmap":
                return self._get_heatmap_data(conn, config)
            elif chart_type == "funnel":
                return self._get_funnel_data(conn, config)
            elif chart_type == "area":
                return self._get_area_chart_data(conn, config)
            else:
                raise ValueError(f"Unsupported chart type: {chart_type}")
                
        except Exception as e:
            raise Exception(f"Error generating chart data: {str(e)}")
    
    def _get_bar_chart_data(self, conn, config: Dict) -> List[Dict]:
        """Generate bar chart data"""
        x_col = config.get("x_axis")
        y_col = config.get("y_axis")
        aggregation = config.get("aggregation", "sum")
        limit = config.get("limit", 50)
        
        if not x_col or not y_col:
            raise ValueError("Bar chart requires x_axis and y_axis columns")
        
        query = f"""
            SELECT "{x_col}" as category, 
                   {aggregation.upper()}("{y_col}") as value
            FROM data
            GROUP BY "{x_col}"
            ORDER BY value DESC
            LIMIT {limit}
        """
        
        df = conn.execute(query).df()
        return df.to_dict('records')
    
    def _get_line_chart_data(self, conn, config: Dict) -> List[Dict]:
        """Generate line chart data"""
        x_col = config.get("x_axis")
        y_col = config.get("y_axis")
        aggregation = config.get("aggregation", "sum")
        limit = config.get("limit", 100)
        
        if not x_col or not y_col:
            raise ValueError("Line chart requires x_axis and y_axis columns")
        
        query = f"""
            SELECT "{x_col}" as x, 
                   {aggregation.upper()}("{y_col}") as y
            FROM data
            GROUP BY "{x_col}"
            ORDER BY "{x_col}"
            LIMIT {limit}
        """
        
        df = conn.execute(query).df()
        return df.to_dict('records')
    
    def _get_pie_chart_data(self, conn, config: Dict) -> List[Dict]:
        """Generate pie chart data"""
        label_col = config.get("label")
        value_col = config.get("value")
        aggregation = config.get("aggregation", "sum")
        limit = config.get("limit", 10)
        
        if not label_col or not value_col:
            raise ValueError("Pie chart requires label and value columns")
        
        query = f"""
            SELECT "{label_col}" as name, 
                   {aggregation.upper()}("{value_col}") as value
            FROM data
            GROUP BY "{label_col}"
            ORDER BY value DESC
            LIMIT {limit}
        """
        
        df = conn.execute(query).df()
        return df.to_dict('records')
    
    def _get_scatter_chart_data(self, conn, config: Dict) -> List[Dict]:
        """Generate scatter plot data"""
        x_col = config.get("x_axis")
        y_col = config.get("y_axis")
        limit = config.get("limit", 1000)
        
        if not x_col or not y_col:
            raise ValueError("Scatter chart requires x_axis and y_axis columns")
        
        query = f"""
            SELECT "{x_col}" as x, 
                   "{y_col}" as y
            FROM data
            LIMIT {limit}
        """
        
        df = conn.execute(query).df()
        return df.to_dict('records')
    
    def _get_heatmap_data(self, conn, config: Dict) -> List[Dict]:
        """Generate heatmap data"""
        x_col = config.get("x_axis")
        y_col = config.get("y_axis")
        value_col = config.get("value")
        aggregation = config.get("aggregation", "sum")
        
        if not x_col or not y_col or not value_col:
            raise ValueError("Heatmap requires x_axis, y_axis, and value columns")
        
        query = f"""
            SELECT "{x_col}" as x, 
                   "{y_col}" as y,
                   {aggregation.upper()}("{value_col}") as value
            FROM data
            GROUP BY "{x_col}", "{y_col}"
        """
        
        df = conn.execute(query).df()
        return df.to_dict('records')
    
    def _get_funnel_data(self, conn, config: Dict) -> List[Dict]:
        """Generate funnel chart data"""
        stages = config.get("stages", [])
        value_col = config.get("value")
        
        if not stages or not value_col:
            raise ValueError("Funnel chart requires stages and value column")
        
        data = []
        for stage in stages:
            query = f"""
                SELECT COUNT(*) as count
                FROM data
                WHERE "{stage['column']}" {stage['operator']} '{stage['value']}'
            """
            result = conn.execute(query).fetchone()
            data.append({
                "stage": stage['name'],
                "value": result[0] if result else 0
            })
        
        return data
    
    def _get_area_chart_data(self, conn, config: Dict) -> List[Dict]:
        """Generate area chart data"""
        # Similar to line chart but with area fill
        return self._get_line_chart_data(conn, config)
    
    def calculate_kpi(self, dataset_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate KPI value"""
        try:
            conn = self.duckdb.get_connection(dataset_id)
            column = config.get("column")
            aggregation = config.get("aggregation", "count")
            filters = config.get("filters", [])
            
            # Build WHERE clause from filters
            where_clause = ""
            if filters:
                conditions = []
                for f in filters:
                    if f["operator"] == "equals":
                        conditions.append(f'"{f["column"]}" = \'{f["value"]}\'')
                    elif f["operator"] == "greater_than":
                        conditions.append(f'"{f["column"]}" > {f["value"]}')
                    elif f["operator"] == "less_than":
                        conditions.append(f'"{f["column"]}" < {f["value"]}')
                if conditions:
                    where_clause = "WHERE " + " AND ".join(conditions)
            
            if aggregation == "count":
                query = f"SELECT COUNT(*) as value FROM data {where_clause}"
            else:
                query = f'SELECT {aggregation.upper()}("{column}") as value FROM data {where_clause}'
            
            result = conn.execute(query).fetchone()
            value = result[0] if result else 0
            
            # Calculate trend if trend_period is specified
            trend = None
            if config.get("trend_period"):
                # This would require timestamp column analysis
                # Simplified for now
                trend = 0
            
            return {
                "value": value,
                "trend": trend,
                "formatted": self._format_kpi_value(value, config.get("format", "number"))
            }
            
        except Exception as e:
            raise Exception(f"Error calculating KPI: {str(e)}")
    
    def _format_kpi_value(self, value: float, format_type: str) -> str:
        """Format KPI value based on type"""
        if format_type == "currency":
            return f"${value:,.2f}"
        elif format_type == "percentage":
            return f"{value:.1f}%"
        elif format_type == "number":
            if value >= 1000000:
                return f"{value/1000000:.1f}M"
            elif value >= 1000:
                return f"{value/1000:.1f}K"
            return f"{value:,.0f}"
        return str(value)
    
    def get_table_data(self, dataset_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Get data for table widget"""
        try:
            conn = self.duckdb.get_connection(dataset_id)
            columns = config.get("columns", [])
            sort_by = config.get("sort_by")
            sort_order = config.get("sort_order", "asc")
            page = config.get("page", 1)
            page_size = config.get("page_size", 10)
            
            # Build column list
            col_list = "*" if not columns else ", ".join([f'"{c}"' for c in columns])
            
            # Build ORDER BY clause
            order_clause = ""
            if sort_by:
                order_clause = f'ORDER BY "{sort_by}" {sort_order.upper()}'
            
            # Get total count
            count_query = "SELECT COUNT(*) FROM data"
            total_rows = conn.execute(count_query).fetchone()[0]
            
            # Get paginated data
            offset = (page - 1) * page_size
            query = f"""
                SELECT {col_list}
                FROM data
                {order_clause}
                LIMIT {page_size}
                OFFSET {offset}
            """
            
            df = conn.execute(query).df()
            
            return {
                "data": df.to_dict('records'),
                "total_rows": total_rows,
                "page": page,
                "page_size": page_size,
                "total_pages": (total_rows + page_size - 1) // page_size
            }
            
        except Exception as e:
            raise Exception(f"Error getting table data: {str(e)}")
    
    def generate_share_token(self) -> str:
        """Generate a secure share token"""
        return secrets.token_urlsafe(32)
    
    def apply_dashboard_filters(self, dataset_id: str, filters: List[Dict]) -> str:
        """Apply filters to dataset and return filtered dataset ID"""
        # This would create a temporary filtered view
        # For now, return the original dataset_id
        # In production, you might create a temp table or view
        return dataset_id
