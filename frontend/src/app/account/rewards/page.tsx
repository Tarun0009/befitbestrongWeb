"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { RequireAuth } from "@/features/auth/RequireAuth";
import { useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";
import {
  type LoyaltyEntryType,
  type RewardCoupon,
  useApplyReferralMutation,
  useGetLoyaltyQuery,
  useRedeemPointsMutation,
} from "@/features/loyalty/loyaltyApi";

export default function RewardsPage() {
  return (
    <RequireAuth>
      <RewardsBody />
    </RequireAuth>
  );
}

function RewardsBody() {
  const user = useAppSelector((state) => state.auth.user);
  const userKey = user?.uid ?? "";
  const { data, isLoading, isError, refetch } = useGetLoyaltyQuery(userKey, {
    skip: !userKey,
  });
  const [applyReferral, { isLoading: applyingReferral }] =
    useApplyReferralMutation();
  const [redeemPoints, { isLoading: redeeming }] = useRedeemPointsMutation();
  const [referralCode, setReferralCode] = useState("");
  const [points, setPoints] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<RewardCoupon | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setError("Copy failed. Select and copy the code manually.");
    }
  }

  async function handleReferral(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      await applyReferral({
        code: referralCode.trim().toUpperCase(),
        userKey,
      }).unwrap();
      setReferralCode("");
      setMessage("Referral applied. Rewards unlock after your first paid order.");
    } catch (caught) {
      setError(apiMessage(caught, "Could not apply this referral code."));
    }
  }

  async function handleRedeem(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setCoupon(null);
    const amount = Number(points);
    if (!Number.isInteger(amount) || amount <= 0) {
      setError("Enter a whole number of points.");
      return;
    }
    try {
      const result = await redeemPoints({ points: amount, userKey }).unwrap();
      setCoupon(result.coupon);
      setPoints("");
      setMessage("Your private, one-use reward coupon is ready.");
    } catch (caught) {
      setError(apiMessage(caught, "Could not redeem these points."));
    }
  }

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="h-36 animate-pulse rounded-2xl bg-muted" />
        <div className="mt-6 grid gap-5 md:grid-cols-2">
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
          <div className="h-64 animate-pulse rounded-2xl bg-muted" />
        </div>
      </main>
    );
  }

  if (isError || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-3xl font-semibold">Rewards are unavailable</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We could not load your rewards account right now.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Try again
        </button>
      </main>
    );
  }

  const { account, config } = data;
  const requestedPoints = Number(points) || 0;
  const validIncrement =
    requestedPoints > 0 && requestedPoints % config.redeemPointsPerRupee === 0;
  const previewDiscount = validIncrement
    ? (requestedPoints / config.redeemPointsPerRupee) * 100
    : 0;
  const maxRedeemable = Math.min(
    account.pointsBalance,
    config.maxRedeemPointsPerCoupon ?? account.pointsBalance,
  );

  return (
    <main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
      <Link
        href="/account"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Back to account
      </Link>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-background to-background p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-primary">
              beFit Rewards
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {account.pointsBalance.toLocaleString("en-IN")} points
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              Earn {config.earnPointsPerRupee} point{config.earnPointsPerRupee === 1 ? "" : "s"} per ₹1 on paid orders. Redeem {config.redeemPointsPerRupee} points for ₹1 off.
            </p>
          </div>
          <span className={config.enabled ? activePill : pausedPill}>
            {config.enabled ? "Rewards active" : "Program paused"}
          </span>
        </div>
        <div className="mt-7 grid gap-3 sm:grid-cols-3">
          <Metric label="Available" value={account.pointsBalance} />
          <Metric label="Lifetime earned" value={account.lifetimePointsEarned} />
          <Metric label="Lifetime redeemed" value={account.lifetimePointsRedeemed} />
        </div>
      </section>

      {(message || error) && (
        <div
          className={
            "mt-5 rounded-xl border px-4 py-3 text-sm " +
            (error
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-emerald-300 bg-emerald-50 text-emerald-800")
          }
        >
          {error ?? message}
        </div>
      )}

      {coupon && (
        <section className="mt-5 rounded-2xl border border-primary/30 bg-primary/5 p-5 sm:flex sm:items-center sm:justify-between sm:gap-5">
          <div>
            <p className="text-sm font-semibold">{formatINR(coupon.discount)} reward coupon</p>
            <p className="mt-1 font-mono text-lg font-semibold tracking-wide">{coupon.code}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Valid through {new Date(coupon.expiresAt).toLocaleDateString("en-IN")}. Assigned to your account and usable once.
            </p>
          </div>
          <div className="mt-4 flex gap-2 sm:mt-0">
            <button
              type="button"
              onClick={() => copy(coupon.code, "coupon")}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold"
            >
              {copied === "coupon" ? "Copied" : "Copy code"}
            </button>
            <Link
              href="/checkout"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Checkout
            </Link>
          </div>
        </section>
      )}

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className="rounded-2xl border border-border p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Redeem</p>
          <h2 className="mt-2 text-xl font-semibold">Turn points into savings</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Minimum {config.minRedeemPoints.toLocaleString("en-IN")} points. Coupons are private, single-use, and valid for {config.couponValidityDays} days.
          </p>
          <form onSubmit={handleRedeem} className="mt-5">
            <label className="text-sm font-medium" htmlFor="reward-points">Points to redeem</label>
            <input
              id="reward-points"
              type="number"
              min={config.minRedeemPoints}
              max={maxRedeemable}
              step={config.redeemPointsPerRupee}
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder={String(config.minRedeemPoints)}
              disabled={!config.enabled}
              className={inputClass}
            />
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Up to {maxRedeemable.toLocaleString("en-IN")} points</span>
              <span>{previewDiscount ? formatINR(previewDiscount) + " off" : "Enter an eligible amount"}</span>
            </div>
            <button
              type="submit"
              disabled={
                redeeming ||
                !config.enabled ||
                requestedPoints < config.minRedeemPoints ||
                requestedPoints > maxRedeemable ||
                !validIncrement
              }
              className="mt-5 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {redeeming ? "Creating reward…" : "Redeem points"}
            </button>
          </form>
        </section>

        <section className="rounded-2xl border border-border p-5 sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Refer a friend</p>
          <h2 className="mt-2 text-xl font-semibold">Train stronger together</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            You earn {config.referralBonusReferrer} points and your friend earns {config.referralBonusReferred} after their first paid order.
          </p>
          <div className="mt-5 flex items-center gap-2 rounded-xl bg-muted/60 p-3">
            <code className="min-w-0 flex-1 truncate text-sm font-semibold">{account.referralCode}</code>
            <button
              type="button"
              onClick={() => copy(account.referralCode, "referral")}
              className="shrink-0 rounded-lg bg-background px-3 py-2 text-xs font-semibold ring-1 ring-border"
            >
              {copied === "referral" ? "Copied" : "Copy"}
            </button>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2 text-center">
            <SmallMetric label="Invited" value={data.referrals.total} />
            <SmallMetric label="Pending" value={data.referrals.pending} />
            <SmallMetric label="Rewarded" value={data.referrals.rewarded} />
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-border p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Have a referral code?</h2>
        {data.receivedReferral ? (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 px-4 py-3">
            <div>
              <p className="text-sm font-medium">
                Code {data.receivedReferral.code}
                {data.receivedReferral.referrer.name ? " from " + data.receivedReferral.referrer.name : ""}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {data.receivedReferral.status === "PENDING"
                  ? "Pending your first paid order"
                  : data.receivedReferral.status === "REWARDED"
                    ? "Referral rewards issued"
                    : "Referral reward reversed"}
              </p>
            </div>
            <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold ring-1 ring-border">
              {data.receivedReferral.status}
            </span>
          </div>
        ) : (
          <form onSubmit={handleReferral} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              required
              value={referralCode}
              onChange={(event) => setReferralCode(event.target.value.toUpperCase())}
              placeholder="Enter code before your first paid order"
              disabled={!config.enabled}
              className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={applyingReferral || !config.enabled}
              className="rounded-lg border border-border px-5 py-2 text-sm font-semibold disabled:opacity-50"
            >
              {applyingReferral ? "Applying…" : "Apply code"}
            </button>
          </form>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Ledger</p>
            <h2 className="mt-2 text-xl font-semibold">Points activity</h2>
          </div>
          <span className="text-xs text-muted-foreground">Latest 30 entries</span>
        </div>
        {data.entries.length ? (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {data.entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entryLabel[entry.type]} · {new Date(entry.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </div>
                <span className={entry.points > 0 ? positivePoints : negativePoints}>
                  {entry.points > 0 ? "+" : ""}{entry.points.toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Your points activity will appear here after a paid order or adjustment.
          </p>
        )}
      </section>
    </main>
  );
}

function apiMessage(caught: unknown, fallback: string) {
  const error = caught as { data?: { error?: { message?: string } } };
  return error.data?.error?.message ?? fallback;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/70 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/60 px-2 py-3">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

const entryLabel: Record<LoyaltyEntryType, string> = {
  ORDER_EARN: "Order reward",
  ORDER_REFUND_REVERSAL: "Refund reversal",
  REFERRAL_BONUS: "Referral bonus",
  REFERRAL_REVERSAL: "Referral reversal",
  COUPON_REDEMPTION: "Coupon redemption",
  REDEMPTION_RESTORE: "Points restored",
  ADMIN_ADJUSTMENT: "Manual adjustment",
};

const inputClass =
  "mt-2 h-12 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50";
const activePill =
  "rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20";
const pausedPill =
  "rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700 ring-1 ring-inset ring-orange-500/20";
const positivePoints =
  "shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-700";
const negativePoints =
  "shrink-0 rounded-full bg-red-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-red-700";