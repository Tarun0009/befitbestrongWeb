"use client";

import { useGetSiteConfigQuery } from "@/lib/siteConfigApi";

export function RewardsTicker() {
  const { data } = useGetSiteConfigQuery();
  const tiers = data?.rewardTiers ?? [];
  if (tiers.length === 0) return null;

  const items = [...tiers, ...tiers];

  return (
    <div className="overflow-hidden border-b border-border bg-foreground text-background">
      <div className="rewards-ticker-track flex w-max items-center gap-8 whitespace-nowrap px-6 py-2 text-xs font-medium sm:text-sm">
        {items.map((tier, index) => (
          <span key={`${tier.threshold}-${tier.reward}-${index}`}>
            Spend ₹{tier.threshold.toLocaleString("en-IN")} and get {tier.reward}
          </span>
        ))}
      </div>
    </div>
  );
}
