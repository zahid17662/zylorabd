"""admin panel as Postgres functions (Supabase RPC): products, stock, orders, status changes, stats

Statements live in alembic/sql/0007_admin_rpc.sql, separated by "-- @@" (asyncpg runs one statement at a
time). Idempotent (CREATE OR REPLACE). Every admin_* function refuses anyone but a password-signed-in admin;
the EXECUTE grants are skipped on databases without the Supabase 'anon' role.
"""
from pathlib import Path

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0007_admin_rpc.sql"

_FUNCS = (
    "admin_list_products()", "admin_save_product(uuid, jsonb)", "admin_update_stock(uuid, jsonb)",
    "admin_delete_product(uuid)", "admin_list_orders(jsonb, int, int)", "admin_get_order(uuid)",
    "admin_set_order_status(uuid, text)", "admin_stats()", "zy_split(jsonb, text[])", "zy_admin_order_json(uuid)",
    "zy_product_json(uuid)", "zy_require_admin()", "zy_is_admin()",
)


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    for f in _FUNCS:
        op.execute(f"DROP FUNCTION IF EXISTS public.{f}")
