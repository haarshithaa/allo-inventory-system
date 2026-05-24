import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * Cron job: release all PENDING reservations that have passed their expiresAt.
 *
 * In production this is called by Vercel Cron (configured in vercel.json)
 * every minute. The CRON_SECRET header prevents unauthorized calls.
 *
 * The job is idempotent — running it multiple times has no additional effect.
 */
export async function GET(request: NextRequest) {
  // Authenticate the cron caller
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Find all expired PENDING reservations
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        quantity: true,
      },
    });

    if (expiredReservations.length === 0) {
      return NextResponse.json({ released: 0, message: "No expired reservations" });
    }

    // Process in a transaction: release each reservation and return stock
    let released = 0;

    // Batch in groups of 50 to avoid very large transactions
    const BATCH_SIZE = 50;
    for (let i = 0; i < expiredReservations.length; i += BATCH_SIZE) {
      const batch = expiredReservations.slice(i, i + BATCH_SIZE);

      await prisma.$transaction(async (tx) => {
        for (const reservation of batch) {
          // Mark as released
          await tx.$executeRaw`
            UPDATE reservations
            SET status = 'RELEASED', released_at = NOW(), updated_at = NOW()
            WHERE id = ${reservation.id}
              AND status = 'PENDING'
          `;

          // Return units to available pool
          await tx.$executeRaw`
            UPDATE stock_levels
            SET reserved_units = GREATEST(0, reserved_units - ${reservation.quantity}),
                updated_at     = NOW()
            WHERE product_id   = ${reservation.productId}
              AND warehouse_id = ${reservation.warehouseId}
          `;
        }
      });

      released += batch.length;
    }

    console.log(`[cron/expire-reservations] Released ${released} reservations`);

    return NextResponse.json({
      released,
      message: `Released ${released} expired reservation(s)`,
    });
  } catch (error) {
    console.error("[cron/expire-reservations]", error);
    return NextResponse.json(
      { error: "Failed to expire reservations" },
      { status: 500 }
    );
  }
}
