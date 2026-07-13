"use client";

import Link from "next/link";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAppSelector } from "@/lib/hooks";
import { useListOrdersQuery, type OrderStatus } from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";
import { useGetWishlistQuery } from "@/features/wishlist/wishlistApi";
import { useGetLoyaltyQuery } from "@/features/loyalty/loyaltyApi";

export default function AccountPage() {
  return (
    <RequireAuth>
      <AccountBody />
    </RequireAuth>
  );
}

function AccountBody() {
  const { user } = useAppSelector((s) => s.auth);
  const { data: orders, isLoading: ordersLoading } = useListOrdersQuery({
    page: 1,
    limit: 3,
  });
  const { data: wishlist } = useGetWishlistQuery(user?.uid ?? "", {
    skip: !user?.uid,
  });
  const { data: loyalty } = useGetLoyaltyQuery(user?.uid ?? "", {
    skip: !user?.uid,
  });

  const firstName = (user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "athlete").trim();
  const inProgressCount =
    orders?.items.filter((o) =>
      ["PENDING", "PAID", "SHIPPED"].includes(o.status),
    ).length ?? 0;

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      {/* Greeting */}
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Your account
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Welcome back, {firstName}.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {user?.email}
            {user?.role === "ADMIN" && (
              <>
                {" · "}
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary ring-1 ring-inset ring-primary/20">
                  Admin
                </span>
              </>
            )}
          </p>
        </div>

        {user?.role === "ADMIN" && (
          <Link
            href="/admin"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Open admin panel →
          </Link>
        )}
      </header>

      {/* Quick stats */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total orders"
          value={orders ? String(orders.total) : "—"}
          hint={
            orders && orders.total === 0
              ? "You haven't placed one yet"
              : orders
                ? `Latest ${orders.items.length} shown below`
                : undefined
          }
        />
        <Stat
          label="In progress"
          value={String(inProgressCount)}
          hint="Pending, paid, or in transit"
        />
        <Stat
          label="Saved products"
          value={String(wishlist?.items.length ?? 0)}
          hint="Synced to your wishlist"
        />
        <Stat
          label="Reward points"
          value={(loyalty?.account.pointsBalance ?? 0).toLocaleString("en-IN")}
          hint="Ready to redeem"
        />
      </section>

      {/* Quick actions */}
      <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <ActionCard
          href="/account/orders"
          title="Your orders"
          body="Track deliveries, view invoices, request a refund."
          cta="View all orders →"
        />
        <ActionCard
          href="/account/wishlist"
          title="Wishlist & stock alerts"
          body="Return to saved products and manage availability alerts."
          cta="View saved items →"
        />
        <ActionCard
          href="/account/rewards"
          title="Rewards & referrals"
          body="Earn points, unlock private coupons, and invite friends."
          cta="Open rewards →"
        />
        <ActionCard
          href="/account/subscriptions"
          title="Subscriptions"
          body="Review refill schedules, pause, skip, or cancel."
          cta="Manage subscriptions →"
        />
        <ActionCard
          href="/shop"
          title="Continue shopping"
          body="New drops, best sellers, and every category you love."
          cta="Browse the shop →"
        />
      </section>

      {/* Recent orders */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold">Recent orders</h2>
          <Link
            href="/account/orders"
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            All orders →
          </Link>
        </div>

        {ordersLoading ? (
          <div className="mt-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : !orders || orders.items.length === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-border p-10 text-center">
            <p className="text-sm text-muted-foreground">
              No orders yet — get after it.
            </p>
            <Link
              href="/shop"
              className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              Start shopping
            </Link>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {orders.items.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/account/orders/${o.id}`}
                  className="block rounded-lg border border-border p-5 hover:border-foreground/40"
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs font-mono text-muted-foreground">
                        {o.id.slice(0, 16)}…
                      </p>
                      <p className="mt-1 truncate text-sm">
                        {o.items
                          .slice(0, 2)
                          .map(
                            (i) =>
                              `${i.productSnapshot.name} ×${i.quantity}`,
                          )
                          .join(", ")}
                        {o.items.length > 2 && ` +${o.items.length - 2} more`}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Placed {new Date(o.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <StatusPill status={o.status} />
                      <p className="mt-2 font-medium tabular-nums">
                        {formatINR(o.total)}
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Placeholders for future account features */}
      <section className="mt-16">
        <h2 className="text-xl font-semibold">More account tools</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <PlaceholderCard
            title="Address book"
            body="Manage saved shipping addresses (Phase 10+)"
          />
          <PlaceholderCard
            title="Payment methods"
            body="Saved cards & UPI (Phase 10+)"
          />
          <PlaceholderCard
            title="Preferences"
            body="Email + notifications (Phase 10+)"
          />
        </div>
      </section>
    </main>
  );
}

// ------------- Reusable bits -------------

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{value}</p>
      {hint && (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      )}
    </div>
  );
}

function ActionCard({
  href,
  title,
  body,
  cta,
}: {
  href: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-lg border border-border p-5 transition-colors hover:border-foreground/40"
    >
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <span className="mt-3 inline-block text-sm text-primary group-hover:underline">
        {cta}
      </span>
    </Link>
  );
}

function PlaceholderCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-5 text-sm">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{body}</p>
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

