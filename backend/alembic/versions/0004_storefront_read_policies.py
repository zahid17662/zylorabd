"""read-only RLS policies so the storefront can list products straight from Supabase

Idempotent and skipped on databases without the Supabase 'anon' role. The backend's own connection
is unaffected; anon/authenticated get SELECT only (no write policies exist).
"""
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

_UP = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    DROP POLICY IF EXISTS storefront_read_products ON public.products;
    CREATE POLICY storefront_read_products ON public.products
      FOR SELECT TO anon, authenticated USING (is_active);

    DROP POLICY IF EXISTS storefront_read_variants ON public.product_variants;
    CREATE POLICY storefront_read_variants ON public.product_variants
      FOR SELECT TO anon, authenticated
      USING (EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.is_active));

    REVOKE ALL ON public.product_variants FROM anon, authenticated;
    GRANT SELECT (id, product_id, size, stock_quantity) ON public.product_variants TO anon, authenticated;
    REVOKE ALL ON public.products FROM anon, authenticated;
    GRANT SELECT ON public.products TO anon, authenticated;
  END IF;
END
$$;
"""

_DOWN = """
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    DROP POLICY IF EXISTS storefront_read_variants ON public.product_variants;
    DROP POLICY IF EXISTS storefront_read_products ON public.products;
  END IF;
END
$$;
"""


def upgrade() -> None:
    op.execute(_UP)


def downgrade() -> None:
    op.execute(_DOWN)
