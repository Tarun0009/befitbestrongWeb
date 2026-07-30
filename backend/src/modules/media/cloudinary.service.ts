import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";

export const PRODUCT_IMAGE_MIME_TYPES = [
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

const CLOUDINARY_FORMATS = ["avif", "jpeg", "jpg", "png", "webp"] as const;
const CLOUDINARY_PROVIDER = "CLOUDINARY";

export interface CloudinaryUploadEvidence {
  assetId: string;
  publicId: string;
  version: number;
  signature: string;
  width: number;
  height: number;
  bytes: number;
  format: string;
  resourceType: "image";
}

export interface ManagedProductImage {
  provider: typeof CLOUDINARY_PROVIDER;
  storageKey: string;
  assetId: string;
  version: number;
  width: number;
  height: number;
  bytes: number;
  format: string;
  url: string;
}

type SignatureValue = string | number | boolean;

function isCloudinaryConfigured() {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
      env.CLOUDINARY_API_KEY &&
      env.CLOUDINARY_API_SECRET,
  );
}

function requireCloudinaryConfiguration() {
  if (
    !env.CLOUDINARY_CLOUD_NAME ||
    !env.CLOUDINARY_API_KEY ||
    !env.CLOUDINARY_API_SECRET
  ) {
    throw new HttpError(
      503,
      "media_unavailable",
      "Managed image uploads are not configured yet",
    );
  }
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    apiSecret: env.CLOUDINARY_API_SECRET,
  };
}

function signatureValue(value: SignatureValue) {
  return typeof value === "boolean" ? String(value) : String(value);
}

export function signCloudinaryParameters(
  parameters: Record<string, SignatureValue>,
  apiSecret: string,
) {
  const payload = Object.entries(parameters)
    .filter(([, value]) => value !== "")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${signatureValue(value)}`)
    .join("&");
  return createHash("sha1").update(`${payload}${apiSecret}`).digest("hex");
}

function signaturesMatch(actual: string, expected: string) {
  if (!/^[a-f0-9]{40}$/i.test(actual) || actual.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function safeFileStem(fileName: string) {
  const withoutExtension = fileName.replace(/\.[^.]+$/, "");
  const stem = withoutExtension
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return stem || "product-image";
}

function productPublicIdPrefix(productId: string) {
  return `${env.CLOUDINARY_UPLOAD_FOLDER}/${productId}/`;
}

export function getProductMediaConfiguration() {
  return {
    configured: isCloudinaryConfigured(),
    provider: isCloudinaryConfigured() ? CLOUDINARY_PROVIDER : null,
    acceptedMimeTypes: [...PRODUCT_IMAGE_MIME_TYPES],
    maxBytes: env.CLOUDINARY_MAX_IMAGE_BYTES,
    maxDimension: env.CLOUDINARY_MAX_IMAGE_DIMENSION,
    maxImagesPerProduct: env.CLOUDINARY_MAX_IMAGES_PER_PRODUCT,
  };
}

export function issueProductImageUploadSignature(input: {
  productId: string;
  fileName: string;
}) {
  const config = requireCloudinaryConfiguration();
  const timestamp = Math.floor(Date.now() / 1_000);
  const publicId = `${productPublicIdPrefix(input.productId)}${safeFileStem(input.fileName)}-${randomUUID()}`;
  const signedParameters: Record<string, SignatureValue> = {
    allowed_formats: CLOUDINARY_FORMATS.join(","),
    overwrite: false,
    public_id: publicId,
    timestamp,
    transformation: `c_limit,h_${env.CLOUDINARY_MAX_IMAGE_DIMENSION},w_${env.CLOUDINARY_MAX_IMAGE_DIMENSION}`,
  };

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/upload`,
    formFields: {
      api_key: config.apiKey,
      ...Object.fromEntries(
        Object.entries(signedParameters).map(([key, value]) => [
          key,
          signatureValue(value),
        ]),
      ),
      signature: signCloudinaryParameters(signedParameters, config.apiSecret),
    },
    expiresAt: new Date((timestamp + 55 * 60) * 1_000).toISOString(),
    constraints: getProductMediaConfiguration(),
  };
}

function trustedDeliveryUrl(input: {
  cloudName: string;
  publicId: string;
  version: number;
  format: string;
}) {
  const encodedPublicId = input.publicId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `https://res.cloudinary.com/${encodeURIComponent(input.cloudName)}/image/upload/f_auto,q_auto/v${input.version}/${encodedPublicId}.${input.format}`;
}

export function verifyProductImageUploadIdentity(
  productId: string,
  upload: CloudinaryUploadEvidence,
) {
  const config = requireCloudinaryConfiguration();
  const expectedSignature = signCloudinaryParameters(
    { public_id: upload.publicId, version: upload.version },
    config.apiSecret,
  );
  if (!signaturesMatch(upload.signature, expectedSignature)) {
    throw new HttpError(400, "invalid_media_signature", "Image upload verification failed");
  }
  if (!upload.publicId.startsWith(productPublicIdPrefix(productId))) {
    throw new HttpError(400, "invalid_media_owner", "Image upload does not belong to this product");
  }
}

export function verifyProductImageUpload(
  productId: string,
  upload: CloudinaryUploadEvidence,
): ManagedProductImage {
  verifyProductImageUploadIdentity(productId, upload);
  const config = requireCloudinaryConfiguration();
  const format = upload.format.toLowerCase();
  if (!(CLOUDINARY_FORMATS as readonly string[]).includes(format)) {
    throw new HttpError(400, "unsupported_media_type", "Unsupported product image type");
  }
  if (
    upload.bytes <= 0 ||
    upload.bytes > env.CLOUDINARY_MAX_IMAGE_BYTES ||
    upload.width <= 0 ||
    upload.height <= 0 ||
    upload.width > env.CLOUDINARY_MAX_IMAGE_DIMENSION ||
    upload.height > env.CLOUDINARY_MAX_IMAGE_DIMENSION
  ) {
    throw new HttpError(400, "invalid_media_dimensions", "Image exceeds the configured limits");
  }

  return {
    provider: CLOUDINARY_PROVIDER,
    storageKey: upload.publicId,
    assetId: upload.assetId,
    version: upload.version,
    width: upload.width,
    height: upload.height,
    bytes: upload.bytes,
    format,
    url: trustedDeliveryUrl({
      cloudName: config.cloudName,
      publicId: upload.publicId,
      version: upload.version,
      format,
    }),
  };
}

interface CloudinaryResourceDetails {
  asset_id?: unknown;
  public_id?: unknown;
  version?: unknown;
  width?: unknown;
  height?: unknown;
  bytes?: unknown;
  format?: unknown;
  resource_type?: unknown;
  type?: unknown;
}

export async function confirmProductImageUpload(
  productId: string,
  upload: CloudinaryUploadEvidence,
  fetchImpl: typeof fetch = fetch,
) {
  // Verify possession of a valid upload response before spending an Admin API call.
  verifyProductImageUpload(productId, upload);
  const config = requireCloudinaryConfiguration();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.CLOUDINARY_HTTP_TIMEOUT_MS);
  try {
    const response = await fetchImpl(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/resources/${encodeURIComponent(upload.assetId)}`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`).toString("base64")}`,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) {
      throw new HttpError(
        response.status === 404 ? 400 : 502,
        response.status === 404 ? "media_not_found" : "media_verification_failed",
        response.status === 404
          ? "Uploaded image could not be found"
          : "Uploaded image could not be verified",
      );
    }
    const resource = (await response.json()) as CloudinaryResourceDetails;
    if (
      resource.asset_id !== upload.assetId ||
      resource.public_id !== upload.publicId ||
      resource.version !== upload.version ||
      resource.resource_type !== "image" ||
      resource.type !== "upload" ||
      typeof resource.width !== "number" ||
      typeof resource.height !== "number" ||
      typeof resource.bytes !== "number" ||
      typeof resource.format !== "string"
    ) {
      throw new HttpError(400, "media_mismatch", "Uploaded image details do not match");
    }
    return verifyProductImageUpload(productId, {
      ...upload,
      width: resource.width,
      height: resource.height,
      bytes: resource.bytes,
      format: resource.format,
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(
      { err: error, provider: CLOUDINARY_PROVIDER, storageKey: upload.publicId },
      "managed product image verification request failed",
    );
    throw new HttpError(502, "media_verification_failed", "Uploaded image could not be verified");
  } finally {
    clearTimeout(timeout);
  }
}

export async function destroyManagedProductImage(input: {
  provider: string | null;
  storageKey: string | null;
}) {
  if (!input.provider || !input.storageKey) return;
  if (input.provider !== CLOUDINARY_PROVIDER) {
    throw new HttpError(500, "unknown_media_provider", "Unknown managed media provider");
  }

  const config = requireCloudinaryConfiguration();
  const parameters: Record<string, SignatureValue> = {
    invalidate: true,
    public_id: input.storageKey,
    timestamp: Math.floor(Date.now() / 1_000),
  };
  const body = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => [
        key,
        signatureValue(value),
      ]),
    ),
    api_key: config.apiKey,
    signature: signCloudinaryParameters(parameters, config.apiSecret),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.CLOUDINARY_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(config.cloudName)}/image/destroy`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
        signal: controller.signal,
      },
    );
    const result = (await response.json().catch(() => null)) as
      | { result?: string; error?: { message?: string } }
      | null;
    if (
      !response.ok ||
      (result?.result !== "ok" && result?.result !== "not found")
    ) {
      logger.error(
        {
          status: response.status,
          provider: CLOUDINARY_PROVIDER,
          storageKey: input.storageKey,
          providerResult: result?.result,
          providerError: result?.error?.message,
        },
        "managed product image deletion failed",
      );
      throw new HttpError(502, "media_delete_failed", "Hosted image could not be removed");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    logger.error(
      { err: error, provider: CLOUDINARY_PROVIDER, storageKey: input.storageKey },
      "managed product image deletion request failed",
    );
    throw new HttpError(502, "media_delete_failed", "Hosted image could not be removed");
  } finally {
    clearTimeout(timeout);
  }
}
