"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAdminCreateProductMutation,
  useGetCategoriesQuery,
} from "@/lib/catalogApi";

interface DraftVariant {
  key: string;
  sku: string;
  size: string;
  color: string;
  price: string; // rupees, converted to paise on submit
  stock: string;
}

const emptyVariant = (): DraftVariant => ({
  key: Math.random().toString(36).slice(2),
  sku: "",
  size: "",
  color: "",
  price: "",
  stock: "0",
});

function rupeesToPaise(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Math.round(Number(value) * 100);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function NewProductPage() {
  const router = useRouter();
  const { data: cats } = useGetCategoriesQuery();
  const [createProduct, { isLoading }] = useAdminCreateProductMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [basePrice, setBasePrice] = useState(""); // rupees
  const [compareAtPrice, setCompareAtPrice] = useState(""); // rupees
  const [dispatchHint, setDispatchHint] = useState("Dispatches in 24 hrs");
  const [imageUrl, setImageUrl] = useState("");
  const [variants, setVariants] = useState<DraftVariant[]>([emptyVariant()]);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!categoryId) {
      setError("Pick a category.");
      return;
    }
    const priceInPaise = rupeesToPaise(basePrice);
    if (priceInPaise === null || priceInPaise < 0) {
      setError("Base price must be a positive number.");
      return;
    }
    const mrpInPaise = rupeesToPaise(compareAtPrice);
    if (mrpInPaise !== null && mrpInPaise <= priceInPaise) {
      setError("MRP should be higher than the base price, or left empty.");
      return;
    }
    try {
      const res = await createProduct({
        name: name.trim(),
        description: description.trim(),
        categoryId,
        basePrice: priceInPaise,
        compareAtPrice: mrpInPaise,
        dispatchHint: dispatchHint.trim() || null,
        active: true,
        images: imageUrl.trim() ? [{ url: imageUrl.trim(), alt: name.trim() }] : [],
        variants: variants
          .filter((v) => v.sku.trim())
          .map((v) => ({
            sku: v.sku.trim(),
            size: v.size.trim() || undefined,
            color: v.color.trim() || undefined,
            price: rupeesToPaise(v.price || basePrice) ?? priceInPaise,
            stock: Number(v.stock) || 0,
          })),
      }).unwrap();
      router.push(`/admin/products/${res.product.id}`);
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setError(e.data?.error?.message ?? "Couldn't create product.");
    }
  }

  return (
    <div className="space-y-5">
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/admin/products" className="hover:text-foreground">
          Products
        </Link>{" "}
        / New
      </nav>

      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Catalog</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Create a new product</h2>
        <p className="mt-1 text-sm text-muted-foreground">Add the core product, pricing, first image, and opening inventory in one guided form.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <Field label="Name">
          <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Description">
          <textarea required value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={inputCls}>
              <option value="">Pick a category</option>
              {cats?.items.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Base price (₹)">
            <input required type="number" min={0} step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={inputCls} />
          </Field>
          <Field label="MRP / compare-at price (₹)">
            <input type="number" min={0} step="0.01" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="Leave empty for no sale ribbon" className={inputCls} />
          </Field>
          <Field label="Dispatch hint">
            <input value={dispatchHint} onChange={(e) => setDispatchHint(e.target.value)} maxLength={80} placeholder="Dispatches in 24 hrs" className={inputCls} />
          </Field>
        </div>
        <Field label="Image URL (optional)">
          <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." className={inputCls} />
        </Field>

        <section className="rounded-2xl border border-black/[0.07] bg-[#faf9f6] p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Variants</h3>
            <button type="button" onClick={() => setVariants((prev) => [...prev, emptyVariant()])} className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted">
              Add variant
            </button>
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            SKU must be unique across the catalog. Price defaults to the product's base price if you leave it blank.
          </p>

          <div className="mt-4 space-y-3">
            {variants.map((v, i) => (
              <div key={v.key} className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]">
                <input placeholder="SKU" value={v.sku} onChange={(e) => setVariants((prev) => prev.map((row, j) => j === i ? { ...row, sku: e.target.value } : row))} className={inputCls} />
                <input placeholder="Size" value={v.size} onChange={(e) => setVariants((prev) => prev.map((row, j) => j === i ? { ...row, size: e.target.value } : row))} className={inputCls} />
                <input placeholder="Color" value={v.color} onChange={(e) => setVariants((prev) => prev.map((row, j) => j === i ? { ...row, color: e.target.value } : row))} className={inputCls} />
                <input placeholder="Price ₹" type="number" min={0} step="0.01" value={v.price} onChange={(e) => setVariants((prev) => prev.map((row, j) => j === i ? { ...row, price: e.target.value } : row))} className={inputCls} />
                <input placeholder="Stock" type="number" min={0} value={v.stock} onChange={(e) => setVariants((prev) => prev.map((row, j) => j === i ? { ...row, stock: e.target.value } : row))} className={inputCls} />
                <button type="button" onClick={() => setVariants((prev) => prev.length === 1 ? prev : prev.filter((_, j) => j !== i))} disabled={variants.length === 1} className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40" aria-label="Remove variant">
                  ×
                </button>
              </div>
            ))}
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={isLoading} className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {isLoading ? "Creating..." : "Create product"}
          </button>
          <Link href="/admin/products" className="rounded-md border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 py-2 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
