import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { WarehouseDTO } from "@/lib/schemas";

export async function GET() {
  try {
    const warehouses = await prisma.warehouse.findMany({
      orderBy: { name: "asc" },
    });

    const data: WarehouseDTO[] = warehouses.map((w: { id: string; name: string; location: string }) => ({
      id: w.id,
      name: w.name,
      location: w.location,
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/warehouses]", error);
    return NextResponse.json(
      { error: "Failed to fetch warehouses" },
      { status: 500 }
    );
  }
}
