import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getIdempotencyEntry,
  setIdempotencyEntry,
} from "@/lib/redis";
import type { ReservationDTO } from "@/lib/schemas";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // ── Idempotency check ────────────────────────────────────────────────────
  const idempotencyKey = request.headers.get("Idempotency-Key");
  if (idempotencyKey) {
    const cached = await getIdempotencyEntry(`confirm:${idempotencyKey}`);
    if (cached) {
      return NextResponse.json(cached.body, { status: cached.statusCode });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock the reservation row
      const reservations = await tx.$queryRaw<
        Array<{
          id: string;
          product_id: string;
          warehouse_id: string;
          quantity: number;
          status: string;
          expires_at: Date;
        }>
      >`
        SELECT id, product_id, warehouse_id, quantity, status, expires_at
        FROM reservations
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (reservations.length === 0) {
        return { success: false as const, status: 404, error: "Reservation not found" };
      }

      const reservation = reservations[0];

      if (reservation.status === "CONFIRMED") {
        // Already confirmed — idempotent success
        const full = await tx.reservation.findUnique({
          where: { id },
          include: {
            product: { select: { name: true, sku: true } },
            warehouse: { select: { name: true } },
          },
        });
        return { success: true as const, reservation: full! };
      }

      if (reservation.status === "RELEASED") {
        return {
          success: false as const,
          status: 410,
          error: "Reservation has already been released",
          code: "ALREADY_RELEASED",
        };
      }

      // Check expiry
      if (new Date() > reservation.expires_at) {
        // Lazy cleanup: release the reservation now
        await tx.$executeRaw`
          UPDATE reservations
          SET status = 'RELEASED', released_at = NOW(), updated_at = NOW()
          WHERE id = ${id}
        `;
        // Return reserved units to stock
        await tx.$executeRaw`
          UPDATE stock_levels
          SET reserved_units = GREATEST(0, reserved_units - ${reservation.quantity}),
              updated_at = NOW()
          WHERE product_id = ${reservation.product_id}
            AND warehouse_id = ${reservation.warehouse_id}
        `;
        return {
          success: false as const,
          status: 410,
          error: "Reservation has expired",
          code: "RESERVATION_EXPIRED",
        };
      }

      // Confirm: decrement total stock and clear the reservation hold
      await tx.$executeRaw`
        UPDATE stock_levels
        SET total_units    = GREATEST(0, total_units - ${reservation.quantity}),
            reserved_units = GREATEST(0, reserved_units - ${reservation.quantity}),
            updated_at     = NOW()
        WHERE product_id   = ${reservation.product_id}
          AND warehouse_id = ${reservation.warehouse_id}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      return { success: true as const, reservation: updated };
    });

    if (!result.success) {
      const responseBody = {
        error: result.error,
        ...(result.code ? { code: result.code } : {}),
      };
      if (idempotencyKey) {
        await setIdempotencyEntry(`confirm:${idempotencyKey}`, {
          statusCode: result.status,
          body: responseBody,
        });
      }
      return NextResponse.json(responseBody, { status: result.status });
    }

    const r = result.reservation;
    const dto: ReservationDTO = {
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      productSku: r.product.sku,
      warehouseId: r.warehouseId,
      warehouseName: r.warehouse.name,
      quantity: r.quantity,
      status: r.status as ReservationDTO["status"],
      expiresAt: r.expiresAt.toISOString(),
      confirmedAt: r.confirmedAt?.toISOString() ?? null,
      releasedAt: r.releasedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };

    if (idempotencyKey) {
      await setIdempotencyEntry(`confirm:${idempotencyKey}`, {
        statusCode: 200,
        body: dto,
      });
    }

    return NextResponse.json(dto);
  } catch (error) {
    console.error(`[POST /api/reservations/${id}/confirm]`, error);
    return NextResponse.json(
      { error: "Failed to confirm reservation" },
      { status: 500 }
    );
  }
}
