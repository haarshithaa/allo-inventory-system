import { z } from "zod";

// ─── Request schemas ──────────────────────────────────────────────────────────

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  warehouseId: z.string().min(1, "warehouseId is required"),
  quantity: z
    .number()
    .int("quantity must be an integer")
    .min(1, "quantity must be at least 1")
    .max(100, "quantity cannot exceed 100"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

// ─── Response types ───────────────────────────────────────────────────────────

export interface WarehouseDTO {
  id: string;
  name: string;
  location: string;
}

export interface StockLevelDTO {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
}

export interface ProductDTO {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  imageUrl: string | null;
  stockLevels: StockLevelDTO[];
}

export interface ReservationDTO {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string; // ISO string
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}

export interface ApiError {
  error: string;
  code?: string;
}
