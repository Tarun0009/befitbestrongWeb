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
          <CoreFields key={product.id} product={product} />
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
  const [update] = useAdminUpdateProductMutation();

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
  const [baseline, setBaseline] = useState<ProductEditableValues>(() =>
    editableProductValues(product),
  );
  const [savingSection, setSavingSection] = useState<string | null>(null);
  const [sectionStatus, setSectionStatus] = useState<
    Record<string, { message: string; error: boolean }>
  >({});

  const detailsPatch = buildChangedFields(
    {
      name: name.trim(),
      description: description.trim(),
      categoryId,
    },
    {
      name: baseline.name,
      description: baseline.description,
      categoryId: baseline.categoryId,
    },
  );
  const pricingPatch = buildChangedFields(
    {
    basePrice: rupeesToPaise(basePrice) ?? -1,
    compareAtPrice: rupeesToPaise(compareAtPrice),
    dispatchHint: dispatchHint.trim() || null,
    },
    {
      basePrice: baseline.basePrice,
      compareAtPrice: baseline.compareAtPrice,
      dispatchHint: baseline.dispatchHint,
    },
  );
  const visibilityPatch = buildChangedFields(
    { active },
    { active: baseline.active },
  );

  async function saveSection(
    section: "details" | "pricing" | "visibility",
    patch: Partial<ProductEditableValues>,
  ) {
    if (!hasChangedFields(patch)) return;
    if (section === "pricing") {
      const priceInPaise = rupeesToPaise(basePrice);
      if (priceInPaise === null || priceInPaise < 0) {
        setSectionStatus((current) => ({
          ...current,
          pricing: { message: "Base price must be a positive number.", error: true },
        }));
        return;
      }
      const mrpInPaise = rupeesToPaise(compareAtPrice);
      if (mrpInPaise !== null && mrpInPaise <= priceInPaise) {
        setSectionStatus((current) => ({
          ...current,
          pricing: {
            message: "MRP should be higher than the base price, or left empty.",
            error: true,
          },
        }));
        return;
      }
    }
    setSavingSection(section);
    setSectionStatus((current) => {
      const next = { ...current };
      delete next[section];
      return next;
    });
    try {
      await update({ id: product.id, body: patch }).unwrap();
      setBaseline((current) => ({ ...current, ...patch }));
      setSectionStatus((current) => ({
        ...current,
        [section]: { message: "Saved successfully.", error: false },
      }));
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setSectionStatus((current) => ({
        ...current,
        [section]: {
          message: e.data?.error?.message ?? "This section could not be saved.",
          error: true,
        },
      }));
    } finally {
      setSavingSection(null);
    }
  }

  return (
    <div className="space-y-6">
      <ProductEditSection
        title="Basic information"
        description="Customer-facing product name, description, and catalog placement."
        dirty={hasChangedFields(detailsPatch)}
        saving={savingSection === "details"}
        status={sectionStatus.details}
        onSave={() => saveSection("details", detailsPatch)}
      >
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
      </ProductEditSection>

      <ProductEditSection
        title="Pricing & dispatch"
        description="Only price and fulfillment guidance are updated from this card."
        dirty={hasChangedFields(pricingPatch)}
        saving={savingSection === "pricing"}
        status={sectionStatus.pricing}
        onSave={() => saveSection("pricing", pricingPatch)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
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
      </ProductEditSection>

      <ProductEditSection
        title="Storefront visibility"
        description="Publish or hide this product without resubmitting its content, product options, prices, or images."
        dirty={hasChangedFields(visibilityPatch)}
        saving={savingSection === "visibility"}
        status={sectionStatus.visibility}
        onSave={() => saveSection("visibility", visibilityPatch)}
      >
        <label className="flex items-center justify-between gap-4 rounded-xl border border-black/[0.08] bg-[#faf9f6] p-4 text-sm">
          <span>
            <span className="block font-semibold">Visible on storefront</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Hidden products remain available in historical orders.
            </span>
          </span>
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-5 w-5 accent-primary"
          />
        </label>
      </ProductEditSection>
    </div>
  );
}

interface ProductEditableValues {
  name: string;
  description: string;
  categoryId: string;
  basePrice: number;
  compareAtPrice: number | null;
  dispatchHint: string | null;
  active: boolean;
}

function editableProductValues(product: AdminProductDetail): ProductEditableValues {
  return {
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    dispatchHint: product.dispatchHint,
    active: product.active,
  };
}

function ProductEditSection({
  title,
  description,
  dirty,
  saving,
  status,
  onSave,
  children,
}: {
  title: string;
  description: string;
  dirty: boolean;
  saving: boolean;
  status?: { message: string; error: boolean };
  onSave: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty && !saving) void onSave();
      }}
      aria-busy={saving}
      className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]"
    >
      <div className="flex items-start justify-between gap-3 border-b border-black/[0.06] px-5 py-4 sm:px-6">
        <div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p></div>
        <span className={dirty ? "rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800" : "rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700"}>{dirty ? "Unsaved" : "Up to date"}</span>
      </div>
      <div className="space-y-4 px-5 py-5 sm:px-6">{children}</div>
      <div className="flex min-h-16 flex-wrap items-center gap-3 border-t border-black/[0.06] bg-[#faf9f6] px-5 py-3 sm:px-6">
        <button type="submit" disabled={!dirty || saving} className="rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40">{saving ? "Saving section…" : "Save this section"}</button>
        {status && (!dirty || status.error) && <span role={status.error ? "alert" : "status"} className={status.error ? "text-sm text-red-700" : "text-sm text-emerald-700"}>{status.message}</span>}
      </div>
    </form>
  );
}

// ------------- Variant editor -------------

function productOptionLabel(
  size: string | null | undefined,
  color: string | null | undefined,
): string {
  return [size, color].filter(Boolean).join(" / ") || "Standard option";
}

function VariantEditor({ product }: { product: AdminProductDetail }) {
  const [createVariant, { isLoading: creating }] =
    useAdminCreateVariantMutation();
  const [deleteVariant, { isLoading: deleting }] =
    useAdminDeleteVariantMutation();

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
    const price = rupeesToPaise(
      draft.price.trim() || String(product.basePrice / 100),
    );
    const stock = Number(draft.stock);

    if (!draft.sku.trim()) {
      setError("Enter a unique SKU / inventory code.");
      return;
    }
    if (price === null || price < 0) {
      setError("Enter a valid non-negative selling price.");
      return;
    }
    if (!draft.stock.trim() || !Number.isInteger(stock) || stock < 0) {
      setError("Available stock must be a non-negative whole number.");
      return;
    }

    try {
      await createVariant({
        productId: product.id,
        body: {
          sku: draft.sku.trim(),
          size: draft.size.trim() || undefined,
          color: draft.color.trim() || undefined,
          price,
          stock,
        },
      }).unwrap();
      setDraft({ sku: "", size: "", color: "", price: "", stock: "0" });
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setError(e.data?.error?.message ?? "Couldn't create this product option.");
    }
  }

  async function handleDelete(variantId: string) {
    if (product.active && product.variants.length <= 1) {
      alert("An active product must keep at least one option. Hide the product or add another option first.");
      return;
    }
    if (!confirm("Delete this product option? Customers will no longer be able to buy it.")) {
      return;
    }
    try {
      await deleteVariant({ variantId, productId: product.id }).unwrap();
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      alert(e.data?.error?.message ?? "Couldn't delete this product option.");
    }
  }

  const canDeleteOption = !product.active || product.variants.length > 1;

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Inventory
          </p>
          <h3 className="mt-1 font-semibold">Product options & stock</h3>
        </div>
        <span className="rounded-full bg-[#f2f0e9] px-3 py-1 text-xs font-semibold text-muted-foreground">
          {product.variants.length} {product.variants.length === 1 ? "option" : "options"}
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.07] px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <p>
          Each option is one version customers can purchase—for example 1 kg /
          Chocolate or Size M / Black. For a product with no choices, keep one
          option with size and colour/flavour blank; it is shown as Standard.
        </p>
      </div>

      {product.variants.length === 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900">
          This product cannot be added to cart until it has at least one
          inventory option.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {product.variants.map((variant) => (
            <VariantRow
              key={variant.id}
              variant={variant}
              productId={product.id}
              onDelete={() => handleDelete(variant.id)}
              deleting={deleting}
              canDelete={canDeleteOption}
            />
          ))}
        </ul>
      )}

      <form
        onSubmit={handleAdd}
        className="mt-6 rounded-xl border border-dashed border-black/15 bg-[#faf9f6] p-4"
      >
        <div>
          <p className="text-sm font-semibold">Add another product option</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Leave size and colour/flavour empty when the product has only one
            standard version.
          </p>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Field label="SKU / inventory code">
            <input
              required
              placeholder="Example: BFS-WHEY-1KG"
              value={draft.sku}
              onChange={(e) => setDraft((d) => ({ ...d, sku: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Size / pack (optional)">
            <input
              placeholder="1 kg, M, 10 kg"
              value={draft.size}
              onChange={(e) => setDraft((d) => ({ ...d, size: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Colour / flavour (optional)">
            <input
              placeholder="Black, Chocolate"
              value={draft.color}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Selling price (₹)">
            <input
              type="number"
              min={0}
              step="0.01"
              placeholder={`Base price ₹${(product.basePrice / 100).toFixed(2)}`}
              value={draft.price}
              onChange={(e) => setDraft((d) => ({ ...d, price: e.target.value }))}
              className={inputCls}
            />
          </Field>
          <Field label="Available stock">
            <input
              required
              type="number"
              min={0}
              step={1}
              value={draft.stock}
              onChange={(e) => setDraft((d) => ({ ...d, stock: e.target.value }))}
              className={inputCls}
            />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:brightness-95 disabled:opacity-60"
          >
            {creating ? "Adding option…" : "Add option"}
          </button>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
        </div>
      </form>
    </section>
  );
}

function VariantRow({
  variant,
  productId,
  onDelete,
  deleting,
  canDelete,
}: {
  variant: AdminProductDetail["variants"][number];
  productId: string;
  onDelete: () => void;
  deleting: boolean;
  canDelete: boolean;
}) {
  const [updateVariant, { isLoading }] = useAdminUpdateVariantMutation();
  const [sku, setSku] = useState(variant.sku);
  const [size, setSize] = useState(variant.size ?? "");
  const [color, setColor] = useState(variant.color ?? "");
  const [price, setPrice] = useState((variant.price / 100).toFixed(2));
  const [stock, setStock] = useState(String(variant.stock));
  const [status, setStatus] = useState<{
    message: string;
    error: boolean;
  } | null>(null);

  const currentValues = {
    sku: sku.trim(),
    size: size.trim() || null,
    color: color.trim() || null,
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
  const optionName = productOptionLabel(currentValues.size, currentValues.color);

  async function handleSave() {
    setStatus(null);
    const priceInPaise = rupeesToPaise(price);
    const stockValue = Number(stock);
    if (!sku.trim() || priceInPaise === null || priceInPaise < 0) {
      setStatus({
        message: "SKU and a valid non-negative price are required.",
        error: true,
      });
      return;
    }
    if (!stock.trim() || !Number.isInteger(stockValue) || stockValue < 0) {
      setStatus({
        message: "Stock must be a non-negative whole number.",
        error: true,
      });
      return;
    }
    try {
      await updateVariant({
        variantId: variant.id,
        productId,
        body: variantPatch,
      }).unwrap();
      setSku(sku.trim());
      setSize(size.trim());
      setColor(color.trim());
      setStatus({ message: "Option saved.", error: false });
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setStatus({
        message: e.data?.error?.message ?? "This option could not be saved.",
        error: true,
      });
    }
  }

  return (
    <li className="rounded-xl border border-black/[0.08] bg-[#faf9f6] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{optionName}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Changes in this card update only this option.
          </p>
        </div>
        <span
          className={
            dirty
              ? "rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900"
              : "rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800"
          }
        >
          {dirty ? "Unsaved changes" : "Up to date"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Field label="SKU / inventory code">
          <input
            value={sku}
            onChange={(e) => {
              setSku(e.target.value);
              setStatus(null);
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Size / pack (optional)">
          <input
            value={size}
            onChange={(e) => {
              setSize(e.target.value);
              setStatus(null);
            }}
            placeholder="1 kg, M, 10 kg"
            className={inputCls}
          />
        </Field>
        <Field label="Colour / flavour (optional)">
          <input
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setStatus(null);
            }}
            placeholder="Black, Chocolate"
            className={inputCls}
          />
        </Field>
        <Field label="Selling price (₹)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={price}
            onChange={(e) => {
              setPrice(e.target.value);
              setStatus(null);
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Available stock">
          <input
            type="number"
            min={0}
            step={1}
            value={stock}
            onChange={(e) => {
              setStock(e.target.value);
              setStatus(null);
            }}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || isLoading}
          className="rounded-lg bg-foreground px-3.5 py-2 text-xs font-semibold text-background hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLoading ? "Saving…" : "Save option"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete || deleting || isLoading}
          title={
            canDelete
              ? "Delete this product option"
              : "An active product must keep at least one option."
          }
          className="rounded-lg border border-border px-3.5 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-40"
          aria-label={`Delete ${optionName}`}
        >
          Delete
        </button>
        {status && (
          <p
            role={status.error ? "alert" : "status"}
            className={
              status.error
                ? "text-xs font-medium text-red-700"
                : "text-xs font-medium text-emerald-700"
            }
          >
            {status.message}
          </p>
        )}
      </div>
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
