"use client";

import Link from "next/link";
import { BellRing, ChevronLeft } from "lucide-react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { ProductCard } from "@/components/ProductCard";
import { useAppSelector } from "@/lib/hooks";
import {
  useGetStockAlertsQuery,
  useGetWishlistQuery,
  useUnsubscribeStockAlertMutation,
} from "@/features/wishlist/wishlistApi";

export default function WishlistPage() {
  return (
    <RequireAuth>
      <WishlistBody />
    </RequireAuth>
  );
}

function WishlistBody() {
  const user = useAppSelector((state) => state.auth.user);
  const userKey = user?.uid ?? "";
  const {
    data: wishlist,
    isLoading: wishlistLoading,
    isError: wishlistError,
  } = useGetWishlistQuery(userKey, { skip: !userKey });
  const {
    data: alerts,
    isLoading: alertsLoading,
  } = useGetStockAlertsQuery(userKey, { skip: !userKey });
  const [unsubscribe, { isLoading: removingAlert }] =
    useUnsubscribeStockAlertMutation();

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Link
        href="/account"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Account
      </Link>

      <header className="mt-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Saved for later
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Your wishlist
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Saved products sync securely with your account.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {wishlist?.items.length ?? 0} saved
        </span>
      </header>

      {wishlistLoading ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <div
              key={item}
              className="aspect-[3/4] animate-pulse rounded-xl bg-muted"
            />
          ))}
        </div>
      ) : wishlistError ? (
        <p className="mt-8 rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          Your wishlist could not be loaded right now.
        </p>
      ) : wishlist?.items.length ? (
        <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {wishlist.items.map((item) => (
            <ProductCard key={item.id} product={item.product} />
          ))}
        </div>
      ) : (
        <section className="mt-8 rounded-xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">Your wishlist is empty.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Use the heart on any product to keep it here.
          </p>
          <Link
            href="/shop"
            className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Browse products
          </Link>
        </section>
      )}

      <section className="mt-16 border-t border-border pt-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Availability
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Back-in-stock alerts</h2>
          </div>
          <span className="text-sm text-muted-foreground">
            {alerts?.items.length ?? 0} active
          </span>
        </div>

        {alertsLoading ? (
          <div className="mt-6 h-28 animate-pulse rounded-xl bg-muted" />
        ) : alerts?.items.length ? (
          <div className="mt-6 space-y-3">
            {alerts.items.map((alert) => {
              const variantLabel =
                [alert.variant.size, alert.variant.color]
                  .filter(Boolean)
                  .join(" / ") || alert.variant.sku;
              return (
                <article
                  key={alert.id}
                  className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-4"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {alert.product.image?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={alert.product.image.url}
                        alt={alert.product.image.alt ?? alert.product.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link
                      href={"/shop/" + alert.product.slug}
                      className="font-semibold hover:underline"
                    >
                      {alert.product.name}
                    </Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {variantLabel}
                    </p>
                    <p
                      className={
                        alert.variant.stock > 0
                          ? "mt-1 text-xs font-medium text-emerald-700"
                          : "mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground"
                      }
                    >
                      {alert.variant.stock > 0 ? (
                        "Available now"
                      ) : (
                        <>
                          <BellRing className="h-3.5 w-3.5" />
                          We will email {user?.email}
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      unsubscribe({
                        variantId: alert.variantId,
                        userKey,
                      })
                    }
                    disabled={removingAlert}
                    className="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-60"
                  >
                    Remove alert
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="mt-6 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No active stock alerts. Choose an unavailable variant on a product
            page to create one.
          </p>
        )}
      </section>
    </main>
  );
}
