export async function getIdempotencyEntry() {
  return null;
}

export async function setIdempotencyEntry() {
  return null;
}

export async function acquireLock() {
  return true;
}

export async function releaseLock() {
  return true;
}

export function stockLockKey(productId: string, warehouseId: string) {
  return `lock:${productId}:${warehouseId}`;
}