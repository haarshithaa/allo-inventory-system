import { Redis } from "@upstash/redis";

// Lazy singleton — only instantiated when first used, not at module load time.
// This prevents build-time errors when env vars aren't set.
let _redis: Redis | null = null;

function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      "Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables"
    );
  }

  _redis = new Redis({ url, token });
  return _redis;
}

// ─── Distributed lock helpers ────────────────────────────────────────────────

const LOCK_TTL_MS = 5_000; // 5 seconds — enough for a DB transaction

/**
 * Acquire a distributed lock using SET NX PX.
 * Returns true if the lock was acquired, false if already held.
 */
export async function acquireLock(
  key: string,
  token: string
): Promise<boolean> {
  const result = await getRedis().set(key, token, {
    nx: true,
    px: LOCK_TTL_MS,
  });
  return result === "OK";
}

/**
 * Release a lock only if we own it (compare-and-delete via Lua script).
 * Prevents accidentally releasing a lock acquired by another process
 * after our lock expired.
 */
export async function releaseLock(
  key: string,
  token: string
): Promise<boolean> {
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  const result = await getRedis().eval(script, [key], [token]);
  return result === 1;
}

/**
 * Lock key scoped to a specific product+warehouse pair.
 * Two reservations for different products don't contend with each other.
 */
export function stockLockKey(productId: string, warehouseId: string): string {
  return `lock:stock:${productId}:${warehouseId}`;
}

// ─── Idempotency helpers ─────────────────────────────────────────────────────

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24 hours

export interface IdempotencyEntry {
  statusCode: number;
  body: unknown;
}

export async function getIdempotencyEntry(
  key: string
): Promise<IdempotencyEntry | null> {
  const raw = await getRedis().get<IdempotencyEntry>(`idempotency:${key}`);
  return raw ?? null;
}

export async function setIdempotencyEntry(
  key: string,
  entry: IdempotencyEntry
): Promise<void> {
  await getRedis().set(`idempotency:${key}`, entry, {
    ex: IDEMPOTENCY_TTL_SECONDS,
  });
}
