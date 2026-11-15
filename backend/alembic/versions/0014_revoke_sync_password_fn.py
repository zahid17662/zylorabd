"""close direct EXECUTE on the password-sync trigger function (the trigger itself keeps working)"""
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AND to_regprocedure('public.zy_sync_password_from_auth()') IS NOT NULL THEN "
        "REVOKE ALL ON FUNCTION public.zy_sync_password_from_auth() FROM PUBLIC, anon, authenticated; END IF; END $$"
    )


def downgrade() -> None:
    pass
