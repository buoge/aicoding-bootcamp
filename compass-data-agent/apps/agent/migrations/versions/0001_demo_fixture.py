"""Initial synthetic demo fixture. Business tables arrive with their domain features."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "demo_daily_sales",
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("revenue_minor", sa.Integer(), nullable=False),
        sa.Column("orders", sa.Integer(), nullable=False),
        sa.CheckConstraint("revenue_minor >= 0", name="ck_demo_revenue_nonnegative"),
        sa.CheckConstraint("orders >= 0", name="ck_demo_orders_nonnegative"),
    )


def downgrade() -> None:
    op.drop_table("demo_daily_sales")
