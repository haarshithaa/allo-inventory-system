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

  // ── Idempotency check ─────────────────────────────────────────────
  const idempotencyKey = request.headers.get("Idempotency-Key");

  if (idempotencyKey) {
    const cached = await getIdempotencyEntry(
      `confirm:${idempotencyKey}`
    );

    if (cached) {
      return NextResponse.json(cached.body, {
        status: cached.statusCode,
      });
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Lock reservation row
      const reservations = await tx.$queryRaw<
        Array<{
          id: string;
          productId: string;
          warehouseId: string;
          quantity: number;
          status: string;
          expiresAt: Date;
        }>
      >`
        SELECT
          id,
          "productId",
          "warehouseId",
          quantity,
          status,
          "expiresAt"
        FROM "reservations"
        WHERE id = ${id}
        FOR UPDATE
      `;

      if (reservations.length === 0) {
        return {
          success: false as const,
          status: 404,
          error: "Reservation not found",
        };
      }

      const reservation = reservations[0];

      // Already confirmed
      if (reservation.status === "CONFIRMED") {
        const full = await tx.reservation.findUnique({
          where: { id },
          include: {
            product: {
              select: {
                name: true,
                sku: true,
              },
            },
            warehouse: {
              select: {
                name: true,
              },
            },
          },
        });

        return {
          success: true as const,
          reservation: full!,
        };
      }

      // Already released
      if (reservation.status === "RELEASED") {
        return {
          success: false as const,
          status: 410,
          error: "Reservation already released",
          code: "ALREADY_RELEASED",
        };
      }

      // Expired reservation
      if (new Date() > reservation.expiresAt) {
        await tx.$executeRaw`
          UPDATE "reservations"
          SET
            status = 'RELEASED',
            "releasedAt" = NOW()
          WHERE id = ${id}
        `;

        await tx.$executeRaw`
          UPDATE "stock_levels"
          SET
            "reservedUnits" =
              GREATEST(
                0,
                "reservedUnits" - ${reservation.quantity}
              )
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
        `;

        return {
          success: false as const,
          status: 410,
          error: "Reservation expired",
          code: "RESERVATION_EXPIRED",
        };
      }

      // CONFIRM PURCHASE
      await tx.$executeRaw`
        UPDATE "stock_levels"
        SET
          "totalUnits" =
            GREATEST(
              0,
              "totalUnits" - ${reservation.quantity}
            ),
          "reservedUnits" =
            GREATEST(
              0,
              "reservedUnits" - ${reservation.quantity}
            )
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: {
          status: "CONFIRMED",
          confirmedAt: new Date(),
        },
        include: {
          product: {
            select: {
              name: true,
              sku: true,
            },
          },
          warehouse: {
            select: {
              name: true,
            },
          },
        },
      });

      return {
        success: true as const,
        reservation: updated,
      };
    });

    if (!result.success) {
      const responseBody = {
        error: result.error,
        ...(result.code
          ? { code: result.code }
          : {}),
      };

      return NextResponse.json(responseBody, {
        status: result.status,
      });
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
      confirmedAt:
        r.confirmedAt?.toISOString() ?? null,
      releasedAt:
        r.releasedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    };

    return NextResponse.json(dto);
  } catch (error) {
    console.error(
      `[POST /api/reservations/${id}/confirm]`,
      error
    );

    return NextResponse.json(
      {
        error: "Failed to confirm reservation",
      },
      {
        status: 500,
      }
    );
  }
}