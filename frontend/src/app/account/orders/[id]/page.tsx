"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useGetOrderQuery, type OrderStatus } from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { ReviewComposer } from "@/features/reviews/ReviewComposer";
import { SubscriptionEnrollButton } from "@/features/subscriptions/SubscriptionEnrollButton";

export default function OrderDetailPage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}

function Inner() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useGetOrderQuery({ id: params.id }, {
    skip: !params.id,
  });

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Order not found.
        </div>
        <Link
          href="/account/orders"
          className="mt-4 inline-block text-sm underline underline-offset-4"
        >
          ← All orders
        </Link>
      </main>
    );
  }

  if (isLoading || !data) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="h-40 animate-pulse rounded-lg bg-muted" />
      </main>
    );
  }

  const { order } = data;

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/account/orders" className="hover:text-foreground">
          Orders
        </Link>{" "}
        / <span className="font-mono">{order.id}</span>
      </nav>

      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Order
          </p>
          <h1 className="mt-3 text-3xl font-semibold">
            {formatINR(order.total)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <StatusPill status={order.status} />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="font-medium">Items</h2>
          <ul className="mt-3 space-y-3">
            {order.items.map((line) => (
              <li
                key={line.id}
                className="flex gap-4 rounded-lg border border-border p-5"
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                  {line.productSnapshot.image?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.productSnapshot.image.url}
                      alt={
                        line.productSnapshot.image.alt ??
                        line.productSnapshot.name
                      }
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/shop/${line.productSnapshot.slug}`}
                        className="font-medium hover:underline"
                      >
                        {line.productSnapshot.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[line.productSnapshot.size, line.productSnapshot.color]
                          .filter(Boolean)
                          .join(" / ") || line.productSnapshot.sku}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                        {formatINR(line.unitPrice)} × {line.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">
                      {formatINR(line.subtotal)}
                    </p>
                  </div>
                  {order.status === "DELIVERED" && (
                    <ReviewComposer
                      productSlug={line.productSnapshot.slug}
                      compact
                    />
                  )}
                  <SubscriptionEnrollButton
                    orderId={order.id}
                    variantId={line.variantId}
                    orderStatus={order.status}
                    maxQuantity={line.quantity}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="space-y-6">
          {order.shipments?.length > 0 && (
            <section className="rounded-lg border border-border p-5">
              <h2 className="font-medium">Track shipment</h2>
              <div className="mt-3 space-y-4">
                {order.shipments.map((shipment) => (
                  <article
                    key={shipment.id}
                    className="rounded-md border border-border bg-muted/20 p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">
                          {shipment.carrier}
                          {shipment.service ? ` · ${shipment.service}` : ""}
                        </p>
                        <p className="mt-1 font-mono text-xs text-muted-foreground">
                          {shipment.trackingNumber}
                        </p>
                      </div>
                      <span className="rounded-full bg-background px-2 py-0.5 text-xs font-medium ring-1 ring-inset ring-border">
                        {formatShipmentStatus(shipment.status)}
                      </span>
                    </div>
                    {shipment.estimatedDeliveryAt && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        Estimated delivery{" "}
                        {new Date(
                          shipment.estimatedDeliveryAt,
                        ).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    )}
                    {shipment.trackingUrl && (
                      <a
                        href={shipment.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex rounded-md bg-foreground px-3 py-2 text-xs font-medium text-background hover:opacity-90"
                      >
                        Track with carrier ↗
                      </a>
                    )}
                    {shipment.events.length > 0 && (
                      <ol className="mt-4 space-y-3 border-l border-border pl-4">
                        {shipment.events.map((event) => (
                          <li key={event.id} className="relative">
                            <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-foreground" />
                            <p className="text-sm font-medium">
                              {formatShipmentStatus(event.status)}
                            </p>
                            {event.description && (
                              <p className="text-xs text-muted-foreground">
                                {event.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              {event.location ? `${event.location} · ` : ""}
                              {new Date(event.occurredAt).toLocaleString("en-IN")}
                            </p>
                          </li>
                        ))}
                      </ol>
                    )}
                  </article>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-lg border border-border p-5">
            <h2 className="font-medium">Shipping</h2>
            <address className="mt-3 not-italic text-sm text-muted-foreground">
              <p className="text-foreground">{order.addressSnapshot.fullName}</p>
              <p>{order.addressSnapshot.line1}</p>
              {order.addressSnapshot.line2 && (
                <p>{order.addressSnapshot.line2}</p>
              )}
              <p>
                {order.addressSnapshot.city}, {order.addressSnapshot.state}{" "}
                {order.addressSnapshot.pincode}
              </p>
              <p>{order.addressSnapshot.country ?? "IN"}</p>
              <p className="mt-1">Phone: {order.addressSnapshot.phone}</p>
            </address>
          </section>

          <section className="rounded-lg border border-border p-5">
            <h2 className="font-medium">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatINR(order.subtotal)}</dd>
              </div>
              {order.bundleDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Bundle savings</dt>
                  <dd className="tabular-nums">−{formatINR(order.bundleDiscount)}</dd>
                </div>
              )}
              {order.couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Coupon savings{order.couponCode ? ` (${order.couponCode})` : ""}</dt>
                  <dd className="tabular-nums">−{formatINR(order.couponDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd className="tabular-nums">{formatINR(order.shipping)}</dd>
              </div>
              {order.paymentFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">COD handling fee</dt>
                  <dd className="tabular-nums">{formatINR(order.paymentFee)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="tabular-nums">{formatINR(order.tax)}</dd>
              </div>
              <div className="flex justify-between border-t border-border pt-2 font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatINR(order.total)}</dd>
              </div>
            </dl>
          </section>

          {order.payment && (
            <section className="rounded-lg border border-border p-5">
              <h2 className="font-medium">Payment</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Method</dt>
                  <dd>{order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="capitalize">{order.payment.provider}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>{order.payment.status}</dd>
                </div>
                {order.payment.providerPaymentId && (
                  <div className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">Payment ID</dt>
                    <dd className="max-w-[60%] truncate font-mono">
                      {order.payment.providerPaymentId}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {order.refunds.length > 0 && (
            <section className="rounded-lg border border-border p-5">
              <h2 className="font-medium">Refunds</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Provider confirmation can take a short time after a refund is requested.
              </p>
              <ol className="mt-3 space-y-3">
                {order.refunds.map((refund) => (
                  <li key={refund.id} className="rounded-md bg-muted/30 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatINR(refund.amount)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {refund.reason}
                        </p>
                      </div>
                      <span className="rounded-full bg-background px-2 py-1 text-[10px] font-semibold ring-1 ring-inset ring-border">
                        {formatShipmentStatus(refund.status)}
                      </span>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Requested {new Date(refund.createdAt).toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {order.history.length > 0 && (
            <section className="rounded-lg border border-border p-5">
              <h2 className="font-medium">Progress</h2>
              <ol className="mt-3 space-y-2 border-l border-border pl-4 text-sm">
                {order.history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-foreground" />
                    <p>
                      {h.fromStatus ? (
                        <>
                          <span className="text-muted-foreground">
                            {h.fromStatus}
                          </span>{" "}
                          →{" "}
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Order placed —{" "}
                        </span>
                      )}
                      <span className="font-medium">{h.toStatus}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(h.createdAt).toLocaleString("en-IN")}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </aside>
      </div>
    </main>
  );
}

function formatShipmentStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = {
    PENDING:
      "bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/20",
    CONFIRMED:
      "bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/20",
    PAID:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    SHIPPED:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    DELIVERED:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    CANCELLED: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    FAILED: "border border-red-300 bg-red-50 text-red-700",
    REFUNDED: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone[status]}`}>
      {status}
    </span>
  );
}

