# Allo Inventory

A multi-warehouse inventory and reservation system built with Next.js 16, Prisma 7, PostgreSQL (Neon), and Redis (Upstash).

## Live demo

> **[https://allo-inventory.vercel.app](https://allo-inventory.vercel.app)**  
> Seeded with 5 products across 3 warehouses. Some SKUs are intentionally low-stock to make the 409 path easy to trigger.

---

## Running locally

### Prerequisites

- Node.js 18+
- A hosted PostgreSQL instance (Neon, Supabase, or Railway — all have free tiers)
- An Upstash Redis instance (free tier works fine)

### 1. Clone and install

```bash
git clone https://github.com/your-username/allo-inventory
cd allo-inventory
npm install
```

### 2. Set environment variables

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (pooled, for app queries) |
| `DIRECT_URL` | Postgres direct connection string (for migrations) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis REST token |
| `RESERVATION_TTL_MINUTES` | How long a reservation holds stock (default: `10`) |
| `CRON_SECRET` | Secret for authenticating the cron endpoint |

**Neon note:** Neon gives you two connection strings — use the pooled one for `DATABASE_URL` and the direct one for `DIRECT_URL`. The direct URL is needed for Prisma migrations.

### 3. Run migrations

```bash
npm run db:push      # push schema to DB (no migration history)
# or
npm run db:migrate   # create a named migration (recommended for production)
```

### 4. Seed the database

```bash
npm run db:seed
```

This creates 3 warehouses, 5 products, and stock levels — some intentionally low to make the 409 path easy to hit.

### 5. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How expiry works in production

Reservations have an `expiresAt` timestamp set at creation time (default: 10 minutes from now).

**Two mechanisms work together:**

### 1. Vercel Cron (active cleanup)

`vercel.json` schedules `GET /api/cron/expire-reservations` to run every minute. The job:

1. Finds all `PENDING` reservations where `expiresAt < NOW()`
2. Sets their status to `RELEASED`
3. Decrements `reservedUnits` on the corresponding `StockLevel` rows

The endpoint is authenticated with a `CRON_SECRET` bearer token to prevent unauthorized calls.

### 2. Lazy cleanup on confirm (defensive)

When a client calls `POST /api/reservations/:id/confirm`, the handler checks `expiresAt` inside the transaction. If the reservation has expired, it releases it on the spot and returns `410 Gone`. This means even if the cron job is delayed, a user can never confirm an expired reservation.

**Why not just lazy cleanup?**  
Lazy cleanup alone means expired reservations hold stock until someone tries to confirm them — which may never happen for abandoned carts. The cron job ensures stock is returned promptly regardless of user behaviour.

---

## Concurrency: how the reservation is race-condition-free

This is the core of the exercise. The approach uses two layers:

### Layer 1: Redis distributed lock

Before touching the database, the reservation endpoint acquires a Redis lock scoped to `(productId, warehouseId)`:

```
SET lock:stock:{productId}:{warehouseId} {token} NX PX 5000
```

- `NX` — only set if the key doesn't exist (atomic test-and-set)
- `PX 5000` — auto-expire after 5 seconds (prevents deadlocks if the process crashes)

If two requests arrive simultaneously for the last unit of a SKU, exactly one wins the `SET NX` and proceeds. The other gets a `409 LOCK_CONTENTION` immediately, without touching the database.

The lock is released in a `finally` block using a Lua compare-and-delete script, so we never accidentally release a lock we don't own (e.g. if our lock expired and another process acquired it).

### Layer 2: `SELECT ... FOR UPDATE` inside a transaction

Inside the lock, we use a Postgres transaction with a row-level lock on the `stock_levels` row:

```sql
SELECT id, total_units, reserved_units
FROM stock_levels
WHERE product_id = $1 AND warehouse_id = $2
FOR UPDATE
```

This is defence-in-depth: if the Redis lock ever fails (network partition, Redis restart), the database-level lock prevents two transactions from both reading "available > 0" and both writing. The check-then-update is atomic at the DB level.

**Why both?**  
Redis is faster and fails early (before a DB round-trip). The DB lock is the safety net. Together they handle the race condition correctly even under adversarial conditions.

---

## Idempotency (bonus)

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints support an `Idempotency-Key` header.

**How it works:**

1. On each request, check Redis for a cached entry at `idempotency:{key}`
2. If found, return the cached `{ statusCode, body }` immediately — no DB writes
3. If not found, process normally, then store the result in Redis with a 24-hour TTL

This means a client can safely retry a timed-out request without double-reserving. The frontend generates a UUID per request and sends it as `Idempotency-Key`.

**Scope:** The key is namespaced by operation (`confirm:` prefix for confirm calls) so the same UUID can't accidentally match across different endpoints.

---

## API reference

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/products` | List products with available stock per warehouse |
| `GET` | `/api/warehouses` | List warehouses |
| `POST` | `/api/reservations` | Reserve units. Returns `409` if insufficient stock or lock contention |
| `POST` | `/api/reservations/:id/confirm` | Confirm reservation. Returns `410` if expired |
| `POST` | `/api/reservations/:id/release` | Release reservation early |
| `GET` | `/api/cron/expire-reservations` | Cron job — releases expired reservations |

---

## Trade-offs and things I'd do differently

**What I'd change with more time:**

- **`GET /api/reservations/:id`** — The spec doesn't require it, but the frontend would benefit from a polling endpoint to sync state after expiry rather than relying purely on client-side timer logic.

- **Optimistic UI** — The product listing page re-fetches on navigation. With more time I'd add SWR or React Query for background revalidation so stock counts update without a full page reload.

- **Prisma v7 raw SQL** — Prisma v7 dropped `url` from the schema file and requires a driver adapter. The `SELECT ... FOR UPDATE` queries use `$queryRaw` with tagged template literals, which works but is more verbose than Prisma's query builder. I'd evaluate whether a lower-level pg client (like `postgres.js`) would be cleaner for the locking queries.

- **Lock retry with backoff** — Currently, `LOCK_CONTENTION` returns a 409 immediately. A short retry loop (2–3 attempts with 50ms backoff) would reduce spurious failures under moderate load without meaningfully increasing latency.

- **Idempotency for release** — The release endpoint doesn't implement idempotency (it's already idempotent by design — releasing a released reservation is a no-op), but it doesn't cache the response. Adding the header support would be consistent.

- **Observability** — Production would need structured logging (Pino), error tracking (Sentry), and metrics on lock contention rate and reservation conversion rate.

- **Tests** — I'd add integration tests for the concurrency path using `Promise.all` to fire simultaneous reservation requests and assert exactly one succeeds.

**Deliberate simplifications:**

- No authentication — the spec doesn't require it and adding it would obscure the interesting parts.
- No payment simulation — the "Confirm purchase" button stands in for a real payment flow.
- Stock levels are seeded manually — a real system would have purchase orders and receiving workflows.
