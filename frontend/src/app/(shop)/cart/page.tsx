"use client";

import Link from "next/link";
import {
  useGetCartQuery,
  useRemoveItemMutation,
  useSetItemQtyMutation,
  useClearCartMutation,
  useRemoveBundleMutation,
  useSetBundleQtyMutation,
  type CartLine,
  type BundleCartLine,
  type CartNotice,
} from "@/lib/cartApi";
import { useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";

export default function CartPage() {
  const { data: cart, isFetching, error } = useGetCartQuery();
  const [setQty] = useSetItemQtyMutation();
  const [removeItem] = useRemoveItemMutation();
  const [clearCart] = useClearCartMutation();
  const [setBundleQty] = useSetBundleQtyMutation();
  const [removeBundle] = useRemoveBundleMutation();
  const authed = useAppSelector((s) => s.auth.status === "authenticated");

  if (error) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn't load cart.
        </div>
      </main>
    );
  }

  const empty =
    !isFetching &&
    (!cart || (cart.items.length === 0 && cart.bundles.length === 0));

  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <header className="flex items-baseline justify-between">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Storefront
          </p>
          <h1 className="mt-3 text-3xl font-semibold">Your cart</h1>
          {cart && cart.count > 0 && (
            <p className="mt-2 text-sm text-muted-foreground">
              {cart.count} item{cart.count === 1 ? "" : "s"}
            </p>
          )}
        </div>
        {cart && cart.count > 0 && (
          <button
            onClick={() => clearCart()}
            className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Clear cart
          </button>
        )}
      </header>

      {cart?.notices.length ? (
        <NoticeList notices={cart.notices} items={cart.items} />
      ) : null}

      {empty ? (
        <div className="mt-16 rounded-lg border border-dashed border-border py-16 text-center">
          <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          <Link
            href="/shop"
            className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
          >
            Browse the shop
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
          <ul className="space-y-4">
            {cart?.bundles.map((bundle) => (
              <BundleCartCard
                key={bundle.bundleId}
                bundle={bundle}
                onSetQuantity={(quantity) =>
                  setBundleQty({ bundleId: bundle.bundleId, quantity })
                }
                onRemove={() => removeBundle(bundle.bundleId)}
              />
            ))}
            {cart?.items.map((line) => (
              <li
                key={line.variantId}
                className="flex gap-4 rounded-lg border border-border p-5"
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
                  {line.image?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={line.image.url}
                      alt={line.image.alt ?? line.name}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Link
                        href={`/shop/${line.slug}`}
                        className="font-medium hover:underline"
                      >
                        {line.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {[line.size, line.color].filter(Boolean).join(" / ") ||
                          line.sku}
                      </p>
                      <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                        {formatINR(line.price)} each
                      </p>
                    </div>
                    <p className="text-sm font-medium tabular-nums">
                      {formatINR(line.subtotal)}
                    </p>
                  </div>

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center rounded-md border border-border">
                      <button
                        onClick={() =>
                          setQty({
                            variantId: line.variantId,
                            quantity: line.quantity - 1,
                          })
                        }
                        className="px-2 py-1 text-sm hover:bg-muted"
                        aria-label="Decrease quantity"
                      >
                        –
                      </button>
                      <span className="min-w-[2rem] text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        onClick={() =>
                          setQty({
                            variantId: line.variantId,
                            quantity: line.quantity + 1,
                          })
                        }
                        disabled={line.quantity >= line.stock}
                        className="px-2 py-1 text-sm hover:bg-muted disabled:opacity-40"
                        aria-label="Increase quantity"
                      >
                        +
                      </button>
                    </div>
                    <button
                      onClick={() => removeItem(line.variantId)}
                      className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                    >
                      Remove
                    </button>
                    {line.cappedByStock && (
                      <span className="text-xs text-orange-600">
                        Capped at stock ({line.stock})
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <aside className="h-fit rounded-lg border border-border p-5">
            <h2 className="font-medium">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {cart && cart.bundleSavings > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Bundle savings</dt>
                  <dd className="tabular-nums">−{formatINR(cart.bundleSavings)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">
                  {cart ? formatINR(cart.subtotal) : "—"}
                </dd>
              </div>
              <div className="flex justify-between text-muted-foreground">
                <dt>Shipping</dt>
                <dd>Calculated at checkout</dd>
              </div>
            </dl>
            {authed ? (
              <Link
                href="/checkout"
                className="mt-4 block w-full rounded-md bg-primary px-4 py-2 text-center text-primary-foreground hover:opacity-90"
              >
                Checkout
              </Link>
            ) : (
              <Link
                href="/login?next=/checkout"
                className="mt-4 block w-full rounded-md bg-primary px-4 py-2 text-center text-primary-foreground hover:opacity-90"
              >
                Log in to checkout
              </Link>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Payment powered by Razorpay (test mode).
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}


function BundleCartCard({
  bundle,
  onSetQuantity,
  onRemove,
}: {
  bundle: BundleCartLine;
  onSetQuantity: (quantity: number) => void;
  onRemove: () => void;
}) {
  return (
    <li className="rounded-lg border border-primary/30 bg-primary/5 p-5">
      <div className="flex gap-4">
        <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-muted">
          {bundle.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bundle.imageUrl} alt={bundle.name} className="h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-primary-foreground">Bundle</p>
              <Link href="/bundles" className="font-semibold hover:underline">{bundle.name}</Link>
              <p className="mt-1 text-xs text-muted-foreground">{bundle.items.map((item) => item.quantity + "× " + item.product.name).join(" · ")}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="font-semibold tabular-nums">{formatINR(bundle.subtotal)}</p>
              <p className="text-xs text-emerald-700">Save {formatINR(bundle.savings * bundle.quantity)}</p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center rounded-md border border-border bg-background">
              <button type="button" onClick={() => onSetQuantity(bundle.quantity - 1)} className="px-2 py-1 text-sm hover:bg-muted" aria-label="Decrease bundle quantity">–</button>
              <span className="min-w-[2rem] text-center text-sm tabular-nums">{bundle.quantity}</span>
              <button type="button" onClick={() => onSetQuantity(bundle.quantity + 1)} disabled={bundle.quantity >= bundle.availableUnits} className="px-2 py-1 text-sm hover:bg-muted disabled:opacity-40" aria-label="Increase bundle quantity">+</button>
            </div>
            <button type="button" onClick={onRemove} className="text-xs text-muted-foreground underline underline-offset-4">Remove</button>
            <span className="ml-auto text-xs text-muted-foreground">{formatINR(bundle.unitPrice)} per bundle</span>
          </div>
        </div>
      </div>
    </li>
  );
}

function NoticeList({
  notices,
  items,
}: {
  notices: CartNotice[];
  items: CartLine[];
}) {
  const nameFor = (variantId: string) =>
    items.find((i) => i.variantId === variantId)?.name ?? "An item";

  return (
    <div className="mt-6 space-y-2">
      {notices.map((n, i) => {
        if (n.kind === "capped_bundle") {
          return (
            <p key={i} className="rounded-md bg-orange-500/10 px-3 py-2 text-sm text-orange-600 ring-1 ring-inset ring-orange-500/20">
              A bundle was reduced from {n.requested} to {n.effective} because a component has limited stock.
            </p>
          );
        }
        if (n.kind === "removed_bundle") {
          return (
            <p key={i} className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              A bundle is no longer available and was removed from your cart.
            </p>
          );
        }
        if (n.kind === "capped") {
          return (
            <p
              key={i}
              className="rounded-md bg-orange-500/10 px-3 py-2 text-sm text-orange-600 ring-1 ring-inset ring-orange-500/20"
            >
              {nameFor(n.variantId)} was reduced from {n.requested} to{" "}
              {n.effective} — stock is limited.
            </p>
          );
        }
        if (n.kind === "removed_variant") {
          return (
            <p
              key={i}
              className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              A variant in your cart was removed by the store and has been
              cleared.
            </p>
          );
        }
        return (
          <p
            key={i}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            A product in your cart is no longer available and was removed.
          </p>
        );
      })}
    </div>
  );
}
