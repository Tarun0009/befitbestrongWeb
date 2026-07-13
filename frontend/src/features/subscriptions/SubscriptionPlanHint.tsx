"use client";

import { useListSubscriptionPlansQuery } from "./subscriptionsApi";
import { formatINR } from "@/lib/format";

export function SubscriptionPlanHint({ variantId }: { variantId: string | null }) {
  const { data } = useListSubscriptionPlansQuery(variantId ?? undefined, { skip: !variantId });
  const plan = data?.items[0];
  if (!plan) return null;
  return (
    <div className="mt-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <p className="text-sm font-semibold">Subscribe after purchase & save {plan.discountPercent}%</p>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">Eligible paid orders can schedule this exact variant every {plan.allowedFrequencies.map((days) => days + " days").join(", ")}. Renewal estimate {formatINR(plan.variant.discountedPrice)}; no automatic charge.</p>
    </div>
  );
}