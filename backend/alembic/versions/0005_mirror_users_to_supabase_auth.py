"""mirror existing users into Supabase Auth (same id, same bcrypt hash)

Idempotent; skipped on databases that have no Supabase `auth` schema (CI / plain Postgres). The API keeps
mirroring new and changed users at runtime (app.services.supabase_auth.sync_user).
"""
from alembic import op
from sqlalchemy import text

from app.services.supabase_auth import SYNC_SQL

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    has_auth = conn.execute(text(
        "SELECT to_regclass('auth.users') IS NOT NULL AND to_regclass('auth.identities') IS NOT NULL"
    )).scalar()
    if not has_auth:
        return
    for stmt in SYNC_SQL:
        conn.execute(text(stmt), {"uid": None})


def downgrade() -> None:
    pass  # the mirrored rows are harmless; removing them could lock people out of Supabase sign-in
