import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ReservationDTO } from "@/lib/schemas";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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
        }>
      >`
        SELECT id, product_id, warehouse_id, quantity, status
        FROM reservations
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (reservations.length === 0) {
        return { success: false as const, status: 404, error: "Reservation not found" };
      }

      const reservation = reservations[0];

      // Idempotent: already released is fine
      if (reservation.status === "RELEASED") {
        const full = await tx.reservation.findUnique({
          where: { id },
          include: {
            product: { select: { name: true, sku: true } },
            warehouse: { select: { name: true } },
          },
        });
        return { success: true as const, reservation: full! };
      }

      if (reservation.status === "CONFIRMED") {
        return {
          success: false as const,
          status: 409,
          error: "Cannot release a confirmed reservation",
          code: "ALREADY_CONFIRMED",
        };
      }

      // Release: return reserved units to available pool
      await tx.$executeRaw`
        UPDATE stock_levels
        SET reserved_units = GREATEST(0, reserved_units - ${reservation.quantity}),
            updated_at     = NOW()
        WHERE product_id   = ${reservation.product_id}
          AND warehouse_id = ${reservation.warehouse_id}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: "RELEASED",
          releasedAt: new Date(),
        },
        include: {
          product: { select: { name: true, sku: true } },
          warehouse: { select: { name: true } },
        },
      });

      return { success: true as const, reservation: updated };
    });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.code ? { code: result.code } : {}),
        },
        { status: result.status }
      );
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

    return NextResponse.json(dto);
  } catch (error) {
    console.error(`[POST /api/reservations/${id}/release]`, error);
    return NextResponse.json(
      { error: "Failed to release reservation" },
      { status: 500 }
    );
  }
}
