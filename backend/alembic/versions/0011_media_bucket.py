"""Supabase Storage bucket `media` + admin-only upload policy (and is_admin_session())

Statements live in alembic/sql/0011_media_bucket.sql, separated by marker lines. Idempotent and guarded: skipped
quietly on databases without Supabase Storage.
"""
from pathlib import Path

from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

_SQL = Path(__file__).resolve().parents[1] / "sql" / "0011_media_bucket.sql"


def upgrade() -> None:
    conn = op.get_bind()
    for stmt in _SQL.read_text().split("-- @@"):
        if stmt.strip():
            conn.exec_driver_sql(stmt.strip())


def downgrade() -> None:
    op.execute("DO $$ BEGIN IF to_regclass('storage.objects') IS NOT NULL THEN DROP POLICY IF EXISTS zy_media_admin_upload ON storage.objects; END IF; END $$")
    op.execute("DROP FUNCTION IF EXISTS public.is_admin_session()")
    # the bucket and its files are kept
