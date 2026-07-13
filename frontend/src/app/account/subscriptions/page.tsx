"use client";

import Link from "next/link";
import { useState } from "react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";
import {
  type UserSubscription,
  useControlSubscriptionMutation,
  useListSubscriptionsQuery,
} from "@/features/subscriptions/subscriptionsApi";

export default function SubscriptionsPage() {
  return <RequireAuth><SubscriptionsBody /></RequireAuth>;
}

function SubscriptionsBody() {
  const user = useAppSelector((state) => state.auth.user);
  const userKey = user?.uid ?? "";
  const { data, isLoading, isError, refetch } = useListSubscriptionsQuery(userKey, { skip: !userKey });
  const [control, { isLoading: controlling }] = useControlSubscriptionMutation();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function run(subscription: UserSubscription, action: "pause" | "resume" | "skip" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancel this subscription? This cannot be resumed.")) return;
    setBusyId(subscription.id);
    setError(null);
    setMessage(null);
    try {
      await control({ id: subscription.id, action, userKey }).unwrap();
      setMessage(action === "skip" ? "The next renewal was skipped." : "Subscription updated.");
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setError(apiError.data?.error?.message ?? "Could not update the subscription.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <Link href="/account" className="text-sm text-muted-foreground hover:text-foreground">← Back to account</Link>
      <header className="mt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary">Subscribe & save</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Your training routine, on schedule.</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Subscriptions create upcoming renewal reminders without silently charging or reserving stock. You review each renewal before checkout.</p>
      </header>

      {(message || error) && <div className={"mt-5 rounded-xl border px-4 py-3 text-sm " + (error ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>{error ?? message}</div>}

      {isLoading ? <div className="mt-8 space-y-4">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-64 animate-pulse rounded-2xl bg-muted" />)}</div> : isError ? (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center"><p className="text-sm text-muted-foreground">Subscriptions could not be loaded.</p><button type="button" onClick={() => refetch()} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Try again</button></div>
      ) : data?.items.length ? (
        <div className="mt-8 space-y-5">
          {data.items.map((subscription) => {
            const product = subscription.plan.variant.product;
            const discounted = Math.max(0, subscription.plan.variant.price - Math.floor((subscription.plan.variant.price * subscription.discountPercent) / 100));
            const busy = controlling && busyId === subscription.id;
            return <article key={subscription.id} className="overflow-hidden rounded-2xl border border-border">
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
                <div className="h-28 w-28 shrink-0 overflow-hidden rounded-xl bg-muted">{product.images[0]?.url && <img src={product.images[0].url} alt={product.images[0].alt ?? product.name} className="h-full w-full object-cover" />}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{subscription.planNameSnapshot}</p><Link href={"/shop/" + product.slug} className="mt-1 block text-xl font-semibold hover:underline">{product.name}</Link><p className="mt-1 text-xs text-muted-foreground">{[subscription.plan.variant.size, subscription.plan.variant.color].filter(Boolean).join(" / ") || subscription.plan.variant.sku}</p></div>
                    <span className={statusClass[subscription.status]}>{subscription.status}</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Metric label="Renewal price" value={formatINR(discounted * subscription.quantity)} hint={`${subscription.discountPercent}% plan saving`} />
                    <Metric label="Frequency" value={`Every ${subscription.frequencyDays} days`} hint={`Quantity ${subscription.quantity}`} />
                    <Metric label="Next review" value={new Date(subscription.nextOrderAt).toLocaleDateString("en-IN")} hint="No automatic charge" />
                  </div>
                  {subscription.status !== "CANCELLED" && <div className="mt-5 flex flex-wrap gap-2">
                    {subscription.status === "ACTIVE" ? <button type="button" disabled={busy} onClick={() => run(subscription, "pause")} className={secondaryButton}>Pause</button> : <button type="button" disabled={busy} onClick={() => run(subscription, "resume")} className={secondaryButton}>Resume</button>}
                    {subscription.status === "ACTIVE" && <button type="button" disabled={busy} onClick={() => run(subscription, "skip")} className={secondaryButton}>Skip next</button>}
                    <button type="button" disabled={busy} onClick={() => run(subscription, "cancel")} className="rounded-lg px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-50">Cancel</button>
                  </div>}
                </div>
              </div>
              {subscription.renewals.length > 0 && <div className="border-t border-border bg-muted/30 px-5 py-4 sm:px-6"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Recent renewals</p><div className="mt-3 flex flex-wrap gap-2">{subscription.renewals.map((renewal) => <span key={renewal.id} className="rounded-full bg-background px-3 py-1 text-xs ring-1 ring-border">{new Date(renewal.scheduledFor).toLocaleDateString("en-IN")} · {renewal.status.replaceAll("_", " ")}</span>)}</div></div>}
            </article>;
          })}
        </div>
      ) : (
        <div className="mt-8 rounded-2xl border border-dashed border-border p-10 text-center"><h2 className="text-xl font-semibold">No subscriptions yet</h2><p className="mt-2 text-sm text-muted-foreground">Open a paid order and choose Subscribe & save on an eligible item.</p><Link href="/account/orders" className="mt-5 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">View eligible orders</Link></div>
      )}
    </main>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <div className="rounded-lg bg-muted/50 p-3"><p className="text-[11px] text-muted-foreground">{label}</p><p className="mt-1 text-sm font-semibold">{value}</p><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>;
}
const statusClass = { ACTIVE: "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700", PAUSED: "rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700", CANCELLED: "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground" };
const secondaryButton = "rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50";