"""Seed an admin user + sample products (run `alembic upgrade head` first).

    ADMIN_EMAIL=a@b.com ADMIN_PASSWORD=... python seed.py
"""
import asyncio
import os
import sys
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app import models
from app.api.v1.admin import make_sku, slugify
from app.core.database import SessionLocal
from app.core.security import hash_password

U = "https://images.unsplash.com/photo-"
Z = {"S": 0, "M": 0, "L": 0, "XL": 0, "XXL": 0}
# (title, category, price, discount %, unsplash photo id, stock per size) - newest first
SAMPLES = [
    ("Noor Embroidered Tiered Kurti", "Kurti", 1850, 0, "1760287363878-1a09af715b80", {"S": 3, "M": 6, "L": 5, "XL": 2, "XXL": 1}),
    ("Noir Sleeveless Shell Top", "Western", 1350, 0, "1519554318711-aaf73ece6ff9", Z),
    ("Mocha Relaxed Fit Shirt", "Western", 1450, 0, "1776838103951-993ff1ffc916", {"S": 4, "M": 7, "L": 6, "XL": 3, "XXL": 0}),
    ("Blossom Floral Sundress | Limited Edition", "Western", 2250, 25, "1585129357576-aa4da9a68970", {"S": 2, "M": 4, "L": 3, "XL": 1, "XXL": 0}),
    ("Paisley Night Long Kurti", "Kurti", 2150, 20, "1760287364219-160c234ded00", {"S": 2, "M": 0, "L": 3, "XL": 1, "XXL": 0}),
    ("Rose Lattice Two-Piece Set", "Three Piece", 2890, 0, "1764271692129-767f58952c26", {"S": 2, "M": 3, "L": 2, "XL": 2, "XXL": 1}),
    ("Rose Garden Embellished Gown", "Gowns", 3450, 40, "1735553816887-95a2657d5fd8", {"S": 1, "M": 2, "L": 2, "XL": 1, "XXL": 0}),
    ("Mehrun Embroidered Red Kurti", "Kurti", 3250, 0, "1760287364328-e30221615f2e", {"S": 1, "M": 3, "L": 4, "XL": 2, "XXL": 1}),
    ("Ivory Lace Sleeveless Dress", "Western", 1690, 30, "1591221662157-6f62de5508eb", {"S": 9, "M": 12, "L": 10, "XL": 6, "XXL": 3}),
    ("Heritage Tweed Shift Dress", "Western", 1650, 0, "1772909566980-b06731149511", {"S": 3, "M": 4, "L": 2, "XL": 1, "XXL": 0}),
    ("Tan Leather Shoulder Bag", "Accessories", 2450, 20, "1691480150204-66dd1eb77391", {"Free Size": 8}),
    ("Gold Drop Jhumka Earrings", "Accessories", 890, 0, "1705326453282-e4e1b78f5fea", {"Free Size": 18}),
]


async def main() -> None:
    async with SessionLocal() as db:
        email, pw = os.environ.get("ADMIN_EMAIL"), os.environ.get("ADMIN_PASSWORD")
        if email and pw and not await db.scalar(select(models.User).where(models.User.email == email.lower())):
            db.add(models.User(name="Admin", email=email.lower(), password_hash=hash_password(pw),
                               auth_provider=models.AuthProvider.email, role=models.Role.admin))
            print("admin created:", email)
        if not await db.scalar(select(models.Product).limit(1)):
            now = datetime.now(timezone.utc)
            for i, (title, cat, price, disc, photo, sizes) in enumerate(SAMPLES):
                slug = slugify(title)
                db.add(models.Product(
                    title=title, slug=slug, category=cat, base_price=Decimal(price), discount_percent=Decimal(disc),
                    images=[U + photo], created_at=now - timedelta(minutes=i),
                    variants=[models.ProductVariant(size=s, stock_quantity=q, sku=make_sku(slug, s)) for s, q in sizes.items()],
                ))
            print("sample products added")
        await db.commit()


if __name__ == "__main__":
    asyncio.run(main())
