"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useAdminGetOrderQuery,
  useAdminOrderTransitionMutation,
  type AdminTransitionAction,
  type OrderStatus,
} from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";

const ACTION_BY_TARGET: Record<
  Extract<OrderStatus, "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED">,
  { label: string; action: AdminTransitionAction; danger?: boolean }
> = {
  SHIPPED: { label: "Mark shipped", action: "ship" },
  DELIVERED: { label: "Mark delivered", action: "deliver" },
  CANCELLED: { label: "Cancel", action: "cancel", danger: true },
  REFUNDED: { label: "Refund", action: "refund", danger: true },
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useAdminGetOrderQuery(params.id, {
    skip: !params.id,
  });
  const [runTransition, { isLoading: acting }] =
    useAdminOrderTransitionMutation();
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        Order not found.
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const { order, allowedTransitions } = data;
  const buttons = allowedTransitions
    .map((s) =>
      s in ACTION_BY_TARGET
        ? { to: s, ...ACTION_BY_TARGET[s as keyof typeof ACTION_BY_TARGET] }
        : null,
    )
    .filter((b): b is NonNullable<typeof b> => Boolean(b));

  async function handleAction(action: AdminTransitionAction) {
    setActionError(null);
    try {
      await runTransition({
        id: order.id,
        action,
        note: note.trim() || undefined,
      }).unwrap();
      setNote("");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(e.data?.error?.message ?? "Transition failed.");
    }
  }

  return (
    <div>
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/admin/orders" className="hover:text-foreground">
          Orders
        </Link>{" "}
        / <span className="font-mono">{order.id}</span>
      </nav>

      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Order
          </p>
          <h1 className="mt-2 text-3xl font-semibold tabular-nums">
            {formatINR(order.total)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.user?.name ?? "Guest checkout"} · {order.user?.email ?? order.contactEmail}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <StatusPill status={order.status} />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section>
            <h2 className="font-medium">Items</h2>
            <ul className="mt-3 space-y-3">
              {order.items.map((line) => (
                <li
                  key={line.id}
                  className="flex gap-4 rounded-lg border border-border p-5"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
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
                        <p className="font-medium">
                          {line.productSnapshot.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            line.productSnapshot.size,
                            line.productSnapshot.color,
                          ]
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
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-medium">History</h2>
            <ol className="mt-3 space-y-2 border-l border-border pl-4">
              {order.history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-foreground" />
                  <p className="text-sm">
                    {h.fromStatus ? (
                      <>
                        <span className="text-muted-foreground">
                          {h.fromStatus}
                        </span>{" "}
                        →{" "}
                      </>
                    ) : (
                      <span className="text-muted-foreground">created — </span>
                    )}
                    <span className="font-medium">{h.toStatus}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      · {h.actorKind}
                    </span>
                  </p>
                  {h.note && (
                    <p className="text-xs text-muted-foreground">
                      {h.note}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("en-IN")}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border p-5">
            <h2 className="font-medium">Actions</h2>
            {buttons.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No transitions available from {order.status}.
              </p>
            ) : (
              <>
                <label className="mt-3 block">
                  <span className="text-sm font-medium">Note (optional)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Tracking id, refund reason, …"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {buttons.map((b) => (
                    <button
                      key={b.action}
                      onClick={() => handleAction(b.action)}
                      disabled={acting}
                      className={
                        b.danger
                          ? "rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                          : "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      }
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            )}
            {actionError && (
              <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </div>
            )}
          </section>

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

          {order.payment && (
            <section className="rounded-lg border border-border p-5">
              <h2 className="font-medium">Payment</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row label="Provider" value={order.payment.provider} />
                <Row label="Status" value={order.payment.status} />
                <Row
                  label="Order id"
                  value={order.payment.providerOrderId}
                  mono
                />
                {order.payment.providerPaymentId && (
                  <Row
                    label="Payment id"
                    value={order.payment.providerPaymentId}
                    mono
                  />
                )}
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`max-w-[60%] truncate ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = {
    PENDING:
      "bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/20",
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

