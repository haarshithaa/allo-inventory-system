"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { ReservationDTO } from "@/lib/schemas";
import { formatTimeRemaining } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  Package,
  Warehouse,
  ArrowLeft,
} from "lucide-react";
import { v4 as uuidv4 } from "uuid";

interface ReservationDetailProps {
  initialReservation: ReservationDTO;
}

function StatusBadge({ status }: { status: ReservationDTO["status"] }) {
  switch (status) {
    case "PENDING":
      return (
        <Badge variant="warning" className="gap-1">
          <Clock className="h-3 w-3" />
          Pending
        </Badge>
      );
    case "CONFIRMED":
      return (
        <Badge variant="success" className="gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Confirmed
        </Badge>
      );
    case "RELEASED":
      return (
        <Badge variant="secondary" className="gap-1">
          <XCircle className="h-3 w-3" />
          Released
        </Badge>
      );
  }
}

export function ReservationDetail({
  initialReservation,
}: ReservationDetailProps) {
  const router = useRouter();
  const [reservation, setReservation] =
    useState<ReservationDTO>(initialReservation);
  const [timeRemaining, setTimeRemaining] = useState(() =>
    formatTimeRemaining(initialReservation.expiresAt)
  );
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Live countdown timer
  useEffect(() => {
    if (reservation.status !== "PENDING") return;

    const interval = setInterval(() => {
      const remaining = formatTimeRemaining(reservation.expiresAt);
      setTimeRemaining(remaining);

      // When timer hits zero, poll the server to get the updated status
      if (remaining.isExpired) {
        clearInterval(interval);
        refreshReservation();
      }
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservation.status, reservation.expiresAt]);

  const refreshReservation = useCallback(async () => {
    // We don't have a GET /api/reservations/:id endpoint in the spec,
    // but we can infer the state from the expiry time on the client.
    // The server will do lazy cleanup on the next confirm/release call.
    setTimeRemaining(formatTimeRemaining(reservation.expiresAt));
  }, [reservation.expiresAt]);

  async function handleConfirm() {
    setConfirmLoading(true);
    setError(null);

    try {
      const idempotencyKey = uuidv4();
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: {
          "Idempotency-Key": idempotencyKey,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 410) {
          setError(
            data.code === "RESERVATION_EXPIRED"
              ? "Your reservation expired before payment could be confirmed. The items have been returned to stock."
              : data.error
          );
          // Update local state to reflect the released status
          setReservation((prev) => ({ ...prev, status: "RELEASED" }));
        } else {
          setError(data.error ?? "Failed to confirm reservation.");
        }
        return;
      }

      setReservation(data);
      setSuccessMessage(
        "Purchase confirmed! Your order has been placed successfully."
      );
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleCancel() {
    setCancelLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to cancel reservation.");
        return;
      }

      setReservation(data);
      setSuccessMessage("Reservation cancelled. Items returned to stock.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setCancelLoading(false);
    }
  }

  const isPending = reservation.status === "PENDING";
  const isExpiredLocally =
    isPending && timeRemaining.isExpired;

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 py-5 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900"
              aria-label="Back to products"
            >
              <ArrowLeft className="h-4 w-4" />
              Products
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">
            Checkout
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Reservation #{reservation.id.slice(-8).toUpperCase()}
          </p>
        </div>

        <div className="space-y-4">
          {/* Status banner */}
          {successMessage && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>
                {reservation.status === "CONFIRMED"
                  ? "Order confirmed"
                  : "Reservation cancelled"}
              </AlertTitle>
              <AlertDescription>{successMessage}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Something went wrong</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {isExpiredLocally && !error && !successMessage && (
            <Alert variant="warning">
              <Clock className="h-4 w-4" />
              <AlertTitle>Reservation expired</AlertTitle>
              <AlertDescription>
                Your 10-minute hold has ended. The items have been returned to
                stock. Please go back and reserve again.
              </AlertDescription>
            </Alert>
          )}

          {/* Reservation card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle>Order summary</CardTitle>
                  <CardDescription className="mt-1">
                    Review your reservation details
                  </CardDescription>
                </div>
                <StatusBadge status={reservation.status} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Product */}
              <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                  <Package className="h-5 w-5 text-slate-400" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-slate-900">
                    {reservation.productName}
                  </p>
                  <p className="text-xs text-slate-500">
                    SKU: {reservation.productSku}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Qty: <strong>{reservation.quantity}</strong>
                  </p>
                </div>
              </div>

              {/* Warehouse */}
              <div className="flex items-center gap-3 rounded-lg bg-slate-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm">
                  <Warehouse className="h-5 w-5 text-slate-400" />
                </div>
                <div>
                  <p className="text-xs text-slate-500">Fulfillment warehouse</p>
                  <p className="font-medium text-slate-900">
                    {reservation.warehouseName}
                  </p>
                </div>
              </div>

              {/* Countdown / timestamps */}
              {isPending && !isExpiredLocally && (
                <div
                  className={`flex items-center justify-between rounded-lg p-4 ${
                    timeRemaining.isUrgent
                      ? "bg-red-50 text-red-900"
                      : "bg-amber-50 text-amber-900"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Clock
                      className={`h-5 w-5 ${
                        timeRemaining.isUrgent
                          ? "text-red-500"
                          : "text-amber-500"
                      }`}
                    />
                    <span className="text-sm font-medium">
                      Reservation expires in
                    </span>
                  </div>
                  <span
                    className={`font-mono text-xl font-bold tabular-nums ${
                      timeRemaining.isUrgent ? "text-red-600" : "text-amber-700"
                    }`}
                    aria-live="polite"
                    aria-label={`Time remaining: ${timeRemaining.display}`}
                  >
                    {timeRemaining.display}
                  </span>
                </div>
              )}

              {reservation.status === "CONFIRMED" && reservation.confirmedAt && (
                <div className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">
                  <strong>Confirmed</strong> at{" "}
                  {new Date(reservation.confirmedAt).toLocaleString()}
                </div>
              )}

              {reservation.status === "RELEASED" && reservation.releasedAt && (
                <div className="rounded-lg bg-slate-100 p-4 text-sm text-slate-600">
                  <strong>Released</strong> at{" "}
                  {new Date(reservation.releasedAt).toLocaleString()}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action buttons — only shown while pending */}
          {isPending && !isExpiredLocally && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={cancelLoading || confirmLoading}
                className="flex-1"
              >
                {cancelLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  "Cancel reservation"
                )}
              </Button>
              <Button
                variant="success"
                onClick={handleConfirm}
                disabled={confirmLoading || cancelLoading}
                className="flex-1"
              >
                {confirmLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Confirming…
                  </>
                ) : (
                  "Confirm purchase"
                )}
              </Button>
            </div>
          )}

          {(reservation.status === "CONFIRMED" ||
            reservation.status === "RELEASED" ||
            isExpiredLocally) && (
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              className="w-full"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to products
            </Button>
          )}
        </div>
      </div>
    </main>
  );
}
