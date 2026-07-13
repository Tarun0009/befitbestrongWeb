import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";

export async function listWishlist(userId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: {
      userId,
      product: { active: true },
    },
    orderBy: { createdAt: "desc" },
    include: {
      product: {
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true, alt: true },
          },
          variants: {
            select: { id: true, stock: true },
          },
        },
      },
    },
  });

  return {
    productIds: rows.map((row) => row.productId),
    items: rows.map((row) => ({
      id: row.id,
      addedAt: row.createdAt,
      product: {
        id: row.product.id,
        slug: row.product.slug,
        name: row.product.name,
        basePrice: row.product.basePrice,
        compareAtPrice: row.product.compareAtPrice,
        dispatchHint: row.product.dispatchHint,
        currency: row.product.currency,
        ratingAvg: row.product.ratingAvg,
        ratingCount: row.product.ratingCount,
        category: row.product.category,
        image: row.product.images[0] ?? null,
        totalStock: row.product.variants.reduce(
          (sum, variant) => sum + variant.stock,
          0,
        ),
        variantCount: row.product.variants.length,
      },
    })),
  };
}

export async function addWishlistItem(userId: string, productId: string) {
  const product = await prisma.product.findFirst({
    where: { id: productId, active: true },
    select: { id: true },
  });
  if (!product) {
    throw new HttpError(404, "product_not_found", "Product not found");
  }

  await prisma.wishlistItem.upsert({
    where: {
      userId_productId: { userId, productId },
    },
    update: {},
    create: { userId, productId },
  });

  const wishlist = await listWishlist(userId);
  const item = wishlist.items.find((entry) => entry.product.id === productId);
  if (!item) {
    throw new HttpError(
      500,
      "wishlist_hydration_failed",
      "Wishlist item could not be loaded",
    );
  }
  return { item };
}

export async function removeWishlistItem(
  userId: string,
  productId: string,
): Promise<void> {
  await prisma.wishlistItem.deleteMany({
    where: { userId, productId },
  });
}
