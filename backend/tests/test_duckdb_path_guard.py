import unittest

from app.services.duckdb.path_guard import DuckDBPathGuardError, extract_duckdb_paths, guard_duckdb_sql_paths


class DuckDBPathGuardTests(unittest.TestCase):
    def test_allows_whitelisted_literal_path(self) -> None:
        path = "https://example-bucket.s3.amazonaws.com/workspace-a/dataset-x.parquet?token=abc"
        sql = f"SELECT * FROM read_parquet('{path}') LIMIT 10"
        guarded_sql = guard_duckdb_sql_paths(sql, allowed_paths=[path])
        self.assertEqual(guarded_sql, sql)

    def test_allows_whitelisted_prefix(self) -> None:
        sql = "SELECT * FROM read_parquet('s3://tenant-a/datasets/one.parquet')"
        guarded_sql = guard_duckdb_sql_paths(sql, allowed_prefixes=["s3://tenant-a"])
        self.assertEqual(guarded_sql, sql)

    def test_blocks_unapproved_literal_path(self) -> None:
        sql = "SELECT * FROM read_parquet('s3://tenant-b/datasets/two.parquet')"
        with self.assertRaises(DuckDBPathGuardError):
            guard_duckdb_sql_paths(sql, allowed_prefixes=["s3://tenant-a"])

    def test_blocks_copy_statement(self) -> None:
        sql = "COPY (SELECT 1) TO 'local://tenant-a/export.parquet'"
        with self.assertRaises(DuckDBPathGuardError):
            guard_duckdb_sql_paths(sql, allowed_prefixes=["local://tenant-a"])

    def test_blocks_attach_statement(self) -> None:
        sql = "ATTACH 'local://tenant-a/other.duckdb'"
        with self.assertRaises(DuckDBPathGuardError):
            guard_duckdb_sql_paths(sql, allowed_prefixes=["local://tenant-a"])

    def test_blocks_non_literal_read_path_expression(self) -> None:
        sql = "SELECT * FROM read_parquet(concat('s3://tenant-a/', 'file.parquet'))"
        with self.assertRaises(DuckDBPathGuardError):
            guard_duckdb_sql_paths(sql, allowed_prefixes=["s3://tenant-a"])

    def test_extract_duckdb_paths(self) -> None:
        sql = "SELECT * FROM read_parquet('s3://tenant-a/file.parquet') UNION ALL SELECT * FROM read_csv('s3://tenant-a/file.csv')"
        paths = extract_duckdb_paths(sql)
        self.assertEqual(
            paths,
            [
                "s3://tenant-a/file.parquet",
                "s3://tenant-a/file.csv",
            ],
        )


if __name__ == "__main__":
    unittest.main()
