"""customer order JSON includes each item's product image

The statement lives in alembic/sql/0012_customer_order_images.sql. Idempotent (CREATE OR REPLACE).
"""
from pathlib import Path

from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0012_customer_order_images.sql"


def upgrade() -> None:
    op.get_bind().exec_driver_sql(_SQL.read_text().strip())


def downgrade() -> None:
    pass  # the previous definition (0010) is a subset; leaving this one in place is harmless
