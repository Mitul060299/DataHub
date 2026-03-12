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


def _get_schema_policy_snapshots(bind: sa.engine.Connection) -> list[dict[str, str]]:
    if bind.dialect.name != "postgresql":
        return []

    rows = bind.execute(
        sa.text(
            """
            SELECT
                policyname,
                format(
                    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',
                    policyname,
                    schemaname,
                    tablename,
                    permissive,
                    cmd,
                    COALESCE(
                        (
                            SELECT string_agg(
                                CASE
                                    WHEN role_name = 'public' THEN 'PUBLIC'
                                    ELSE quote_ident(role_name)
                                END,
                                ', '
                            )
                            FROM unnest(roles) AS role_name
                        ),
                        'PUBLIC'
                    ),
                    CASE
                        WHEN qual IS NOT NULL THEN format(' USING (%s)', qual)
                        ELSE ''
                    END,
                    CASE
                        WHEN with_check IS NOT NULL THEN format(' WITH CHECK (%s)', with_check)
                        ELSE ''
                    END
                ) AS create_sql
            FROM pg_policies
            WHERE schemaname = current_schema()
            ORDER BY tablename, policyname
            """
        ),
    ).mappings()
    return [dict(row) for row in rows]


def _drop_schema_policies(policies: list[dict[str, str]]) -> None:
    for policy in policies:
        op.execute(
            sa.text(
                f"DROP POLICY IF EXISTS {_quote_ident(policy['policyname'])} "
                f"ON {_quote_ident(policy['schemaname'])}.{_quote_ident(policy['tablename'])}"
            )
        )


def _recreate_schema_policies(policies: list[dict[str, str]]) -> None:
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

    policies = _get_schema_policy_snapshots(bind)
    if policies:
        _drop_schema_policies(policies)

    for alter in alterations:
        op.alter_column(table_name, **alter)

    if policies:
        _recreate_schema_policies(policies)


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
