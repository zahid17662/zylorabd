"""baseline schema

Idempotent: creates any missing tables/enums, leaves existing ones untouched, so it works both on a
fresh database and on the Neon database that was created before Alembic was introduced.
Later changes should be generated with `alembic revision --autogenerate -m "..."`.
"""
from alembic import op

import app.models  # noqa: F401
from app.core.database import Base

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    Base.metadata.create_all(bind=op.get_bind(), checkfirst=True)


def downgrade() -> None:
    raise NotImplementedError("Baseline cannot be downgraded; drop the database objects manually.")
