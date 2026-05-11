from typing import Dict, Any, Optional
import ipaddress
import re
import socket
import pandas as pd
from io import StringIO
from urllib.parse import urlparse
from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from supabase import create_client
from .plugins import plugin_registry, PluginInfo
import logging

logger = logging.getLogger(__name__)

# ── Security helpers ──────────────────────────────────────────────────────────

_SAFE_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_$]*$")
_MAX_IDENTIFIER_LEN = 128
# Patterns that suggest multi-statement or comment injection in a WHERE clause
_UNSAFE_WHERE_RE = re.compile(r"--|/\*|\*/|;|\bxp_|\bexec\s|\bexecute\s", re.IGNORECASE)
# Private / loopback IP ranges that should never be reached via connector URLs
_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
]
# Credential-bearing keys that must not be persisted in plaintext column store
CREDENTIAL_KEYS: frozenset[str] = frozenset({
    "password", "passwd", "connection_url", "api_key", "key", "secret",
    "token", "access_token", "refresh_token", "access_key", "secret_key",
    "service_account_key", "private_key", "auth_header", "credentials",
    "certificate", "ssl_cert", "ssl_key",
})


def _validate_identifier(name: str, label: str = "identifier") -> str:
    """Raise ValueError if *name* is not a safe SQL identifier.

    Allows letters, digits, underscores and ``$`` (common in many databases).
    Does NOT allow dots, spaces, quotes or any other special character.
    Users needing complex identifiers must pass a full ``query`` instead.
    """
    if (
        not name
        or len(name) > _MAX_IDENTIFIER_LEN
        or not _SAFE_IDENTIFIER_RE.match(name)
    ):
        raise ValueError(
            f"Invalid SQL {label} {name!r}: only letters, digits, underscores "
            "and $ are allowed. Pass a 'query' field for complex identifiers."
        )
    return name


def _validate_where(where: str) -> str:
    """Raise ValueError if the WHERE clause contains suspicious SQL injection markers."""
    if _UNSAFE_WHERE_RE.search(where):
        raise ValueError(
            "WHERE clause contains forbidden characters or keywords (e.g. --, /*, ;). "
            "Pass a parameterised 'query' field instead."
        )
    return where


def _validate_http_url_no_ssrf(url: str, label: str = "URL") -> None:
    """Raise ValueError if *url* resolves to a private/loopback address (SSRF guard)."""
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            raise ValueError(f"Only http/https schemes are allowed for {label}")
        hostname = parsed.hostname
        if not hostname:
            raise ValueError(f"Missing hostname in {label}")
        resolved = socket.getaddrinfo(hostname, None)
        for (_fam, _typ, _pro, _can, sockaddr) in resolved:
            ip = ipaddress.ip_address(sockaddr[0])
            if any(ip in net for net in _PRIVATE_NETWORKS):
                raise ValueError(
                    f"{label} resolves to a private/reserved address ({ip}), which is not allowed"
                )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Invalid {label}: {exc}") from exc


def _validate_db_connection_url(connection_url: str) -> None:
    """Reject connection URLs that target loopback/private hosts or use the SQLite scheme.

    The ``sqlite`` scheme would allow reading arbitrary local files on the server;
    loopback/private hosts would allow SSRF against internal services.
    """
    try:
        parsed = urlparse(connection_url)
        scheme = (parsed.scheme or "").lower()
        if scheme.startswith("sqlite"):
            raise ValueError(
                "SQLite connection URLs are not permitted in the sql_query connector. "
                "Use the dedicated 'sqlite' connector instead."
            )
        hostname = parsed.hostname
        if hostname:
            try:
                resolved = socket.getaddrinfo(hostname, None)
            except socket.gaierror:
                raise ValueError(f"Cannot resolve hostname in connection URL: {hostname!r}")
            for (_fam, _typ, _pro, _can, sockaddr) in resolved:
                ip = ipaddress.ip_address(sockaddr[0])
                if any(ip in net for net in _PRIVATE_NETWORKS):
                    raise ValueError(
                        f"connection_url hostname resolves to a private/reserved address "
                        f"({ip}), which is not allowed"
                    )
    except ValueError:
        raise
    except Exception as exc:
        raise ValueError(f"Invalid connection_url: {exc}") from exc


_ALLOWED_SQLITE_EXTENSIONS = {".db", ".sqlite", ".sqlite3"}

# Hard upper bound for client-supplied row limits on document/object stores
# (MongoDB, Salesforce, etc.) to stop a malicious or buggy caller from
# requesting an unbounded scan that would OOM the worker.
_MAX_DOCSTORE_ROWS = 50_000


def _safe_error(exc: Exception, default: str = "Operation failed") -> str:
    """Return a generic error message safe to send to API clients.

    Many third-party drivers embed the full connection URL (with username
    and password) in their exception messages. Returning ``str(exc)`` to the
    HTTP layer therefore leaks credentials to the caller and into request
    logs. Always log the full exception server-side and surface only the
    exception class name to the client.
    """
    return f"{default}: {type(exc).__name__}"


def _validate_snowflake_account(account: str) -> None:
    """Block obviously private/loopback Snowflake account identifiers.

    Snowflake accounts are normally short identifiers like ``xy12345.us-east-1``
    that resolve to ``<acct>.snowflakecomputing.com``. Refuse anything that
    contains a scheme, a slash, or that resolves locally so the connector
    can't be tricked into hitting an internal service.
    """
    if not account or not isinstance(account, str):
        raise ValueError("Snowflake account is required")
    if any(ch in account for ch in ("/", "\\", " ", "@", ":")):
        raise ValueError("Snowflake account contains forbidden characters")
    # Resolve the canonical hostname through the SSRF guard.
    _validate_http_url_no_ssrf(
        f"https://{account}.snowflakecomputing.com", label="Snowflake account"
    )


def _validate_sqlite_path(file_path: str) -> None:
    """Reject SQLite file_paths that could read arbitrary server files."""
    import os
    # Block path traversal
    if ".." in file_path:
        raise ValueError("file_path must not contain '..': path traversal is not allowed")
    _, ext = os.path.splitext(file_path.lower())
    if ext not in _ALLOWED_SQLITE_EXTENSIONS:
        raise ValueError(
            f"file_path must have a .db, .sqlite or .sqlite3 extension (got {ext!r})"
        )


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
        _validate_http_url_no_ssrf(url, label="CSV URL")
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
        _validate_db_connection_url(connection_url)

        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            query = f'SELECT * FROM "{table}"'
            clauses = []
            if where:
                _validate_where(where)
                clauses.append(where)
            if updated_at_column and updated_at_since:
                _validate_identifier(updated_at_column, "updated_at_column")
                clauses.append(f'"{updated_at_column}" >= :updated_at_since')
            if clauses:
                query = f"{query} WHERE " + " AND ".join(clauses)

        engine = create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool)
        params = {}
        if updated_at_column and updated_at_since:
            params["updated_at_since"] = updated_at_since
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn, params=params)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            connection_url = config.get("connection_url", "")
            if not connection_url:
                return {"success": False, "error": "connection_url is required"}

            engine = create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool, connect_args={"connect_timeout": 5})
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            return {"success": True, "message": "Successfully connected to database"}
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Database connection failed")}


class PostgreSQLConnector:
    """PostgreSQL database connector using psycopg driver."""
    name = "postgresql"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        connection_url = config.get("connection_url")
        if connection_url:
            _validate_db_connection_url(connection_url)
            # Ensure the URL uses the psycopg3 driver prefix
            if connection_url.startswith("postgresql://") or connection_url.startswith("postgres://"):
                connection_url = "postgresql+psycopg" + connection_url[connection_url.index("://"):]
            return create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool, connect_args={"connect_timeout": 10})

        host = config.get("host", "localhost")
        port = config.get("port", 5432)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        sslmode = config.get("sslmode") or config.get("ssl_mode")
        url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
        connect_args: Dict[str, Any] = {"connect_timeout": 10}
        if sslmode:
            connect_args["sslmode"] = sslmode
        return create_engine(url, pool_pre_ping=True, poolclass=NullPool, connect_args=connect_args)

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source PostgreSQL database and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")
        schema = config.get("schema", "public")

        # Support direct connection_url (e.g. NeonDB / Render / Supabase connection strings)
        if config.get("connection_url"):
            if not query and not table:
                raise ValueError("query or table is required")
        else:
            host = config.get("host", "localhost")
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")
            if not all([host, database, username, password]):
                raise ValueError("host, database, username, and password are required (or provide connection_url)")
            if not query and not table:
                raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            _validate_identifier(schema, "schema")
            query = f'SELECT * FROM "{schema}"."{table}"'
            if where:
                _validate_where(where)
                query = f"{query} WHERE {where}"

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        schema = config.get("schema", "public")
        engine = self._build_engine(config)
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, schema=schema, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not config.get("connection_url"):
                host = config.get("host", "localhost")
                database = config.get("database")
                username = config.get("username")
                password = config.get("password")
                if not all([host, database, username, password]):
                    return {"success": False, "error": "Missing required credentials"}

            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT version()"))
            
            return {"success": True, "message": "Successfully connected to PostgreSQL"}
        except Exception as e:
            logger.error(f"PostgreSQL connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "PostgreSQL connection failed")}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            if not config.get("connection_url"):
                host = config.get("host", "localhost")
                database = config.get("database")
                username = config.get("username")
                password = config.get("password")
                if not all([host, database, username, password]):
                    return []
            engine = self._build_engine(config)
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT t.table_schema, t.table_name,
                        COALESCE(c.reltuples::bigint, 0) AS row_count_approx
                    FROM information_schema.tables t
                    LEFT JOIN pg_class c ON c.relname = t.table_name
                    WHERE t.table_type = 'BASE TABLE'
                      AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
                    ORDER BY t.table_schema, t.table_name
                """))
                return [{"schema": r[0], "table": r[1], "row_count": r[2]} for r in result.fetchall()]
        except Exception as e:
            logger.error(f"PostgreSQL list_tables failed: {e}")
            return []


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


# ===========================================
# RELATIONAL DATABASE CONNECTORS
# ===========================================

class MySQLConnector:
    """MySQL database connector using PyMySQL driver."""
    name = "mysql"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        connection_url = config.get("connection_url")
        if connection_url:
            _validate_db_connection_url(connection_url)
            # Normalise scheme so bare mysql:// gets the pymysql driver
            if connection_url.startswith("mysql://"):
                connection_url = "mysql+pymysql" + connection_url[5:]
            return create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool, connect_args={"connect_timeout": 10})
        host = config.get("host", "localhost")
        port = config.get("port", 3306)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        connect_args: Dict[str, Any] = {"connect_timeout": 10}
        ssl_ca = config.get("ssl_ca")
        ssl_mode = config.get("ssl_mode") or config.get("sslmode")
        if ssl_ca:
            connect_args["ssl"] = {"ca": ssl_ca}
        elif ssl_mode:
            connect_args["ssl"] = {}
        url = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
        return create_engine(url, pool_pre_ping=True, poolclass=NullPool, connect_args=connect_args)

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source MySQL database and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            query = f"SELECT * FROM {table}"
            if where:
                _validate_where(where)
                query = f"{query} WHERE {where}"

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        engine = self._build_engine(config)
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
                return {"success": False, "error": "Missing required credentials"}
            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            database = config.get("database", "")
            return {"success": True, "message": f"Successfully connected to MySQL database '{database}'"}
        except Exception as e:
            logger.error(f"MySQL connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "MySQL connection failed")}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
                return []
            engine = self._build_engine(config)
            database = config.get("database")
            if not database and config.get("connection_url"):
                from urllib.parse import urlparse as _urlparse
                database = (_urlparse(config["connection_url"]).path or "").lstrip("/").split("?")[0]
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT TABLE_SCHEMA, TABLE_NAME, COALESCE(TABLE_ROWS, 0)
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_TYPE = 'BASE TABLE' AND TABLE_SCHEMA = :db
                    ORDER BY TABLE_NAME
                """), {"db": database})
                return [{"schema": r[0], "table": r[1], "row_count": r[2]} for r in result.fetchall()]
        except Exception as e:
            logger.error(f"MySQL list_tables failed: {e}")
            return []


class SQLServerConnector:
    """Microsoft SQL Server connector using PyMSSQL driver."""
    name = "mssql"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        connection_url = config.get("connection_url")
        if connection_url:
            _validate_db_connection_url(connection_url)
            if connection_url.startswith("mssql://"):
                connection_url = "mssql+pymssql" + connection_url[5:]
            return create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool, connect_args={"timeout": 10})
        host = config.get("host", "localhost")
        port = config.get("port", 1433)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        url = f"mssql+pymssql://{username}:{password}@{host}:{port}/{database}"
        return create_engine(url, pool_pre_ping=True, poolclass=NullPool, connect_args={"timeout": 10})

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source SQL Server database and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            query = f"SELECT * FROM {table}"
            if where:
                _validate_where(where)
                query = f"{query} WHERE {where}"

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        engine = self._build_engine(config)
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
                return {"success": False, "error": "Missing required credentials"}
            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            database = config.get("database", "")
            return {"success": True, "message": f"Successfully connected to SQL Server database '{database}'"}
        except Exception as e:
            logger.error(f"SQL Server connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "SQL Server connection failed")}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
                return []
            engine = self._build_engine(config)
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT TABLE_SCHEMA, TABLE_NAME, 0
                    FROM INFORMATION_SCHEMA.TABLES
                    WHERE TABLE_TYPE = 'BASE TABLE'
                    ORDER BY TABLE_SCHEMA, TABLE_NAME
                """))
                return [{"schema": r[0], "table": r[1], "row_count": r[2]} for r in result.fetchall()]
        except Exception as e:
            logger.error(f"SQL Server list_tables failed: {e}")
            return []


class OracleConnector:
    """Oracle Database connector using python-oracledb (thin mode)."""
    name = "oracle"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        host = config.get("host", "localhost")
        port = config.get("port", 1521)
        service_name = config.get("service_name")
        sid = config.get("sid")
        username = config.get("username")
        password = config.get("password")
        if not all([host, username, password]):
            raise ValueError("host, username, and password are required")
        if not service_name and not sid:
            raise ValueError("service_name or sid is required")
        dsn = f"{host}:{port}/{service_name or sid}"
        url = f"oracle+oracledb://{username}:{password}@{dsn}"
        return create_engine(url, pool_pre_ping=True, poolclass=NullPool, thick_mode=False, connect_args={"tcp_connect_timeout": 10})

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source Oracle database and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not all([config.get("host"), config.get("username"), config.get("password")]):
            raise ValueError("host, username, and password are required")
        service_name = config.get("service_name")
        sid = config.get("sid")
        if not service_name and not sid:
            raise ValueError("service_name or sid is required")
        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            query = f"SELECT * FROM {table}"
            if where:
                _validate_where(where)
                query = f"{query} WHERE {where}"

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        engine = self._build_engine(config)
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not all([config.get("host"), config.get("username"), config.get("password")]):
                return {"success": False, "error": "Missing required credentials"}
            if not config.get("service_name") and not config.get("sid"):
                return {"success": False, "error": "service_name or sid is required"}
            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1 FROM DUAL"))
            return {"success": True, "message": f"Successfully connected to Oracle database at {config.get('host')}"}
        except Exception as e:
            logger.error(f"Oracle connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Oracle connection failed")}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            if not all([config.get("host"), config.get("username"), config.get("password")]) or not (config.get("service_name") or config.get("sid")):
                return []
            engine = self._build_engine(config)
            with engine.connect() as conn:
                result = conn.execute(text("""
                    SELECT owner, table_name, COALESCE(num_rows, 0)
                    FROM all_tables
                    WHERE owner NOT IN (
                        'SYS','SYSTEM','CTXSYS','MDSYS','ORDDATA','ORDSYS','OUTLN','WMSYS','XDB'
                    )
                    ORDER BY owner, table_name
                """))
                return [{"schema": r[0], "table": r[1], "row_count": r[2]} for r in result.fetchall()]
        except Exception as e:
            logger.error(f"Oracle list_tables failed: {e}")
            return []


class SQLiteConnector:
    """SQLite file-based connector (read-only)."""
    name = "sqlite"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        file_path = config.get("file_path")
        if not file_path:
            raise ValueError("file_path is required")
        _validate_sqlite_path(file_path)
        url = f"sqlite:///{file_path}"
        return create_engine(url, poolclass=NullPool)

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the SQLite file and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not config.get("file_path"):
            raise ValueError("file_path is required")
        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            query = f"SELECT * FROM {table}"
            if where:
                _validate_where(where)
                query = f"{query} WHERE {where}"

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not config.get("file_path"):
                return {"success": False, "error": "file_path is required"}
            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            file_path = config.get("file_path", "")
            return {"success": True, "message": f"Successfully connected to SQLite database '{file_path}'"}
        except Exception as e:
            logger.error(f"SQLite connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "SQLite connection failed")}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            if not config.get("file_path"):
                return []
            engine = self._build_engine(config)
            with engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                ))
                tables = [r[0] for r in result.fetchall()]
                out = []
                for tbl in tables:
                    _validate_identifier(tbl, "table")
                    count_row = conn.execute(text(f'SELECT COUNT(*) FROM "{tbl}"')).fetchone()
                    out.append({"schema": "main", "table": tbl, "row_count": count_row[0]})
                return out
        except Exception as e:
            logger.error(f"SQLite list_tables failed: {e}")
            return []


class MongoDBConnector:
    """MongoDB connector using PyMongo."""
    name = "mongodb"

    def _build_connection_url(self, config: Dict[str, Any]) -> str:
        """Return a validated MongoDB connection URL.

        Accepts a direct ``connection_url`` field (e.g. Atlas ``mongodb+srv://``
        URIs) or constructs one from host/port/username/password.
        The SSRF guard is only applied to host-based URLs; ``mongodb+srv://``
        URIs resolve via DNS SRV and are rejected by _validate_db_connection_url
        if the resolved IPs are private.
        """
        if config.get("connection_url"):
            url = config["connection_url"]
            # For srv URIs, validate the hostname portion through the same guard
            # that rejects private-range IPs.
            _validate_db_connection_url(url)
            return url
        host = config.get("host", "localhost")
        port = config.get("port", 27017)
        database = config.get("database", "")
        username = config.get("username")
        password = config.get("password")
        if username and password:
            url = f"mongodb://{username}:{password}@{host}:{port}/{database}"
        else:
            url = f"mongodb://{host}:{port}/{database}"
        _validate_db_connection_url(url)
        return url

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        try:
            from pymongo import MongoClient
        except ImportError:
            raise ImportError("pymongo is required for MongoDB connector")

        database = config.get("database")
        collection = config.get("collection")
        query = config.get("query", {})
        # SECURITY: clamp caller-supplied row count to a hard upper bound so a
        # malicious or buggy client can't request an unbounded scan.
        try:
            limit = max(1, min(int(config.get("limit", 1000)), _MAX_DOCSTORE_ROWS))
        except (TypeError, ValueError):
            limit = 1000

        if not all([database, collection]):
            raise ValueError("database and collection are required")

        connection_url = self._build_connection_url(config)
        client = MongoClient(connection_url, serverSelectionTimeoutMS=5000)
        db = client[database]
        coll = db[collection]
        cursor = coll.find(query).limit(limit)
        data = list(cursor)
        client.close()
        return pd.DataFrame(data)

    def write(self, config: Dict[str, Any], rows: list[dict]) -> int:
        try:
            from pymongo import MongoClient
        except ImportError:
            raise ImportError("pymongo is required for MongoDB connector")

        database = config.get("database")
        collection = config.get("collection")
        if not all([database, collection]):
            raise ValueError("database and collection are required")

        connection_url = self._build_connection_url(config)
        client = MongoClient(connection_url, serverSelectionTimeoutMS=5000)
        db = client[database]
        coll = db[collection]
        result = coll.insert_many(rows)
        client.close()
        return len(result.inserted_ids)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from pymongo import MongoClient
        except ImportError:
            return {"success": False, "error": "pymongo library not installed"}

        try:
            database = config.get("database")
            if not database and not config.get("connection_url"):
                return {"success": False, "error": "database is required"}

            connection_url = self._build_connection_url(config)
            client = MongoClient(connection_url, serverSelectionTimeoutMS=5000)
            client.server_info()  # Force connection
            client.close()
            return {"success": True, "message": f"Successfully connected to MongoDB database '{database}'"}
        except Exception as e:
            logger.error(f"MongoDB connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "MongoDB connection failed")}


# ===========================================
# CLOUD DATA WAREHOUSE CONNECTORS
# ===========================================

class SnowflakeConnector:
    """Snowflake Data Warehouse connector."""
    name = "snowflake"
    supports_query_folding: bool = True

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source Snowflake account and return results."""
        try:
            import snowflake.connector
        except ImportError:
            raise ImportError("snowflake-connector-python is required for Snowflake connector")
        account = config.get("account")
        username = config.get("username")
        password = config.get("password")
        warehouse = config.get("warehouse")
        database = config.get("database")
        schema = config.get("schema", "PUBLIC")
        _validate_snowflake_account(account)
        conn = snowflake.connector.connect(
            account=account,
            user=username,
            password=password,
            warehouse=warehouse,
            database=database,
            schema=schema,
            client_session_keep_alive=True,
        )
        df = pd.read_sql(sql, conn)
        conn.close()
        return df

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        try:
            import snowflake.connector
        except ImportError:
            raise ImportError("snowflake-connector-python is required for Snowflake connector")

        account = config.get("account")
        username = config.get("username")
        password = config.get("password")
        warehouse = config.get("warehouse")
        database = config.get("database")
        schema = config.get("schema", "PUBLIC")
        query = config.get("query")
        table = config.get("table")

        if not all([account, username, password, warehouse, database]):
            raise ValueError("account, username, password, warehouse, and database are required")
        if not query and not table:
            raise ValueError("query or table is required")

        # SECURITY: SSRF guard on the user-supplied account identifier.
        _validate_snowflake_account(account)

        conn = snowflake.connector.connect(
            account=account,
            user=username,
            password=password,
            warehouse=warehouse,
            database=database,
            schema=schema,
            client_session_keep_alive=True
        )

        if not query:
            _validate_identifier(table, "table")
            query = f"SELECT * FROM {table}"

        df = pd.read_sql(query, conn)
        conn.close()
        return df

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        try:
            import snowflake.connector
            from snowflake.connector.pandas_tools import write_pandas
        except ImportError:
            raise ImportError("snowflake-connector-python is required for Snowflake connector")

        account = config.get("account")
        username = config.get("username")
        password = config.get("password")
        warehouse = config.get("warehouse")
        database = config.get("database")
        schema = config.get("schema", "PUBLIC")

        if not all([account, username, password, warehouse, database]):
            raise ValueError("account, username, password, warehouse, and database are required")

        # SECURITY: SSRF guard on the user-supplied account identifier.
        _validate_snowflake_account(account)

        conn = snowflake.connector.connect(
            account=account,
            user=username,
            password=password,
            warehouse=warehouse,
            database=database,
            schema=schema
        )

        if mode == "replace":
            _validate_identifier(table, "table")
            cursor = conn.cursor()
            # SECURITY: quote the identifier so a `_validate_identifier`-clean
            # but case-sensitive name (e.g. `MyTable`) still resolves correctly
            # in Snowflake, where unquoted identifiers are folded to upper-case.
            safe_table = table.replace('"', '""')
            cursor.execute(f'TRUNCATE TABLE IF EXISTS "{safe_table}"')
            cursor.close()

        success, nchunks, nrows, _ = write_pandas(conn, df, table)
        conn.close()
        
        return nrows if success else 0

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            import snowflake.connector
        except ImportError:
            return {"success": False, "error": "snowflake-connector-python library not installed"}

        try:
            account = config.get("account")
            username = config.get("username")
            password = config.get("password")
            warehouse = config.get("warehouse")
            database = config.get("database")

            if not all([account, username, password, warehouse, database]):
                return {"success": False, "error": "Missing required credentials"}

            # SECURITY: SSRF guard on the user-supplied account identifier.
            _validate_snowflake_account(account)

            conn = snowflake.connector.connect(
                account=account,
                user=username,
                password=password,
                warehouse=warehouse,
                database=database,
                login_timeout=10
            )
            
            cursor = conn.cursor()
            cursor.execute("SELECT CURRENT_VERSION()")
            version = cursor.fetchone()[0]
            cursor.close()
            conn.close()
            
            return {"success": True, "message": f"Successfully connected to Snowflake (version {version})"}
        except Exception as e:
            logger.error(f"Snowflake connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Snowflake connection failed")}


class BigQueryConnector:
    """Google BigQuery connector."""
    name = "bigquery"
    supports_query_folding: bool = True

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source BigQuery project and return results."""
        try:
            from google.cloud import bigquery
            from google.oauth2 import service_account
        except ImportError:
            raise ImportError("google-cloud-bigquery is required for BigQuery connector")
        project_id = config.get("project_id")
        credentials_json = config.get("credentials_json")
        if credentials_json:
            import json
            creds_dict = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            client = bigquery.Client(project=project_id, credentials=credentials)
        else:
            client = bigquery.Client(project=project_id)
        return client.query(sql).to_dataframe()

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        try:
            from google.cloud import bigquery
            from google.oauth2 import service_account
        except ImportError:
            raise ImportError("google-cloud-bigquery is required for BigQuery connector")

        project_id = config.get("project_id")
        credentials_json = config.get("credentials_json")
        query = config.get("query")
        table = config.get("table")
        dataset = config.get("dataset")

        if not project_id:
            raise ValueError("project_id is required")
        if not query and not table:
            raise ValueError("query or table is required")

        # Create credentials from JSON
        if credentials_json:
            import json
            creds_dict = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            client = bigquery.Client(project=project_id, credentials=credentials)
        else:
            # Use default credentials (from environment)
            client = bigquery.Client(project=project_id)

        if not query:
            if dataset:
                full_table = f"{project_id}.{dataset}.{table}"
            else:
                full_table = table
            query = f"SELECT * FROM `{full_table}`"

        df = client.query(query).to_dataframe()
        return df

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        try:
            from google.cloud import bigquery
            from google.oauth2 import service_account
        except ImportError:
            raise ImportError("google-cloud-bigquery is required for BigQuery connector")

        project_id = config.get("project_id")
        dataset = config.get("dataset")
        credentials_json = config.get("credentials_json")

        if not all([project_id, dataset]):
            raise ValueError("project_id and dataset are required")

        # Create credentials from JSON
        if credentials_json:
            import json
            creds_dict = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            client = bigquery.Client(project=project_id, credentials=credentials)
        else:
            client = bigquery.Client(project=project_id)

        table_id = f"{project_id}.{dataset}.{table}"
        
        write_disposition = "WRITE_TRUNCATE" if mode == "replace" else "WRITE_APPEND"
        job_config = bigquery.LoadJobConfig(write_disposition=write_disposition)
        
        job = client.load_table_from_dataframe(df, table_id, job_config=job_config)
        job.result()  # Wait for completion
        
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from google.cloud import bigquery
            from google.oauth2 import service_account
        except ImportError:
            return {"success": False, "error": "google-cloud-bigquery library not installed"}

        try:
            project_id = config.get("project_id")
            credentials_json = config.get("credentials_json")

            if not project_id:
                return {"success": False, "error": "project_id is required"}

            # Create credentials from JSON
            if credentials_json:
                import json
                creds_dict = json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
                credentials = service_account.Credentials.from_service_account_info(creds_dict)
                client = bigquery.Client(project=project_id, credentials=credentials)
            else:
                client = bigquery.Client(project=project_id)

            # Test connection by listing datasets
            datasets = list(client.list_datasets(max_results=1))
            
            return {"success": True, "message": f"Successfully connected to BigQuery project '{project_id}'"}
        except Exception as e:
            logger.error(f"BigQuery connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "BigQuery connection failed")}


class RedshiftConnector:
    """Amazon Redshift connector (uses PostgreSQL driver)."""
    name = "redshift"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        connection_url = config.get("connection_url")
        if connection_url:
            _validate_db_connection_url(connection_url)
            if connection_url.startswith("redshift://") or connection_url.startswith("redshift+psycopg2://"):
                pass  # keep as-is; redshift-connector handles these
            elif connection_url.startswith("postgresql://") or connection_url.startswith("postgres://"):
                connection_url = "postgresql+psycopg" + connection_url[connection_url.index("://"):]
            return create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool, connect_args={"connect_timeout": 10})
        host = config.get("host")
        port = config.get("port", 5439)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        sslmode = config.get("sslmode") or config.get("ssl_mode")
        url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
        connect_args: Dict[str, Any] = {"connect_timeout": 10}
        if sslmode:
            connect_args["sslmode"] = sslmode
        return create_engine(url, pool_pre_ping=True, poolclass=NullPool, connect_args=connect_args)

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source Redshift database and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        schema = config.get("schema", "public")

        if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
            raise ValueError("host, database, username, and password are required (or provide connection_url)")
        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            _validate_identifier(schema, "schema")
            query = f'SELECT * FROM "{schema}"."{table}"'

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        schema = config.get("schema", "public")
        engine = self._build_engine(config)
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, schema=schema, if_exists=if_exists, index=False, method="multi")
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not config.get("connection_url") and not all([config.get("host"), config.get("database"), config.get("username"), config.get("password")]):
                return {"success": False, "error": "Missing required credentials"}
            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"success": True, "message": "Successfully connected to Redshift"}
        except Exception as e:
            logger.error(f"Redshift connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Redshift connection failed")}


class AzureSynapseConnector:
    """Azure Synapse Analytics connector (uses SQL Server driver)."""
    name = "azure-sql"
    supports_query_folding: bool = True

    def _build_engine(self, config: Dict[str, Any]):
        connection_url = config.get("connection_url")
        if connection_url:
            _validate_db_connection_url(connection_url)
            if connection_url.startswith("mssql://"):
                connection_url = "mssql+pymssql" + connection_url[5:]
            return create_engine(connection_url, pool_pre_ping=True, poolclass=NullPool, connect_args={"timeout": 10})
        server = config.get("server")
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        if not all([server, database, username, password]):
            raise ValueError("server, database, username, and password are required (or provide connection_url)")
        url = f"mssql+pymssql://{username}:{password}@{server}/{database}"
        return create_engine(url, pool_pre_ping=True, poolclass=NullPool, connect_args={"timeout": 10})

    def execute_sql(self, sql: str, config: Dict[str, Any]) -> pd.DataFrame:
        """Push an arbitrary SQL query to the source Azure Synapse database and return results."""
        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(sql), conn)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        query = config.get("query")
        table = config.get("table")
        schema = config.get("schema", "dbo")

        if not config.get("connection_url") and not all([config.get("server"), config.get("database"), config.get("username"), config.get("password")]):
            raise ValueError("server, database, username, and password are required (or provide connection_url)")
        if not query and not table:
            raise ValueError("query or table is required")

        if not query:
            _validate_identifier(table, "table")
            _validate_identifier(schema, "schema")
            query = f"SELECT * FROM {schema}.{table}"

        engine = self._build_engine(config)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        schema = config.get("schema", "dbo")
        engine = self._build_engine(config)
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, schema=schema, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            if not config.get("connection_url") and not all([config.get("server"), config.get("database"), config.get("username"), config.get("password")]):
                return {"success": False, "error": "Missing required credentials"}
            engine = self._build_engine(config)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            database = config.get("database", "")
            return {"success": True, "message": f"Successfully connected to Azure Synapse database '{database}'"}
        except Exception as e:
            logger.error(f"Azure Synapse connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Azure Synapse connection failed")}


# ===========================================
# SaaS API CONNECTORS (Phase 2)
# ===========================================

class SalesforceConnector:
    """Salesforce SOQL/API connector."""
    name = "salesforce"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        try:
            from simple_salesforce import Salesforce
        except ImportError:
            raise ImportError("simple-salesforce is required for Salesforce connector")

        username = config.get("username")
        password = config.get("password")
        security_token = config.get("security_token")
        domain = config.get("domain", "login")  # or "test" for sandbox
        object_name = config.get("object_name")  # e.g., "Account", "Contact"
        soql_query = config.get("query")

        if not all([username, password, security_token]):
            raise ValueError("username, password, and security_token are required")

        sf = Salesforce(
            username=username,
            password=password,
            security_token=security_token,
            domain=domain
        )

        if soql_query:
            # Custom SOQL query
            result = sf.query_all(soql_query)
        elif object_name:
            # Query all from object
            soql_query = f"SELECT FIELDS(ALL) FROM {object_name} LIMIT 1000"
            result = sf.query_all(soql_query)
        else:
            raise ValueError("object_name or query is required")

        records = result.get("records", [])
        # Remove 'attributes' field from each record
        cleaned_records = [{k: v for k, v in record.items() if k != "attributes"} for record in records]
        
        return pd.DataFrame(cleaned_records)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            from simple_salesforce import Salesforce
        except ImportError:
            return {"success": False, "error": "simple-salesforce library not installed"}

        try:
            username = config.get("username")
            password = config.get("password")
            security_token = config.get("security_token")
            domain = config.get("domain", "login")

            if not all([username, password, security_token]):
                return {"success": False, "error": "Missing required credentials"}

            sf = Salesforce(
                username=username,
                password=password,
                security_token=security_token,
                domain=domain
            )

            # Test by getting organization info
            org_info = sf.query("SELECT Id, Name FROM Organization LIMIT 1")
            org_name = org_info.get("records", [{}])[0].get("Name", "Unknown")
            
            return {"success": True, "message": f"Successfully connected to Salesforce org '{org_name}'"}
        except Exception as e:
            logger.error(f"Salesforce connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Salesforce connection failed")}


# ===========================================
# CLOUD OBJECT STORAGE CONNECTORS (Professional+)
# ===========================================

_ALLOWED_OBJECT_FORMATS = {"csv", "tsv", "json", "jsonl", "ndjson", "parquet", "xlsx", "xls"}


def _infer_object_format(key: str, explicit: str | None = None) -> str:
    if explicit:
        fmt = explicit.lower().lstrip(".")
        if fmt in _ALLOWED_OBJECT_FORMATS:
            return fmt
        raise ValueError(
            f"Unsupported format {explicit!r}. Allowed: {sorted(_ALLOWED_OBJECT_FORMATS)}"
        )
    lowered = (key or "").lower()
    for ext in _ALLOWED_OBJECT_FORMATS:
        if lowered.endswith("." + ext):
            return ext
    raise ValueError(
        f"Cannot infer file format from key {key!r}. Pass explicit 'format'."
    )


def _read_object_bytes(payload: bytes, fmt: str, options: Dict[str, Any] | None = None) -> pd.DataFrame:
    """Decode a downloaded object's bytes into a DataFrame."""
    from io import BytesIO
    options = options or {}
    if fmt == "csv":
        return pd.read_csv(BytesIO(payload), **{k: v for k, v in options.items() if k in {"sep", "delimiter", "encoding", "header", "skiprows", "nrows"}})
    if fmt == "tsv":
        return pd.read_csv(BytesIO(payload), sep="\t", **{k: v for k, v in options.items() if k in {"encoding", "header", "skiprows", "nrows"}})
    if fmt in ("json",):
        return pd.read_json(BytesIO(payload))
    if fmt in ("jsonl", "ndjson"):
        return pd.read_json(BytesIO(payload), lines=True)
    if fmt == "parquet":
        return pd.read_parquet(BytesIO(payload))
    if fmt in ("xlsx", "xls"):
        sheet = options.get("sheet_name", 0)
        return pd.read_excel(BytesIO(payload), sheet_name=sheet)
    raise ValueError(f"Unsupported format: {fmt}")


def _validate_object_key(key: str) -> str:
    """Reject suspicious object keys."""
    if not key or not isinstance(key, str):
        raise ValueError("key is required")
    if len(key) > 1024:
        raise ValueError("key is too long (max 1024 chars)")
    if key.startswith("/") or ".." in key.split("/"):
        raise ValueError("key must not start with '/' or contain '..'")
    return key


class S3Connector:
    """Amazon S3 object storage connector."""
    name = "s3"

    def _client(self, config: Dict[str, Any]):
        try:
            import boto3
            from botocore.config import Config as BotoConfig
        except ImportError:
            raise ImportError("boto3 is required for the S3 connector")

        access_key = config.get("access_key_id") or config.get("aws_access_key_id")
        secret_key = config.get("secret_access_key") or config.get("aws_secret_access_key")
        region = config.get("region") or config.get("aws_region") or "us-east-1"
        endpoint_url = config.get("endpoint_url")  # optional, for S3-compatible (MinIO, R2, etc.)
        session_token = config.get("session_token")

        if not access_key or not secret_key:
            raise ValueError("access_key_id and secret_access_key are required")

        kwargs: Dict[str, Any] = {
            "aws_access_key_id": access_key,
            "aws_secret_access_key": secret_key,
            "region_name": region,
            "config": BotoConfig(
                connect_timeout=10,
                read_timeout=30,
                retries={"max_attempts": 3, "mode": "standard"},
                signature_version="s3v4",
            ),
        }
        if session_token:
            kwargs["aws_session_token"] = session_token
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        return boto3.client("s3", **kwargs)

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        bucket = config.get("bucket")
        key = config.get("key") or config.get("path")
        if not bucket:
            raise ValueError("bucket is required")
        _validate_object_key(key or "")
        fmt = _infer_object_format(key, config.get("format"))

        client = self._client(config)
        obj = client.get_object(Bucket=bucket, Key=key)
        body = obj["Body"].read()
        return _read_object_bytes(body, fmt, config.get("options") or {})

    def write(self, config: Dict[str, Any], df: pd.DataFrame, key: str | None = None, mode: str = "replace") -> int:
        from io import BytesIO

        bucket = config.get("bucket")
        target_key = key or config.get("key") or config.get("path")
        if not bucket or not target_key:
            raise ValueError("bucket and key are required")
        _validate_object_key(target_key)

        fmt = _infer_object_format(target_key, config.get("format"))
        buf = BytesIO()
        if fmt == "csv":
            df.to_csv(buf, index=False)
            content_type = "text/csv"
        elif fmt == "parquet":
            df.to_parquet(buf, index=False)
            content_type = "application/octet-stream"
        elif fmt in ("json",):
            buf.write(df.to_json(orient="records").encode("utf-8"))
            content_type = "application/json"
        elif fmt in ("jsonl", "ndjson"):
            buf.write(df.to_json(orient="records", lines=True).encode("utf-8"))
            content_type = "application/x-ndjson"
        else:
            raise ValueError(f"Write not supported for format: {fmt}")
        buf.seek(0)

        client = self._client(config)
        client.put_object(Bucket=bucket, Key=target_key, Body=buf.getvalue(), ContentType=content_type)
        return len(df)

    def list_objects(self, config: Dict[str, Any]) -> list:
        bucket = config.get("bucket")
        prefix = config.get("prefix", "")
        if not bucket:
            raise ValueError("bucket is required")
        client = self._client(config)
        paginator = client.get_paginator("list_objects_v2")
        out: list = []
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix, MaxKeys=1000):
            for entry in page.get("Contents") or []:
                out.append({
                    "key": entry.get("Key"),
                    "size": entry.get("Size"),
                    "last_modified": entry.get("LastModified").isoformat() if entry.get("LastModified") else None,
                })
                if len(out) >= 1000:
                    return out
        return out

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            bucket = config.get("bucket")
            if not bucket:
                return {"success": False, "error": "bucket is required"}
            client = self._client(config)
            client.head_bucket(Bucket=bucket)
            return {"success": True, "message": f"Successfully connected to S3 bucket '{bucket}'"}
        except ImportError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as e:
            logger.error(f"S3 connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "S3 connection failed")}


class GCSConnector:
    """Google Cloud Storage object connector."""
    name = "gcs"

    def _client(self, config: Dict[str, Any]):
        try:
            from google.cloud import storage as gcs_storage
            from google.oauth2 import service_account
        except ImportError:
            raise ImportError("google-cloud-storage is required for the GCS connector")

        project_id = config.get("project_id")
        credentials_json = config.get("credentials_json")

        if credentials_json:
            import json as _json
            creds_dict = _json.loads(credentials_json) if isinstance(credentials_json, str) else credentials_json
            credentials = service_account.Credentials.from_service_account_info(creds_dict)
            return gcs_storage.Client(project=project_id, credentials=credentials)
        # Fall back to ADC (e.g., GOOGLE_APPLICATION_CREDENTIALS env var)
        return gcs_storage.Client(project=project_id) if project_id else gcs_storage.Client()

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        bucket_name = config.get("bucket")
        key = config.get("key") or config.get("path") or config.get("blob")
        if not bucket_name:
            raise ValueError("bucket is required")
        _validate_object_key(key or "")
        fmt = _infer_object_format(key, config.get("format"))

        client = self._client(config)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(key)
        body = blob.download_as_bytes()
        return _read_object_bytes(body, fmt, config.get("options") or {})

    def write(self, config: Dict[str, Any], df: pd.DataFrame, key: str | None = None, mode: str = "replace") -> int:
        from io import BytesIO

        bucket_name = config.get("bucket")
        target_key = key or config.get("key") or config.get("path") or config.get("blob")
        if not bucket_name or not target_key:
            raise ValueError("bucket and key are required")
        _validate_object_key(target_key)
        fmt = _infer_object_format(target_key, config.get("format"))

        buf = BytesIO()
        content_type = "application/octet-stream"
        if fmt == "csv":
            df.to_csv(buf, index=False)
            content_type = "text/csv"
        elif fmt == "parquet":
            df.to_parquet(buf, index=False)
        elif fmt == "json":
            buf.write(df.to_json(orient="records").encode("utf-8"))
            content_type = "application/json"
        elif fmt in ("jsonl", "ndjson"):
            buf.write(df.to_json(orient="records", lines=True).encode("utf-8"))
            content_type = "application/x-ndjson"
        else:
            raise ValueError(f"Write not supported for format: {fmt}")

        client = self._client(config)
        bucket = client.bucket(bucket_name)
        blob = bucket.blob(target_key)
        blob.upload_from_string(buf.getvalue(), content_type=content_type)
        return len(df)

    def list_objects(self, config: Dict[str, Any]) -> list:
        bucket_name = config.get("bucket")
        prefix = config.get("prefix", "")
        if not bucket_name:
            raise ValueError("bucket is required")
        client = self._client(config)
        out: list = []
        for blob in client.list_blobs(bucket_name, prefix=prefix, max_results=1000):
            out.append({
                "key": blob.name,
                "size": blob.size,
                "last_modified": blob.updated.isoformat() if blob.updated else None,
            })
        return out

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            bucket_name = config.get("bucket")
            if not bucket_name:
                return {"success": False, "error": "bucket is required"}
            client = self._client(config)
            bucket = client.bucket(bucket_name)
            if not bucket.exists():
                return {"success": False, "error": f"Bucket '{bucket_name}' not found or no access"}
            return {"success": True, "message": f"Successfully connected to GCS bucket '{bucket_name}'"}
        except ImportError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as e:
            logger.error(f"GCS connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "GCS connection failed")}


class AzureBlobConnector:
    """Azure Blob Storage object connector."""
    name = "azure_blob"

    def _service(self, config: Dict[str, Any]):
        try:
            from azure.storage.blob import BlobServiceClient
        except ImportError:
            raise ImportError("azure-storage-blob is required for the Azure Blob connector")

        connection_string = config.get("connection_string")
        account_url = config.get("account_url")
        account_key = config.get("account_key")
        sas_token = config.get("sas_token")

        if connection_string:
            return BlobServiceClient.from_connection_string(connection_string)
        if account_url:
            credential = account_key or sas_token
            if not credential:
                raise ValueError("account_key or sas_token is required when using account_url")
            return BlobServiceClient(account_url=account_url, credential=credential)
        raise ValueError("connection_string or (account_url + account_key/sas_token) is required")

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        container = config.get("container")
        key = config.get("key") or config.get("path") or config.get("blob")
        if not container:
            raise ValueError("container is required")
        _validate_object_key(key or "")
        fmt = _infer_object_format(key, config.get("format"))

        service = self._service(config)
        blob_client = service.get_blob_client(container=container, blob=key)
        downloader = blob_client.download_blob(max_concurrency=2)
        body = downloader.readall()
        return _read_object_bytes(body, fmt, config.get("options") or {})

    def write(self, config: Dict[str, Any], df: pd.DataFrame, key: str | None = None, mode: str = "replace") -> int:
        from io import BytesIO

        container = config.get("container")
        target_key = key or config.get("key") or config.get("path") or config.get("blob")
        if not container or not target_key:
            raise ValueError("container and key are required")
        _validate_object_key(target_key)
        fmt = _infer_object_format(target_key, config.get("format"))

        buf = BytesIO()
        if fmt == "csv":
            df.to_csv(buf, index=False)
        elif fmt == "parquet":
            df.to_parquet(buf, index=False)
        elif fmt == "json":
            buf.write(df.to_json(orient="records").encode("utf-8"))
        elif fmt in ("jsonl", "ndjson"):
            buf.write(df.to_json(orient="records", lines=True).encode("utf-8"))
        else:
            raise ValueError(f"Write not supported for format: {fmt}")

        service = self._service(config)
        blob_client = service.get_blob_client(container=container, blob=target_key)
        blob_client.upload_blob(buf.getvalue(), overwrite=(mode == "replace"))
        return len(df)

    def list_objects(self, config: Dict[str, Any]) -> list:
        container = config.get("container")
        prefix = config.get("prefix", "")
        if not container:
            raise ValueError("container is required")
        service = self._service(config)
        container_client = service.get_container_client(container)
        out: list = []
        for blob in container_client.list_blobs(name_starts_with=prefix):
            out.append({
                "key": blob.name,
                "size": blob.size,
                "last_modified": blob.last_modified.isoformat() if blob.last_modified else None,
            })
            if len(out) >= 1000:
                break
        return out

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            container = config.get("container")
            if not container:
                return {"success": False, "error": "container is required"}
            service = self._service(config)
            container_client = service.get_container_client(container)
            # exists() does a HEAD request; cheap and decisive.
            if not container_client.exists():
                return {"success": False, "error": f"Container '{container}' not found or no access"}
            return {"success": True, "message": f"Successfully connected to Azure Blob container '{container}'"}
        except ImportError as exc:
            return {"success": False, "error": str(exc)}
        except Exception as e:
            logger.error(f"Azure Blob connection test failed: {e}")
            return {"success": False, "error": _safe_error(e, "Azure Blob connection failed")}


class ConnectorRegistry:
    def __init__(self) -> None:
        self._connectors = {
            # File-based connectors
            InlineCsvConnector.name: InlineCsvConnector(),
            HttpCsvConnector.name: HttpCsvConnector(),
            ExcelConnector.name: ExcelConnector(),
            GoogleSheetsConnector.name: GoogleSheetsConnector(),
            
            # Database connectors (Professional tier)
            SqlQueryConnector.name: SqlQueryConnector(),
            PostgreSQLConnector.name: PostgreSQLConnector(),
            MySQLConnector.name: MySQLConnector(),
            SQLServerConnector.name: SQLServerConnector(),
            OracleConnector.name: OracleConnector(),
            SQLiteConnector.name: SQLiteConnector(),
            MongoDBConnector.name: MongoDBConnector(),

            # Cloud object storage (Professional tier)
            S3Connector.name: S3Connector(),
            GCSConnector.name: GCSConnector(),
            AzureBlobConnector.name: AzureBlobConnector(),

            # Cloud data warehouses (Team/Enterprise tier)
            SnowflakeConnector.name: SnowflakeConnector(),
            BigQueryConnector.name: BigQueryConnector(),
            RedshiftConnector.name: RedshiftConnector(),
            AzureSynapseConnector.name: AzureSynapseConnector(),
            
            # SaaS APIs (Enterprise tier)
            SupabaseConnector.name: SupabaseConnector(),
            SalesforceConnector.name: SalesforceConnector(),
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
