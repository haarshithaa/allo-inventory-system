"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductDTO, StockLevelDTO } from "@/lib/schemas";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Loader2, Package } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

interface ReserveModalProps {
  product: ProductDTO;
  onClose: () => void;
}

export function ReserveModal({ product, onClose }: ReserveModalProps) {
  const router = useRouter();
  const [selectedWarehouse, setSelectedWarehouse] =
    useState<StockLevelDTO | null>(
      product.stockLevels.find((sl) => sl.availableUnits > 0) ?? null
    );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableWarehouses = product.stockLevels.filter(
    (sl) => sl.availableUnits > 0
  );

  async function handleReserve() {
    if (!selectedWarehouse) return;
    setLoading(true);
    setError(null);

    try {
      const idempotencyKey = uuidv4();
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouse.warehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            data.code === "LOCK_CONTENTION"
              ? "Another request is processing this item. Please try again in a moment."
              : `Not enough stock available. ${data.error}`
          );
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      // Navigate to the reservation page
      router.push(`/reservations/${data.id}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="border-b border-slate-100 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2
                id="modal-title"
                className="text-lg font-semibold text-slate-900"
              >
                Reserve Item
              </h2>
              <p className="mt-1 text-sm text-slate-500">{product.name}</p>
              <p className="text-xs text-slate-400">SKU: {product.sku}</p>
            </div>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {/* Warehouse selection */}
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Fulfillment warehouse
            </label>
            {availableWarehouses.length === 0 ? (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <Package className="h-4 w-4 shrink-0" />
                No stock available at any warehouse
              </div>
            ) : (
              <div className="space-y-2">
                {product.stockLevels.map((sl) => {
                  const isAvailable = sl.availableUnits > 0;
                  const isSelected =
                    selectedWarehouse?.warehouseId === sl.warehouseId;
                  return (
                    <button
                      key={sl.warehouseId}
                      onClick={() => isAvailable && setSelectedWarehouse(sl)}
                      disabled={!isAvailable}
                      className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                        isSelected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : isAvailable
                          ? "border-slate-200 hover:border-slate-400 hover:bg-slate-50"
                          : "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">{sl.warehouseName}</div>
                          <div
                            className={`text-xs ${
                              isSelected ? "text-slate-300" : "text-slate-500"
                            }`}
                          >
                            {sl.warehouseLocation}
                          </div>
                        </div>
                        <div
                          className={`text-right text-xs ${
                            isSelected ? "text-slate-300" : "text-slate-500"
                          }`}
                        >
                          {isAvailable ? (
                            <>
                              <span
                                className={`font-semibold ${
                                  isSelected
                                    ? "text-white"
                                    : sl.availableUnits <= 3
                                    ? "text-amber-600"
                                    : "text-emerald-600"
                                }`}
                              >
                                {sl.availableUnits}
                              </span>{" "}
                              available
                            </>
                          ) : (
                            <span className="text-red-500">Out of stock</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quantity */}
          {selectedWarehouse && (
            <div>
              <label
                htmlFor="quantity"
                className="mb-2 block text-sm font-medium text-slate-700"
              >
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Decrease quantity"
                >
                  −
                </button>
                <input
                  id="quantity"
                  type="number"
                  min={1}
                  max={selectedWarehouse.availableUnits}
                  value={quantity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) {
                      setQuantity(
                        Math.min(
                          Math.max(1, v),
                          selectedWarehouse.availableUnits
                        )
                      );
                    }
                  }}
                  className="h-9 w-16 rounded-md border border-slate-200 text-center text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <button
                  onClick={() =>
                    setQuantity((q) =>
                      Math.min(q + 1, selectedWarehouse.availableUnits)
                    )
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                  aria-label="Increase quantity"
                >
                  +
                </button>
                <span className="text-xs text-slate-500">
                  max {selectedWarehouse.availableUnits}
                </span>
              </div>
            </div>
          )}

          {/* Reservation info */}
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <strong>How reservations work:</strong> We&apos;ll hold these units
            for <strong>10 minutes</strong> while you complete payment. If you
            don&apos;t confirm in time, the hold is released automatically.
          </div>

          {/* Error */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Reservation failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-slate-100 p-6">
          <Button variant="outline" onClick={onClose} className="flex-1">
            Cancel
          </Button>
          <Button
            onClick={handleReserve}
            disabled={loading || !selectedWarehouse || availableWarehouses.length === 0}
            className="flex-1"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Reserving…
              </>
            ) : (
              "Reserve now"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
