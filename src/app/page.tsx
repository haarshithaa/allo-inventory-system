import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/ProductCard";
import type { ProductDTO } from "@/lib/schemas";
import { Package } from "lucide-react";

// Force dynamic rendering — stock counts change in real time
export const dynamic = "force-dynamic";

async function getProducts(): Promise<ProductDTO[]> {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: {
      stockLevels: {
        include: { warehouse: true },
        orderBy: { warehouse: { name: "asc" } },
      },
    },
  });

  return products.map((p) => ({
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
}

export default async function HomePage() {
  const products = await getProducts();

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900">
              <Package className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                Allo Inventory
              </h1>
              <p className="text-xs text-slate-500">
                Multi-warehouse fulfillment
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-slate-900">Products</h2>
          <p className="mt-1 text-sm text-slate-500">
            {products.length} product{products.length !== 1 ? "s" : ""} ·
            Stock counts update every 30 seconds
          </p>
        </div>

        {products.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-20 text-center">
            <Package className="mb-3 h-12 w-12 text-slate-300" />
            <p className="text-slate-500">No products found.</p>
            <p className="mt-1 text-sm text-slate-400">
              Run the seed script to populate the database.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
