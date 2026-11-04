"""composite index for the admin order log

Idempotent: a fresh database already gets this index from the baseline (create_all reads the
current models), so this only creates it where it is missing.
"""
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_orders_admin_filter "
        "ON orders (order_status, payment_method, order_source, created_at)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_orders_admin_filter")
