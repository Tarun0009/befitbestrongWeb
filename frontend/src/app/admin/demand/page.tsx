"use client";

import Link from "next/link";
import { BellRing, Heart, MailCheck, MailWarning } from "lucide-react";
import { useAdminGetDemandQuery } from "@/features/wishlist/wishlistApi";

export default function AdminDemandPage() {
  const { data, isLoading, isError } = useAdminGetDemandQuery();

  if (isLoading) {
    return <div className="h-52 animate-pulse rounded-xl bg-muted" />;
  }

  if (isError || !data) {
    return (
      <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
        Customer demand data could not be loaded.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold">Customer demand</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Wishlist interest and variant-level restock demand.
        </p>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={<Heart className="h-5 w-5" />}
          label="Wishlist saves"
          value={data.summary.totalWishlistItems}
        />
        <Stat
          icon={<BellRing className="h-5 w-5" />}
          label="Active stock alerts"
          value={data.summary.activeStockAlerts}
        />
        <Stat
          icon={
            data.summary.notificationsConfigured ? (
              <MailCheck className="h-5 w-5" />
            ) : (
              <MailWarning className="h-5 w-5" />
            )
          }
          label="Alert customers"
          value={data.summary.alertCustomers}
        />
      </section>

      <div
        className={
          data.summary.notificationsConfigured
            ? "rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-800"
            : "rounded-xl border border-orange-300 bg-orange-50 p-4 text-sm text-orange-800"
        }
      >
        {data.summary.notificationsConfigured
          ? "Restock emails are enabled. Alerts are sent when admin inventory moves from zero to available."
          : "Restock demand is being collected, but emails are paused until RESEND_API_KEY and EMAIL_FROM are configured."}
      </div>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Most wishlisted</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Use this signal for merchandising and purchasing.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {data.topWishlisted.length} products
            </span>
          </div>

          {data.topWishlisted.length ? (
            <ol className="mt-5 space-y-3">
              {data.topWishlisted.map((row, index) => (
                <li
                  key={row.product.id}
                  className="flex items-center justify-between gap-4 border-t border-border pt-3 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      #{index + 1}
                    </p>
                    <Link
                      href={"/admin/products/" + row.product.id}
                      className="truncate text-sm font-medium hover:underline"
                    >
                      {row.product.name}
                    </Link>
                  </div>
                  <span className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold">
                    {row.count} saves
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              No products have been saved yet.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-border p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <h3 className="font-semibold">Restock requests</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Active alerts grouped by exact variant.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">
              {data.stockAlertDemand.length} variants
            </span>
          </div>

          {data.stockAlertDemand.length ? (
            <ol className="mt-5 space-y-3">
              {data.stockAlertDemand.map((row, index) => {
                const label =
                  [row.variant.size, row.variant.color]
                    .filter(Boolean)
                    .join(" / ") || row.variant.sku;
                return (
                  <li
                    key={row.variant.id}
                    className="flex items-center justify-between gap-4 border-t border-border pt-3 first:border-0 first:pt-0"
                  >
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        #{index + 1} · {label}
                      </p>
                      <Link
                        href={"/admin/products/" + row.variant.product.id}
                        className="truncate text-sm font-medium hover:underline"
                      >
                        {row.variant.product.name}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Current stock: {row.variant.stock}
                      </p>
                    </div>
                    <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-xs font-semibold text-orange-700">
                      {row.count} alerts
                    </span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-5 text-sm text-muted-foreground">
              No active restock requests.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border border-border p-5">
      <span className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15">
        {icon}
      </span>
      <p className="mt-4 text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
