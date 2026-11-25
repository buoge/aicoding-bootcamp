"""Current canonical 63-table single-source business model."""

from alembic import op
from compass_data_seed.schema import ddl

revision = "retail_0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.get_bind().exec_driver_sql(ddl().replace("BEGIN;", "").replace("COMMIT;", ""))


def downgrade():
    raise RuntimeError(
        "Immutable retail releases use manifest rollback; destructive downgrade disabled"
    )
