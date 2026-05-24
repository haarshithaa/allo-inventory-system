import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ProductDTO } from "@/lib/schemas";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: { name: "asc" },
      include: {
        stockLevels: {
          include: {
            warehouse: true,
          },
          orderBy: {
            warehouse: { name: "asc" },
          },
        },
      },
    });

    const data: ProductDTO[] = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      sku: p.sku,
      imageUrl: p.imageUrl,
      stockLevels: p.stockLevels.map((sl) => ({
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouse.name,
        warehouseLocation: sl.warehouse.location,
        totalUnits: sl.totalUnits,
        reservedUnits: sl.reservedUnits,
        availableUnits: Math.max(0, sl.totalUnits - sl.reservedUnits),
      })),
    }));

    return NextResponse.json(data);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json(
      { error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
