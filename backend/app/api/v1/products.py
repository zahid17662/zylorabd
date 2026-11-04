import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models import Product
from app.schemas import ProductDetailOut, ProductListOut, ProductOut, VariantOut

router = APIRouter(prefix="/products", tags=["products"])
LOW_STOCK = 3


def to_out(p: Product) -> dict:
    return {
        **{k: getattr(p, k) for k in (
            "id", "title", "slug", "category", "base_price", "discount_percent", "final_price",
            "images", "video_url", "is_active",
        )},
        "in_stock": any(v.stock_quantity > 0 for v in p.variants),
    }


def to_detail(p: Product) -> ProductDetailOut:
    return ProductDetailOut(
        **to_out(p),
        description=p.description,
        variants=[
            VariantOut(
                id=v.id, size=v.size, sku=v.sku, stock_quantity=v.stock_quantity,
                in_stock=v.stock_quantity > 0, low_stock=0 < v.stock_quantity <= LOW_STOCK,
            )
            for v in p.variants
        ],
    )


@router.get("", response_model=ProductListOut)
async def list_products(
    db: AsyncSession = Depends(get_db),
    category: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    min_price: float | None = Query(default=None, ge=0),
    max_price: float | None = Query(default=None, ge=0),
    sort: str = Query(default="newest", pattern="^(newest|price_asc|price_desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
):
    stmt = select(Product).where(Product.is_active.is_(True))
    if category:
        stmt = stmt.where(Product.category == category)
    if q:
        stmt = stmt.where(Product.title.ilike(f"%{q}%"))
    if min_price is not None:
        stmt = stmt.where(Product.base_price >= min_price)
    if max_price is not None:
        stmt = stmt.where(Product.base_price <= max_price)
    total = await db.scalar(select(func.count()).select_from(stmt.subquery()))
    order = {"newest": Product.created_at.desc(), "price_asc": Product.base_price.asc(), "price_desc": Product.base_price.desc()}[sort]
    rows = await db.scalars(
        stmt.options(selectinload(Product.variants)).order_by(order).offset((page - 1) * page_size).limit(page_size)
    )
    return ProductListOut(items=[to_detail(p) for p in rows], total=total or 0, page=page, page_size=page_size)


@router.get("/{product_id}", response_model=ProductDetailOut)
async def get_product(product_id: str, db: AsyncSession = Depends(get_db)):
    """Accepts a UUID or a slug."""
    cond = Product.slug == product_id
    try:
        cond = Product.id == uuid.UUID(product_id)
    except ValueError:
        pass
    p = await db.scalar(
        select(Product).where(cond, Product.is_active.is_(True)).options(selectinload(Product.variants))
    )
    if p is None:
        raise HTTPException(404, "Product not found")
    return to_detail(p)
