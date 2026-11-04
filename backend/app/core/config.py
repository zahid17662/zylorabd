from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str = Field(validation_alias=AliasChoices("jwt_secret", "jwt_secret_key"))
    jwt_algorithm: str = "HS256"
    access_token_minutes: int = Field(default=15, validation_alias=AliasChoices("access_token_minutes", "access_token_expire_minutes"))
    refresh_token_days: int = 30
    payment_webhook_secret: str = ""  # HMAC fallback mode (used when no gateway API key is set)
    cors_origins: str = "http://localhost:5173"

    public_api_url: str = "http://localhost:8000"
    frontend_url: str = "http://localhost:5173"

    facebook_app_id: str = ""
    facebook_app_secret: str = ""

    sms_api_url: str = ""
    sms_api_key: str = ""
    sms_sender_id: str = ""

    payment_gateway_base_url: str = ""
    # UddoktaPay: base URL e.g. https://sandbox.uddoktapay.com ; API key from the panel
    payment_gateway_api_key: str = ""
    payment_verify_url: str = ""  # defaults to {base}/api/verify-payment

    # Shipping fees (BDT)
    shipping_inside_dhaka: int = 70
    shipping_outside_dhaka: int = 130
    stock_hold_minutes: int = 30  # unpaid online orders release stock after this

    # Cloudflare R2 / any S3-compatible store
    # Either naming works: S3_* / PUBLIC_CDN_URL or R2_*
    s3_endpoint_url: str = ""  # e.g. https://<account_id>.r2.cloudflarestorage.com
    r2_account_id: str = ""  # used to build the endpoint when S3_ENDPOINT_URL is not set
    r2_access_key_id: str = Field(default="", validation_alias=AliasChoices("r2_access_key_id", "s3_access_key_id"))
    r2_secret_access_key: str = Field(default="", validation_alias=AliasChoices("r2_secret_access_key", "s3_secret_access_key"))
    r2_bucket: str = Field(default="", validation_alias=AliasChoices("r2_bucket", "s3_bucket_name"))
    r2_public_base_url: str = Field(default="", validation_alias=AliasChoices("r2_public_base_url", "public_cdn_url"))  # CDN domain bound to the bucket

    @property
    def storage_endpoint(self) -> str:
        if self.s3_endpoint_url and "<" not in self.s3_endpoint_url:
            return self.s3_endpoint_url.rstrip("/")
        return f"https://{self.r2_account_id}.r2.cloudflarestorage.com" if self.r2_account_id else ""

    @property
    def uddoktapay_enabled(self) -> bool:
        return bool(self.payment_gateway_api_key and self.payment_gateway_base_url)

    @property
    def async_database_url(self) -> str:
        """Neon gives a libpq URL; asyncpg needs its own driver prefix and no sslmode/channel_binding."""
        parts = urlsplit(self.database_url)
        query = [(k, v) for k, v in parse_qsl(parts.query) if k not in ("sslmode", "channel_binding")]
        return urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, urlencode(query), ""))


settings = Settings()
