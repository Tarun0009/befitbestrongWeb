"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CheckCircle2, Clock3 } from "lucide-react";
import { useGetOrderQuery } from "@/lib/ordersApi";
import { cartApi } from "@/lib/cartApi";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";

export default function SuccessPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" />}>
      <SuccessContent />
    </Suspense>
  );
}

function SuccessContent() {
  const params = useSearchParams();
  const orderId = params.get("orderId") ?? "";
  const authStatus = useAppSelector((state) => state.auth.status);
  const [guestAccessToken, setGuestAccessToken] = useState<string | undefined>();
  const [storageChecked, setStorageChecked] = useState(false);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (orderId) {
      setGuestAccessToken(
        window.sessionStorage.getItem("guest-order:" + orderId) ?? undefined,
      );
    }
    setStorageChecked(true);
    dispatch(cartApi.util.invalidateTags(["Cart"]));
  }, [dispatch, orderId]);

  const authReady = authStatus !== "idle" && authStatus !== "loading";
  const { data, isLoading, error } = useGetOrderQuery(
    { id: orderId, guestAccessToken },
    {
      skip: !orderId || !storageChecked || !authReady,
      pollingInterval: 2500,
    },
  );

  const order = data?.order;
  const isPaid = order?.status === "PAID";
  const isCodConfirmed =
    order?.paymentMethod === "COD" &&
    ["CONFIRMED", "SHIPPED", "DELIVERED"].includes(order.status);
  const isConfirmed = isPaid || isCodConfirmed;

  return (
    <main className="mx-auto max-w-4xl px-4 py-14 sm:px-6 sm:py-20">
      <div className="rounded-2xl border border-border p-6 sm:p-8">
        <span
          className={
            isPaid
              ? "grid h-12 w-12 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600"
              : "grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-foreground"
          }
        >
          {isConfirmed ? (
            <CheckCircle2 className="h-6 w-6" />
          ) : (
            <Clock3 className="h-6 w-6" />
          )}
        </span>

        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {isCodConfirmed
            ? "COD order confirmed"
            : isPaid
              ? "Order confirmed"
              : "Payment processing"}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {isConfirmed
            ? "Thank you for your order"
            : "We are confirming your payment"}
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
          {isCodConfirmed
            ? "Your order is confirmed. Keep the cash amount ready when the delivery arrives."
            : isPaid
              ? "Your order is being prepared. Keep the order number below for your records."
              : "Payment confirmation normally takes a few seconds. This page updates automatically."}
        </p>

        {error && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
            We could not access this order. Guest order access remains available
            in the browser tab where checkout was completed.
          </div>
        )}

        {isLoading || (!order && !error) ? (
          <div className="mt-8 h-32 animate-pulse rounded-xl bg-muted" />
        ) : order ? (
          <section className="mt-8 rounded-xl bg-muted/40 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">
                  Order number
                </p>
                <p className="mt-1 break-all font-mono text-sm">{order.id}</p>
              </div>
              <p className="text-2xl font-semibold tabular-nums">
                {formatINR(order.total)}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="rounded-full bg-background px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-border">
                {order.status}
              </span>
              <span className="text-muted-foreground">
                {order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}
              </span>
              <span className="text-muted-foreground">
                Contact: {order.contactEmail}
              </span>
            </div>
          </section>
        ) : null}

        <div className="mt-7 flex flex-wrap gap-3">
          {order?.userId && (
            <Link
              href={"/account/orders/" + order.id}
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
            >
              View order details
            </Link>
          )}
          <Link
            href="/shop"
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:brightness-95"
          >
            Continue shopping
          </Link>
          {order && !order.userId && (
            <Link
              href="/signup"
              className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
            >
              Create an account
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
