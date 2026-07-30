"use client";

import { useState, type FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CloudUpload,
  LoaderCircle,
  Star,
  Trash2,
} from "lucide-react";
import {
  useAdminAddImageMutation,
  useAdminDeleteImageMutation,
  useAdminUpdateImageMutation,
  type AdminProductDetail,
} from "@/lib/catalogApi";
import { ProductImageFilePicker } from "./ProductImageFilePicker";
import { uploadProductImageToCloudinary, validateProductImageFile } from "./cloudinaryUpload";
import {
  useAttachManagedProductImageMutation,
  useCleanupManagedProductImageUploadMutation,
  useCreateProductImageUploadSignatureMutation,
  useGetProductMediaConfigurationQuery,
  useReorderProductImagesMutation,
} from "./productImagesApi";

const inputClass =
  "min-h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 py-2 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";

function readableError(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  const apiError = error as { data?: { error?: { message?: string } } };
  return apiError.data?.error?.message ?? fallback;
}

function selectedFileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function ProductImageManager({ product }: { product: AdminProductDetail }) {
  const { data: configuration, isLoading: loadingConfiguration } =
    useGetProductMediaConfigurationQuery();
  const [createSignature] = useCreateProductImageUploadSignatureMutation();
  const [attachImage] = useAttachManagedProductImageMutation();
  const [cleanupUpload] = useCleanupManagedProductImageUploadMutation();
  const [reorderImages, { isLoading: reordering }] = useReorderProductImagesMutation();
  const [addExternalImage, { isLoading: addingExternal }] = useAdminAddImageMutation();
  const [deleteImage, { isLoading: deleting }] = useAdminDeleteImageMutation();
  const [files, setFiles] = useState<File[]>([]);
  const [alt, setAlt] = useState(product.name);
  const [externalUrl, setExternalUrl] = useState("");
  const [externalAlt, setExternalAlt] = useState("");
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);

  const remaining = Math.max(
    0,
    (configuration?.maxImagesPerProduct ?? 8) - product.images.length,
  );
  const busy = uploading || reordering || deleting || addingExternal;

  async function handleUpload() {
    if (!configuration?.configured || files.length === 0 || busy) return;
    setUploading(true);
    setMessage(null);
    const failed: File[] = [];
    let uploaded = 0;

    for (const file of files) {
      const key = selectedFileKey(file);
      let evidence;
      try {
        await validateProductImageFile(file, configuration);
        const signed = await createSignature({
          productId: product.id,
          fileName: file.name,
          contentType: file.type,
        }).unwrap();
        evidence = await uploadProductImageToCloudinary(file, signed, (value) => {
          setProgress((current) => ({ ...current, [key]: value }));
        });
        await attachImage({
          productId: product.id,
          upload: evidence,
          alt: alt.trim() || product.name,
        }).unwrap();
        uploaded += 1;
      } catch (error) {
        failed.push(file);
        if (evidence) {
          await cleanupUpload({ productId: product.id, upload: evidence })
            .unwrap()
            .catch(() => undefined);
        }
        setMessage({ kind: "error", text: readableError(error, `Could not upload ${file.name}.`) });
      }
    }

    setFiles(failed);
    setProgress({});
    setUploading(false);
    if (uploaded > 0 && failed.length === 0) {
      setMessage({
        kind: "success",
        text: `${uploaded} image${uploaded === 1 ? "" : "s"} uploaded successfully.`,
      });
    }
  }

  async function handleExternalImage(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      await addExternalImage({
        productId: product.id,
        body: {
          url: externalUrl.trim(),
          alt: externalAlt.trim() || product.name,
        },
      }).unwrap();
      setExternalUrl("");
      setExternalAlt("");
      setMessage({ kind: "success", text: "External image added." });
    } catch (error) {
      setMessage({ kind: "error", text: readableError(error, "Could not add the external image.") });
    }
  }

  async function removeImage(imageId: string) {
    if (!confirm("Remove this image from the product?")) return;
    setMessage(null);
    try {
      await deleteImage({ imageId, productId: product.id }).unwrap();
    } catch (error) {
      setMessage({ kind: "error", text: readableError(error, "Could not remove the image.") });
    }
  }

  async function setOrder(imageIds: string[]) {
    setMessage(null);
    try {
      await reorderImages({ productId: product.id, imageIds }).unwrap();
    } catch (error) {
      setMessage({ kind: "error", text: readableError(error, "Could not reorder images.") });
    }
  }

  function moveImage(index: number, nextIndex: number) {
    const next = product.images.map((image) => image.id);
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(nextIndex, 0, moved);
    void setOrder(next);
  }

  function makePrimary(imageId: string) {
    void setOrder([
      imageId,
      ...product.images.filter((image) => image.id !== imageId).map((image) => image.id),
    ]);
  }

  return (
    <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Product images</h3>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            The first image is the storefront thumbnail. Use clear square or portrait photos.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-black/[0.05] px-2.5 py-1 text-[11px] font-semibold tabular-nums">
          {product.images.length}/{configuration?.maxImagesPerProduct ?? 8}
        </span>
      </div>

      {product.images.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-black/10 px-4 py-6 text-center text-sm text-muted-foreground">
          No images yet. Add a primary product photo below.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {product.images.map((image, index) => (
            <ProductImageRow
              key={image.id}
              image={image}
              product={product}
              index={index}
              count={product.images.length}
              busy={busy}
              onMove={(nextIndex) => moveImage(index, nextIndex)}
              onMakePrimary={() => makePrimary(image.id)}
              onRemove={() => void removeImage(image.id)}
            />
          ))}
        </ul>
      )}

      <div className="mt-5 border-t border-border pt-5">
        {loadingConfiguration ? (
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        ) : configuration?.configured ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold">Upload from your device</p>
              <p className="mt-1 text-xs text-muted-foreground">Files are validated before a signed direct upload. Secret credentials stay on the server.</p>
            </div>
            <ProductImageFilePicker
              files={files}
              onFilesChange={setFiles}
              configuration={configuration}
              maxFiles={remaining}
              disabled={busy || remaining === 0}
            />
            {files.length > 0 && (
              <>
                <label className="block text-xs font-medium">
                  Image description
                  <input
                    value={alt}
                    onChange={(event) => setAlt(event.target.value)}
                    maxLength={200}
                    className={`mt-1.5 ${inputClass}`}
                    placeholder="Describe the product for screen readers"
                    disabled={busy}
                  />
                </label>
                {uploading && files.map((file) => (
                  <div key={selectedFileKey(file)} className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span className="truncate">{file.name}</span>
                      <span>{progress[selectedFileKey(file)] ?? 0}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-black/10">
                      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress[selectedFileKey(file)] ?? 0}%` }} />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => void handleUpload()}
                  disabled={busy}
                  className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {uploading ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <CloudUpload aria-hidden="true" className="h-4 w-4" />}
                  {uploading ? "Uploading…" : `Upload ${files.length} image${files.length === 1 ? "" : "s"}`}
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-5 text-amber-900">
            Device uploads will become available after Cloudinary is configured. You can continue with an external image URL below.
          </div>
        )}
      </div>

      <details className="mt-4 rounded-xl border border-black/10 bg-[#faf9f6] px-3.5 py-3">
        <summary className="cursor-pointer text-xs font-semibold">Advanced: add an external image URL</summary>
        <form onSubmit={handleExternalImage} className="mt-3 space-y-2">
          <input
            type="url"
            required
            value={externalUrl}
            onChange={(event) => setExternalUrl(event.target.value)}
            placeholder="https://…"
            className={inputClass}
            disabled={busy || remaining === 0}
          />
          <input
            value={externalAlt}
            onChange={(event) => setExternalAlt(event.target.value)}
            maxLength={200}
            placeholder="Image description"
            className={inputClass}
            disabled={busy || remaining === 0}
          />
          <button
            type="submit"
            disabled={busy || remaining === 0 || !externalUrl.trim()}
            className="min-h-10 w-full rounded-xl border border-black/15 bg-white px-3 text-xs font-semibold hover:bg-muted disabled:opacity-50"
          >
            {addingExternal ? "Adding…" : "Add external image"}
          </button>
        </form>
      </details>

      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`mt-3 flex items-start gap-1.5 text-xs ${message.kind === "error" ? "text-red-600" : "text-emerald-700"}`}
        >
          {message.kind === "success" && <Check aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          {message.text}
        </p>
      )}
    </section>
  );
}

function ProductImageRow({
  image,
  product,
  index,
  count,
  busy,
  onMove,
  onMakePrimary,
  onRemove,
}: {
  image: AdminProductDetail["images"][number];
  product: AdminProductDetail;
  index: number;
  count: number;
  busy: boolean;
  onMove: (nextIndex: number) => void;
  onMakePrimary: () => void;
  onRemove: () => void;
}) {
  const [updateImage, { isLoading: saving }] = useAdminUpdateImageMutation();
  const [alt, setAlt] = useState(image.alt ?? "");
  const [error, setError] = useState<string | null>(null);
  const dirty = alt.trim() !== (image.alt ?? "");

  async function saveAlt() {
    setError(null);
    try {
      await updateImage({
        imageId: image.id,
        productId: product.id,
        body: { alt: alt.trim() || null },
      }).unwrap();
    } catch (saveError) {
      setError(readableError(saveError, "Could not save the image description."));
    }
  }

  return (
    <li className={`rounded-xl border p-2.5 ${index === 0 ? "border-primary/45 bg-primary/[0.04]" : "border-black/10"}`}>
      <div className="flex gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.url} alt={image.alt ?? product.name} className="h-full w-full object-cover" />
          {index === 0 && <span className="absolute bottom-1 left-1 rounded bg-black/80 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">Primary</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {image.provider ? "Managed" : "External"}
              {image.width && image.height ? ` · ${image.width}×${image.height}` : ""}
            </span>
            <button
              type="button"
              onClick={onRemove}
              disabled={busy || saving}
              aria-label={`Remove image ${index + 1}`}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>
          <input
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            maxLength={200}
            aria-label={`Description for image ${index + 1}`}
            placeholder="Image description"
            className="mt-2 min-h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:ring-2 focus:ring-primary/30"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {index > 0 && (
              <button type="button" onClick={onMakePrimary} disabled={busy || saving} className="inline-flex items-center gap-1 rounded-md border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-40">
                <Star aria-hidden="true" className="h-3 w-3" /> Make primary
              </button>
            )}
            <button type="button" onClick={() => onMove(index - 1)} disabled={index === 0 || busy || saving} aria-label="Move image up" className="rounded-md border border-black/10 bg-white p-1.5 hover:bg-muted disabled:opacity-30">
              <ArrowUp aria-hidden="true" className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => onMove(index + 1)} disabled={index === count - 1 || busy || saving} aria-label="Move image down" className="rounded-md border border-black/10 bg-white p-1.5 hover:bg-muted disabled:opacity-30">
              <ArrowDown aria-hidden="true" className="h-3 w-3" />
            </button>
            <button type="button" onClick={() => void saveAlt()} disabled={!dirty || busy || saving} className="ml-auto rounded-md border border-black/10 bg-white px-2 py-1 text-[10px] font-semibold hover:bg-muted disabled:opacity-35">
              {saving ? "Saving…" : "Save description"}
            </button>
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-[11px] text-red-600">{error}</p>}
    </li>
  );
}
