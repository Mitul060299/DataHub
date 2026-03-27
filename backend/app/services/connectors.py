from typing import Dict, Any, Optional
import pandas as pd
from io import StringIO
from sqlalchemy import create_engine, text
from supabase import create_client
from .plugins import plugin_registry, PluginInfo
import logging

logger = logging.getLogger(__name__)


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

        engine = create_engine(connection_url, pool_pre_ping=True)
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

            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            return {"success": True, "message": "Successfully connected to database"}
        except Exception as e:
            logger.error(f"Database connection test failed: {e}")
            return {"success": False, "error": str(e)}


class PostgreSQLConnector:
    """PostgreSQL database connector using psycopg driver."""
    name = "postgresql"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        host = config.get("host", "localhost")
        port = config.get("port", 5432)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")
        schema = config.get("schema", "public")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")
        if not query and not table:
            raise ValueError("query or table is required")

        connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
        
        if not query:
            query = f"SELECT * FROM {schema}.{table}"
            if where:
                query = f"{query} WHERE {where}"

        engine = create_engine(connection_url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        host = config.get("host", "localhost")
        port = config.get("port", 5432)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        schema = config.get("schema", "public")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")

        connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_url, pool_pre_ping=True)
        
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, schema=schema, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 5432)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")

            if not all([host, database, username, password]):
                return {"success": False, "error": "Missing required credentials"}

            connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
            
            with engine.connect() as conn:
                result = conn.execute(text("SELECT version()"))
                version = result.fetchone()[0]
            
            return {"success": True, "message": f"Successfully connected to PostgreSQL"}
        except Exception as e:
            logger.error(f"PostgreSQL connection test failed: {e}")
            return {"success": False, "error": str(e)}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 5432)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")
            if not all([host, database, username, password]):
                return []
            connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
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

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        host = config.get("host", "localhost")
        port = config.get("port", 3306)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")
        if not query and not table:
            raise ValueError("query or table is required")

        connection_url = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
        
        if not query:
            query = f"SELECT * FROM {table}"
            if where:
                query = f"{query} WHERE {where}"

        engine = create_engine(connection_url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        host = config.get("host", "localhost")
        port = config.get("port", 3306)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")

        connection_url = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_url, pool_pre_ping=True)
        
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 3306)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")

            if not all([host, database, username, password]):
                return {"success": False, "error": "Missing required credentials"}

            connection_url = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
            
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            return {"success": True, "message": f"Successfully connected to MySQL database '{database}'"}
        except Exception as e:
            logger.error(f"MySQL connection test failed: {e}")
            return {"success": False, "error": str(e)}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 3306)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")
            if not all([host, database, username, password]):
                return []
            connection_url = f"mysql+pymysql://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
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

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        host = config.get("host", "localhost")
        port = config.get("port", 1433)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")
        if not query and not table:
            raise ValueError("query or table is required")

        connection_url = f"mssql+pymssql://{username}:{password}@{host}:{port}/{database}"
        
        if not query:
            query = f"SELECT * FROM {table}"
            if where:
                query = f"{query} WHERE {where}"

        engine = create_engine(connection_url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        host = config.get("host", "localhost")
        port = config.get("port", 1433)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")

        connection_url = f"mssql+pymssql://{username}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_url, pool_pre_ping=True)
        
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 1433)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")

            if not all([host, database, username, password]):
                return {"success": False, "error": "Missing required credentials"}

            connection_url = f"mssql+pymssql://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"timeout": 5})
            
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            return {"success": True, "message": f"Successfully connected to SQL Server database '{database}'"}
        except Exception as e:
            logger.error(f"SQL Server connection test failed: {e}")
            return {"success": False, "error": str(e)}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 1433)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")
            if not all([host, database, username, password]):
                return []
            connection_url = f"mssql+pymssql://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"timeout": 5})
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

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        host = config.get("host", "localhost")
        port = config.get("port", 1521)
        service_name = config.get("service_name")
        sid = config.get("sid")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not all([host, username, password]):
            raise ValueError("host, username, and password are required")
        if not service_name and not sid:
            raise ValueError("service_name or sid is required")
        if not query and not table:
            raise ValueError("query or table is required")

        if service_name:
            dsn = f"{host}:{port}/{service_name}"
        else:
            dsn = f"{host}:{port}/{sid}"
        
        connection_url = f"oracle+oracledb://{username}:{password}@{dsn}"
        
        if not query:
            query = f"SELECT * FROM {table}"
            if where:
                query = f"{query} WHERE {where}"

        engine = create_engine(connection_url, pool_pre_ping=True, thick_mode=False)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
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

        if service_name:
            dsn = f"{host}:{port}/{service_name}"
        else:
            dsn = f"{host}:{port}/{sid}"
        
        connection_url = f"oracle+oracledb://{username}:{password}@{dsn}"
        engine = create_engine(connection_url, pool_pre_ping=True, thick_mode=False)
        
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 1521)
            service_name = config.get("service_name")
            sid = config.get("sid")
            username = config.get("username")
            password = config.get("password")

            if not all([host, username, password]):
                return {"success": False, "error": "Missing required credentials"}
            if not service_name and not sid:
                return {"success": False, "error": "service_name or sid is required"}

            if service_name:
                dsn = f"{host}:{port}/{service_name}"
            else:
                dsn = f"{host}:{port}/{sid}"
            
            connection_url = f"oracle+oracledb://{username}:{password}@{dsn}"
            engine = create_engine(connection_url, pool_pre_ping=True, thick_mode=False)
            
            with engine.connect() as conn:
                conn.execute(text("SELECT 1 FROM DUAL"))
            
            return {"success": True, "message": f"Successfully connected to Oracle database at {host}"}
        except Exception as e:
            logger.error(f"Oracle connection test failed: {e}")
            return {"success": False, "error": str(e)}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            host = config.get("host", "localhost")
            port = config.get("port", 1521)
            service_name = config.get("service_name")
            sid = config.get("sid")
            username = config.get("username")
            password = config.get("password")
            if not all([host, username, password]) or not (service_name or sid):
                return []
            dsn = f"{host}:{port}/{service_name or sid}"
            connection_url = f"oracle+oracledb://{username}:{password}@{dsn}"
            engine = create_engine(connection_url, pool_pre_ping=True, thick_mode=False)
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

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        file_path = config.get("file_path")
        query = config.get("query")
        table = config.get("table")
        where = config.get("where")

        if not file_path:
            raise ValueError("file_path is required")
        if not query and not table:
            raise ValueError("query or table is required")

        connection_url = f"sqlite:///{file_path}"
        if not query:
            query = f"SELECT * FROM {table}"
            if where:
                query = f"{query} WHERE {where}"

        engine = create_engine(connection_url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            file_path = config.get("file_path")
            if not file_path:
                return {"success": False, "error": "file_path is required"}
            connection_url = f"sqlite:///{file_path}"
            engine = create_engine(connection_url, pool_pre_ping=True)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return {"success": True, "message": f"Successfully connected to SQLite database '{file_path}'"}
        except Exception as e:
            logger.error(f"SQLite connection test failed: {e}")
            return {"success": False, "error": str(e)}

    def list_tables(self, config: Dict[str, Any]) -> list:
        try:
            file_path = config.get("file_path")
            if not file_path:
                return []
            connection_url = f"sqlite:///{file_path}"
            engine = create_engine(connection_url, pool_pre_ping=True)
            with engine.connect() as conn:
                result = conn.execute(text(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
                ))
                return [{"schema": "main", "table": r[0], "row_count": 0} for r in result.fetchall()]
        except Exception as e:
            logger.error(f"SQLite list_tables failed: {e}")
            return []


class MongoDBConnector:
    """MongoDB connector using PyMongo."""
    name = "mongodb"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        try:
            from pymongo import MongoClient
        except ImportError:
            raise ImportError("pymongo is required for MongoDB connector")

        host = config.get("host", "localhost")
        port = config.get("port", 27017)
        database = config.get("database")
        collection = config.get("collection")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query", {})
        limit = config.get("limit", 1000)

        if not all([database, collection]):
            raise ValueError("database and collection are required")

        # Build connection string
        if username and password:
            connection_url = f"mongodb://{username}:{password}@{host}:{port}/{database}"
        else:
            connection_url = f"mongodb://{host}:{port}/{database}"

        client = MongoClient(connection_url, serverSelectionTimeoutMS=5000)
        db = client[database]
        coll = db[collection]
        
        # Query documents
        cursor = coll.find(query).limit(limit)
        data = list(cursor)
        client.close()
        
        return pd.DataFrame(data)

    def write(self, config: Dict[str, Any], rows: list[dict]) -> int:
        try:
            from pymongo import MongoClient
        except ImportError:
            raise ImportError("pymongo is required for MongoDB connector")

        host = config.get("host", "localhost")
        port = config.get("port", 27017)
        database = config.get("database")
        collection = config.get("collection")
        username = config.get("username")
        password = config.get("password")

        if not all([database, collection]):
            raise ValueError("database and collection are required")

        if username and password:
            connection_url = f"mongodb://{username}:{password}@{host}:{port}/{database}"
        else:
            connection_url = f"mongodb://{host}:{port}/{database}"

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
            host = config.get("host", "localhost")
            port = config.get("port", 27017)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")

            if not database:
                return {"success": False, "error": "database is required"}

            if username and password:
                connection_url = f"mongodb://{username}:{password}@{host}:{port}/{database}"
            else:
                connection_url = f"mongodb://{host}:{port}/{database}"

            client = MongoClient(connection_url, serverSelectionTimeoutMS=5000)
            client.server_info()  # Force connection
            client.close()
            
            return {"success": True, "message": f"Successfully connected to MongoDB database '{database}'"}
        except Exception as e:
            logger.error(f"MongoDB connection test failed: {e}")
            return {"success": False, "error": str(e)}


# ===========================================
# CLOUD DATA WAREHOUSE CONNECTORS
# ===========================================

class SnowflakeConnector:
    """Snowflake Data Warehouse connector."""
    name = "snowflake"

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

        conn = snowflake.connector.connect(
            account=account,
            user=username,
            password=password,
            warehouse=warehouse,
            database=database,
            schema=schema
        )

        if mode == "replace":
            cursor = conn.cursor()
            cursor.execute(f"TRUNCATE TABLE IF EXISTS {table}")
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
            return {"success": False, "error": str(e)}


class BigQueryConnector:
    """Google BigQuery connector."""
    name = "bigquery"

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
            return {"success": False, "error": str(e)}


class RedshiftConnector:
    """Amazon Redshift connector (uses PostgreSQL driver)."""
    name = "redshift"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        host = config.get("host")
        port = config.get("port", 5439)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query")
        table = config.get("table")
        schema = config.get("schema", "public")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")
        if not query and not table:
            raise ValueError("query or table is required")

        connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
        
        if not query:
            query = f"SELECT * FROM {schema}.{table}"

        engine = create_engine(connection_url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        host = config.get("host")
        port = config.get("port", 5439)
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        schema = config.get("schema", "public")

        if not all([host, database, username, password]):
            raise ValueError("host, database, username, and password are required")

        connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
        engine = create_engine(connection_url, pool_pre_ping=True)
        
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, schema=schema, if_exists=if_exists, index=False, method="multi")
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            host = config.get("host")
            port = config.get("port", 5439)
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")

            if not all([host, database, username, password]):
                return {"success": False, "error": "Missing required credentials"}

            connection_url = f"postgresql+psycopg://{username}:{password}@{host}:{port}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"connect_timeout": 5})
            
            with engine.connect() as conn:
                result = conn.execute(text("SELECT version()"))
                version = result.fetchone()[0]
            
            return {"success": True, "message": f"Successfully connected to Redshift"}
        except Exception as e:
            logger.error(f"Redshift connection test failed: {e}")
            return {"success": False, "error": str(e)}


class AzureSynapseConnector:
    """Azure Synapse Analytics connector (uses SQL Server driver)."""
    name = "azure-sql"

    def read(self, config: Dict[str, Any]) -> pd.DataFrame:
        server = config.get("server")  # e.g., myserver.database.windows.net
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        query = config.get("query")
        table = config.get("table")
        schema = config.get("schema", "dbo")

        if not all([server, database, username, password]):
            raise ValueError("server, database, username, and password are required")
        if not query and not table:
            raise ValueError("query or table is required")

        connection_url = f"mssql+pymssql://{username}:{password}@{server}/{database}"
        
        if not query:
            query = f"SELECT * FROM {schema}.{table}"

        engine = create_engine(connection_url, pool_pre_ping=True)
        with engine.connect() as conn:
            return pd.read_sql_query(text(query), conn)

    def write(self, config: Dict[str, Any], df: pd.DataFrame, table: str, mode: str = "append") -> int:
        server = config.get("server")
        database = config.get("database")
        username = config.get("username")
        password = config.get("password")
        schema = config.get("schema", "dbo")

        if not all([server, database, username, password]):
            raise ValueError("server, database, username, and password are required")

        connection_url = f"mssql+pymssql://{username}:{password}@{server}/{database}"
        engine = create_engine(connection_url, pool_pre_ping=True)
        
        if_exists = "append" if mode == "append" else "replace"
        df.to_sql(table, engine, schema=schema, if_exists=if_exists, index=False)
        return len(df)

    def test_connection(self, config: Dict[str, Any]) -> Dict[str, Any]:
        try:
            server = config.get("server")
            database = config.get("database")
            username = config.get("username")
            password = config.get("password")

            if not all([server, database, username, password]):
                return {"success": False, "error": "Missing required credentials"}

            connection_url = f"mssql+pymssql://{username}:{password}@{server}/{database}"
            engine = create_engine(connection_url, pool_pre_ping=True, connect_args={"timeout": 5})
            
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            
            return {"success": True, "message": f"Successfully connected to Azure Synapse database '{database}'"}
        except Exception as e:
            logger.error(f"Azure Synapse connection test failed: {e}")
            return {"success": False, "error": str(e)}


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
            return {"success": False, "error": str(e)}


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
