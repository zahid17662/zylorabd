"""Cloudflare R2 / S3 presigned upload URLs (the API never handles file bytes)."""
import uuid

import boto3
from botocore.config import Config as BotoConfig

from app.core.config import settings

MEDIA_TYPES = {
    "image/jpeg": ("jpg", 8), "image/png": ("png", 8), "image/webp": ("webp", 8),
    "video/mp4": ("mp4", 15), "video/webm": ("webm", 15),
}  # content type -> (extension, max MB)


class StorageNotConfigured(Exception):
    pass


class InvalidUpload(Exception):
    pass


def presign_put(content_type: str, size_bytes: int) -> dict:
    if not all((settings.storage_endpoint, settings.r2_access_key_id, settings.r2_secret_access_key,
                settings.r2_bucket, settings.r2_public_base_url)):
        raise StorageNotConfigured
    if content_type not in MEDIA_TYPES:
        raise InvalidUpload("Allowed types: JPEG, PNG, WebP images; MP4, WebM videos")
    ext, max_mb = MEDIA_TYPES[content_type]
    if size_bytes > max_mb * 1024 * 1024:
        raise InvalidUpload(f"File too large (max {max_mb} MB). Compress videos before uploading.")
    key = f"products/{uuid.uuid4().hex}.{ext}"
    cache = "public, max-age=31536000, immutable"
    s3 = boto3.client(
        "s3", endpoint_url=settings.storage_endpoint,
        aws_access_key_id=settings.r2_access_key_id, aws_secret_access_key=settings.r2_secret_access_key,
        region_name="auto", config=BotoConfig(signature_version="s3v4"),
    )
    url = s3.generate_presigned_url(
        "put_object",
        Params={"Bucket": settings.r2_bucket, "Key": key, "ContentType": content_type, "CacheControl": cache},
        ExpiresIn=600,
    )
    return {
        "upload_url": url,
        "public_url": f"{settings.r2_public_base_url.rstrip('/')}/{key}",
        "headers": {"Content-Type": content_type, "Cache-Control": cache},
    }
