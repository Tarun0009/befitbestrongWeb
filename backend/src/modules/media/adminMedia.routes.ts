import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { invalidateCatalog } from "../products/products.service.js";
import {
  PRODUCT_IMAGE_MIME_TYPES,
  confirmProductImageUpload,
  destroyManagedProductImage,
  getProductMediaConfiguration,
  issueProductImageUploadSignature,
  verifyProductImageUploadIdentity,
  type CloudinaryUploadEvidence,
} from "./cloudinary.service.js";
import { PRODUCT_IMAGE_TRANSACTION_OPTIONS, lockProductImageSet } from "./productImages.service.js";

const router = Router();
const productIdSchema = z.string().cuid();

const uploadEvidenceSchema = z
  .object({
    assetId: z.string().trim().min(1).max(255),
    publicId: z.string().trim().min(1).max(255),
    version: z.number().int().positive(),
    signature: z.string().regex(/^[a-f0-9]{40}$/i),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    bytes: z.number().int().positive(),
    format: z.string().trim().min(1).max(20),
    resourceType: z.literal("image"),
  })
  .strict();

router.get("/media/config", (_req, res) => {
  res.json(getProductMediaConfiguration());
});

router.post("/media/upload-signatures", async (req, res, next) => {
  try {
    const body = z
      .object({
        productId: productIdSchema,
        fileName: z.string().trim().min(1).max(255),
        contentType: z.enum(PRODUCT_IMAGE_MIME_TYPES),
      })
      .strict()
      .parse(req.body);
    const product = await prisma.product.findUnique({
      where: { id: body.productId },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (!product) {
      throw new HttpError(404, "product_not_found", "Product not found");
    }
    if (product._count.images >= getProductMediaConfiguration().maxImagesPerProduct) {
      throw new HttpError(409, "image_limit_reached", "This product already has the maximum number of images");
    }
    res.json(issueProductImageUploadSignature(body));
  } catch (error) {
    next(error);
  }
});

router.post("/products/:productId/images/managed", async (req, res, next) => {
  try {
    const productId = productIdSchema.parse(req.params.productId);
    const body = z
      .object({
        upload: uploadEvidenceSchema,
        alt: z.string().trim().max(200).nullable().optional(),
      })
      .strict()
      .parse(req.body);
    const evidence = body.upload as CloudinaryUploadEvidence;
    verifyProductImageUploadIdentity(productId, evidence);

    const image = await prisma.$transaction(async (transaction) => {
      await lockProductImageSet(transaction, productId);
      const existing = await transaction.productImage.findUnique({
        where: {
          provider_storageKey: {
            provider: "CLOUDINARY",
            storageKey: evidence.publicId,
          },
        },
      });
      if (existing) {
        if (existing.productId !== productId) {
          throw new HttpError(409, "media_already_attached", "Image is already attached to another product");
        }
        return { image: existing, created: false };
      }

      const product = await transaction.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) {
        throw new HttpError(404, "product_not_found", "Product not found");
      }
      const imageCount = await transaction.productImage.count({ where: { productId } });
      if (imageCount >= getProductMediaConfiguration().maxImagesPerProduct) {
        throw new HttpError(409, "image_limit_reached", "This product already has the maximum number of images");
      }
      const last = await transaction.productImage.aggregate({
        where: { productId },
        _max: { position: true },
      });
      const managed = await confirmProductImageUpload(productId, evidence);
      const created = await transaction.productImage.create({
        data: {
          productId,
          alt: body.alt ?? null,
          position: (last._max.position ?? -1) + 1,
          ...managed,
        },
      });
      return { image: created, created: true };
    }, PRODUCT_IMAGE_TRANSACTION_OPTIONS);
    await invalidateCatalog(productId);
    res.status(image.created ? 201 : 200).json({ image: image.image });
  } catch (error) {
    next(error);
  }
});

router.post("/media/uploads/cleanup", async (req, res, next) => {
  try {
    const body = z
      .object({
        productId: productIdSchema,
        upload: uploadEvidenceSchema,
      })
      .strict()
      .parse(req.body);
    const evidence = body.upload as CloudinaryUploadEvidence;
    verifyProductImageUploadIdentity(body.productId, evidence);
    await prisma.$transaction(async (transaction) => {
      await lockProductImageSet(transaction, body.productId);
      const attached = await transaction.productImage.findUnique({
        where: {
          provider_storageKey: {
            provider: "CLOUDINARY",
            storageKey: evidence.publicId,
          },
        },
        select: { id: true },
      });
      if (attached) {
        throw new HttpError(409, "media_is_attached", "Attached images cannot be cleaned up");
      }
      await destroyManagedProductImage({
        provider: "CLOUDINARY",
        storageKey: evidence.publicId,
      });
    }, PRODUCT_IMAGE_TRANSACTION_OPTIONS);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

router.patch("/products/:productId/images/order", async (req, res, next) => {
  try {
    const productId = productIdSchema.parse(req.params.productId);
    const body = z
      .object({ imageIds: z.array(z.string().cuid()).min(1).max(20) })
      .strict()
      .parse(req.body);
    if (new Set(body.imageIds).size !== body.imageIds.length) {
      throw new HttpError(400, "duplicate_image_id", "Each image must appear once");
    }
    await prisma.$transaction(async (transaction) => {
      await lockProductImageSet(transaction, productId);
      const current = await transaction.productImage.findMany({
        where: { productId },
        select: { id: true },
      });
      const currentIds = new Set(current.map((image) => image.id));
      if (
        currentIds.size !== body.imageIds.length ||
        body.imageIds.some((imageId) => !currentIds.has(imageId))
      ) {
        throw new HttpError(409, "image_order_conflict", "Image list changed; refresh and try again");
      }
      for (const [position, imageId] of body.imageIds.entries()) {
        await transaction.productImage.update({
          where: { id: imageId },
          data: { position },
        });
      }
    });
    await invalidateCatalog(productId);
    res.json({ imageIds: body.imageIds });
  } catch (error) {
    next(error);
  }
});

export default router;
