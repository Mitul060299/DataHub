"""Fix visualization tables column types

Revision ID: 0018_fix_visualization_column_types
Revises: 0017_visualization_tables
Create Date: 2025-02-16 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '0018_fix_visualization_column_types'
down_revision = '0017_visualization_tables'
branch_labels = None
depends_on = None


def _quote_ident(value: str) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def _get_dependent_policy_snapshots(
    bind: sa.engine.Connection,
    table_name: str,
    column_names: list[str],
) -> list[dict[str, str]]:
    if bind.dialect.name != "postgresql":
        return []

    filtered_columns = [column for column in column_names if column]
    if not filtered_columns:
        return []

    stmt = sa.text(
        """
        WITH target_table AS (
            SELECT c.oid AS table_oid
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema()
              AND c.relname = :table_name
        )
        SELECT
            p.schemaname,
            p.tablename,
            p.policyname,
            format(
                'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
                p.policyname,
                p.schemaname,
                p.tablename,
                p.permissive,
                p.cmd,
                COALESCE(
                    (
                        SELECT string_agg(
                            CASE
                                WHEN role_name = 'public' THEN 'PUBLIC'
                                ELSE quote_ident(role_name)
                            END,
                            ', '
                        )
                        FROM unnest(p.roles) AS role_name
                    ),
                    'PUBLIC'
                ),
                CASE
                    WHEN p.qual IS NOT NULL THEN format(' USING (%s)', p.qual)
                    ELSE ''
                END,
                CASE
                    WHEN p.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', p.with_check)
                    ELSE ''
                END
            ) AS create_sql
        FROM pg_policies p
        JOIN pg_namespace policy_ns
          ON policy_ns.nspname = p.schemaname
        JOIN pg_class policy_table
          ON policy_table.relnamespace = policy_ns.oid
         AND policy_table.relname = p.tablename
        JOIN pg_policy pol
          ON pol.polrelid = policy_table.oid
         AND pol.polname = p.policyname
        WHERE p.schemaname = current_schema()
          AND EXISTS (
              SELECT 1
              FROM pg_depend dep
              JOIN target_table tt ON tt.table_oid = dep.refobjid
              JOIN pg_attribute attr
                ON attr.attrelid = dep.refobjid
               AND attr.attnum = dep.refobjsubid
              WHERE dep.classid = 'pg_policy'::regclass
                AND dep.objid = pol.oid
                AND dep.refclassid = 'pg_class'::regclass
                AND attr.attname IN :column_names
          )
        ORDER BY p.tablename, p.policyname
        """
    ).bindparams(sa.bindparam("column_names", expanding=True))

    rows = bind.execute(
        stmt,
        {
            "table_name": table_name,
            "column_names": filtered_columns,
        },
    ).mappings()
    return [dict(row) for row in rows]


def _drop_table_policies(policies: list[dict[str, str]]) -> None:
    for policy in policies:
        table_name = (policy.get("tablename") or "").strip()
        if not table_name:
            continue
        schema_name = (policy.get("schemaname") or "").strip()
        target = (
            f"{_quote_ident(schema_name)}.{_quote_ident(table_name)}"
            if schema_name
            else _quote_ident(table_name)
        )
        op.execute(
            sa.text(
                f"DROP POLICY IF EXISTS {_quote_ident(policy['policyname'])} "
                f"ON {target}"
            )
        )


def _recreate_table_policies(policies: list[dict[str, str]]) -> None:
    for policy in policies:
        create_sql = (policy.get("create_sql") or "").strip()
        if create_sql:
            op.execute(sa.text(create_sql))


def _alter_with_policy_handling(
    table_name: str,
    alterations: list[dict[str, object]],
) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name):
        return

    # Skip alterations targeting columns that no longer exist
    # (e.g. workspace_id was dropped by a later migration / startup DDL).
    existing_cols = {c["name"] for c in inspector.get_columns(table_name)}
    alterations = [
        a for a in alterations
        if str(a.get("column_name") or "").strip() in existing_cols
    ]
    if not alterations:
        return

    column_names: list[str] = []
    for alter in alterations:
        column_name = str(alter.get("column_name") or "").strip()
        if column_name:
            column_names.append(column_name)

    policies = _get_dependent_policy_snapshots(bind, table_name, column_names)
    if policies:
        _drop_table_policies(policies)

    for alter in alterations:
        op.alter_column(table_name, **alter)

    if policies:
        _recreate_table_policies(policies)


def upgrade():
    _alter_with_policy_handling(
        'viz_dashboard_themes',
        [
            {
                'column_name': 'user_id',
                'existing_type': sa.Integer(),
                'type_': sa.String(),
                'existing_nullable': False,
            },
            {
                'column_name': 'workspace_id',
                'existing_type': sa.Integer(),
                'type_': sa.String(),
                'existing_nullable': True,
            },
        ],
    )

    _alter_with_policy_handling(
        'viz_dashboards',
        [
            {
                'column_name': 'user_id',
                'existing_type': sa.Integer(),
                'type_': sa.String(),
                'existing_nullable': False,
            },
            {
                'column_name': 'workspace_id',
                'existing_type': sa.Integer(),
                'type_': sa.String(),
                'existing_nullable': False,
            },
        ],
    )


def downgrade():
    _alter_with_policy_handling(
        'viz_dashboards',
        [
            {
                'column_name': 'workspace_id',
                'existing_type': sa.String(),
                'type_': sa.Integer(),
                'existing_nullable': False,
            },
            {
                'column_name': 'user_id',
                'existing_type': sa.String(),
                'type_': sa.Integer(),
                'existing_nullable': False,
            },
        ],
    )

    _alter_with_policy_handling(
        'viz_dashboard_themes',
        [
            {
                'column_name': 'workspace_id',
                'existing_type': sa.String(),
                'type_': sa.Integer(),
                'existing_nullable': True,
            },
            {
                'column_name': 'user_id',
                'existing_type': sa.String(),
                'type_': sa.Integer(),
                'existing_nullable': False,
            },
        ],
    )
