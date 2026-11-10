"""add 'google' to the auth_provider enum

Idempotent. A fresh database already gets the value from the baseline (create_all reads the current
models), so this only matters for databases created before Google sign-in existed.
"""
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE cannot run inside a transaction block on older PostgreSQL versions.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE auth_provider ADD VALUE IF NOT EXISTS 'google'")


def downgrade() -> None:
    pass  # PostgreSQL cannot drop a single enum value; leaving it is harmless
