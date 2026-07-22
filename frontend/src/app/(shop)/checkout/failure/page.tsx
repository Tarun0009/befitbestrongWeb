"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useCancelCheckoutMutation } from "@/lib/ordersApi";
import { useAppSelector } from "@/lib/hooks";

export default function FailurePage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" />}>
      <FailureContent />
    </Suspense>
  );
}

function FailureContent() {
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? "";
  const authStatus = useAppSelector((state) => state.auth.status);
  const [guestAccessToken, setGuestAccessToken] = useState<string | undefined>();
  const [cancel, { isLoading, isSuccess }] = useCancelCheckoutMutation();

  const [cancelError, setCancelError] = useState<string | null>(null);
  useEffect(() => {
    if (orderId) {
      setGuestAccessToken(
        window.sessionStorage.getItem("guest-order:" + orderId) ?? undefined,
      );
    }
  }, [orderId]);

  async function handleCancel() {
    if (!orderId) return;
    setCancelError(null);
    try {
      await cancel({ orderId, guestAccessToken }).unwrap();
    } catch (caught) {
      const apiError = caught as {
        data?: { error?: { message?: string } };
      };
      setCancelError(
        apiError.data?.error?.message ??
          "We could not confirm cancellation. Check your order status before trying again.",
      );
    }
  }

  const authReady = authStatus !== "idle" && authStatus !== "loading";

  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
      <section className="rounded-2xl border border-border p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Payment incomplete
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Your payment was not completed</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          You can return to checkout and try again, or cancel this pending order
          to release its reserved stock.
        </p>

        {orderId && (
          <p className="mt-6 break-all text-sm text-muted-foreground">
            Order: <span className="font-mono text-foreground">{orderId}</span>
          </p>
        )}

        {isSuccess && (
          <p className="mt-5 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700">
            The pending order was cancelled and its stock was released.
          </p>
        )}

        {cancelError && (
          <p className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {cancelError}
          </p>
        )}

        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/checkout"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Try checkout again
          </Link>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading || isSuccess || !orderId || !authReady}
            className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            {isLoading
              ? "Releasing…"
              : isSuccess
                ? "Order cancelled"
                : "Cancel pending order"}
          </button>
        </div>
      </section>
    </main>
  );
}
