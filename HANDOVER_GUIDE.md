# Zylora BD: Handover Guide

A mobile-first apparel store. Customers browse, pick a size, sign in (email, phone OTP or Facebook) and pay by Cash on Delivery or online (bKash / Nagad / card). Staff manage products and orders at `/admin`.

| Part | Tech | Where it runs |
|---|---|---|
| Storefront + admin (`frontend/`) | React, Vite, Tailwind | Vercel or Cloudflare Pages (static) |
| API (`backend/`) | FastAPI, async SQLAlchemy | Render, Railway, or any VPS (Docker) |
| Database | Supabase PostgreSQL | Supabase (hosted) |
| Photos and videos | Cloudflare R2 (S3-compatible) | Cloudflare, served through a CDN domain |
| Online payments | UddoktaPay (bKash, Nagad, cards) | UddoktaPay |

---

## 1. Configuration (environment variables)

All backend settings live in `backend/.env`. Copy `backend/.env.example` to `backend/.env` and fill it in. **Never commit `.env` or send it over chat or email.** On a hosting platform, enter the same names in its "Environment" settings instead of using a file.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Supabase connection string: Project > Connect > **Transaction pooler** (port 6543). Reset the database password in Supabase if it was ever shared. |
| `DB_SSL` | `true` (default, verifies the certificate). If the API fails with "certificate verify failed", set `require`. |
| `JWT_SECRET` | Long random secret that signs logins. Generate: `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Changing it logs everyone out. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PHONE` (optional) | Read by `python -m scripts.seed_admin`, which creates the first admin or promotes the matching existing user. Safe to re-run; it never overwrites an existing password. Change the password after first login. |
| `CORS_ORIGINS` | Your storefront address(es), comma-separated, e.g. `https://zylora.com`. No `*`. |
| `PUBLIC_API_URL` | The public address of the API (used in payment return/webhook URLs). |
| `FRONTEND_URL` | The public address of the storefront. |
| `PAYMENT_GATEWAY_BASE_URL`, `PAYMENT_GATEWAY_API_KEY` | UddoktaPay panel URL and API key. Use the sandbox while testing. |
| `S3_ENDPOINT_URL`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_NAME`, `PUBLIC_CDN_URL` | Cloudflare R2 bucket for product media. |
| `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` | Facebook Login (optional). |
| `GOOGLE_CLIENT_ID` | Google sign-in (optional). OAuth client ID of type "Web application" from Google Cloud Console. |
| `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER_ID` | SMS provider for OTP codes and order texts. Without it, SMS are only written to the server log. |

Frontend (set in Vercel/Cloudflare Pages, or in a `frontend/.env.production`):

| Variable | Meaning |
|---|---|
| `VITE_API_URL` | API address, e.g. `https://api.zylora.com`. |
| `VITE_FACEBOOK_APP_ID` | Same app ID as above. The "Continue with Facebook" button only appears when this is set. |
| `VITE_GOOGLE_CLIENT_ID` | Same client ID as `GOOGLE_CLIENT_ID`. The "Continue with Google" button only appears when this is set. In Google Cloud Console add your store's address (e.g. `https://zylorabd.vercel.app`) under Authorized JavaScript origins. |

## 2. Database and migrations

The schema is managed with Alembic. From the `backend/` folder:

```bash
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head          # create/update tables (safe to run repeatedly)
python -m scripts.seed_admin  # creates (or promotes) the admin account; safe to re-run
python seed.py                # optional: sample products
```

The Docker image runs `alembic upgrade head` automatically on every start. After changing a model, create a migration with `alembic revision --autogenerate -m "describe change"`, review it, then deploy.

## 3. Run it locally

```bash
cd backend && uvicorn app.main:app --reload     # API on http://localhost:8000  (docs: /docs)
cd frontend && npm install && npm run dev      # storefront on the Vite port
```

Run the tests: `cd backend && pip install -r requirements-dev.txt && pytest`. Use a throwaway local Postgres (set `DB_SSL=false`), never the production database. GitHub Actions does this automatically on every push.

## 4. Managing the shop (admin)

Open `/admin` and sign in with the admin account.

- **Overview:** total, pending and today's orders, revenue, and the Cash-on-Delivery vs online split.
- **Orders:** filter by status, payment method, payment status, how the customer logged in (Email/Phone/Facebook) and traffic source (`utm_source`). Move an order through *Confirmed → Shipped → Delivered*, or cancel it (cancelling returns stock). COD orders become *Paid* when marked Delivered. Online orders become *Paid* automatically when the gateway confirms.
- **Products:** create or edit products, set price and discount %, and set stock per size (S, M, L, XL, XXL, Free Size). Stock 0 marks a size sold out. "Visible in store" off hides a product without deleting order history.

### Uploading product photos and videos
In the product form, use **Upload**. The file goes straight from the browser to Cloudflare R2 (the server never handles the bytes), with a progress bar.

- Images: JPEG, PNG or WebP, up to 8 MB. Video: MP4 or WebM, up to 15 MB (compress first; 720p is plenty for a phone).
- The upload link is valid for 10 minutes. After uploading, the address is filled in automatically; press **Save**.
- One-time bucket setup (R2 → bucket → Settings → CORS): allow `PUT` from your storefront and admin origin, with headers `Content-Type` and `Cache-Control`. Also attach a public custom domain to the bucket and use it as `PUBLIC_CDN_URL`.

### Tracking where orders come from
Share links with a `utm_source`, e.g. `https://zylora.com/?utm_source=facebook`. The first visit's source is stored with the order and appears in the admin order log.

## 5. How orders and payments behave

- **Cash on Delivery:** order is *Confirmed*, payment *Unpaid*; stock is deducted immediately.
- **Online:** order is *Awaiting payment*; stock is held for 30 minutes. When the gateway reports success, the server re-checks the payment with the gateway, then marks it *Paid + Confirmed*. If the payment fails or is cancelled, or 30 minutes pass, the order is cancelled and stock is returned automatically.
- Prices are always recalculated on the server; delivery is ৳70 inside Dhaka and ৳130 outside (change in `app/core/config.py`).
- The browser return page (`/checkout/result`) is for display only. Only the server-to-server webhook can mark an order paid.

## 6. Deploying

### API on Render / Railway
1. Create a **Web Service** from this repository, root directory `backend`, runtime **Docker** (it uses `backend/Dockerfile`).
2. Add the environment variables from section 1. Health check path: `/health`.
3. Deploy. Migrations run on start. Then run `python -m scripts.seed_admin` from the platform shell to create the admin (safe to re-run).
4. Set `PUBLIC_API_URL` to the service address and register `https://<api>/api/v1/payments/webhook` as the webhook in UddoktaPay.

### API on a VPS
```bash
git clone <repo> && cd <repo>
cp backend/.env.example backend/.env && nano backend/.env
docker compose up --build -d
```
Put Nginx or Caddy in front for HTTPS and proxy to port 8000. Check with `curl https://<api>/health`.

### Storefront on Vercel or Cloudflare Pages
- Set **Root Directory** to `frontend`. Build command `npm run build`, output directory `dist`, environment `VITE_API_URL` (and `VITE_FACEBOOK_APP_ID` if used).
- `frontend/vercel.json` and `frontend/public/_redirects` already send every path to the app so `/admin` and `/checkout/result` work on refresh.
- Add the final storefront address to the API's `CORS_ORIGINS`.

## 7. Before going live: checklist
- [ ] Reset the Supabase database password if it was ever shared, and set real `JWT_SECRET`, `ADMIN_PASSWORD`.
- [ ] Switch UddoktaPay from sandbox to live and run one real test payment end to end.
- [ ] Configure the SMS provider and confirm an OTP text arrives.
- [ ] R2 bucket CORS and CDN domain set; upload one image and one video from `/admin`.
- [ ] `CORS_ORIGINS`, `PUBLIC_API_URL`, `FRONTEND_URL`, `VITE_API_URL` all point to the real domains (https).
- [ ] Remove demo/sample products and any test orders and test accounts from the database.
- [ ] `.env` is not in version control (`git status` should not list it).

## 8. Known limits
- Rate limiting (login/OTP) is in-memory per server process. If you run several API instances, move it to Redis.
- Order confirmation emails are not sent yet (SMS only, once a provider is configured).
- The payment integration was tested against a simulated gateway; verify it against the real UddoktaPay sandbox before launch.
