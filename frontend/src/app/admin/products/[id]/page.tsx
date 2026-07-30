"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  useAdminGetProductQuery,
  useAdminUpdateProductMutation,
  useAdminDeleteProductMutation,
  useAdminCreateVariantMutation,
  useAdminUpdateVariantMutation,
  useAdminDeleteVariantMutation,
  useGetCategoriesQuery,
  type AdminProductDetail,
} from "@/lib/catalogApi";
import { formatINR } from "@/lib/format";
import { buildChangedFields, hasChangedFields } from "@/lib/changedFields";
import { ProductImageManager } from "@/features/productImages/ProductImageManager";

function rupeesToPaise(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Math.round(Number(value) * 100);
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminEditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [imageUploadWarning, setImageUploadWarning] = useState(false);
  const { data, isLoading, error } = useAdminGetProductQuery(params.id, {
    skip: !params.id,
  });
  const [deleteProduct, { isLoading: deleting }] =
    useAdminDeleteProductMutation();

  useEffect(() => {
    const key = `product-image-upload:${params.id}`;
    if (sessionStorage.getItem(key) === "failed") {
      sessionStorage.removeItem(key);
      setImageUploadWarning(true);
    }
  }, [params.id]);

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        Product not found.
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const product = data.product;

  async function handleDelete() {
    if (!confirm("Delete this product? Existing orders keep their snapshots.")) return;
    try {
      await deleteProduct(product.id).unwrap();
      router.push("/admin/products");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      alert(e.data?.error?.message ?? "Couldn't delete.");
    }
  }

  return (
    <div>
      <nav className="mb-5 text-sm font-medium text-muted-foreground">
        <Link href="/admin/products" className="hover:text-foreground">
          Products
        </Link>{" "}
        / <span className="font-mono">{product.slug}</span>
      </nav>

      {imageUploadWarning && (
        <div role="alert" className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Product created, but its first image did not finish uploading. The product was kept safely; retry in Product images below.
        </div>
      )}

      <header className="flex flex-col gap-4 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h2 className="text-2xl font-semibold">{product.name}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {product.category.name} · {formatINR(product.basePrice)}
          </p>
        </div>
        <Link
          href={`/shop/${product.slug}`}
          target="_blank"
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
        >
          View storefront
        </Link>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-6">
          <CoreFields product={product} />
          <VariantEditor product={product} />
        </div>

        <aside className="space-y-6">
          <ProductImageManager product={product} />

          <section className="rounded-2xl border border-red-200 bg-red-50/40 p-5 shadow-[0_10px_35px_rgba(127,29,29,0.04)]">
            <h3 className="font-medium text-red-700">Danger zone</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Deleting a product removes it from listings and search. Existing
              orders keep their product snapshots and remain fulfillable.
            </p>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="mt-3 rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              {deleting ? "Deleting…" : "Delete product"}
            </button>
          </section>
        </aside>
      </div>
    </div>
  );
}

// ------------- Core fields form -------------

function CoreFields({ product }: { product: AdminProductDetail }) {
  const { data: cats } = useGetCategoriesQuery();
  const [update, { isLoading }] = useAdminUpdateProductMutation();

  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [categoryId, setCategoryId] = useState(product.categoryId);
  const [basePrice, setBasePrice] = useState(
    (product.basePrice / 100).toFixed(2),
  );
  const [compareAtPrice, setCompareAtPrice] = useState(
    product.compareAtPrice ? (product.compareAtPrice / 100).toFixed(2) : "",
  );
  const [dispatchHint, setDispatchHint] = useState(product.dispatchHint ?? "");
  const [active, setActive] = useState(product.active);
  const [status, setStatus] = useState<string | null>(null);

  const currentValues = {
    name,
    description,
    categoryId,
    basePrice: rupeesToPaise(basePrice) ?? -1,
    compareAtPrice: rupeesToPaise(compareAtPrice),
    dispatchHint: dispatchHint.trim() || null,
    active,
  };
  const originalValues = {
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    dispatchHint: product.dispatchHint,
    active: product.active,
  };
  const productPatch = buildChangedFields(currentValues, originalValues);
  const dirty = hasChangedFields(productPatch);

  // Reset local form state when we navigate to a different product.
  useEffect(() => {
    setName(product.name);
    setDescription(product.description);
    setCategoryId(product.categoryId);
    setBasePrice((product.basePrice / 100).toFixed(2));
    setCompareAtPrice(
      product.compareAtPrice ? (product.compareAtPrice / 100).toFixed(2) : "",
    );
    setDispatchHint(product.dispatchHint ?? "");
    setActive(product.active);
  }, [product]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    const priceInPaise = rupeesToPaise(basePrice);
    if (priceInPaise === null || priceInPaise < 0) {
      setStatus("Base price must be a positive number.");
      return;
    }
    const mrpInPaise = rupeesToPaise(compareAtPrice);
    if (mrpInPaise !== null && mrpInPaise <= priceInPaise) {
      setStatus("MRP should be higher than the base price, or left empty.");
      return;
    }
    if (!dirty) {
      setStatus("Nothing to save.");
      return;
    }
    try {
      await update({ id: product.id, body: productPatch }).unwrap();
      setStatus("Saved.");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setStatus(e.data?.error?.message ?? "Save failed.");
    }
  }

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
      <h3 className="font-medium">Details</h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <Field label="Name">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={inputCls}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category">
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={inputCls}
            >
              {cats?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Base price (₹)">
            <input
              required
              type="number"
              min={0}
              step="0.01"
              value={basePrice}
              onChange={(e) => setBasePrice(e.target.value)}
              className={inputCls}
            />
          </Field>
          <Field label="MRP / compare-at price (₹)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={compareAtPrice}
              onChange={(e) => setCompareAtPrice(e.target.value)}
              placeholder="Leave empty for no sale ribbon"
              className={inputCls}
            />
          </Field>
          <Field label="Dispatch hint">
            <input
              value={dispatchHint}
              onChange={(e) => setDispatchHint(e.target.value)}
              maxLength={80}
              placeholder="Optional dispatch information shown to customers"
              className={inputCls}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Active (visible on storefront)
        </label>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={!dirty || isLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {isLoading ? "Saving..." : "Save changes"}
          </button>
          {status && (
            <span className="text-sm text-muted-foreground">{status}</span>
          )}
        </div>
      </form>
    </section>
  );
}

// ------------- Variant editor -------------

function VariantEditor({ product }: { product: AdminProductDetail }) {
  const [createVariant, { isLoading: creating }] =
    useAdminCreateVariantMutation();
  const [deleteVariant, { isLoading: deleting }] = useAdminDeleteVariantMutation();

  const [draft, setDraft] = useState({
    sku: "",
    size: "",
    color: "",
    price: "",
    stock: "0",
  });
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!draft.sku.trim()) {
      setError("SKU is required.");
      return;
    }
    try {
      await createVariant({
        productId: product.id,
        body: {
          sku: draft.sku.trim(),
          size: draft.size.trim() || undefined,
          color: draft.color.trim() || undefined,
          price: Math.round(
            Number(draft.price || product.basePrice / 100) * 100,
          ),
          stock: Number(draft.stock) || 0,
        },
      }).unwrap();
      setDraft({ sku: "", size: "", color: "", price: "", stock: "0" });
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setError(e.data?.error?.message ?? "Couldn't create variant.");
    }
  }

  async function handleDelete(variantId: string) {
    if (!confirm("Delete this variant?")) return;
    try {
      await deleteVariant({ variantId, productId: product.id }).unwrap();
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      alert(e.data?.error?.message ?? "Couldn't delete variant.");
    }
  }

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
      <h3 className="font-medium">Variants</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Each variant is a purchasable SKU. Stock is decremented at checkout.
      </p>

      {product.variants.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No variants yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {product.variants.map((v) => (
            <VariantRow
              key={v.id}
              variant={v}
              productId={product.id}
              onDelete={() => handleDelete(v.id)}
              deleting={deleting}
            />
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-medium">Add variant</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto]">
          <input
            placeholder="SKU"
            value={draft.sku}
            onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Size"
            value={draft.size}
            onChange={(e) => setDraft((d) => ({ ...d, size: e.target.value }))}
            className={inputCls}
          />
          <input
            placeholder="Color"
            value={draft.color}
            onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            step="0.01"
            placeholder="Price ₹"
            value={draft.price}
            onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
            className={inputCls}
          />
          <input
            type="number"
            min={0}
            placeholder="Stock"
            value={draft.stock}
            onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
            className={inputCls}
          />
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {creating ? "Adding…" : "Add"}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </form>
    </section>
  );
}

function VariantRow({
  variant,
  productId,
  onDelete,
  deleting,
}: {
  variant: AdminProductDetail["variants"][number];
  productId: string;
  onDelete: () => void;
  deleting: boolean;
}) {
  const [updateVariant, { isLoading }] = useAdminUpdateVariantMutation();
  const [sku, setSku] = useState(variant.sku);
  const [size, setSize] = useState(variant.size ?? "");
  const [color, setColor] = useState(variant.color ?? "");
  const [price, setPrice] = useState((variant.price / 100).toFixed(2));
  const [stock, setStock] = useState(String(variant.stock));

  const currentValues = {
    sku,
    size: size || null,
    color: color || null,
    price: rupeesToPaise(price) ?? -1,
    stock: stock.trim() ? Number(stock) : -1,
  };
  const originalValues = {
    sku: variant.sku,
    size: variant.size,
    color: variant.color,
    price: variant.price,
    stock: variant.stock,
  };
  const variantPatch = buildChangedFields(currentValues, originalValues);
  const dirty = hasChangedFields(variantPatch);

  async function handleSave() {
    const priceInPaise = rupeesToPaise(price);
    const stockValue = Number(stock);
    if (!sku.trim() || priceInPaise === null || priceInPaise < 0) {
      alert("SKU and a valid non-negative price are required.");
      return;
    }
    if (!stock.trim() || !Number.isInteger(stockValue) || stockValue < 0) {
      alert("Stock must be a non-negative whole number.");
      return;
    }
    try {
      await updateVariant({
        variantId: variant.id,
        productId,
        body: variantPatch,
      }).unwrap();
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      alert(e.data?.error?.message ?? "Save failed.");
    }
  }

  return (
    <li className="grid gap-2 sm:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto_auto]">
      <input
        value={sku}
        onChange={(e) => setSku(e.target.value)}
        className={inputCls}
      />
      <input
        value={size}
        onChange={(e) => setSize(e.target.value)}
        placeholder="Size"
        className={inputCls}
      />
      <input
        value={color}
        onChange={(e) => setColor(e.target.value)}
        placeholder="Color"
        className={inputCls}
      />
      <input
        type="number"
        min={0}
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        className={inputCls}
      />
      <input
        type="number"
        min={0}
        value={stock}
        onChange={(e) => setStock(e.target.value)}
        className={inputCls}
      />
      <button
        type="button"
        onClick={handleSave}
        disabled={!dirty || isLoading}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-40"
      >
        {isLoading ? "…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={deleting || isLoading}
        className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
        aria-label="Delete variant"
      >
        ×
      </button>
    </li>
  );
}

const inputCls =
  "mt-1.5 min-h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 py-2 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
