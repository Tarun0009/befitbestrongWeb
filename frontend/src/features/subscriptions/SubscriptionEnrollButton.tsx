"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";
import {
  useEnrollSubscriptionMutation,
  useListSubscriptionPlansQuery,
} from "./subscriptionsApi";

export function SubscriptionEnrollButton({
  orderId,
  variantId,
  orderStatus,
  maxQuantity,
}: {
  orderId: string;
  variantId: string;
  orderStatus: string;
  maxQuantity: number;
}) {
  const eligible = ["PAID", "SHIPPED", "DELIVERED"].includes(orderStatus);
  const user = useAppSelector((state) => state.auth.user);
  const { data } = useListSubscriptionPlansQuery(variantId, { skip: !eligible });
  const plan = data?.items[0];
  const [enroll, { isLoading }] = useEnrollSubscriptionMutation();
  const [open, setOpen] = useState(false);
  const [frequency, setFrequency] = useState(30);
  const [quantity, setQuantity] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (plan?.allowedFrequencies[0]) setFrequency(plan.allowedFrequencies[0]);
  }, [plan]);

  if (!eligible || !plan) return null;

  async function handleEnroll() {
    setError(null);
    setMessage(null);
    try {
      await enroll({
        planId: plan!.id,
        orderId,
        quantity,
        frequencyDays: frequency,
        userKey: user?.uid ?? "",
      }).unwrap();
      setMessage("Subscription scheduled. No automatic charge was made.");
      setOpen(false);
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setError(apiError.data?.error?.message ?? "Could not create the subscription.");
    }
  }

  return (
    <div className="mt-3 border-t border-border pt-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-primary/10 px-3 py-2 text-xs font-semibold text-foreground ring-1 ring-inset ring-primary/30">
          Subscribe & save {plan.discountPercent}%
        </button>
      ) : (
        <div className="rounded-lg bg-muted/50 p-3">
          <div className="flex flex-wrap gap-3">
            <label className="text-xs font-medium">Frequency<select value={frequency} onChange={(event) => setFrequency(Number(event.target.value))} className="mt-1 block h-9 rounded-md border border-border bg-background px-2 text-xs">{plan.allowedFrequencies.map((days) => <option key={days} value={days}>Every {days} days</option>)}</select></label>
            <label className="text-xs font-medium">Quantity<input type="number" min="1" max={Math.min(20, Math.max(1, maxQuantity))} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} className="mt-1 block h-9 w-20 rounded-md border border-border bg-background px-2 text-xs" /></label>
            <div className="ml-auto text-right text-xs"><p className="text-muted-foreground">Renewal estimate</p><p className="mt-1 font-semibold">{formatINR(plan.variant.discountedPrice * quantity)}</p></div>
          </div>
          <p className="mt-3 text-[11px] leading-5 text-muted-foreground">We create an upcoming renewal reminder. Stock is checked at renewal and charged only when you review and check out.</p>
          <div className="mt-3 flex gap-2"><button type="button" onClick={handleEnroll} disabled={isLoading} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50">{isLoading ? "Scheduling…" : "Start subscription"}</button><button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-xs">Cancel</button></div>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-emerald-700">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}