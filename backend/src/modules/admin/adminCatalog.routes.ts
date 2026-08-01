import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { invalidateCatalog } from "../products/products.service.js";
import { queueBackInStockNotifications } from "../wishlist/stockAlertEmail.service.js";
import { requireAtLeastOneField, safeHttpUrl } from "../../lib/validation.js";
import { destroyManagedProductImage, getProductMediaConfiguration } from "../media/cloudinary.service.js";
import { lockProductImageSet } from "../media/productImages.service.js";

const router = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// -------- Categories --------

const categoryBody = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1_000).nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
}).strict();
const categoryPatchBody = requireAtLeastOneField(
  categoryBody.partial().strict(),
);

router.get("/categories", async (_req, res, next) => {
  try {
    const items = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { products: true } } },
    });
    res.json({
      items: items.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        parentId: c.parentId,
        productCount: c._count.products,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/categories", async (req, res, next) => {
  try {
    const body = categoryBody.parse(req.body);
    const category = await prisma.category.create({
      data: {
        name: body.name,
        slug: slugify(body.name),
        description: body.description,
        parentId: body.parentId,
      },
    });
    await invalidateCatalog();
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

router.patch("/categories/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const body = categoryPatchBody.parse(req.body);
    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name, slug: slugify(body.name) } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.parentId !== undefined ? { parentId: body.parentId } : {}),
      },
    });
    await invalidateCatalog();
    res.json({ category });
  } catch (err) {
    next(err);
  }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const productCount = await prisma.product.count({ where: { categoryId: id } });
    if (productCount > 0) {
      throw new HttpError(
        409,
        "category_has_products",
        `Category has ${productCount} product(s). Reassign or delete them first.`,
      );
    }
    await prisma.category.delete({ where: { id } });
    await invalidateCatalog();
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// -------- Products --------

const variantBody = z.object({
  sku: z.string().trim().min(1).max(100),
  size: z.string().trim().max(80).nullable().optional(),
  color: z.string().trim().max(80).nullable().optional(),
  price: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
}).strict();

const productBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5_000),
  categoryId: z.string().cuid(),
  basePrice: z.number().int().nonnegative(),
  // MRP for strike-through pricing on the storefront card. Null / undefined
  // removes the sale ribbon.
  compareAtPrice: z.number().int().nonnegative().nullable().optional(),
  dispatchHint: z.string().max(80).nullable().optional(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("INR"),
  active: z.boolean().default(true),
  images: z
    .array(
      z.object({
        url: safeHttpUrl,
        alt: z.string().trim().max(200).optional(),
      }).strict(),
    )
    .max(20)
    .default([]),
  variants: z.array(variantBody).max(100).default([]),
}).strict();
const productPatchBody = requireAtLeastOneField(
  productBody.omit({ images: true, variants: true }).partial().strict(),
);
const variantPatchBody = requireAtLeastOneField(
  variantBody.partial().strict(),
);

router.get("/products", async (req, res, next) => {
  try {
    const q = z
      .object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().positive().max(100).default(20),
        search: z.string().trim().max(120).optional(),
        ids: z
          .string()
          .trim()
          .min(1)
          .max(400)
          .transform((value) => value.split(","))
          .pipe(z.array(z.string().cuid()).min(1).max(12))
          .optional(),
      })
      .strict()
      .parse(req.query);

    const where = {
      ...(q.ids ? { id: { in: q.ids } } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: "insensitive" as const } },
              { slug: { contains: q.search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
        include: {
          category: { select: { name: true, slug: true } },
          _count: { select: { variants: true, images: true } },
        },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({
      items: items.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        basePrice: p.basePrice,
        currency: p.currency,
        active: p.active,
        category: p.category,
        variantCount: p._count.variants,
        imageCount: p._count.images,
        createdAt: p.createdAt,
      })),
      total,
      page: q.page,
      limit: q.limit,
      totalPages: Math.max(1, Math.ceil(total / q.limit)),
    });
  } catch (err) {
    next(err);
  }
});

router.post("/products", async (req, res, next) => {
  try {
    const body = productBody.parse(req.body);
    if (body.active && body.variants.length === 0) {
      throw new HttpError(
        400,
        "product_option_required",
        "An active product needs at least one inventory option",
      );
    }
    if (body.images.length > getProductMediaConfiguration().maxImagesPerProduct) {
      throw new HttpError(400, "image_limit_reached", "Too many product images");
    }
    const product = await prisma.product.create({
      data: {
        name: body.name,
        slug: slugify(body.name),
        description: body.description,
        categoryId: body.categoryId,
        basePrice: body.basePrice,
        compareAtPrice: body.compareAtPrice ?? null,
        dispatchHint: body.dispatchHint ?? null,
        currency: body.currency,
        active: body.active,
        images: {
          create: body.images.map((img, i) => ({
            url: img.url,
            alt: img.alt,
            position: i,
          })),
        },
        variants: { create: body.variants },
      },
      include: { images: true, variants: true },
    });
    await invalidateCatalog(product.id);
    res.status(201).json({ product });
  } catch (err) {
    next(err);
  }
});

router.get("/products/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: true,
        images: { orderBy: { position: "asc" } },
        variants: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!product) {
      throw new HttpError(404, "product_not_found", "Product not found");
    }
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

router.patch("/products/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const body = productPatchBody.parse(req.body);
    if (body.active === true) {
      const productState = await prisma.product.findUnique({
        where: { id },
        select: {
          _count: { select: { variants: true } },
        },
      });
      if (!productState) {
        throw new HttpError(404, "product_not_found", "Product not found");
      }
      if (productState._count.variants === 0) {
        throw new HttpError(
          409,
          "product_option_required",
          "Add an inventory option before publishing this product",
        );
      }
    }
    const product = await prisma.product.update({
      where: { id },
      data: {
        ...(body.name ? { name: body.name, slug: slugify(body.name) } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.categoryId ? { categoryId: body.categoryId } : {}),
        ...(body.basePrice !== undefined ? { basePrice: body.basePrice } : {}),
        ...(body.compareAtPrice !== undefined
          ? { compareAtPrice: body.compareAtPrice }
          : {}),
        ...(body.dispatchHint !== undefined
          ? { dispatchHint: body.dispatchHint }
          : {}),
        ...(body.currency ? { currency: body.currency } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
    });
    await invalidateCatalog(product.id);
    res.json({ product });
  } catch (err) {
    next(err);
  }
});

router.delete("/products/:id", async (req, res, next) => {
  try {
    const id = z.string().cuid().parse(req.params.id);
    const images = await prisma.productImage.findMany({
      where: { productId: id, provider: { not: null } },
      select: { provider: true, storageKey: true },
    });
    for (const image of images) {
      await destroyManagedProductImage(image);
    }
    await prisma.product.delete({ where: { id } });
    await invalidateCatalog(id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// -------- Variants --------

router.post("/products/:id/variants", async (req, res, next) => {
  try {
    const productId = z.string().cuid().parse(req.params.id);
    const body = variantBody.parse(req.body);
    const variant = await prisma.productVariant.create({
      data: { ...body, productId },
    });
    await invalidateCatalog(productId);
    res.status(201).json({ variant });
  } catch (err) {
    next(err);
  }
});

router.patch("/variants/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    const body = variantPatchBody.parse(req.body);
    const variant = await prisma.$transaction(async (tx) => {
      const current = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: { stock: true },
      });
      if (!current) {
        throw new HttpError(404, "variant_not_found", "Variant not found");
      }
      const updated = await tx.productVariant.update({
        where: { id: variantId },
        data: body,
      });
      if (body.stock !== undefined) {
        await queueBackInStockNotifications(
          tx,
          updated.id,
          current.stock,
          updated.stock,
        );
      }
      return updated;
    });
    await invalidateCatalog(variant.productId);

    res.json({ variant });
  } catch (err) {
    next(err);
  }
});

router.delete("/variants/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    const variant = await prisma.$transaction(async (tx) => {
      const current = await tx.productVariant.findUnique({
        where: { id: variantId },
        select: {
          id: true,
          productId: true,
          product: {
            select: {
              active: true,
              _count: { select: { variants: true } },
            },
          },
        },
      });
      if (!current) {
        throw new HttpError(404, "variant_not_found", "Product option not found");
      }
      if (current.product.active && current.product._count.variants <= 1) {
        throw new HttpError(
          409,
          "product_option_required",
          "An active product must keep at least one inventory option",
        );
      }
      await tx.productVariant.delete({ where: { id: variantId } });
      return current;
    });
    await invalidateCatalog(variant.productId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// -------- Product images --------

const imageBody = z.object({
  url: safeHttpUrl,
  alt: z.string().trim().max(200).optional(),
  position: z.number().int().nonnegative().optional(),
}).strict();

router.post("/products/:id/images", async (req, res, next) => {
  try {
    const productId = z.string().cuid().parse(req.params.id);
    const body = imageBody.parse(req.body);
    const image = await prisma.$transaction(async (transaction) => {
      await lockProductImageSet(transaction, productId);
      const product = await transaction.product.findUnique({
        where: { id: productId },
        select: { id: true },
      });
      if (!product) {
        throw new HttpError(404, "product_not_found", "Product not found");
      }
      const [imageCount, last] = await Promise.all([
        transaction.productImage.count({ where: { productId } }),
        transaction.productImage.aggregate({
          where: { productId },
          _max: { position: true },
        }),
      ]);
      if (imageCount >= getProductMediaConfiguration().maxImagesPerProduct) {
        throw new HttpError(409, "image_limit_reached", "This product already has the maximum number of images");
      }
      return transaction.productImage.create({
        data: {
          productId,
          url: body.url,
          alt: body.alt,
          position: body.position ?? (last._max.position ?? -1) + 1,
        },
      });
    });
    await invalidateCatalog(productId);
    res.status(201).json({ image });
  } catch (err) {
    next(err);
  }
});

const imagePatchBody = requireAtLeastOneField(
  z
    .object({
      url: safeHttpUrl.optional(),
      alt: z.string().max(200).nullable().optional(),
      position: z.number().int().nonnegative().optional(),
    })
    .strict(),
);

router.patch("/images/:imageId", async (req, res, next) => {
  try {
    const imageId = z.string().cuid().parse(req.params.imageId);
    const body = imagePatchBody.parse(req.body);
    const current = await prisma.productImage.findUnique({
      where: { id: imageId },
      select: { provider: true },
    });
    if (!current) {
      throw new HttpError(404, "image_not_found", "Product image not found");
    }
    if (current.provider && body.url) {
      throw new HttpError(409, "managed_image_url_locked", "Managed image URLs cannot be replaced manually");
    }
    const image = await prisma.productImage.update({
      where: { id: imageId },
      data: body,
    });
    await invalidateCatalog(image.productId);
    res.json({ image });
  } catch (err) {
    next(err);
  }
});

router.delete("/images/:imageId", async (req, res, next) => {
  try {
    const imageId = z.string().cuid().parse(req.params.imageId);
    const current = await prisma.productImage.findUnique({ where: { id: imageId } });
    if (!current) {
      throw new HttpError(404, "image_not_found", "Product image not found");
    }
    await destroyManagedProductImage(current);
    const image = await prisma.productImage.delete({ where: { id: imageId } });
    await invalidateCatalog(image.productId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;

