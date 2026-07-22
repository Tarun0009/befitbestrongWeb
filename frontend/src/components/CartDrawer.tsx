"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  useGetCartQuery,
  useRemoveItemMutation,
  useSetItemQtyMutation,
  useRemoveBundleMutation,
  useSetBundleQtyMutation,
} from "@/lib/cartApi";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { closeDrawer } from "@/features/cart/cartSlice";
import { formatINR } from "@/lib/format";

/**
 * Slide-in cart drawer. Mounted once at the root layout; visibility driven by
 * `cartUi.drawerOpen`. Closes on route change (pathname effect), on Escape,
 * and on backdrop click.
 */
export function CartDrawer() {
  const open = useAppSelector((s) => s.cartUi.drawerOpen);
  const dispatch = useAppDispatch();
  const pathname = usePathname();
  const panelRef = useRef<HTMLElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const { data: cart, isLoading: cartLoading, isFetching: cartFetching } = useGetCartQuery();
  const [setQty, { isLoading: settingQty }] = useSetItemQtyMutation();
  const [removeItem, { isLoading: removingItem }] = useRemoveItemMutation();
  const [setBundleQty, { isLoading: settingBundleQty }] = useSetBundleQtyMutation();
  const [removeBundle, { isLoading: removingBundle }] = useRemoveBundleMutation();
  const mutating = settingQty || removingItem || settingBundleQty || removingBundle;

  // Close on navigation. Drawer state lives in Redux so it survives route
  // changes; without this effect, clicking a product link inside the drawer
  // would leave it hanging open on the destination page.
  useEffect(() => {
    dispatch(closeDrawer());
  }, [pathname, dispatch]);

  // Move keyboard focus into the modal, trap it there, and restore the opener.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const frame = window.requestAnimationFrame(() => {
      panel.querySelector<HTMLElement>("[data-cart-autofocus]")?.focus();
    });

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dispatch(closeDrawer());
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panel!.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        panel!.focus();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKey);
      const restoreTarget = restoreFocusRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
      restoreFocusRef.current = null;
    };
  }, [open, dispatch]);

  // Prevent scroll bleed-through while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => dispatch(closeDrawer())}
        aria-hidden="true"
        className={`fixed inset-0 z-40 bg-foreground/30 transition-opacity duration-200 ${
          open
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
      />

      {/* Panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
        aria-hidden={!open}
        inert={open ? undefined : true}
        tabIndex={-1}
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-border bg-background transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-baseline justify-between border-b border-border px-6 py-4">
          <h2 id="cart-drawer-title" className="font-medium">
            Your cart
            {cart && cart.count > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                ({cart.count} item{cart.count === 1 ? "" : "s"})
              </span>
            )}
          </h2>
          <button
            type="button"
            data-cart-autofocus
            onClick={() => dispatch(closeDrawer())}
            className="rounded-md px-2 py-1 text-sm hover:bg-muted"
            aria-label="Close cart"
          >
            Close
          </button>
        </header>

        <div className={`flex-1 overflow-y-auto px-6 py-4 ${cartFetching && cart ? "opacity-60" : ""}`}>
          {cartLoading ? (
            <div className="space-y-3 pt-4" aria-label="Loading cart">
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
            </div>
          ) : !cart || (cart.items.length === 0 && cart.bundles.length === 0) ? (
            <div className="mt-16 text-center">
              <p className="text-sm text-muted-foreground">
                Your cart is empty.
              </p>
              <Link
                href="/shop"
                className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
              >
                Browse the shop
              </Link>
            </div>
          ) : (
            <ul className="space-y-4">
              {cart.bundles.map((bundle) => (
                <li key={bundle.bundleId} className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Bundle</p>
                      <p className="truncate text-sm font-semibold">{bundle.name}</p>
                      <p className="mt-1 truncate text-xs text-muted-foreground">{bundle.items.map((item) => item.quantity + "× " + item.product.name).join(" · ")}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold tabular-nums">{formatINR(bundle.subtotal)}</p>
                      <p className="text-[11px] text-emerald-700">Save {formatINR(bundle.savings * bundle.quantity)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center rounded-md border border-border bg-background">
                      <button type="button" onClick={() => setBundleQty({ bundleId: bundle.bundleId, quantity: bundle.quantity - 1 })} disabled={mutating || bundle.quantity <= 1} aria-label={`Decrease ${bundle.name} quantity`} className="px-2 py-0.5 text-sm disabled:opacity-40">–</button>
                      <span className="min-w-7 text-center text-sm">{bundle.quantity}</span>
                      <button type="button" onClick={() => setBundleQty({ bundleId: bundle.bundleId, quantity: bundle.quantity + 1 })} disabled={mutating || bundle.quantity >= bundle.availableUnits} aria-label={`Increase ${bundle.name} quantity`} className="px-2 py-0.5 text-sm disabled:opacity-40">+</button>
                    </div>
                    <button type="button" onClick={() => removeBundle(bundle.bundleId)} disabled={mutating} aria-label={`Remove ${bundle.name} bundle`} className="text-xs text-muted-foreground underline underline-offset-4 disabled:opacity-40">Remove</button>
                  </div>
                </li>
              ))}
              {cart.items.map((line) => (
                <li
                  key={line.variantId}
                  className="flex gap-3 border-b border-border pb-4 last:border-b-0"
                >
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-muted">
                    {line.image?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.image.url}
                        alt={line.image.alt ?? line.name}
                        width={64}
                        height={64}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/shop/${line.slug}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {line.name}
                      </Link>
                      <p className="text-sm tabular-nums">
                        {formatINR(line.subtotal)}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {[line.size, line.color].filter(Boolean).join(" / ") ||
                        line.sku}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          onClick={() =>
                            setQty({
                              variantId: line.variantId,
                              quantity: line.quantity - 1,
                            })
                          }
                          disabled={mutating || line.quantity <= 1}
                          className="px-2 py-0.5 text-sm hover:bg-muted"
                          aria-label="Decrease quantity"
                        >
                          –
                        </button>
                        <span className="min-w-[1.75rem] text-center text-sm tabular-nums">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() =>
                            setQty({
                              variantId: line.variantId,
                              quantity: line.quantity + 1,
                            })
                          }
                          disabled={mutating || line.quantity >= line.stock}
                          className="px-2 py-0.5 text-sm hover:bg-muted disabled:opacity-40"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <button
                        onClick={() => removeItem(line.variantId)}
                        disabled={mutating}
                        className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {cart && cart.count > 0 && (
          <footer className="border-t border-border px-6 py-4">
            <dl className="space-y-1 text-sm">
              {cart.bundleSavings > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Bundle savings</dt>
                  <dd>−{formatINR(cart.bundleSavings)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatINR(cart.subtotal)}</dd>
              </div>
              <p className="text-xs text-muted-foreground">
                Shipping calculated at checkout.
              </p>
            </dl>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href="/cart"
                className="rounded-md border border-border px-3 py-2 text-center text-sm hover:bg-muted"
              >
                View cart
              </Link>
              <Link
                href="/checkout"
                className="rounded-md bg-primary px-3 py-2 text-center text-sm text-primary-foreground hover:opacity-90"
              >
                Checkout
              </Link>
            </div>
          </footer>
        )}
      </aside>
    </>
  );
}


