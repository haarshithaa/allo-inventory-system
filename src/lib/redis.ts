export async function getIdempotencyEntry(key?: string) {
  return null as any;
}

export async function setIdempotencyEntry(
  key?: string,
  value?: any
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