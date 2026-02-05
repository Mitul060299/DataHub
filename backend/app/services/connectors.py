from typing import Dict, Any
import pandas as pd
from io import StringIO
from sqlalchemy import create_engine, text
from supabase import create_client
from .plugins import plugin_registry, PluginInfo


class InlineCsvConnector:
    name = "inline_csv"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        csv_text = config.get("csv_text", "")
        if not csv_text:
            raise ValueError("csv_text is required")
        return pd.read_csv(StringIO(csv_text))


class HttpCsvConnector:
    name = "http_csv"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        url = config.get("url", "")
        if not url:
            raise ValueError("url is required")
        return pd.read_csv(url)


class ExcelConnector:
    name = "excel"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        path = config.get("file_path")
        url = config.get("url")
        sheet_name = config.get("sheet_name", 0)
        if not path and not url:
            raise ValueError("file_path or url is required")
        return pd.read_excel(url or path, sheet_name=sheet_name)


class GoogleSheetsConnector:
    name = "google_sheets"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        sheet_id = config.get("sheet_id")
        gid = config.get("gid", 0)
        if not sheet_id:
            raise ValueError("sheet_id is required")
        url = f"https://docs.google.com/spreadsheets/d/{sheet_id}/export?format=csv&gid={gid}"
        return pd.read_csv(url)


class SqlQueryConnector:
    name = "sql_query"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        connection_url = config.get("connection_url", "")
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")
        updated_at_column = config.get("updated_at_column")
        updated_at_since = config.get("updated_at_since")

        if not connection_url:
            raise ValueError("connection_url is required")

        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            query = f"SELECT * FROM {table}"
            clauses = []
            if where:
                clauses.append(where)
            if updated_at_column and updated_at_since:
                clauses.append(f"{updated_at_column} >= :updated_at_since")
            if clauses:
                query = f"{query} WHERE " + " AND ".join(clauses)

        engine = create_engine(connection_url)
        params = {}
        if updated_at_column and updated_at_since:
            params["updated_at_since"] = updated_at_since
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn, params=params)


class SupabaseConnector:
    name = "supabase"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        url = config.get("url")
        key = config.get("key")
        table = config.get("table")
        columns = config.get("columns", "*")
        limit = int(config.get("limit", 1000))
        if not url or not key or not table:
            raise ValueError("url, key, and table are required")
        client = create_client(url, key)
        result = client.table(table).select(columns).limit(limit).execute()
        data = result.data or []
        return pd.DataFrame(data)

    def write(self, config: Dict[str, Any], rows: list[dict]) -> int:
        url = config.get("url")
        key = config.get("key")
        table = config.get("table")
        upsert_by = config.get("upsert_by")
        if not url or not key or not table:
            raise ValueError("url, key, and table are required")
        client = create_client(url, key)
        if upsert_by:
            result = client.table(table).upsert(rows, on_conflict=upsert_by).execute()
        else:
            result = client.table(table).insert(rows).execute()
        return len(result.data or [])


class ConnectorRegistry:
    def __init__(self) -> None:
        self._connectors = {
            InlineCsvConnector.name: InlineCsvConnector(),
            HttpCsvConnector.name: HttpCsvConnector(),
            SqlQueryConnector.name: SqlQueryConnector(),
            ExcelConnector.name: ExcelConnector(),
            GoogleSheetsConnector.name: GoogleSheetsConnector(),
            SupabaseConnector.name: SupabaseConnector(),
        }

    def list(self) -> list[str]:
        return list(self._connectors.keys())

    def get(self, name: str):
        return self._connectors.get(name)

    def register(self, name: str, connector: Any) -> None:
        self._connectors[name] = connector

    def remove(self, name: str) -> None:
        if name in self._connectors:
            self._connectors.pop(name, None)


connector_registry = ConnectorRegistry()

for connector_name in connector_registry.list():
    plugin_registry.register(
        PluginInfo(
            name=connector_name,
            kind="connector",
            description="Built-in connector",
            enabled=True,
            source="builtin",
        ),
        instance=connector_registry.get(connector_name),
    )
