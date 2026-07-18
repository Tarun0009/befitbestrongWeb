"use client";

import Link from "next/link";
import { ArrowUpRight, ChevronLeft, PackageCheck, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useListOrdersQuery, type OrderStatus } from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";
import { RequireAuth } from "@/features/auth/RequireAuth";

export default function OrdersPage() {
  return (
    <RequireAuth>
      <OrdersBody />
    </RequireAuth>
  );
}

function OrdersBody() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useListOrdersQuery({ page, limit: 10 });
  const activeOnPage = data?.items.filter((order) => ["PENDING", "CONFIRMED", "PAID", "SHIPPED"].includes(order.status)).length ?? 0;

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <Link href="/account" className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground"><ChevronLeft className="h-4 w-4" /> Account overview</Link>
      <header className="mt-6 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">Order history</p><h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Your orders</h1><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Track deliveries, review payment status, and open an order whenever you need support.</p></div>
        <Link href="/shop" className="inline-flex w-fit items-center gap-2 rounded-xl bg-foreground px-4 py-2.5 text-xs font-semibold text-background transition hover:opacity-90">Shop again <ArrowUpRight className="h-4 w-4" /></Link>
      </header>

      <section className="mt-7 grid gap-3 sm:grid-cols-3" aria-label="Order summary">
        <MiniStat label="All orders" value={data ? String(data.total) : "—"} />
        <MiniStat label="Active on this page" value={String(activeOnPage)} />
        <MiniStat label="Showing" value={data ? `${data.items.length} orders` : "—"} />
      </section>

      {error && <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><span>We couldn&apos;t load your orders.</span><button type="button" onClick={() => void refetch()} disabled={isFetching} className="inline-flex items-center gap-2 rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold hover:bg-red-100 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> {isFetching ? "Retrying…" : "Try again"}</button></div>}

      {isLoading ? <div className="mt-7 overflow-hidden rounded-3xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]"><div className="space-y-3" aria-label="Loading orders" aria-busy="true">{[1, 2, 3, 4].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-muted" />)}</div></div> : error ? null : !data || data.items.length === 0 ? <EmptyOrders /> : (
        <section className="mt-7 overflow-hidden rounded-3xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4 sm:px-6"><div><p className="text-sm font-semibold">All purchases</p><p className="mt-1 text-[11px] text-muted-foreground">Your latest orders appear first.</p></div>{isFetching && <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Updating…</span>}</div>
          <ul className={isFetching ? "opacity-60" : undefined}>
            {data.items.map((order) => <li key={order.id} className="border-b border-black/[0.06] last:border-0"><Link href={`/account/orders/${order.id}`} aria-label={`Order ${order.id}, ${order.status}, ${formatINR(order.total)}`} className="group flex flex-col gap-4 px-5 py-5 transition hover:bg-[#fcfbf8] sm:flex-row sm:items-center sm:px-6"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#f3f1eb] text-muted-foreground transition group-hover:bg-primary/10 group-hover:text-primary"><PackageCheck className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold">#{order.id.slice(0, 12)}</span><StatusPill status={order.status} /></span><span className="mt-1.5 block truncate text-sm text-muted-foreground">{order.items.slice(0, 3).map((item) => `${item.productSnapshot.name} ×${item.quantity}`).join(", ")}{order.items.length > 3 && ` +${order.items.length - 3} more`}</span><span className="mt-1 block text-[11px] text-muted-foreground">Placed {new Date(order.createdAt).toLocaleString("en-IN")}</span></span><span className="flex items-center justify-between gap-3 sm:block sm:text-right"><span className="text-base font-semibold tabular-nums">{formatINR(order.total)}</span><ArrowUpRight className="h-4 w-4 text-muted-foreground transition group-hover:text-foreground sm:ml-2 sm:inline-block" /></span></Link></li>)}
          </ul>
        </section>
      )}

      {data && data.totalPages > 1 && <nav className="mt-6 flex items-center justify-between rounded-2xl border border-black/[0.07] bg-white px-4 py-3 shadow-sm" aria-label="Order pages"><button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || isFetching} className="rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="text-xs text-muted-foreground" aria-live="polite">Page {data.page} of {data.totalPages}</span><button type="button" onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))} disabled={page >= data.totalPages || isFetching} className="rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">Next</button></nav>}
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-black/[0.07] bg-white px-4 py-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p></div>; }
function EmptyOrders() { return <section className="mt-7 rounded-3xl border border-dashed border-black/15 bg-white px-6 py-16 text-center"><span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#f3f1eb] text-muted-foreground"><PackageCheck className="h-6 w-6" /></span><h2 className="mt-5 text-lg font-semibold">No orders yet</h2><p className="mt-2 text-sm text-muted-foreground">Your completed purchases and delivery updates will appear here.</p><Link href="/shop" className="mt-6 inline-flex rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">Browse the shop</Link></section>; }
function StatusPill({ status }: { status: OrderStatus }) { const tone: Record<OrderStatus, string> = { PENDING: "bg-orange-500/10 text-orange-700", CONFIRMED: "bg-blue-500/10 text-blue-700", PAID: "bg-emerald-500/10 text-emerald-700", SHIPPED: "bg-emerald-500/10 text-emerald-700", DELIVERED: "bg-emerald-500/10 text-emerald-700", CANCELLED: "bg-muted text-muted-foreground", FAILED: "bg-red-500/10 text-red-700", REFUNDED: "bg-muted text-muted-foreground" }; return <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${tone[status]}`}>{status}</span>; }