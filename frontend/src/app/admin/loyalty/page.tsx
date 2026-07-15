"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  type LoyaltyConfig,
  type LoyaltyEntryType,
  useAdminAdjustLoyaltyPointsMutation,
  useAdminGetLoyaltyQuery,
  useAdminUpdateLoyaltyConfigMutation,
} from "@/features/loyalty/loyaltyApi";
import { buildChangedFields, hasChangedFields } from "@/lib/changedFields";

function editableConfig(config: LoyaltyConfig): LoyaltyConfig {
  return {
    enabled: config.enabled,
    earnPointsPerRupee: config.earnPointsPerRupee,
    redeemPointsPerRupee: config.redeemPointsPerRupee,
    minRedeemPoints: config.minRedeemPoints,
    maxRedeemPointsPerCoupon: config.maxRedeemPointsPerCoupon,
    referralBonusReferrer: config.referralBonusReferrer,
    referralBonusReferred: config.referralBonusReferred,
    couponValidityDays: config.couponValidityDays,
  };
}

export default function AdminLoyaltyPage() {
  const { data, isLoading, isFetching, refetch } = useAdminGetLoyaltyQuery();
  const [updateConfig, { isLoading: saving }] =
    useAdminUpdateLoyaltyConfigMutation();
  const [adjustPoints, { isLoading: adjusting }] =
    useAdminAdjustLoyaltyPointsMutation();
  const [form, setForm] = useState<LoyaltyConfig | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data?.config) {
      setForm(editableConfig(data.config));
    }
  }, [data?.config]);

  const configPatch =
    form && data
      ? buildChangedFields(form, editableConfig(data.config))
      : {};
  const configDirty = hasChangedFields(configPatch);

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setError(null);
    setMessage(null);
    if (!configDirty) {
      setMessage("Nothing to save.");
      return;
    }
    try {
      await updateConfig(configPatch).unwrap();
      setMessage("Loyalty settings saved.");
    } catch (caught) {
      setError(apiMessage(caught, "Could not save loyalty settings."));
    }
  }

  async function handleAdjustment(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    const amount = Number(points);
    if (!selectedUserId || !Number.isInteger(amount) || amount === 0) {
      setError("Select a customer and enter a non-zero whole point amount.");
      return;
    }
    try {
      await adjustPoints({
        userId: selectedUserId,
        points: amount,
        reason: reason.trim(),
      }).unwrap();
      setPoints("");
      setReason("");
      setMessage("Points adjustment recorded in the ledger.");
    } catch (caught) {
      setError(apiMessage(caught, "Could not adjust this balance."));
    }
  }

  if (isLoading || !data || !form) {
    return (
      <div className="space-y-5">
        <div className="h-28 animate-pulse rounded-xl bg-muted" />
        <div className="h-80 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">Retention</p>
            <h2 className="mt-2 text-2xl font-semibold">Loyalty & referrals</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Configure rewards while the ledger protects each earn, redemption, and reversal from duplication.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {isFetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Points outstanding" value={data.summary.pointsOutstanding} />
          <Metric label="Lifetime earned" value={data.summary.lifetimeEarned} />
          <Metric label="Lifetime redeemed" value={data.summary.lifetimeRedeemed} />
          <Metric label="Ledger entries" value={data.summary.ledgerEntries} />
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SmallMetric label="Referrals pending" value={data.summary.referralsPending} />
          <SmallMetric label="Referrals rewarded" value={data.summary.referralsRewarded} />
          <SmallMetric label="Referrals reversed" value={data.summary.referralsCancelled} />
        </div>
      </section>

      {(message || error) && (
        <div className={error ? errorBox : successBox}>{error ?? message}</div>
      )}

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Program settings</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Pausing stops new earnings, redemptions, and referral applications. Existing balances remain intact.
            </p>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-full border border-border px-4 py-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
              className="h-4 w-4 accent-primary"
            />
            {form.enabled ? "Program active" : "Program paused"}
          </label>
        </div>

        <form onSubmit={handleSave} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NumberField
            label="Points earned per ₹1"
            value={form.earnPointsPerRupee}
            min={0}
            max={100}
            onChange={(value) => setForm({ ...form, earnPointsPerRupee: value })}
          />
          <NumberField
            label="Points required per ₹1 off"
            value={form.redeemPointsPerRupee}
            min={1}
            max={10000}
            onChange={(value) => setForm({ ...form, redeemPointsPerRupee: value })}
          />
          <NumberField
            label="Minimum redemption"
            value={form.minRedeemPoints}
            min={1}
            max={1000000}
            onChange={(value) => setForm({ ...form, minRedeemPoints: value })}
          />
          <label className="block">
            <span className="text-sm font-medium">Maximum per coupon</span>
            <input
              type="number"
              min="1"
              max="1000000"
              value={form.maxRedeemPointsPerCoupon ?? ""}
              onChange={(event) =>
                setForm({
                  ...form,
                  maxRedeemPointsPerCoupon: event.target.value ? Number(event.target.value) : null,
                })
              }
              placeholder="No maximum"
              className={inputClass}
            />
          </label>
          <NumberField
            label="Referrer bonus"
            value={form.referralBonusReferrer}
            min={0}
            max={1000000}
            onChange={(value) => setForm({ ...form, referralBonusReferrer: value })}
          />
          <NumberField
            label="New customer bonus"
            value={form.referralBonusReferred}
            min={0}
            max={1000000}
            onChange={(value) => setForm({ ...form, referralBonusReferred: value })}
          />
          <NumberField
            label="Reward coupon validity (days)"
            value={form.couponValidityDays}
            min={1}
            max={365}
            onChange={(value) => setForm({ ...form, couponValidityDays: value })}
          />
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <button
              type="submit"
              disabled={!configDirty || saving}
              className="h-11 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <h3 className="text-xl font-semibold">Manual adjustment</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Corrections are append-only. Negative adjustments cannot take an account below zero.
        </p>
        <form onSubmit={handleAdjustment} className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_0.7fr_1.8fr_auto] lg:items-end">
          <label className="block">
            <span className="text-sm font-medium">Customer</span>
            <select
              required
              value={selectedUserId}
              onChange={(event) => setSelectedUserId(event.target.value)}
              className={inputClass}
            >
              <option value="">Select customer</option>
              {data.topUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name || user.email} · {user.pointsBalance} points
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium">Points (+ / −)</span>
            <input
              required
              type="number"
              step="1"
              value={points}
              onChange={(event) => setPoints(event.target.value)}
              placeholder="100 or -100"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Audit reason</span>
            <input
              required
              minLength={3}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Customer service correction"
              className={inputClass}
            />
          </label>
          <button
            type="submit"
            disabled={adjusting}
            className="h-11 rounded-lg border border-border px-4 text-sm font-semibold disabled:opacity-50"
          >
            {adjusting ? "Recording…" : "Record"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Customer balances</h3>
            <p className="mt-1 text-sm text-muted-foreground">Highest balances among the first ten customer accounts.</p>
          </div>
          <span className="text-xs text-muted-foreground">Top {data.topUsers.length}</span>
        </div>
        {data.topUsers.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                  <th className="px-4 py-3 text-right">Earned</th>
                  <th className="px-4 py-3 text-right">Redeemed</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.topUsers.map((user) => (
                  <tr key={user.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-medium">{user.name || "Customer"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{user.email}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{user.pointsBalance.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{user.lifetimePointsEarned.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{user.lifetimePointsRedeemed.toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(user.id)}
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold"
                      >
                        Adjust
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No customer accounts yet.</p>
        )}
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Recent ledger activity</h3>
            <p className="mt-1 text-sm text-muted-foreground">Accounting entries cannot be edited or deleted.</p>
          </div>
          <span className="text-xs text-muted-foreground">Latest 20</span>
        </div>
        {data.recentEntries.length ? (
          <ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">
            {data.recentEntries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.description}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {entry.user.name || entry.user.email} · {entryLabels[entry.type]} · {new Date(entry.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <span className={entry.points > 0 ? positivePoints : negativePoints}>
                  {entry.points > 0 ? "+" : ""}{entry.points.toLocaleString("en-IN")}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No loyalty activity yet.</p>
        )}
      </section>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        required
        type="number"
        min={min}
        max={max}
        step="1"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={inputClass}
      />
    </label>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-IN")}</p>
    </div>
  );
}

function SmallMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/50 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function apiMessage(caught: unknown, fallback: string) {
  const error = caught as { data?: { error?: { message?: string } } };
  return error.data?.error?.message ?? fallback;
}

const entryLabels: Record<LoyaltyEntryType, string> = {
  ORDER_EARN: "Order reward",
  ORDER_REFUND_REVERSAL: "Refund reversal",
  REFERRAL_BONUS: "Referral bonus",
  REFERRAL_REVERSAL: "Referral reversal",
  COUPON_REDEMPTION: "Coupon redemption",
  REDEMPTION_RESTORE: "Points restored",
  ADMIN_ADJUSTMENT: "Manual adjustment",
};

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";
const successBox = "rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800";
const errorBox = "rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700";
const positivePoints = "shrink-0 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-emerald-700";
const negativePoints = "shrink-0 rounded-full bg-red-500/10 px-3 py-1 text-sm font-semibold tabular-nums text-red-700";