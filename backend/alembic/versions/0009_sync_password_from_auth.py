"""copy a password changed in Supabase Auth to public.users (trigger on auth.users)

Statements live in alembic/sql/0009_sync_password_from_auth.sql, separated by marker lines. Idempotent; the trigger
is skipped on databases without the Supabase 'auth' schema.
"""
from pathlib import Path

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0009_sync_password_from_auth.sql"


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    op.execute("DO $$ BEGIN IF to_regclass('auth.users') IS NOT NULL THEN DROP TRIGGER IF EXISTS zy_sync_password ON auth.users; END IF; END $$")
    op.execute("DROP FUNCTION IF EXISTS public.zy_sync_password_from_auth()")
