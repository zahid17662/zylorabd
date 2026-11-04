@AGENTS.md

# Project: Apparel E-Commerce Platform (Client Handover Ready)

## Tech Stack
- **Backend** (`backend/`): Python 3.11+, FastAPI, SQLAlchemy 2.0 (async), `asyncpg`, Pydantic v2, Alembic
- **Database:** Neon serverless PostgreSQL (`ap-southeast-1`, PgBouncer pooler)
- **Media storage:** Cloudflare R2 / S3 via `boto3` presigned PUT URLs. Never stream video uploads through FastAPI.
- **Frontend** (repo root `src/`): React 19, Vite, Tailwind 4, Lucide icons, `fetch` via `src/api.ts` (no Axios)
- **Auth:** JWT access token + rotating refresh token. Email/password, phone OTP (BD SMS gateway hook), Facebook login.
- **Payments:** Cash on Delivery + online gateway (UddoktaPay; bKash/Nagad/cards) with server-to-server webhook verification

## Mandatory workflows (ECC)
1. Follow the loop: plan -> test -> implement -> review -> verify.
2. Database (`postgres-patterns`, `database-reviewer`): keep `statement_cache_size=0` and `ssl=True` in `connect_args` (Neon PgBouncer). Always `SELECT ... FOR UPDATE` (ordered by id) when deducting variant stock.
3. Security (`security-review`, `fastapi-reviewer`): never trust frontend prices. Verify webhooks (`RT-UDDOKTAPAY-API-KEY` header plus server-side `verify-payment`) and keep them idempotent.
4. Frontend (`frontend-patterns`, `react-reviewer`): product videos lazy-load (`preload="metadata"`, `playsInline`); size pills (S, M, L, XL, XXL) disable out-of-stock variants.
5. Tests (`tdd-workflow`): target 80%+ coverage on checkout concurrency, auth and payment webhooks before marking a task complete.

## Hard rules
- Never commit `backend/.env` or print its contents (it holds the Neon password).
- No destructive Neon operations (TRUNCATE/DELETE on real data) without an explicit user go-ahead.

## Status notes (update as work lands)
- Backend tests: 47 passing in `backend/tests/` (checkout race, webhooks, auth, admin, sweeper), 92% coverage. They use a throwaway schema in Neon and drop it afterwards. Run: `cd backend && pytest --cov=app`.
- Storefront: product page (gallery, lazy video, live stock size pills), Facebook button (needs `VITE_FACEBOOK_APP_ID`), payment return page, BD phone validation are built.
- Still needs real credentials to verify: R2 uploads, UddoktaPay sandbox, SMS provider, Facebook app. See `HANDOVER_GUIDE.md` and `PLAN.md`.
