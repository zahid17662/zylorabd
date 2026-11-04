"""Small in-process sliding-window rate limiter used as a FastAPI dependency.

State lives in this process only. That is enough for a single server; if the API runs on several
instances, back this with Redis instead (same interface).
"""
import time
from collections import defaultdict, deque

from fastapi import HTTPException, Request, status


ENABLED = True  # tests switch this off


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def rate_limit(name: str, limit: int, window_seconds: int):
    hits: dict[str, deque[float]] = defaultdict(deque)

    async def dependency(request: Request) -> None:
        if not ENABLED:
            return
        key = client_ip(request)
        now = time.monotonic()
        q = hits[key]
        while q and now - q[0] > window_seconds:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                "Too many attempts. Please wait a moment and try again.",
                headers={"Retry-After": str(window_seconds)},
            )
        q.append(now)
        if len(hits) > 10_000:  # keep memory bounded
            for k in [k for k, v in hits.items() if not v or now - v[-1] > window_seconds]:
                hits.pop(k, None)

    dependency.__name__ = f"rate_limit_{name}"
    return dependency
