export interface ProductMediaConfiguration {
  configured: boolean;
  provider: "CLOUDINARY" | null;
  acceptedMimeTypes: string[];
  maxBytes: number;
  maxDimension: number;
  maxImagesPerProduct: number;
}

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

export interface ProductImageUploadSignature {
  uploadUrl: string;
  formFields: Record<string, string>;
  expiresAt: string;
  constraints: ProductMediaConfiguration;
}