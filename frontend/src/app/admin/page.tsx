"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BellRing,
  CheckCircle2,
  IndianRupee,
  PackagePlus,
  PanelsTopLeft,
  RefreshCw,
  ShoppingBag,
  Store,
  type LucideIcon,
} from "lucide-react";
import {
  useGetAnalyticsSummaryQuery,
  useGetTopProductsQuery,
  type AnalyticsSummary,
} from "@/lib/adminAnalyticsApi";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

type OrderStatus = keyof AnalyticsSummary["ordersByStatus"];

const ORDER_STATUSES: Array<{
  key: OrderStatus;
  label: string;
  dot: string;
  bar: string;
}> = [
  {
    key: "PENDING",
    label: "Pending",
    dot: "bg-orange-500",
    bar: "bg-orange-400",
  },
  {
    key: "PAID",
    label: "Paid",
    dot: "bg-blue-500",
    bar: "bg-blue-500",
  },
  {
    key: "SHIPPED",
    label: "Shipped",
    dot: "bg-violet-500",
    bar: "bg-violet-500",
  },
  {
    key: "DELIVERED",
    label: "Delivered",
    dot: "bg-emerald-500",
    bar: "bg-emerald-500",
  },
  {
    key: "CANCELLED",
    label: "Cancelled",
    dot: "bg-slate-400",
    bar: "bg-slate-400",
  },
  {
    key: "FAILED",
    label: "Failed",
    dot: "bg-red-500",
    bar: "bg-red-500",
  },
  {
    key: "REFUNDED",
    label: "Refunded",
    dot: "bg-rose-400",
    bar: "bg-rose-400",
  },
];

export default function AdminOverviewPage() {
  const {
    data: summary,
    isLoading: summaryLoading,
    isFetching: summaryFetching,
    isError: summaryError,
    refetch: refetchSummary,
  } = useGetAnalyticsSummaryQuery();
  const {
    data: topProducts,
    isLoading: productsLoading,
    isFetching: productsFetching,
    isError: productsError,
    refetch: refetchProducts,
  } = useGetTopProductsQuery({
    days: 30,
    limit: 5,
  });

  const openOrders = summary
    ? (summary.ordersByStatus.PENDING ?? 0) +
      (summary.ordersByStatus.PAID ?? 0) +
      (summary.ordersByStatus.SHIPPED ?? 0)
    : undefined;

  const orderCounts = ORDER_STATUSES.map(
    (status) => summary?.ordersByStatus[status.key] ?? 0,
  );
  const maxOrderCount = Math.max(1, ...orderCounts);
  const isRefreshing = summaryFetching || productsFetching;

  function refreshDashboard() {
    void refetchSummary();
    void refetchProducts();
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            Today at a glance
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Store operations
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Revenue, orders, inventory risk, and product performance in one
            decision-ready view.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshDashboard}
          disabled={isRefreshing}
          className="inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold shadow-sm transition hover:bg-black/[0.03] disabled:opacity-60"
        >
          <RefreshCw
            className={cn("h-4 w-4", isRefreshing && "animate-spin")}
          />
          {isRefreshing ? "Refreshing" : "Refresh data"}
        </button>
      </section>

      {(summaryError || productsError) && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">Some dashboard data could not load.</p>
            <p className="mt-1 text-red-700">
              Refresh the dashboard. If the issue continues, verify the API and
              administrator session.
            </p>
          </div>
        </div>
      )}

      <section
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Store metrics"
      >
        <StatCard
          label="Revenue today"
          value={summary ? formatINR(summary.revenueToday) : undefined}
          hint="Confirmed revenue for the current day"
          icon={IndianRupee}
          iconClassName="bg-amber-100 text-amber-800"
          accentClassName="bg-primary"
          loading={summaryLoading}
        />
        <StatCard
          label="Orders today"
          value={summary ? String(summary.ordersToday) : undefined}
          hint="Orders placed since midnight"
          icon={ShoppingBag}
          iconClassName="bg-blue-100 text-blue-700"
          accentClassName="bg-blue-500"
          loading={summaryLoading}
        />
        <StatCard
          label="Open orders"
          value={openOrders === undefined ? undefined : String(openOrders)}
          hint="Pending, paid, or shipped"
          icon={BellRing}
          iconClassName="bg-violet-100 text-violet-700"
          accentClassName="bg-violet-500"
          loading={summaryLoading}
        />
        <StatCard
          label="Low-stock variants"
          value={summary ? String(summary.lowStockCount) : undefined}
          hint="Variants with fewer than five units"
          icon={AlertTriangle}
          iconClassName={
            summary && summary.lowStockCount > 0
              ? "bg-red-100 text-red-700"
              : "bg-emerald-100 text-emerald-700"
          }
          accentClassName={
            summary && summary.lowStockCount > 0
              ? "bg-red-500"
              : "bg-emerald-500"
          }
          loading={summaryLoading}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <article className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6 xl:col-span-7">
          <CardHeader
            eyebrow="Order pipeline"
            title="Orders by status"
            actionHref="/admin/orders"
            actionLabel="View all orders"
          />

          {summaryLoading ? (
            <SkeletonList rows={7} />
          ) : summaryError || !summary ? (
            <EmptyState
              icon={AlertTriangle}
              title="Order pipeline unavailable"
              description="Refresh the dashboard to load current order status totals."
            />
          ) : (
            <div className="mt-6 space-y-4">
              {ORDER_STATUSES.map((status) => {
                const count = summary?.ordersByStatus[status.key] ?? 0;
                const width =
                  count === 0 ? 0 : Math.max(4, (count / maxOrderCount) * 100);
                return (
                  <Link
                    key={status.key}
                    href={"/admin/orders?status=" + status.key}
                    className="group block"
                  >
                    <div className="flex items-center justify-between gap-4 text-sm">
                      <span className="flex items-center gap-2.5 font-medium text-foreground/80 group-hover:text-foreground">
                        <span
                          className={cn("h-2 w-2 rounded-full", status.dot)}
                        />
                        {status.label}
                      </span>
                      <span className="font-semibold tabular-nums">{count}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#f0efe9]">
                      <div
                        className={cn(
                          "h-full rounded-full transition-[width] duration-500",
                          status.bar,
                        )}
                        style={{ width: String(width) + "%" }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </article>

        <article className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6 xl:col-span-5">
          <CardHeader
            eyebrow="Last 30 days"
            title="Top products"
            actionHref="/admin/products"
            actionLabel="Manage catalog"
          />

          {productsLoading ? (
            <SkeletonList rows={5} />
          ) : productsError ? (
            <EmptyState
              icon={AlertTriangle}
              title="Product performance unavailable"
              description="Refresh the dashboard to load the latest sales ranking."
            />
          ) : !topProducts || topProducts.items.length === 0 ? (
            <EmptyState
              icon={ShoppingBag}
              title="No sales in this window"
              description="Top-selling products will appear after orders are recorded."
            />
          ) : (
            <ol className="mt-5 divide-y divide-black/[0.06]">
              {topProducts.items.map((product, index) => (
                <li key={product.productId} className="py-4 first:pt-0">
                  <div className="flex items-start gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f4f3ef] text-xs font-bold tabular-nums text-muted-foreground">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <Link
                          href={"/admin/products/" + product.productId}
                          className="truncate text-sm font-semibold hover:underline"
                        >
                          {product.name}
                        </Link>
                        <span className="shrink-0 text-xs font-semibold tabular-nums">
                          {formatINR(product.revenue)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>{product.unitsSold} units sold</span>
                        <span>{Math.round(product.pctOfTop)}% of leader</span>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f0efe9]">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width:
                              String(Math.max(4, product.pctOfTop)) + "%",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-12">
        <article className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6 xl:col-span-8">
          <CardHeader
            eyebrow="Inventory attention"
            title="Low-stock watchlist"
            actionHref="/admin/products"
            actionLabel="Open inventory"
          />

          {summaryLoading ? (
            <SkeletonList rows={4} />
          ) : summaryError || !summary ? (
            <EmptyState
              icon={AlertTriangle}
              title="Inventory status unavailable"
              description="Refresh the dashboard before making stock decisions."
            />
          ) : summary.lowStockItems.length > 0 ? (
            <div className="mt-5 divide-y divide-black/[0.06]">
              {summary.lowStockItems.map((variant) => (
                <div
                  key={variant.variantId}
                  className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center sm:gap-5"
                >
                  <div className="min-w-0">
                    <Link
                      href={"/admin/products/" + variant.product.id}
                      className="block truncate text-sm font-semibold hover:underline"
                    >
                      {variant.product.name}
                    </Link>
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      {[variant.size, variant.color]
                        .filter(Boolean)
                        .join(" / ") || "Default variant"}
                      <span className="mx-2 text-black/20">•</span>
                      SKU {variant.sku}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "w-fit rounded-full px-2.5 py-1 text-xs font-semibold",
                      variant.stock === 0
                        ? "bg-red-100 text-red-700"
                        : "bg-orange-100 text-orange-700",
                    )}
                  >
                    {variant.stock === 0
                      ? "Out of stock"
                      : String(variant.stock) + " remaining"}
                  </span>
                  <Link
                    href={"/admin/products/" + variant.product.id}
                    className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
                  >
                    Update
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={CheckCircle2}
              title="Inventory looks healthy"
              description="No variants are currently below the low-stock threshold."
              positive
            />
          )}

          {summary && summary.lowStockCount > summary.lowStockItems.length && (
            <p className="mt-4 border-t border-black/[0.06] pt-4 text-xs text-muted-foreground">
              Showing {summary.lowStockItems.length} priority variants from{" "}
              {summary.lowStockCount} low-stock variants.
            </p>
          )}
        </article>

        <article className="rounded-2xl bg-[#171714] p-5 text-white shadow-[0_18px_55px_rgba(23,23,20,0.18)] sm:p-6 xl:col-span-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Shortcuts
          </p>
          <h3 className="mt-2 text-xl font-semibold">Quick actions</h3>
          <p className="mt-2 text-sm leading-6 text-white/50">
            Jump straight into the tasks that keep the storefront current.
          </p>

          <div className="mt-6 space-y-2">
            <QuickAction
              href="/admin/products/new"
              icon={PackagePlus}
              label="Add a new product"
              description="Create pricing and variants"
            />
            <QuickAction
              href="/admin/orders"
              icon={ShoppingBag}
              label="Process orders"
              description="Review payment and fulfilment"
            />
            <QuickAction
              href="/admin/homepage"
              icon={PanelsTopLeft}
              label="Update homepage"
              description="Refresh featured content"
            />
            <QuickAction
              href="/"
              icon={Store}
              label="Open storefront"
              description="See the customer experience"
              external
            />
          </div>
        </article>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  iconClassName,
  accentClassName,
  loading,
}: {
  label: string;
  value?: string;
  hint: string;
  icon: LucideIcon;
  iconClassName: string;
  accentClassName: string;
  loading: boolean;
}) {
  return (
    <article className="relative overflow-hidden rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
      <span
        className={cn("absolute inset-x-0 top-0 h-1", accentClassName)}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-muted-foreground">{label}</p>
          {loading ? (
            <div className="mt-3 h-9 w-28 animate-pulse rounded-lg bg-muted" />
          ) : (
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {value ?? "—"}
            </p>
          )}
        </div>
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-xl",
            iconClassName,
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      </div>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">{hint}</p>
    </article>
  );
}

function CardHeader({
  eyebrow,
  title,
  actionHref,
  actionLabel,
}: {
  eyebrow: string;
  title: string;
  actionHref: string;
  actionLabel: string;
}) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
        <h3 className="mt-1.5 text-lg font-semibold tracking-tight">{title}</h3>
      </div>
      <Link
        href={actionHref}
        className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        {actionLabel}
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </header>
  );
}

function QuickAction({
  href,
  icon: Icon,
  label,
  description,
  external = false,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  external?: boolean;
}) {
  return (
    <Link
      href={href}
      target={external ? "_blank" : undefined}
      className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.045] p-3 transition hover:border-white/20 hover:bg-white/[0.08]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-white">{label}</span>
        <span className="mt-1 block truncate text-[10px] text-white/40">
          {description}
        </span>
      </span>
      <ArrowRight className="h-4 w-4 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/60" />
    </Link>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  positive = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  positive?: boolean;
}) {
  return (
    <div className="mt-6 flex flex-col items-center rounded-2xl border border-dashed border-black/10 bg-[#faf9f6] px-6 py-10 text-center">
      <span
        className={cn(
          "grid h-11 w-11 place-items-center rounded-full",
          positive
            ? "bg-emerald-100 text-emerald-700"
            : "bg-black/[0.05] text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-semibold">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="mt-6 space-y-4">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index}>
          <div className="flex items-center justify-between">
            <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            <div className="h-4 w-8 animate-pulse rounded bg-muted" />
          </div>
          <div className="mt-2 h-2 animate-pulse rounded-full bg-muted" />
        </div>
      ))}
    </div>
  );
}
