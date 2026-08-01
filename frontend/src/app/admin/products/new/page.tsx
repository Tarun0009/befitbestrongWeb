"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useAdminCreateProductMutation,
  useGetCategoriesQuery,
} from "@/lib/catalogApi";
import { ProductImageFilePicker } from "@/features/productImages/ProductImageFilePicker";
import { uploadProductImageToCloudinary } from "@/features/productImages/cloudinaryUpload";
import {
  useAttachManagedProductImageMutation,
  useCleanupManagedProductImageUploadMutation,
  useCreateProductImageUploadSignatureMutation,
  useGetProductMediaConfigurationQuery,
} from "@/features/productImages/productImagesApi";
import type { CloudinaryUploadEvidence } from "@/features/productImages/types";

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
  const { data: mediaConfiguration, isLoading: loadingMediaConfiguration } =
    useGetProductMediaConfigurationQuery();
  const [createImageSignature] = useCreateProductImageUploadSignatureMutation();
  const [attachManagedImage] = useAttachManagedProductImageMutation();
  const [cleanupManagedUpload] = useCleanupManagedProductImageUploadMutation();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [basePrice, setBasePrice] = useState(""); // rupees
  const [compareAtPrice, setCompareAtPrice] = useState(""); // rupees
  const [dispatchHint, setDispatchHint] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [imageUploadProgress, setImageUploadProgress] = useState(0);
  const [uploadingImage, setUploadingImage] = useState(false);
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
    if (variants.some((option) => !option.sku.trim())) {
      setError("Every product option needs a unique SKU / inventory code.");
      return;
    }
    const normalizedSkus = variants.map((option) => option.sku.trim().toLowerCase());
    if (new Set(normalizedSkus).size !== normalizedSkus.length) {
      setError("Each product option must use a different SKU.");
      return;
    }
    const hasInvalidInventory = variants.some((option) => {
      const optionPrice = rupeesToPaise(option.price || basePrice);
      const stock = Number(option.stock);
      return (
        optionPrice === null ||
        optionPrice < 0 ||
        !option.stock.trim() ||
        !Number.isInteger(stock) ||
        stock < 0
      );
    });
    if (hasInvalidInventory) {
      setError("Check each option's selling price and enter stock as a whole number.");
      return;
    }
    const preparedOptions = variants.map((option) => ({
      sku: option.sku.trim(),
      size: option.size.trim() || undefined,
      color: option.color.trim() || undefined,
      price: rupeesToPaise(option.price || basePrice) ?? priceInPaise,
      stock: Number(option.stock),
    }));
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
        variants: preparedOptions,
      }).unwrap();
      if (imageFiles[0] && mediaConfiguration?.configured) {
        setUploadingImage(true);
        let evidence: CloudinaryUploadEvidence | undefined;
        try {
          const signedUpload = await createImageSignature({
            productId: res.product.id,
            fileName: imageFiles[0].name,
            contentType: imageFiles[0].type,
          }).unwrap();
          evidence = await uploadProductImageToCloudinary(
            imageFiles[0],
            signedUpload,
            setImageUploadProgress,
          );
          await attachManagedImage({
            productId: res.product.id,
            upload: evidence,
            alt: name.trim(),
          }).unwrap();
        } catch {
          if (evidence) {
            await cleanupManagedUpload({
              productId: res.product.id,
              upload: evidence,
            })
              .unwrap()
              .catch(() => undefined);
          }
          sessionStorage.setItem(`product-image-upload:${res.product.id}`, "failed");
          router.push(`/admin/products/${res.product.id}`);
          return;
        } finally {
          setUploadingImage(false);
        }
      }
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
            <input value={dispatchHint} onChange={(e) => setDispatchHint(e.target.value)} maxLength={80} placeholder="Optional dispatch information shown to customers" className={inputCls} />
          </Field>
        </div>
        <section className="rounded-2xl border border-black/[0.07] bg-[#faf9f6] p-4 sm:p-5">
          <h3 className="font-medium">Primary image</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Optional. The image uploads after the product record is created, so it is always tied to a real product.
          </p>
          <div className="mt-4">
            {loadingMediaConfiguration ? (
              <div className="h-32 animate-pulse rounded-2xl bg-muted" />
            ) : mediaConfiguration?.configured ? (
              <ProductImageFilePicker
                files={imageFiles}
                onFilesChange={(files) => {
                  setImageFiles(files);
                  if (files.length > 0) setImageUrl("");
                }}
                configuration={mediaConfiguration}
                maxFiles={1}
                disabled={isLoading || uploadingImage || Boolean(imageUrl.trim())}
              />
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
                Device uploads will be enabled after Cloudinary is configured. You can create the product now and add images later, or use an external URL below.
              </div>
            )}
          </div>
          {uploadingImage && (
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading primary image…</span>
                <span>{imageUploadProgress}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${imageUploadProgress}%` }} />
              </div>
            </div>
          )}
          <details className="mt-4 rounded-xl border border-black/10 bg-white px-3.5 py-3">
            <summary className="cursor-pointer text-xs font-semibold">Advanced: use an external image URL</summary>
            <input
              type="url"
              value={imageUrl}
              onChange={(event) => {
                setImageUrl(event.target.value);
                if (event.target.value) setImageFiles([]);
              }}
              placeholder="https://…"
              disabled={imageFiles.length > 0 || isLoading || uploadingImage}
              className={inputCls}
            />
          </details>
        </section>

        <section className="rounded-2xl border border-black/[0.07] bg-[#faf9f6] p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Inventory
              </p>
              <h3 className="mt-1 font-semibold">Product options & stock</h3>
            </div>
            <button
              type="button"
              onClick={() => setVariants((prev) => [...prev, emptyVariant()])}
              disabled={variants.length >= 100}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-40"
            >
              Add another option
            </button>
          </div>

          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/[0.07] px-3.5 py-3 text-xs leading-5 text-muted-foreground">
            <p>
              <strong className="text-foreground">What is a product option?</strong>{" "}
              It is one version a customer can buy, such as 1 kg / Chocolate or
              Size M / Black.
            </p>
            <p className="mt-1">
              If this product has only one version, keep one option and leave
              size and colour/flavour empty. Customers will see it as Standard.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {variants.map((option, index) => {
              const optionName =
                [option.size.trim(), option.color.trim()].filter(Boolean).join(" / ") ||
                "Standard option";
              return (
                <div
                  key={option.key}
                  className="rounded-xl border border-black/[0.08] bg-white p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Option {index + 1}
                      </p>
                      <p className="text-sm font-semibold">{optionName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setVariants((current) =>
                          current.length === 1
                            ? current
                            : current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                      disabled={variants.length === 1}
                      title={
                        variants.length === 1
                          ? "Every active product needs at least one option."
                          : "Remove this option"
                      }
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-muted-foreground disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <Field label="SKU / inventory code">
                      <input
                        required
                        placeholder="Example: BFS-WHEY-1KG"
                        value={option.sku}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((row, itemIndex) =>
                              itemIndex === index
                                ? { ...row, sku: event.target.value }
                                : row,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Size / pack (optional)">
                      <input
                        placeholder="1 kg, M, 10 kg"
                        value={option.size}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((row, itemIndex) =>
                              itemIndex === index
                                ? { ...row, size: event.target.value }
                                : row,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Colour / flavour (optional)">
                      <input
                        placeholder="Black, Chocolate"
                        value={option.color}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((row, itemIndex) =>
                              itemIndex === index
                                ? { ...row, color: event.target.value }
                                : row,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Selling price (₹)">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={basePrice ? `Base price ₹${basePrice}` : "Uses base price"}
                        value={option.price}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((row, itemIndex) =>
                              itemIndex === index
                                ? { ...row, price: event.target.value }
                                : row,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </Field>
                    <Field label="Available stock">
                      <input
                        required
                        type="number"
                        min={0}
                        step={1}
                        value={option.stock}
                        onChange={(event) =>
                          setVariants((current) =>
                            current.map((row, itemIndex) =>
                              itemIndex === index
                                ? { ...row, stock: event.target.value }
                                : row,
                            ),
                          )
                        }
                        className={inputCls}
                      />
                    </Field>
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    SKU is an internal inventory code and must be unique. A blank
                    option price uses the product&apos;s base price.
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {error && (
          <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={isLoading || uploadingImage} className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:opacity-90 disabled:opacity-60">
            {uploadingImage ? "Uploading image…" : isLoading ? "Creating..." : "Create product"}
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
