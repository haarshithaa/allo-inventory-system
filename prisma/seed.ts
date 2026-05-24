import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up existing data
  await prisma.reservation.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const [warehouseMumbai, warehouseDelhi, warehouseBangalore] =
    await Promise.all([
      prisma.warehouse.create({
        data: {
          name: "Mumbai Central",
          location: "Mumbai, Maharashtra",
        },
      }),
      prisma.warehouse.create({
        data: {
          name: "Delhi North",
          location: "New Delhi, Delhi",
        },
      }),
      prisma.warehouse.create({
        data: {
          name: "Bangalore Tech Park",
          location: "Bangalore, Karnataka",
        },
      }),
    ]);

  console.log("✅ Created 3 warehouses");

  // Create products
  const [airpods, macbook, iphone, ipad, appleWatch] = await Promise.all([
    prisma.product.create({
      data: {
        name: "AirPods Pro (2nd Gen)",
        description:
          "Active Noise Cancellation, Adaptive Transparency, Personalized Spatial Audio",
        sku: "APP-AIRPODS-PRO-2",
        imageUrl:
          "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/MQD83?wid=400&hei=400&fmt=jpeg",
      },
    }),
    prisma.product.create({
      data: {
        name: 'MacBook Air 15" M3',
        description:
          "Apple M3 chip, 8GB RAM, 256GB SSD, 15.3-inch Liquid Retina display",
        sku: "APP-MBA-15-M3-256",
        imageUrl:
          "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?q=80&w=1200&auto=format&fit=crop",
      },
    }),
    prisma.product.create({
      data: {
        name: "iPhone 15 Pro",
        description:
          "A17 Pro chip, 48MP camera system, Titanium design, USB-C",
        sku: "APP-IP15-PRO-128",
        imageUrl:
          "https://store.storeimages.cdn-apple.com/4982/as-images.apple.com/is/iphone-15-pro-finish-select-202309-6-1inch?wid=400&hei=400&fmt=jpeg",
      },
    }),
    prisma.product.create({
      data: {
        name: "iPad Air M2",
        description:
          "M2 chip, 11-inch Liquid Retina display, 128GB, Wi-Fi + Cellular",
        sku: "APP-IPAD-AIR-M2-128",
        imageUrl:
          "https://images.unsplash.com/photo-1544244015-0df4b3ffc6b0",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple Watch Series 9",
        description:
          "S9 chip, 45mm Aluminium Case, GPS, Always-On Retina display",
        sku: "APP-WATCH-S9-45",
        imageUrl:
          "https://images.unsplash.com/photo-1546868871-7041f2a55e12",
      },
    }),
  ]);

  console.log("✅ Created 5 products");

  // Create stock levels — intentionally low on some to demo 409 scenarios
  const stockData = [
    // AirPods Pro
    { product: airpods, warehouse: warehouseMumbai, total: 15 },
    { product: airpods, warehouse: warehouseDelhi, total: 8 },
    { product: airpods, warehouse: warehouseBangalore, total: 3 }, // low stock

    // MacBook Air
    { product: macbook, warehouse: warehouseMumbai, total: 5 },
    { product: macbook, warehouse: warehouseDelhi, total: 2 }, // low stock
    { product: macbook, warehouse: warehouseBangalore, total: 7 },

    // iPhone 15 Pro
    { product: iphone, warehouse: warehouseMumbai, total: 1 }, // very low — good for race condition demo
    { product: iphone, warehouse: warehouseDelhi, total: 12 },
    { product: iphone, warehouse: warehouseBangalore, total: 6 },

    // iPad Air
    { product: ipad, warehouse: warehouseMumbai, total: 9 },
    { product: ipad, warehouse: warehouseDelhi, total: 4 },
    { product: ipad, warehouse: warehouseBangalore, total: 11 },

    // Apple Watch
    { product: appleWatch, warehouse: warehouseMumbai, total: 20 },
    { product: appleWatch, warehouse: warehouseDelhi, total: 0 }, // out of stock
    { product: appleWatch, warehouse: warehouseBangalore, total: 3 },
  ];

  await Promise.all(
    stockData.map(({ product, warehouse, total }) =>
      prisma.stockLevel.create({
        data: {
          productId: product.id,
          warehouseId: warehouse.id,
          totalUnits: total,
          reservedUnits: 0,
        },
      })
    )
  );

  console.log("✅ Created stock levels");
  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
