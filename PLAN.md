# ZyloraBd: Implementation & Gap-Analysis Blueprint

Status legend: DONE = built and tested by hand against Neon; PARTIAL = exists, needs work; TODO = not built.
Loop for every item: plan -> test -> implement -> review -> verify.

## 0. Security baseline (Phase 1 result)
| Item | Status |
|---|---|
| `backend/.env` ignored by git (root and backend `.gitignore`), plus `.env.*`, `*.pem`, `*.key` | DONE |
| `.env.example` lists every variable with empty/placeholder values only | DONE |
| Neon password was pasted in chat early on | **ACTION (owner):** rotate it in the Neon console, update `backend/.env` |
| `JWT_SECRET`, `PAYMENT_WEBHOOK_SECRET` are placeholders in `.env` | **ACTION (owner):** generate real values before any deployment |
| Project is not a git repo yet | Run `git init` after the above; `.gitignore` is ready |
| `.ecc/`, `.agents/`, `*.zip` are tooling/design exports | Ignored |

## 1. Backend
| Area | Status | Gap |
|---|---|---|
| App wiring, CORS, `/health`, lifespan (expiry sweeper) | PARTIAL | No global exception handlers; `/health` does not check the DB; app not built via `create_app()` |
| Auth: email register/login, phone OTP, Facebook, refresh rotation | DONE | OTP SMS only logged until a gateway is configured; no per-IP rate limit on login/register |
| Catalog + admin product CRUD, soft delete, paginated list | DONE | Dedicated `PATCH /admin/products/{id}/stock` not provided (handled by product PATCH) |
| R2 presign (MIME + size checks, 10 min) | DONE | Untested against a real bucket (needs keys + CORS) |
| Atomic checkout (`FOR UPDATE`, server pricing, attribution) | DONE | Needs automated tests |
| Payment webhook (header + server verify, idempotent, stock restore) | DONE | Verified only against a mock; needs UddoktaPay sandbox run |
| Admin orders + metrics | PARTIAL | Dashboard lacks COD-vs-Online split counts |
| Notifications (SMS/email) | PARTIAL | SMS logs only; email is a stub |

## 2. Database & migrations
| Item | Status | Gap |
|---|---|---|
| Async engine for Neon pooler (`statement_cache_size=0`, `ssl=True`, `pool_pre_ping`, `pool_recycle=300`) | DONE | `ssl=True` is intentional: asyncpg then verifies the certificate, stricter than `"require"` |
| Unique `product_variants(product_id, size)` | DONE | Already present as `uq_variant_product_size` |
| Composite index `orders(order_status, payment_method, order_source, created_at)` | **TODO** | Migration `0002` |
| Alembic async setup, baseline applied | DONE | Add `alembic upgrade head` to deploy steps |
| Naming note | n/a | Models are split (`user.py`, `product.py`, `order.py`); OTP table is `OtpCode`; attribution column is `login_method` |

## 3. Frontend
| Item | Status | Gap |
|---|---|---|
| Catalog from API, cart, checkout (COD/online), order confirmation | DONE | Phone regex `01[3-9]\d{8}` not enforced client-side |
| Auth modal (email, phone OTP) | PARTIAL | No Facebook button |
| Product page: gallery, `<video controls playsInline preload="metadata">`, size pills with live stock | **TODO** | Not built; storefront has cards + cart only |
| Payment return page (`/checkout/result?outcome=`) | **TODO** | Backend redirects there; page missing |
| Admin: orders table, filters, KPI cards, status updater | DONE | Add COD/Online split KPI |
| Admin: direct R2 upload | PARTIAL | No progress bar |
| Bangla text | PARTIAL | No Bengali font stack verified |

## 4. Testing
| Item | Status |
|---|---|
| pytest + httpx suite in `backend/tests/` | **TODO** (none exist) |
| Concurrent checkout oversell test (last unit, two requests) | TODO |
| Webhook idempotency + failed-payment rollback | TODO |
| Auth: OTP expiry/attempt limit, admin RBAC, refresh reuse | TODO |
| Frontend `npm run build` clean | DONE (re-verify at the end) |
| Test DB | Use a separate Neon branch or a local Postgres, never production data |

## 5. Deployment & handover
| Item | Status |
|---|---|
| `Dockerfile`, `docker-compose.yml` | TODO |
| `HANDOVER_GUIDE.md` (env vars, migrations, uploads, deploy) | TODO |
| Backend host (Render/Railway/VPS), frontend host (Vercel/Cloudflare Pages) | TODO; needs `PUBLIC_API_URL` and `CORS_ORIGINS` set to real domains |
| Change seeded admin password; remove test orders/accounts from Neon | **Waiting on owner** ("clean it") |

## Inputs still needed from the owner
R2 keys + CDN domain + bucket CORS; UddoktaPay sandbox key; SMS provider and key; Facebook app id/secret; rotated Neon URL; real `JWT_SECRET`.

## Execution order
1. Phase 2: migration `0002` (composite index) and verify with `alembic check`.
2. Phase 3: global exception handlers, DB-aware `/health`, dashboard COD/Online split, login/register rate limit.
3. Phase 5 (tests first for the TDD rule): checkout race, webhook, auth.
4. Phase 4: product page with video + size pills, Facebook button, return page, upload progress, phone validation.
5. Phase 6: Docker files, HANDOVER_GUIDE, final secret/CORS scan.
