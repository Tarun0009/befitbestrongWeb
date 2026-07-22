"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { formatINR } from "@/lib/format";
import { buildChangedFields, hasChangedFields } from "@/lib/changedFields";
import {
  type Bundle,
  type BundlePricingType,
  useAdminBundleOptionsQuery,
  useAdminCreateBundleMutation,
  useAdminDeleteBundleMutation,
  useAdminListBundlesQuery,
  useAdminUpdateBundleMutation,
} from "@/features/bundles/bundlesApi";

interface ComponentDraft {
  variantId: string;
  quantity: number;
}

const blank = {
  name: "",
  description: "",
  imageUrl: "",
  active: true,
  pricingType: "PERCENTAGE_OFF" as BundlePricingType,
  value: "10",
  startsAt: "",
  endsAt: "",
};

export default function AdminBundlesPage() {
  const { data, isLoading } = useAdminListBundlesQuery();
  const { data: optionsData } = useAdminBundleOptionsQuery();
  const [createBundle, { isLoading: creating }] = useAdminCreateBundleMutation();
  const [updateBundle, { isLoading: updating }] = useAdminUpdateBundleMutation();
  const [deleteBundle, { isLoading: deleting }] = useAdminDeleteBundleMutation();
  const [editing, setEditing] = useState<Bundle | null>(null);
  const [form, setForm] = useState(blank);
  const [components, setComponents] = useState<ComponentDraft[]>([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const options = useMemo(() => optionsData?.items ?? [], [optionsData?.items]);
  const optionById = useMemo(() => new Map(options.map((option) => [option.id, option])), [options]);
  const componentTotal = components.reduce((sum, component) => {
    const option = optionById.get(component.variantId);
    return sum + (option?.price ?? 0) * component.quantity;
  }, 0);
  const submittedValue = form.pricingType === "FIXED_PRICE" ? Math.round(Number(form.value || 0) * 100) : Math.round(Number(form.value || 0));
  const previewPrice = form.pricingType === "FIXED_PRICE" ? submittedValue : componentTotal - Math.floor((componentTotal * submittedValue) / 100);
  const bundleBody = {
    name: form.name.trim(),
    description: form.description.trim(),
    imageUrl: form.imageUrl.trim() || null,
    active: form.active,
    pricingType: form.pricingType,
    value: submittedValue,
    startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    items: components,
  };
  const originalBundleBody = editing
    ? {
        name: editing.name,
        description: editing.description,
        imageUrl: editing.imageUrl,
        active: editing.active,
        pricingType: editing.pricingType,
        value: editing.value,
        startsAt: canonicalEditorDate(editing.startsAt),
        endsAt: canonicalEditorDate(editing.endsAt),
        items: editing.items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      }
    : null;
  const editDirty =
    !originalBundleBody ||
    hasChangedFields(buildChangedFields(bundleBody, originalBundleBody));

  useEffect(() => {
    if (!editing) return;
    setForm({
      name: editing.name,
      description: editing.description,
      imageUrl: editing.imageUrl ?? "",
      active: editing.active,
      pricingType: editing.pricingType,
      value: String(editing.pricingType === "FIXED_PRICE" ? editing.value / 100 : editing.value),
      startsAt: toLocalInput(editing.startsAt),
      endsAt: toLocalInput(editing.endsAt),
    });
    setComponents(editing.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [editing]);

  function reset() {
    setEditing(null);
    setForm(blank);
    setComponents([]);
    setSelectedVariantId("");
  }

  function addComponent() {
    if (!selectedVariantId || components.some((component) => component.variantId === selectedVariantId)) return;
    setComponents([...components, { variantId: selectedVariantId, quantity: 1 }]);
    setSelectedVariantId("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    if (components.length < 2) {
      setError("Choose at least two different variants.");
      return;
    }
    if (editing && !editDirty) {
      setMessage("Nothing to save.");
      return;
    }
    try {
      if (editing) {
        await updateBundle({ id: editing.id, body: bundleBody }).unwrap();
        setMessage("Bundle updated.");
      } else {
        await createBundle(bundleBody).unwrap();
        setMessage("Bundle created.");
      }
      reset();
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setError(apiError.data?.error?.message ?? "Could not save this bundle.");
    }
  }

  async function handleDelete(bundle: Bundle) {
    if (!window.confirm("Delete bundle " + bundle.name + "?")) return;
    try {
      await deleteBundle(bundle.id).unwrap();
      if (editing?.id === bundle.id) reset();
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setError(apiError.data?.error?.message ?? "Could not delete this bundle.");
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-widest text-muted-foreground">Merchandising</p>
            <h2 className="mt-2 text-2xl font-semibold">{editing ? "Edit bundle" : "Create bundle"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Current variant prices determine the retail total; checkout snapshots the saving and reserves every component.</p>
          </div>
          {editing && <button type="button" onClick={reset} className="rounded-lg border border-border px-3 py-2 text-xs font-semibold">Cancel editing</button>}
        </div>

        {(error || message) && <div className={"mt-5 rounded-lg border px-3 py-2 text-sm " + (error ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-800")}>{error ?? message}</div>}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bundle name"><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} placeholder="Strength starter stack" /></Field>
            <Field label="Image URL"><input type="url" value={form.imageUrl} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} className={inputClass} placeholder="Optional bundle artwork" /></Field>
            <Field label="Description" className="sm:col-span-2"><textarea required minLength={10} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="mt-1.5 min-h-24 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" /></Field>
            <Field label="Pricing type"><select value={form.pricingType} onChange={(event) => setForm({ ...form, pricingType: event.target.value as BundlePricingType })} className={inputClass}><option value="PERCENTAGE_OFF">Percentage off</option><option value="FIXED_PRICE">Fixed bundle price</option></select></Field>
            <Field label={form.pricingType === "FIXED_PRICE" ? "Bundle price (₹)" : "Savings (%)"}><input required type="number" min="1" max={form.pricingType === "PERCENTAGE_OFF" ? "90" : undefined} step={form.pricingType === "FIXED_PRICE" ? "0.01" : "1"} value={form.value} onChange={(event) => setForm({ ...form, value: event.target.value })} className={inputClass} /></Field>
            <Field label="Starts at"><input type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className={inputClass} /></Field>
            <Field label="Ends at"><input type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className={inputClass} /></Field>
          </div>

          <section className="rounded-xl bg-muted/40 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Add component" className="min-w-0 flex-1">
                <select value={selectedVariantId} onChange={(event) => setSelectedVariantId(event.target.value)} className={inputClass}>
                  <option value="">Choose a product variant</option>
                  {options.filter((option) => !components.some((component) => component.variantId === option.id)).map((option) => <option key={option.id} value={option.id}>{option.product.name} · {[option.size, option.color].filter(Boolean).join(" / ") || option.sku} · {formatINR(option.price)} · {option.stock} stock</option>)}
                </select>
              </Field>
              <button type="button" onClick={addComponent} disabled={!selectedVariantId} className="h-11 rounded-lg border border-border bg-background px-4 text-sm font-semibold disabled:opacity-50">Add</button>
            </div>
            {components.length ? (
              <ul className="mt-4 space-y-2">
                {components.map((component) => {
                  const option = optionById.get(component.variantId);
                  return <li key={component.variantId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background px-3 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{option?.product.name ?? component.variantId}</p><p className="text-xs text-muted-foreground">{option ? ([option.size, option.color].filter(Boolean).join(" / ") || option.sku) + " · " + formatINR(option.price) : "Loading variant"}</p></div>
                    <label className="flex items-center gap-2 text-xs">Qty<input type="number" min="1" max="20" value={component.quantity} onChange={(event) => setComponents(components.map((item) => item.variantId === component.variantId ? { ...item, quantity: Number(event.target.value) } : item))} className="h-9 w-16 rounded-md border border-border bg-background px-2 text-sm" /></label>
                    <button type="button" onClick={() => setComponents(components.filter((item) => item.variantId !== component.variantId))} className="text-xs font-semibold text-red-600">Remove</button>
                  </li>;
                })}
              </ul>
            ) : <p className="mt-4 text-sm text-muted-foreground">No components selected.</p>}
            <div className="mt-4 flex flex-wrap justify-between gap-3 border-t border-border pt-4 text-sm"><span>Retail total <strong>{formatINR(componentTotal)}</strong></span><span>Preview <strong>{formatINR(Math.max(0, previewPrice))}</strong>{componentTotal > previewPrice && <span className="ml-2 text-emerald-700">Save {formatINR(componentTotal - previewPrice)}</span>}</span></div>
          </section>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} className="h-4 w-4 accent-primary" />Active and visible</label>
            <button type="submit" disabled={creating || updating || (!!editing && !editDirty)} className="rounded-lg bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{creating || updating ? "Saving…" : editing ? "Update bundle" : "Create bundle"}</button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex items-end justify-between"><div><h2 className="text-xl font-semibold">Configured bundles</h2><p className="mt-1 text-sm text-muted-foreground">Availability updates from the lowest-stock component.</p></div><span className="text-sm text-muted-foreground">{data?.items.length ?? 0} total</span></div>
        {isLoading ? <div className="mt-5 h-40 animate-pulse rounded-xl bg-muted" /> : data?.items.length ? (
          <div className="mt-5 overflow-x-auto rounded-xl border border-border"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Bundle</th><th className="px-4 py-3">Pricing</th><th className="px-4 py-3">Availability</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{data.items.map((bundle) => <tr key={bundle.id} className="border-t border-border"><td className="px-4 py-3"><p className="font-medium">{bundle.name}</p><p className="mt-1 text-xs text-muted-foreground">{bundle.items.length} variants · /bundles/{bundle.slug}</p></td><td className="px-4 py-3"><p className="font-semibold">{formatINR(bundle.unitPrice)}</p><p className="text-xs text-emerald-700">Save {formatINR(bundle.savings)} ({bundle.savingsPercent}%)</p></td><td className="px-4 py-3">{bundle.availableUnits} bundles</td><td className="px-4 py-3"><span className={bundle.status === "AVAILABLE" ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-700" : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"}>{bundle.status.replaceAll("_", " ")}</span></td><td className="px-4 py-3 text-right"><button type="button" onClick={() => setEditing(bundle)} disabled={deleting} className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">Edit</button><button type="button" onClick={() => handleDelete(bundle)} disabled={deleting} className="ml-2 px-2 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-50">{deleting ? "Deleting…" : "Delete"}</button></td></tr>)}</tbody></table></div>
        ) : <p className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No bundles configured yet.</p>}
      </section>
    </div>
  );
}

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <label className={"block " + className}><span className="text-sm font-medium">{label}</span>{children}</label>;
}

function canonicalEditorDate(value: string | null) {
  const editorValue = toLocalInput(value);
  return editorValue ? new Date(editorValue).toISOString() : null;
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const inputClass = "mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";
