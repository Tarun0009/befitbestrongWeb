import type {
  CloudinaryUploadEvidence,
  ProductImageUploadSignature,
  ProductMediaConfiguration,
} from "./types";

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
  return expected.every((value, index) => bytes[offset + index] === value);
}

async function detectedImageType(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46]) &&
    hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
  ) {
    return "image/webp";
  }
  const box = new TextDecoder("ascii").decode(bytes);
  if (box.includes("ftypavif") || box.includes("ftypavis")) return "image/avif";
  return null;
}

async function imageDimensions(file: File) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  }

  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The selected file is not a readable image."));
    };
    image.src = url;
  });
}

export async function validateProductImageFile(
  file: File,
  configuration: ProductMediaConfiguration,
) {
  if (!configuration.acceptedMimeTypes.includes(file.type)) {
    throw new Error("Use a JPEG, PNG, WebP, or AVIF image.");
  }
  if (file.size <= 0 || file.size > configuration.maxBytes) {
    throw new Error(
      `Each image must be smaller than ${Math.round(configuration.maxBytes / 1_000_000)} MB.`,
    );
  }
  const detected = await detectedImageType(file);
  if (!detected || detected !== file.type) {
    throw new Error("The file contents do not match a supported image type.");
  }
  let dimensions: { width: number; height: number };
  try {
    dimensions = await imageDimensions(file);
  } catch {
    throw new Error("The selected file is damaged or cannot be decoded.");
  }
  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > configuration.maxDimension ||
    dimensions.height > configuration.maxDimension
  ) {
    throw new Error(
      `Image width and height must each be ${configuration.maxDimension}px or less.`,
    );
  }
  return dimensions;
}

function cloudinaryEvidence(value: unknown): CloudinaryUploadEvidence {
  if (!value || typeof value !== "object") {
    throw new Error("The image host returned an invalid response.");
  }
  const response = value as Record<string, unknown>;
  const evidence = {
    assetId: response.asset_id,
    publicId: response.public_id,
    version: response.version,
    signature: response.signature,
    width: response.width,
    height: response.height,
    bytes: response.bytes,
    format: response.format,
    resourceType: response.resource_type,
  };
  if (
    typeof evidence.assetId !== "string" ||
    typeof evidence.publicId !== "string" ||
    typeof evidence.version !== "number" ||
    typeof evidence.signature !== "string" ||
    typeof evidence.width !== "number" ||
    typeof evidence.height !== "number" ||
    typeof evidence.bytes !== "number" ||
    typeof evidence.format !== "string" ||
    evidence.resourceType !== "image"
  ) {
    throw new Error("The image host returned an incomplete response.");
  }
  return evidence as CloudinaryUploadEvidence;
}

export function uploadProductImageToCloudinary(
  file: File,
  signedUpload: ProductImageUploadSignature,
  onProgress?: (percentage: number) => void,
) {
  return new Promise<CloudinaryUploadEvidence>((resolve, reject) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(signedUpload.formFields)) {
      form.append(key, value);
    }
    form.append("file", file, file.name);

    const request = new XMLHttpRequest();
    request.open("POST", signedUpload.uploadUrl);
    request.timeout = 60_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };
    request.onerror = () => reject(new Error("Image upload lost its network connection."));
    request.ontimeout = () => reject(new Error("Image upload timed out. Please try again."));
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        reject(new Error("The image host rejected this upload. Please try another image."));
        return;
      }
      try {
        const evidence = cloudinaryEvidence(JSON.parse(request.responseText));
        onProgress?.(100);
        resolve(evidence);
      } catch (error) {
        reject(error);
      }
    };
    request.send(form);
  });
}