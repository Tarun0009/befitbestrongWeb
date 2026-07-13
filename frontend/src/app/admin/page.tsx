"use client";

import Link from "next/link";
import {
  useGetAnalyticsSummaryQuery,
  useGetTopProductsQuery,
  type AnalyticsSummary,
} from "@/lib/adminAnalyticsApi";
import { formatINR } from "@/lib/format";

type OrderStatus = keyof AnalyticsSummary["ordersByStatus"];

const STATUS_ORDER: OrderStatus[] = [
  "PENDING",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "REFUNDED",
];

export default function AdminOverviewPage() {
  const { data: summary, isLoading: sLoading } = useGetAnalyticsSummaryQuery();
  const { data: top, isLoading: tLoading } = useGetTopProductsQuery({
    days: 30,
    limit: 5,
  });

  return (
    <div className="space-y-8">
      {/* Top row — headline metrics */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Revenue today"
          value={summary ? formatINR(summary.revenueToday) : "—"}
          hint={
            summary
              ? `${summary.ordersToday} order${summary.ordersToday === 1 ? "" : "s"}`
              : undefined
          }
        />
        <Stat
          label="Open orders"
          value={
            summary
              ? String(
                  (summary.ordersByStatus.PENDING ?? 0) +
                    (summary.ordersByStatus.PAID ?? 0) +
                    (summary.ordersByStatus.SHIPPED ?? 0),
                )
              : "—"
          }
          hint="pending + paid + shipped"
        />
        <Stat
          label="Low-stock variants"
          value={summary ? String(summary.lowStockCount) : "—"}
          hint="< 5 in stock"
        />
      </section>

      {/* Second row — orders by status + top products */}
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Orders by status</h2>
            <Link
              href="/admin/orders"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              View all →
            </Link>
          </div>
          {sLoading ? (
            <SkeletonList rows={7} />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {STATUS_ORDER.map((s) => (
                <li key={s} className="flex items-center justify-between">
                  <Link
                    href={`/admin/orders?status=${s}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </Link>
                  <span className="tabular-nums">
                    {summary?.ordersByStatus[s] ?? 0}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-lg border border-border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Top products · 30 days</h2>
            <Link
              href="/admin/products"
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              All products →
            </Link>
          </div>
          {tLoading ? (
            <SkeletonList rows={5} />
          ) : !top || top.items.length === 0 ? (
            <p className="mt-4 text-sm text-muted-foreground">
              No sales in this window yet.
            </p>
          ) : (
            <ol className="mt-3 space-y-2 text-sm">
              {top.items.map((p, i) => (
                <li key={p.productId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      <span className="mr-2 text-muted-foreground tabular-nums">
                        {i + 1}.
                      </span>
                      <Link
                        href={`/shop/${p.slug}`}
                        target="_blank"
                        className="hover:underline"
                      >
                        {p.name}
                      </Link>
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {p.unitsSold} units · {formatINR(p.revenue)}
                    </span>
                  </div>
                  <div className="mt-1 h-1 w-full rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-foreground"
                      style={{ width: `${Math.max(4, p.pctOfTop)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Low stock alerts */}
      {summary && summary.lowStockItems.length > 0 && (
        <section className="rounded-lg border border-border p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Low-stock alerts</h2>
            <span className="text-xs text-muted-foreground">
              Showing {summary.lowStockItems.length} of {summary.lowStockCount}
            </span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {summary.lowStockItems.map((v) => (
              <li
                key={v.variantId}
                className="flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/products/${v.product.id}`}
                    className="truncate font-medium hover:underline"
                  >
                    {v.product.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[v.size, v.color].filter(Boolean).join(" / ") || v.sku}
                  </p>
                </div>
                <span
                  className={
                    v.stock === 0
                      ? "rounded-full border border-red-300 bg-red-50 px-2 py-0.5 text-xs text-red-700"
                      : "rounded-full bg-orange-500/10 px-2 py-0.5 text-xs text-orange-600 ring-1 ring-inset ring-orange-500/20"
                  }
                >
                  {v.stock === 0 ? "out of stock" : `${v.stock} left`}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Quick actions */}
      <section className="rounded-lg border border-border p-5">
        <h2 className="font-medium">Quick actions</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            href="/admin/products/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            New product
          </Link>
          <Link
            href="/admin/products"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Manage products
          </Link>
          <Link
            href="/admin/orders"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Manage orders
          </Link>
          <Link
            href="/shop"
            className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            View storefront
          </Link>
        </div>
      </section>
    </div>
  );
}

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

function SkeletonList({ rows }: { rows: number }) {
  return (
    <div className="mt-3 space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-muted" />
      ))}
    </div>
  );
}
