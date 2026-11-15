"""cash-on-delivery checkout as a Postgres function (Supabase RPC), idempotency key on orders

Statements live in alembic/sql/0006_place_order.sql, separated by "-- @@" (asyncpg runs one statement at a
time). Idempotent. The EXECUTE grant is skipped on databases without the Supabase 'authenticated' role.
"""
from pathlib import Path

from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0006_place_order.sql"


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.place_order(jsonb, jsonb, text, text, jsonb)")
    op.execute("DROP FUNCTION IF EXISTS public.zy_order_json(uuid)")
    op.execute("DROP FUNCTION IF EXISTS public.zy_final_price(numeric, numeric)")
    # the column, index and shop_settings table are kept: they hold data
