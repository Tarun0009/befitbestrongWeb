"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  Clock3,
  Heart,
  PackageCheck,
  Settings2,
  ShoppingBag,
  Sparkles,
  Trophy,
  type LucideIcon,
} from "lucide-react";
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
  const { user } = useAppSelector((state) => state.auth);
  const {
    data: orders,
    isLoading: ordersLoading,
    isError: ordersError,
    refetch: refetchOrders,
  } = useListOrdersQuery({ page: 1, limit: 3 });
  const { data: wishlist } = useGetWishlistQuery(user?.uid ?? "", {
    skip: !user?.uid,
  });
  const { data: loyalty } = useGetLoyaltyQuery(user?.uid ?? "", {
    skip: !user?.uid,
  });

  const firstName = (
    user?.name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "athlete"
  ).trim();
  const activeCount =
    orders?.items.filter((order) =>
      ["PENDING", "CONFIRMED", "PAID", "SHIPPED"].includes(order.status),
    ).length ?? 0;

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <section className="relative overflow-hidden rounded-[2rem] bg-[#191916] px-5 py-7 text-white shadow-[0_18px_60px_rgba(23,23,20,0.16)] sm:px-8 sm:py-9 lg:px-10">
        <div className="pointer-events-none absolute -right-20 -top-32 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-1/3 h-72 w-72 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex flex-col justify-between gap-8 lg:flex-row lg:items-end">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
              <Sparkles className="h-3.5 w-3.5" /> Your member space
              {user?.role === "ADMIN" && (
                <span className="rounded-full border border-white/15 px-2 py-1 text-[9px] tracking-[0.14em] text-white/65">
                  Admin access
                </span>
              )}
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">
              Welcome back, {firstName}.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/60 sm:text-base">
              Manage your orders, delivery updates, saved products, and rewards in one place.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/shop" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:brightness-95">
                Shop the collection <ArrowUpRight className="h-4 w-4" />
              </Link>
              {user?.role === "ADMIN" && (
                <Link href="/admin" className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-2.5 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white">
                  Open admin panel <ArrowUpRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>

        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Account summary">
        <SummaryCard icon={PackageCheck} label="Total orders" value={orders ? String(orders.total) : "—"} note="Your complete order history" />
        <SummaryCard icon={Clock3} label="Active orders" value={String(activeCount)} note="Latest orders in progress" />
        <SummaryCard icon={Heart} label="Saved products" value={String(wishlist?.items.length ?? 0)} note="Ready when you are" />
        <SummaryCard icon={Trophy} label="Reward points" value={(loyalty?.account.pointsBalance ?? 0).toLocaleString("en-IN")} note="Available to redeem" />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,0.55fr)]">
        <section className="overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-5 sm:px-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Your activity</p>
              <h2 className="mt-1.5 text-xl font-semibold tracking-tight">Recent orders</h2>
            </div>
            <Link href="/account/orders" className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline">
              View all <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {ordersLoading ? (
            <div className="space-y-3 p-5 sm:p-6">{[1, 2, 3].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div>
          ) : ordersError ? (
            <div className="p-8 text-center" role="alert">
              <p className="text-sm font-semibold">Recent orders could not be loaded.</p>
              <button type="button" onClick={() => void refetchOrders()} className="mt-4 rounded-xl border border-black/10 px-4 py-2 text-xs font-semibold hover:bg-muted">Try again</button>
            </div>
          ) : !orders || orders.items.length === 0 ? (
            <div className="p-10 text-center sm:p-14">
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3f1eb] text-muted-foreground"><ShoppingBag className="h-5 w-5" /></span>
              <p className="mt-4 text-sm font-semibold">Your first order starts here.</p>
              <p className="mt-1 text-xs text-muted-foreground">Explore the collection and find your next essential.</p>
              <Link href="/shop" className="mt-5 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">Browse products</Link>
            </div>
          ) : (
            <ul className="divide-y divide-black/[0.06]">
              {orders.items.map((order) => (
                <li key={order.id}>
                  <Link href={`/account/orders/${order.id}`} className="group flex items-center gap-4 px-5 py-4 transition hover:bg-[#fcfbf8] sm:px-6">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#f3f1eb] text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary"><PackageCheck className="h-5 w-5" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold">#{order.id.slice(0, 10)}</span><StatusPill status={order.status} /></span>
                      <span className="mt-1 block truncate text-sm text-muted-foreground">{order.items.slice(0, 2).map((item) => `${item.productSnapshot.name} ×${item.quantity}`).join(", ")}{order.items.length > 2 && ` +${order.items.length - 2} more`}</span>
                      <span className="mt-1 block text-[11px] text-muted-foreground">Placed {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2"><span className="text-sm font-semibold tabular-nums">{formatINR(order.total)}</span><ArrowUpRight className="hidden h-4 w-4 text-muted-foreground transition group-hover:text-foreground sm:block" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-3xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
          <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-primary/10 text-primary"><Settings2 className="h-5 w-5" /></span><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Shortcuts</p><h2 className="mt-1 text-xl font-semibold tracking-tight">Make it yours</h2></div></div>
          <div className="mt-6 space-y-2">
            <ActionLink href="/account/wishlist" icon={Heart} title="Wishlist" note={`${wishlist?.items.length ?? 0} saved products`} />
            <ActionLink href="/account/rewards" icon={Trophy} title="Rewards" note="Redeem points and referrals" />
            <ActionLink href="/account/settings" icon={Settings2} title="Account settings" note="Profile and password" />
          </div>
          <div className="mt-6 rounded-2xl bg-[#f7f6f2] p-4"><p className="text-xs font-semibold">Need help?</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Our support team can help with delivery, returns, and order questions.</p><Link href="/support" className="mt-3 inline-flex text-xs font-semibold text-primary hover:underline">Visit support <ArrowUpRight className="ml-1 inline h-3.5 w-3.5" /></Link></div>
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value, note }: { icon: LucideIcon; label: string; value: string; note: string }) {
  return <div className="rounded-2xl border border-black/[0.07] bg-white p-4 shadow-sm sm:p-5"><div className="flex items-start justify-between gap-3"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</span><span className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span></div><p className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{note}</p></div>;
}

function ActionLink({ href, icon: Icon, title, note }: { href: string; icon: LucideIcon; title: string; note: string }) {
  return <Link href={href} className="group flex items-center gap-3 rounded-2xl border border-black/[0.06] p-3 transition hover:border-black/15 hover:bg-[#fcfbf8]"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#f3f1eb] text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{note}</span></span><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground" /></Link>;
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = { PENDING: "bg-orange-500/10 text-orange-700", CONFIRMED: "bg-blue-500/10 text-blue-700", PAID: "bg-emerald-500/10 text-emerald-700", SHIPPED: "bg-emerald-500/10 text-emerald-700", DELIVERED: "bg-emerald-500/10 text-emerald-700", CANCELLED: "bg-muted text-muted-foreground", FAILED: "bg-red-500/10 text-red-700", REFUNDED: "bg-muted text-muted-foreground" };
  return <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tone[status]}`}>{status}</span>;
}