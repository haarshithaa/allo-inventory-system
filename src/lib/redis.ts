export async function getIdempotencyEntry(
  _key?: string
) {
  return null;
}

export async function setIdempotencyEntry(
  _key?: string,
  _value?: unknown
) {
  return null;
}

export async function acquireLock() {
  return true;
}

export async function releaseLock() {
  return true;
}

export function stockLockKey(
  productId: string,
  warehouseId: string
) {
  return `lock:${productId}:${warehouseId}`;
}