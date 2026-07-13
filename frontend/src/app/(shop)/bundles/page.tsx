"use client";

import Link from "next/link";
import { useState } from "react";
import { Layers3, ShoppingBag } from "lucide-react";
import { useListBundlesQuery } from "@/features/bundles/bundlesApi";
import { useAddBundleMutation } from "@/lib/cartApi";
import { formatINR } from "@/lib/format";
import { useAppDispatch } from "@/lib/hooks";
import { openDrawer } from "@/features/cart/cartSlice";

export default function BundlesPage() {
  const { data, isLoading, isError, refetch } = useListBundlesQuery();
  const [addBundle, { isLoading: adding }] = useAddBundleMutation();
  const [addingId, setAddingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dispatch = useAppDispatch();

  async function handleAdd(bundleId: string, name: string) {
    setAddingId(bundleId);
    setMessage(null);
    setError(null);
    try {
      await addBundle({ bundleId, quantity: 1 }).unwrap();
      setMessage(name + " was added with its bundle saving.");
      dispatch(openDrawer());
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setError(apiError.data?.error?.message ?? "Could not add this bundle.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="max-w-3xl">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Curated stacks</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">Build the routine. Save on the stack.</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Every bundle is priced and stock-checked by the server. Components remain individually tracked for reliable fulfillment.
        </p>
      </header>

      {(message || error) && (
        <div className={"mt-6 rounded-xl border px-4 py-3 text-sm " + (error ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>
          {error ?? message}
        </div>
      )}

      {isLoading ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-96 animate-pulse rounded-2xl bg-muted" />)}
        </div>
      ) : isError ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="text-sm text-muted-foreground">Bundles could not be loaded.</p>
          <button type="button" onClick={() => refetch()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Try again</button>
        </div>
      ) : data?.items.length ? (
        <div className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {data.items.map((bundle) => (
            <article key={bundle.id} className="flex overflow-hidden rounded-2xl border border-border bg-background flex-col">
              <div className="relative aspect-[4/3] overflow-hidden bg-muted">
                {bundle.imageUrl || bundle.items[0]?.product.image?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bundle.imageUrl ?? bundle.items[0].product.image!.url} alt={bundle.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_top,#fff1a8,transparent_62%)]"><Layers3 className="h-12 w-12 text-foreground/70" /></div>
                )}
                <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Save {bundle.savingsPercent}%</span>
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h2 className="text-xl font-semibold">{bundle.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{bundle.description}</p>
                <ul className="mt-4 space-y-1.5 text-sm">
                  {bundle.items.map((item) => (
                    <li key={item.id} className="flex justify-between gap-3">
                      <Link href={"/shop/" + item.product.slug} className="truncate hover:underline">{item.quantity}× {item.product.name}</Link>
                      <span className="shrink-0 text-xs text-muted-foreground">{[item.size, item.color].filter(Boolean).join(" / ") || item.sku}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-5">
                  <div className="flex items-baseline justify-between gap-3 border-t border-border pt-4">
                    <div>
                      <span className="text-2xl font-semibold tabular-nums">{formatINR(bundle.unitPrice)}</span>
                      <span className="ml-2 text-sm text-muted-foreground line-through">{formatINR(bundle.componentTotal)}</span>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700">Save {formatINR(bundle.savings)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(bundle.id, bundle.name)}
                    disabled={!bundle.sellable || adding}
                    className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    {addingId === bundle.id ? "Adding…" : bundle.availableUnits <= 0 ? "Out of stock" : "Add bundle to cart"}
                  </button>
                  <p className="mt-2 text-center text-xs text-muted-foreground">{bundle.availableUnits} stack{bundle.availableUnits === 1 ? "" : "s"} currently available</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-12 text-center">
          <Layers3 className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-semibold">New stacks are being built</h2>
          <p className="mt-2 text-sm text-muted-foreground">Browse individual products while the next curated bundles are prepared.</p>
          <Link href="/shop" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Shop products</Link>
        </div>
      )}
    </main>
  );
}