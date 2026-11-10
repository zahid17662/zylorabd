"""DB_SSL modes map to the right asyncpg `ssl` argument."""
import ssl

import pytest

from app.core.config import settings


@pytest.mark.parametrize("value", ["false", "FALSE", "0", "off", "disable"])
def test_db_ssl_false_disables_tls(monkeypatch, value):
    monkeypatch.setattr(settings, "db_ssl", value)
    assert settings.db_ssl_arg is False


def test_db_ssl_true_verifies_certificate(monkeypatch):
    monkeypatch.setattr(settings, "db_ssl", "true")
    assert settings.db_ssl_arg is True


def test_db_ssl_default_for_unknown_value_is_strict(monkeypatch):
    monkeypatch.setattr(settings, "db_ssl", "garbage")
    assert settings.db_ssl_arg is True


def test_db_ssl_require_encrypts_without_verifying(monkeypatch):
    monkeypatch.setattr(settings, "db_ssl", "require")
    ctx = settings.db_ssl_arg
    assert isinstance(ctx, ssl.SSLContext)
    assert ctx.verify_mode == ssl.CERT_NONE and ctx.check_hostname is False
