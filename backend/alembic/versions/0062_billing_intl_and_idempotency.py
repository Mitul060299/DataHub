"""billing: international currency + webhook idempotency + indexes

* subscriptions.currency (default 'INR')
* payment_events.razorpay_event_id (UNIQUE) for webhook deduplication
* indexes on payment_events for invoice/payment lookups
* index on user_usage(period) for monthly analytics

Revision ID: 0062_billing_intl_and_idempotency
Revises: 0061_fix_remaining_uuid_columns
Create Date: 2026-04-27
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision = "0062_billing_intl_and_idempotency"
down_revision = "0061"
branch_labels = None
depends_on = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(c.get("name") == column_name for c in inspector.get_columns(table_name))


def _index_exists(inspector, table_name: str, index_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return any(ix.get("name") == index_name for ix in inspector.get_indexes(table_name))


def _constraint_exists(inspector, table_name: str, constraint_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    uniques = inspector.get_unique_constraints(table_name)
    return any(uc.get("name") == constraint_name for uc in uniques)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    # 1) subscriptions.currency
    if _table_exists(inspector, "subscriptions") and not _column_exists(inspector, "subscriptions", "currency"):
        op.add_column(
            "subscriptions",
            sa.Column("currency", sa.Text(), nullable=False, server_default="INR"),
        )

    # 2) payment_events.razorpay_event_id + unique index
    if _table_exists(inspector, "payment_events"):
        if not _column_exists(inspector, "payment_events", "razorpay_event_id"):
            op.add_column(
                "payment_events",
                sa.Column("razorpay_event_id", sa.Text(), nullable=True),
            )
        if not _index_exists(inspector, "payment_events", "uq_payment_events_razorpay_event_id"):
            op.create_index(
                "uq_payment_events_razorpay_event_id",
                "payment_events",
                ["razorpay_event_id"],
                unique=True,
                postgresql_where=sa.text("razorpay_event_id IS NOT NULL"),
            )

        # Refresh inspector after column add.
        inspector = inspect(bind)

        # Lookup indexes for invoice/payment history pages.
        if not _index_exists(inspector, "payment_events", "ix_payment_events_user_id"):
            op.create_index("ix_payment_events_user_id", "payment_events", ["user_id"])
        if not _index_exists(inspector, "payment_events", "ix_payment_events_subscription_id"):
            op.create_index("ix_payment_events_subscription_id", "payment_events", ["subscription_id"])
        if not _index_exists(inspector, "payment_events", "ix_payment_events_razorpay_payment_id"):
            op.create_index("ix_payment_events_razorpay_payment_id", "payment_events", ["razorpay_payment_id"])
        if not _index_exists(inspector, "payment_events", "ix_payment_events_created_at"):
            op.create_index("ix_payment_events_created_at", "payment_events", ["created_at"])

    # 3) user_usage(period) index for analytics & cleanup
    if _table_exists(inspector, "user_usage") and not _index_exists(inspector, "user_usage", "ix_user_usage_period"):
        op.create_index("ix_user_usage_period", "user_usage", ["period"])


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, "user_usage") and _index_exists(inspector, "user_usage", "ix_user_usage_period"):
        op.drop_index("ix_user_usage_period", table_name="user_usage")

    if _table_exists(inspector, "payment_events"):
        for ix in (
            "ix_payment_events_created_at",
            "ix_payment_events_razorpay_payment_id",
            "ix_payment_events_subscription_id",
            "ix_payment_events_user_id",
            "uq_payment_events_razorpay_event_id",
        ):
            if _index_exists(inspector, "payment_events", ix):
                op.drop_index(ix, table_name="payment_events")
        if _column_exists(inspector, "payment_events", "razorpay_event_id"):
            op.drop_column("payment_events", "razorpay_event_id")

    if _table_exists(inspector, "subscriptions") and _column_exists(inspector, "subscriptions", "currency"):
        op.drop_column("subscriptions", "currency")
