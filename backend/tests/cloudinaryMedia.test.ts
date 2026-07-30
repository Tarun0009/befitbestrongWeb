import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";

const ORIGINAL_ENV = { ...process.env };

beforeAll(() => {
  process.env.DATABASE_URL ??= "postgresql://ignored:ignored@localhost:5434/x";
  process.env.REDIS_URL ??= "redis://localhost:6381";
  process.env.CLOUDINARY_CLOUD_NAME = "demo_cloud";
  process.env.CLOUDINARY_API_KEY = "public-key";
  process.env.CLOUDINARY_API_SECRET = "test-secret";
  process.env.CLOUDINARY_UPLOAD_FOLDER = "befitbestrong/products";
  process.env.CLOUDINARY_MAX_IMAGE_BYTES = "5000000";
  process.env.CLOUDINARY_MAX_IMAGE_DIMENSION = "4096";
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe("managed product image signatures", () => {
  it("uses Cloudinary's sorted SHA-1 parameter signature", async () => {
    const { signCloudinaryParameters } = await import(
      "../src/modules/media/cloudinary.service.js"
    );
    expect(
      signCloudinaryParameters(
        { timestamp: 1_315_060_510, public_id: "sample" },
        "abcd",
      ),
    ).toBe("c3470533147774275dd37996cc4d0e68fd03cd4f");
  });

  it("verifies the signed response and constructs a trusted delivery URL", async () => {
    const { signCloudinaryParameters, verifyProductImageUpload } = await import(
      "../src/modules/media/cloudinary.service.js"
    );
    const publicId = "befitbestrong/products/product-1/front-photo-uuid";
    const version = 1_725_000_001;
    const upload = {
      assetId: "asset-1",
      publicId,
      version,
      signature: signCloudinaryParameters(
        { public_id: publicId, version },
        "test-secret",
      ),
      width: 1200,
      height: 1200,
      bytes: 450_000,
      format: "webp",
      resourceType: "image" as const,
    };

    expect(verifyProductImageUpload("product-1", upload)).toEqual(
      expect.objectContaining({
        provider: "CLOUDINARY",
        storageKey: publicId,
        url: `https://res.cloudinary.com/demo_cloud/image/upload/f_auto,q_auto/v${version}/${publicId}.webp`,
      }),
    );
    expect(() => verifyProductImageUpload("another-product", upload)).toThrow(
      "Image upload does not belong to this product",
    );
  });

  it("uses authenticated provider metadata instead of trusting browser fields", async () => {
    const { confirmProductImageUpload, signCloudinaryParameters } = await import(
      "../src/modules/media/cloudinary.service.js"
    );
    const publicId = "befitbestrong/products/product-1/provider-checked";
    const version = 456;
    const upload = {
      assetId: "asset-provider-checked",
      publicId,
      version,
      signature: signCloudinaryParameters(
        { public_id: publicId, version },
        "test-secret",
      ),
      width: 1,
      height: 1,
      bytes: 1,
      format: "jpg",
      resourceType: "image" as const,
    };
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        authorization: `Basic ${Buffer.from("public-key:test-secret").toString("base64")}`,
      });
      return new Response(
        JSON.stringify({
          asset_id: upload.assetId,
          public_id: publicId,
          version,
          width: 1600,
          height: 1200,
          bytes: 720_000,
          format: "webp",
          resource_type: "image",
          type: "upload",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as typeof fetch;

    await expect(
      confirmProductImageUpload("product-1", upload, fetchImpl),
    ).resolves.toEqual(
      expect.objectContaining({
        width: 1600,
        height: 1200,
        bytes: 720_000,
        format: "webp",
      }),
    );
  });

  it("rejects tampered evidence and out-of-policy files", async () => {
    const { signCloudinaryParameters, verifyProductImageUpload } = await import(
      "../src/modules/media/cloudinary.service.js"
    );
    const publicId = "befitbestrong/products/product-1/image-uuid";
    const version = 123;
    const valid = {
      assetId: "asset-1",
      publicId,
      version,
      signature: signCloudinaryParameters(
        { public_id: publicId, version },
        "test-secret",
      ),
      width: 1000,
      height: 1000,
      bytes: 100_000,
      format: "jpg",
      resourceType: "image" as const,
    };

    expect(() =>
      verifyProductImageUpload("product-1", { ...valid, signature: "0".repeat(40) }),
    ).toThrow("Image upload verification failed");
    expect(() =>
      verifyProductImageUpload("product-1", { ...valid, bytes: 6_000_000 }),
    ).toThrow("Image exceeds the configured limits");
  });
});
