"""admin_whoami(): lets the media-presign Edge Function confirm the caller is an admin

Statements live in alembic/sql/0008_admin_whoami.sql, separated by marker lines. Idempotent.
"""
from pathlib import Path

from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0008_admin_whoami.sql"


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS public.admin_whoami()")
