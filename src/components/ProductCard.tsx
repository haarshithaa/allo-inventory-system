"use client";

import { useState } from "react";
import type { ProductDTO } from "@/lib/schemas";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReserveModal } from "@/components/ReserveModal";
import { Package, Warehouse } from "lucide-react";

interface ProductCardProps {
  product: ProductDTO;
}

export function ProductCard({ product }: ProductCardProps) {
  const [showModal, setShowModal] = useState(false);

  const totalAvailable = product.stockLevels.reduce(
    (sum, sl) => sum + sl.availableUnits,
    0
  );

  const hasStock = totalAvailable > 0;

  return (
    <>
      <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
        {/* Product image */}
        <div className="relative flex h-48 items-center justify-center bg-slate-50 p-6">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <Package className="h-16 w-16 text-slate-300" />
          )}
          {!hasStock && (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <Badge variant="destructive">Out of stock</Badge>
            </div>
          )}
        </div>

        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base leading-snug">
              {product.name}
            </CardTitle>
            {hasStock && totalAvailable <= 5 && (
              <Badge variant="warning" className="shrink-0">
                Only {totalAvailable} left
              </Badge>
            )}
          </div>
          <p className="text-xs text-slate-400">SKU: {product.sku}</p>
          {product.description && (
            <p className="mt-1 text-sm text-slate-500 line-clamp-2">
              {product.description}
            </p>
          )}
        </CardHeader>

        <CardContent className="flex flex-1 flex-col justify-between gap-4">
          {/* Stock per warehouse */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <Warehouse className="h-3.5 w-3.5" />
              Stock by warehouse
            </div>
            {product.stockLevels.map((sl) => (
              <div
                key={sl.warehouseId}
                className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 text-xs"
              >
                <span className="text-slate-600">{sl.warehouseName}</span>
                <span
                  className={`font-semibold ${
                    sl.availableUnits === 0
                      ? "text-red-500"
                      : sl.availableUnits <= 3
                      ? "text-amber-600"
                      : "text-emerald-600"
                  }`}
                >
                  {sl.availableUnits === 0
                    ? "Out of stock"
                    : `${sl.availableUnits} available`}
                </span>
              </div>
            ))}
          </div>

          <Button
            onClick={() => setShowModal(true)}
            disabled={!hasStock}
            className="w-full"
            variant={hasStock ? "default" : "secondary"}
          >
            {hasStock ? "Reserve" : "Unavailable"}
          </Button>
        </CardContent>
      </Card>

      {showModal && (
        <ReserveModal product={product} onClose={() => setShowModal(false)} />
      )}
    </>
  );
}
