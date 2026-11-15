"""customer order tracking: status history (trigger), my_orders() and track_order()

Statements live in alembic/sql/0010_order_tracking.sql, separated by marker lines. Idempotent; the EXECUTE grants are
skipped on databases without the Supabase 'anon' role.
"""
from pathlib import Path

from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0010_order_tracking.sql"


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.track_order(text, text)")
    op.execute("DROP FUNCTION IF EXISTS public.my_orders()")
    op.execute("DROP FUNCTION IF EXISTS public.zy_customer_order_json(uuid, boolean)")
    op.execute("DROP TRIGGER IF EXISTS zy_log_order_status ON public.orders")
    op.execute("DROP FUNCTION IF EXISTS public.zy_log_order_status()")
    # the history and failure tables are kept: they hold data
