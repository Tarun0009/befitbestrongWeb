import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { invalidateCatalog } from "../products/products.service.js";
import { logger } from "../../config/logger.js";
import { sendBackInStockNotifications } from "../wishlist/stockAlertEmail.service.js";
import { requireAtLeastOneField } from "../../lib/validation.js";

const router = Router();

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// -------- Categories --------

const categoryBody = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  parentId: z.string().cuid().nullable().optional(),
});
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
  sku: z.string().min(1),
  size: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  price: z.number().int().nonnegative(),
  stock: z.number().int().nonnegative(),
});

const productBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  categoryId: z.string().cuid(),
  basePrice: z.number().int().nonnegative(),
  // MRP for strike-through pricing on the storefront card. Null / undefined
  // removes the sale ribbon.
  compareAtPrice: z.number().int().nonnegative().nullable().optional(),
  dispatchHint: z.string().max(80).nullable().optional(),
  currency: z.string().default("INR"),
  active: z.boolean().default(true),
  images: z
    .array(
      z.object({
        url: z.string().url(),
        alt: z.string().optional(),
      }),
    )
    .default([]),
  variants: z.array(variantBody).default([]),
});
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
        search: z.string().optional(),
      })
      .parse(req.query);

    const where = q.search
      ? {
          OR: [
            { name: { contains: q.search, mode: "insensitive" as const } },
            { slug: { contains: q.search, mode: "insensitive" as const } },
          ],
        }
      : {};

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
    const current = await prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { stock: true },
    });
    if (!current) {
      throw new HttpError(404, "variant_not_found", "Variant not found");
    }

    const variant = await prisma.productVariant.update({
      where: { id: variantId },
      data: body,
    });
    await invalidateCatalog(variant.productId);

    if (body.stock !== undefined) {
      try {
        await sendBackInStockNotifications(
          variant.id,
          current.stock,
          variant.stock,
        );
      } catch (error) {
        logger.error(
          { error, variantId: variant.id },
          "back-in-stock notification run failed after inventory update",
        );
      }
    }

    res.json({ variant });
  } catch (err) {
    next(err);
  }
});

router.delete("/variants/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    const variant = await prisma.productVariant.delete({
      where: { id: variantId },
    });
    await invalidateCatalog(variant.productId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// -------- Product images --------

const imageBody = z.object({
  url: z.string().url(),
  alt: z.string().max(200).optional(),
  position: z.number().int().nonnegative().optional(),
});

router.post("/products/:id/images", async (req, res, next) => {
  try {
    const productId = z.string().cuid().parse(req.params.id);
    const body = imageBody.parse(req.body);
    // Default to appending at the end if no explicit position given.
    const nextPos =
      body.position ??
      ((await prisma.productImage.count({ where: { productId } })) as number);
    const image = await prisma.productImage.create({
      data: {
        productId,
        url: body.url,
        alt: body.alt,
        position: nextPos,
      },
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
      url: z.string().url().optional(),
      alt: z.string().max(200).nullable().optional(),
      position: z.number().int().nonnegative().optional(),
    })
    .strict(),
);

router.patch("/images/:imageId", async (req, res, next) => {
  try {
    const imageId = z.string().cuid().parse(req.params.imageId);
    const body = imagePatchBody.parse(req.body);
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
    const image = await prisma.productImage.delete({
      where: { id: imageId },
    });
    await invalidateCatalog(image.productId);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;

