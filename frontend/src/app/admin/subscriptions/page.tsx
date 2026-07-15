"use client";

import { useEffect, useState, type FormEvent } from "react";
import { formatINR } from "@/lib/format";
import { buildChangedFields, hasChangedFields } from "@/lib/changedFields";
import { useAdminBundleOptionsQuery } from "@/features/bundles/bundlesApi";
import {
  type SubscriptionPlan,
  useAdminCreateSubscriptionPlanMutation,
  useAdminDeleteSubscriptionPlanMutation,
  useAdminGetSubscriptionsQuery,
  useAdminProcessSubscriptionsMutation,
  useAdminUpdateSubscriptionPlanMutation,
} from "@/features/subscriptions/subscriptionsApi";

const blank = { name: "", variantId: "", discountPercent: "10", frequencies: "30,60,90", active: true };

export default function AdminSubscriptionsPage() {
  const { data, isLoading } = useAdminGetSubscriptionsQuery();
  const { data: optionsData } = useAdminBundleOptionsQuery();
  const [createPlan, { isLoading: creating }] = useAdminCreateSubscriptionPlanMutation();
  const [updatePlan, { isLoading: updating }] = useAdminUpdateSubscriptionPlanMutation();
  const [deletePlan] = useAdminDeleteSubscriptionPlanMutation();
  const [processDue, { isLoading: processing }] = useAdminProcessSubscriptionsMutation();
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [form, setForm] = useState(blank);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) return;
    setForm({ name: editing.name, variantId: editing.variant.id, discountPercent: String(editing.discountPercent), frequencies: editing.allowedFrequencies.join(","), active: editing.active });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [editing]);

  function reset() { setEditing(null); setForm(blank); }
  function parseFrequencies() { return [...new Set(form.frequencies.split(",").map((value) => Number(value.trim())).filter((value) => Number.isInteger(value) && value >= 7 && value <= 365))].sort((a, b) => a - b); }

  const updateValues = {
    name: form.name.trim(),
    discountPercent: Number(form.discountPercent),
    allowedFrequencies: parseFrequencies(),
    active: form.active,
  };
  const updatePatch = editing
    ? buildChangedFields(updateValues, {
        name: editing.name,
        discountPercent: editing.discountPercent,
        allowedFrequencies: editing.allowedFrequencies,
        active: editing.active,
      })
    : {};
  const editDirty = !editing || hasChangedFields(updatePatch);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault(); setError(null); setMessage(null);
    const allowedFrequencies = updateValues.allowedFrequencies;
    if (!allowedFrequencies.length) { setError("Enter at least one frequency between 7 and 365 days."); return; }
    if (editing && !editDirty) {
      setMessage("Nothing to save.");
      return;
    }
    try {
      if (editing) await updatePlan({ id: editing.id, body: updatePatch }).unwrap();
      else await createPlan({ ...updateValues, variantId: form.variantId }).unwrap();
      setMessage(editing ? "Plan updated." : "Plan created."); reset();
    } catch (caught) { const apiError = caught as { data?: { error?: { message?: string } } }; setError(apiError.data?.error?.message ?? "Could not save this plan."); }
  }

  async function handleDelete(plan: SubscriptionPlan) {
    if (!window.confirm("Delete " + plan.name + "? Plans with subscribers must be deactivated instead.")) return;
    try { await deletePlan(plan.id).unwrap(); } catch (caught) { const apiError = caught as { data?: { error?: { message?: string } } }; setError(apiError.data?.error?.message ?? "Could not delete this plan."); }
  }

  async function handleProcess() {
    setError(null); setMessage(null);
    try { const result = await processDue().unwrap(); setMessage(`Processed ${result.processed} due subscription${result.processed === 1 ? "" : "s"}.`); } catch (caught) { const apiError = caught as { data?: { error?: { message?: string } } }; setError(apiError.data?.error?.message ?? "Renewal scan failed."); }
  }

  return <div className="space-y-6">
    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm uppercase tracking-widest text-muted-foreground">Repeat routines</p><h2 className="mt-2 text-2xl font-semibold">{editing ? "Edit subscription plan" : "Create subscription plan"}</h2><p className="mt-1 text-sm text-muted-foreground">Plans attach to an exact variant so stock, pricing, and fulfillment stay unambiguous.</p></div>{editing && <button type="button" onClick={reset} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Cancel editing</button>}</div>
      {(message || error) && <div className={"mt-5 rounded-lg border px-3 py-2 text-sm " + (error ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>{error ?? message}</div>}
      <form onSubmit={handleSubmit} className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Plan name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Monthly recovery refill" /></Field>
        <Field label="Product variant"><select required disabled={!!editing} value={form.variantId} onChange={(event) => setForm({ ...form, variantId: event.target.value })} className={inputClass}><option value="">Choose variant</option>{optionsData?.items.map((option) => <option key={option.id} value={option.id}>{option.product.name} · {[option.size, option.color].filter(Boolean).join(" / ") || option.sku}</option>)}</select></Field>
        <Field label="Savings (%)"><input required type="number" min="1" max="50" value={form.discountPercent} onChange={(event) => setForm({ ...form, discountPercent: event.target.value })} className={inputClass} /></Field>
        <Field label="Frequencies (days)"><input required value={form.frequencies} onChange={(event) => setForm({ ...form, frequencies: event.target.value })} className={inputClass} placeholder="30,60,90" /></Field>
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-primary" />Plan active</label>
        <div className="sm:col-span-2 lg:col-span-3"><button type="submit" disabled={creating || updating || (!!editing && !editDirty)} className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{creating || updating ? "Saving…" : editing ? "Update plan" : "Create plan"}</button></div>
      </form>
    </section>

    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><h2 className="text-xl font-semibold">Subscription operations</h2><p className="mt-1 text-sm text-muted-foreground">The hourly worker creates reminder records without charging or reserving stock.</p></div><button type="button" onClick={handleProcess} disabled={processing} className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">{processing ? "Scanning…" : "Run due scan"}</button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3"><Metric label="Active" value={data?.summary.active ?? 0} /><Metric label="Paused" value={data?.summary.paused ?? 0} /><Metric label="Cancelled" value={data?.summary.cancelled ?? 0} /></div>
    </section>

    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6"><div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Plans</h2><p className="mt-1 text-sm text-muted-foreground">Savings are snapshotted when a customer enrolls.</p></div><span className="text-sm text-muted-foreground">{data?.plans.length ?? 0} total</span></div>
      {isLoading ? <div className="mt-5 h-40 animate-pulse rounded-xl bg-muted" /> : data?.plans.length ? <div className="mt-5 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Plan</th><th className="px-4 py-3">Price</th><th className="px-4 py-3">Frequencies</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{data.plans.map((plan) => <tr key={plan.id} className="border-t border-border"><td className="px-4 py-3"><p className="font-medium">{plan.name}</p><p className="text-xs text-muted-foreground">{plan.variant.product.name} · {plan.variant.sku}</p></td><td className="px-4 py-3"><p className="font-semibold">{formatINR(plan.variant.discountedPrice)}</p><p className="text-xs text-emerald-700">{plan.discountPercent}% off</p></td><td className="px-4 py-3">{plan.allowedFrequencies.map((days) => days + "d").join(" · ")}</td><td className="px-4 py-3">{plan.active ? "Active" : "Inactive"}</td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditing(plan)} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold">Edit</button><button type="button" onClick={() => handleDelete(plan)} className="ml-2 px-2 py-1.5 text-xs font-semibold text-red-600">Delete</button></td></tr>)}</tbody></table></div> : <p className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No subscription plans yet.</p>}
    </section>

    <section className="grid gap-6 lg:grid-cols-2"><div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6"><h2 className="text-xl font-semibold">Upcoming schedules</h2><ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">{data?.upcoming.length ? data.upcoming.map((item) => <li key={item.id} className="px-4 py-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{item.plan.variant.product.name}</p><p className="text-xs text-muted-foreground">{item.user.name || item.user.email} · every {item.frequencyDays} days</p></div><span className="text-xs font-semibold">{new Date(item.nextOrderAt).toLocaleDateString("en-IN")}</span></div></li>) : <li className="px-4 py-6 text-center text-sm text-muted-foreground">No active schedules.</li>}</ul></div>
      <div className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6"><h2 className="text-xl font-semibold">Recent renewal records</h2><ul className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border">{data?.recentRenewals.length ? data.recentRenewals.map((renewal) => <li key={renewal.id} className="px-4 py-3"><div className="flex justify-between gap-3"><div><p className="text-sm font-medium">{renewal.subscription.plan.variant.product.name}</p><p className="text-xs text-muted-foreground">{renewal.subscription.user.name || renewal.subscription.user.email}</p></div><div className="text-right"><p className="text-xs font-semibold">{renewal.status.replaceAll("_", " ")}</p><p className="text-xs text-muted-foreground">{new Date(renewal.scheduledFor).toLocaleDateString("en-IN")}</p></div></div></li>) : <li className="px-4 py-6 text-center text-sm text-muted-foreground">No renewal records.</li>}</ul></div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-sm font-medium">{label}</span>{children}</label>; }
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p></div>; }
const inputClass="mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35 disabled:opacity-60";