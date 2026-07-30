"use client";

import { useEffect, useId, useState, type ChangeEvent, type DragEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import { validateProductImageFile } from "./cloudinaryUpload";
import type { ProductMediaConfiguration } from "./types";

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

export function ProductImageFilePicker({
  files,
  onFilesChange,
  configuration,
  maxFiles,
  disabled = false,
}: {
  files: File[];
  onFilesChange: (files: File[]) => void;
  configuration: ProductMediaConfiguration;
  maxFiles: number;
  disabled?: boolean;
}) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Array<{ key: string; url: string }>>([]);

  useEffect(() => {
    const next = files.map((file) => ({ key: fileKey(file), url: URL.createObjectURL(file) }));
    setPreviews(next);
    return () => next.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, [files]);

  async function addFiles(incoming: File[]) {
    setError(null);
    const room = Math.max(0, maxFiles - files.length);
    if (room === 0) {
      setError("This product already has the maximum number of images.");
      return;
    }
    const unique = incoming.filter(
      (candidate) => !files.some((current) => fileKey(current) === fileKey(candidate)),
    );
    const accepted: File[] = [];
    let validationMessage: string | null = null;
    for (const file of unique.slice(0, room)) {
      try {
        await validateProductImageFile(file, configuration);
        accepted.push(file);
      } catch (validationError) {
        validationMessage =
          validationError instanceof Error
            ? `${file.name}: ${validationError.message}`
            : `${file.name}: Image validation failed.`;
        break;
      }
    }
    if (!validationMessage && incoming.length > room) {
      validationMessage = `You can select ${room} more image${room === 1 ? "" : "s"}.`;
    }
    setError(validationMessage);
    if (accepted.length) onFilesChange([...files, ...accepted]);
  }

  function handleInput(event: ChangeEvent<HTMLInputElement>) {
    void addFiles(Array.from(event.target.files ?? []));
    event.target.value = "";
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!disabled) void addFiles(Array.from(event.dataTransfer.files));
  }

  return (
    <div className="space-y-3">
      <label
        htmlFor={inputId}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-6 text-center transition ${
          dragging
            ? "border-primary bg-primary/10"
            : "border-black/15 bg-[#faf9f6] hover:border-primary/60 hover:bg-primary/[0.04]"
        } ${disabled ? "pointer-events-none opacity-55" : ""}`}
      >
        <ImagePlus aria-hidden="true" className="h-6 w-6 text-muted-foreground" />
        <span className="mt-2 text-sm font-semibold">Drop product images here</span>
        <span className="mt-1 text-xs text-muted-foreground">
          or choose files · JPEG, PNG, WebP or AVIF · up to {Math.round(configuration.maxBytes / 1_000_000)} MB
        </span>
        <input
          id={inputId}
          type="file"
          accept={configuration.acceptedMimeTypes.join(",")}
          multiple={maxFiles > 1}
          disabled={disabled}
          onChange={handleInput}
          className="sr-only"
        />
      </label>

      {files.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {files.map((file) => {
            const key = fileKey(file);
            const preview = previews.find((item) => item.key === key);
            return (
              <li key={key} className="relative overflow-hidden rounded-xl border border-black/10 bg-white">
                {preview && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt="Selected product preview" className="aspect-square w-full object-cover" />
                )}
                <div className="p-2">
                  <p className="truncate text-[11px] font-medium" title={file.name}>{file.name}</p>
                  <p className="text-[10px] text-muted-foreground">{(file.size / 1_000_000).toFixed(1)} MB</p>
                </div>
                <button
                  type="button"
                  onClick={() => onFilesChange(files.filter((item) => fileKey(item) !== key))}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  className="absolute right-2 top-2 rounded-full bg-black/75 p-1 text-white hover:bg-black disabled:opacity-50"
                >
                  <X aria-hidden="true" className="h-3.5 w-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="text-xs text-red-600">{error}</p>}
    </div>
  );
}