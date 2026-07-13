"use client";

import Link from "next/link";
import { useListOrdersQuery, type OrderStatus } from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";
import { RequireAuth } from "@/features/auth/RequireAuth";

export default function OrdersPage() {
  return (
    <RequireAuth>
      <Inner />
    </RequireAuth>
  );
}

function Inner() {
  const { data, isLoading, error } = useListOrdersQuery();

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header>
        <p className="text-sm uppercase tracking-widest text-muted-foreground">
          Account
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Your orders</h1>
      </header>

      {error && (
        <div className="mt-8 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn't load orders.
        </div>
      )}

      {isLoading ? (
        <div className="mt-8 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="mt-16 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">No orders yet.</p>
          <Link
            href="/shop"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Browse the shop
          </Link>
        </div>
      ) : (
        <ul className="mt-8 space-y-3">
          {data.items.map((o) => (
            <li key={o.id}>
              <Link
                href={`/account/orders/${o.id}`}
                className="block rounded-lg border border-border p-5 hover:border-foreground/40"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">
                      {o.id}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {new Date(o.createdAt).toLocaleString("en-IN")}
                    </p>
                    <p className="mt-2 text-sm">
                      {o.items
                        .slice(0, 3)
                        .map((i) => `${i.productSnapshot.name} ×${i.quantity}`)
                        .join(", ")}
                      {o.items.length > 3 && ` +${o.items.length - 3} more`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <StatusPill status={o.status} />
                    <p className="font-medium tabular-nums">
                      {formatINR(o.total)}
                    </p>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
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
    <span
      className={`rounded-full px-2 py-0.5 text-xs ${tone[status]}`}
    >
      {status}
    </span>
  );
}
