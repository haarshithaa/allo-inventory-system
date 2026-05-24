import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  acquireLock,
  releaseLock,
  stockLockKey,
  getIdempotencyEntry,
  setIdempotencyEntry,
} from "@/lib/redis";
import { CreateReservationSchema } from "@/lib/schemas";
import type { ReservationDTO } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";

const RESERVATION_TTL_MINUTES = parseInt(
  process.env.RESERVATION_TTL_MINUTES ?? "10",
  10
);

function formatReservation(
  reservation: {
    id: string;
    productId: string;
    warehouseId: string;
    quantity: number;
    status: string;
    expiresAt: Date;
    confirmedAt: Date | null;
    releasedAt: Date | null;
    createdAt: Date;
    product: { name: string; sku: string };
    warehouse: { name: string };
  }
): ReservationDTO {
  return {
    id: reservation.id,
    productId: reservation.productId,
    productName: reservation.product.name,
    productSku: reservation.product.sku,
    warehouseId: reservation.warehouseId,
    warehouseName: reservation.warehouse.name,
    quantity: reservation.quantity,
    status: reservation.status as ReservationDTO["status"],
    expiresAt: reservation.expiresAt.toISOString(),
    confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
    releasedAt: reservation.releasedAt?.toISOString() ?? null,
    createdAt: reservation.createdAt.toISOString(),
  };
}

export async function POST(request: NextRequest) {
  // ── Idempotency check ────────────────────────────────────────────────────
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = await getIdempotencyEntry(idempotencyKey);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.statusCode });
    }
  }

  // ── Parse & validate body ────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = CreateReservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { productId, warehouseId, quantity } = parsed.data;

  // ── Acquire distributed lock ─────────────────────────────────────────────
  // This is the key concurrency control mechanism.
  // Two simultaneous requests for the same product+warehouse will race to
  // acquire this lock. Only one wins; the other retries or fails fast.
  const lockKey = stockLockKey(productId, warehouseId);
  const lockToken = uuidv4();

  const acquired = await acquireLock(lockKey, lockToken);
  if (!acquired) {
    // Another request is currently processing stock for this product+warehouse.
    // Return 409 — the client can retry.
    return NextResponse.json(
      {
        error:
          "Stock is being updated by another request. Please retry in a moment.",
        code: "LOCK_CONTENTION",
      },
      { status: 409 }
    );
  }

  try {
    // ── Check & decrement stock inside a transaction ─────────────────────
    // Even with the Redis lock, we use a DB transaction for atomicity.
    // The lock prevents concurrent requests from both reading "available > 0"
    // before either has written. The transaction ensures the read-check-write
    // is atomic at the DB level too (defence in depth).
    const result = await prisma.$transaction(async (tx) => {
      // Re-read stock inside the transaction with a row-level lock
      // Using raw SQL for SELECT ... FOR UPDATE to lock the row
      const stockRows = await tx.$queryRaw<
        Array<{
          id: string;
          total_units: number;
          reserved_units: number;
        }>
      >`
        SELECT id, total_units, reserved_units
        FROM stock_levels
        WHERE product_id = ${productId}
          AND warehouse_id = ${warehouseId}
        FOR UPDATE
      `;

      if (stockRows.length === 0) {
        return {
          success: false as const,
          status: 404,
          error: "No stock record found for this product/warehouse combination",
        };
      }

      const stock = stockRows[0];
      const available = stock.total_units - stock.reserved_units;

      if (available < quantity) {
        return {
          success: false as const,
          status: 409,
          error: `Insufficient stock. Requested: ${quantity}, available: ${available}`,
          code: "INSUFFICIENT_STOCK",
        };
      }

      // Increment reserved units
      await tx.$executeRaw`
        UPDATE stock_levels
        SET reserved_units = reserved_units + ${quantity},
            updated_at = NOW()
        WHERE id = ${stock.id}
      `;

      // Create the reservation
      const expiresAt = new Date(
        Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000
      );

      const reservation = await tx.reservation.create({
        data: {
          productId,
          warehouseId,
          quantity,
          status: "PENDING",
          expiresAt,
          idempotencyKey: idempotencyKey ?? undefined,
        },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      return { success: true as const, reservation };
    });

    if (!result.success) {
      const responseBody = {
        error: result.error,
        ...(result.code ? { code: result.code } : {}),
      };
      const response = NextResponse.json(responseBody, {
        status: result.status,
      });

      // Cache idempotent error responses too (so retries get the same 409)
      if (idempotencyKey) {
        await setIdempotencyEntry(idempotencyKey, {
          statusCode: result.status,
          body: responseBody,
        });
      }

      return response;
    }

    const dto = formatReservation(result.reservation);

    // Cache successful response for idempotency
    if (idempotencyKey) {
      await setIdempotencyEntry(idempotencyKey, {
        statusCode: 201,
        body: dto,
      });
    }

    return NextResponse.json(dto, { status: 201 });
  } finally {
    // Always release the lock, even if an error occurred
    await releaseLock(lockKey, lockToken);
  }
}
