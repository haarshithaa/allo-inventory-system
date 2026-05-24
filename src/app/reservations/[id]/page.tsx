import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { ReservationDTO } from "@/lib/schemas";
import { ReservationDetail } from "@/components/ReservationDetail";

// Force dynamic — reservation status changes in real time
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function getReservation(id: string): Promise<ReservationDTO | null> {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, sku: true } },
      warehouse: { select: { name: true } },
    },
  });

  if (!reservation) return null;

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

export default async function ReservationPage({ params }: PageProps) {
  const { id } = await params;
  const reservation = await getReservation(id);

  if (!reservation) {
    notFound();
  }

  return <ReservationDetail initialReservation={reservation} />;
}
