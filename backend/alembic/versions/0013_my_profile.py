"""my_profile(): the signed-in user's profile from Supabase (no API server needed)

Statements live in alembic/sql/0013_my_profile.sql, separated by marker lines. Idempotent.
"""
from pathlib import Path

from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0013_my_profile.sql"


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.my_profile()")
