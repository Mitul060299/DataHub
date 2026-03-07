"""add billing tables

Revision ID: 0025_billing_tables
Revises: 0024_feedback_table
Create Date: 2026-03-07
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect
from sqlalchemy.dialects import postgresql


revision = "0025_billing_tables"
down_revision = "0024_feedback_table"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(column.get("name") == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if not _table_exists(inspector, "subscriptions"):
        op.create_table(
            "subscriptions",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("razorpay_subscription_id", sa.Text(), nullable=False, unique=True),
            sa.Column("razorpay_plan_id", sa.Text(), nullable=False),
            sa.Column("plan", sa.Text(), nullable=False),
            sa.Column("billing_cycle", sa.Text(), nullable=False),
            sa.Column("status", sa.Text(), nullable=False),
            sa.Column("current_start", sa.DateTime(timezone=True), nullable=True),
            sa.Column("current_end", sa.DateTime(timezone=True), nullable=True),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
            sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )

    if not _table_exists(inspector, "payment_events"):
        op.create_table(
            "payment_events",
            sa.Column("id", postgresql.UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
            sa.Column("user_id", sa.String(), nullable=True),
            sa.Column("subscription_id", sa.Text(), nullable=True),
            sa.Column("razorpay_payment_id", sa.Text(), nullable=True),
            sa.Column("razorpay_invoice_id", sa.Text(), nullable=True),
            sa.Column("event_type", sa.Text(), nullable=False),
            sa.Column("amount", sa.Integer(), nullable=True),
            sa.Column("currency", sa.Text(), nullable=False, server_default="INR"),
            sa.Column("status", sa.Text(), nullable=True),
            sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
            sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        )

    if _table_exists(inspector, "upgrade_requests"):
        op.drop_table("upgrade_requests")

    inspector = inspect(bind)

    if not _column_exists(inspector, "users", "razorpay_customer_id"):
        op.add_column("users", sa.Column("razorpay_customer_id", sa.Text(), nullable=True))

    if not _column_exists(inspector, "users", "subscription_id"):
        op.add_column("users", sa.Column("subscription_id", postgresql.UUID(as_uuid=False), nullable=True))

        inspector = inspect(bind)
        foreign_keys = inspector.get_foreign_keys("users") if _table_exists(inspector, "users") else []
        fk_exists = any(
            fk.get("constrained_columns") == ["subscription_id"] and fk.get("referred_table") == "subscriptions"
            for fk in foreign_keys
        )
        if not fk_exists and _table_exists(inspector, "subscriptions"):
            op.create_foreign_key(
                "fk_users_subscription_id_subscriptions",
                "users",
                "subscriptions",
                ["subscription_id"],
                ["id"],
            )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, "users") and _column_exists(inspector, "users", "subscription_id"):
        foreign_keys = inspector.get_foreign_keys("users")
        for foreign_key in foreign_keys:
            if foreign_key.get("constrained_columns") == ["subscription_id"]:
                if foreign_key.get("name"):
                    op.drop_constraint(foreign_key["name"], "users", type_="foreignkey")
        op.drop_column("users", "subscription_id")

    inspector = inspect(bind)
    if _table_exists(inspector, "users") and _column_exists(inspector, "users", "razorpay_customer_id"):
        op.drop_column("users", "razorpay_customer_id")

    inspector = inspect(bind)
    if _table_exists(inspector, "payment_events"):
        op.drop_table("payment_events")

    inspector = inspect(bind)
    if _table_exists(inspector, "subscriptions"):
        op.drop_table("subscriptions")
