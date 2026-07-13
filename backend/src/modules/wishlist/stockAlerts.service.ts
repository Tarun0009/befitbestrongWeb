import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/errorHandler.js";

export async function listStockAlerts(userId: string) {
  const rows = await prisma.stockAlert.findMany({
    where: {
      userId,
      active: true,
      variant: { product: { active: true } },
    },
    orderBy: { createdAt: "desc" },
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              slug: true,
              name: true,
              images: {
                orderBy: { position: "asc" },
                take: 1,
                select: { url: true, alt: true },
              },
            },
          },
        },
      },
    },
  });

  return {
    variantIds: rows.map((row) => row.variantId),
    items: rows.map((row) => ({
      id: row.id,
      variantId: row.variantId,
      createdAt: row.createdAt,
      variant: {
        sku: row.variant.sku,
        size: row.variant.size,
        color: row.variant.color,
        stock: row.variant.stock,
      },
      product: {
        id: row.variant.product.id,
        slug: row.variant.product.slug,
        name: row.variant.product.name,
        image: row.variant.product.images[0] ?? null,
      },
    })),
  };
}

export async function subscribeStockAlert(
  userId: string,
  variantId: string,
) {
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      product: { active: true },
    },
    select: {
      id: true,
      stock: true,
    },
  });
  if (!variant) {
    throw new HttpError(404, "variant_not_found", "Variant not found");
  }
  if (variant.stock > 0) {
    throw new HttpError(
      409,
      "variant_in_stock",
      "This variant is already available",
    );
  }

  await prisma.stockAlert.upsert({
    where: {
      userId_variantId: { userId, variantId },
    },
    update: {
      active: true,
      notifiedAt: null,
    },
    create: {
      userId,
      variantId,
      active: true,
    },
  });

  const alerts = await listStockAlerts(userId);
  const item = alerts.items.find((entry) => entry.variantId === variantId);
  if (!item) {
    throw new HttpError(
      500,
      "stock_alert_hydration_failed",
      "Stock alert could not be loaded",
    );
  }
  return { item };
}

export async function unsubscribeStockAlert(
  userId: string,
  variantId: string,
): Promise<void> {
  await prisma.stockAlert.deleteMany({
    where: { userId, variantId },
  });
}

export async function getAdminDemand() {
  const [
    wishlistGroups,
    alertGroups,
    totalWishlistItems,
    activeStockAlerts,
    alertCustomers,
  ] = await Promise.all([
    prisma.wishlistItem.groupBy({
      by: ["productId"],
      _count: { _all: true },
    }),
    prisma.stockAlert.groupBy({
      by: ["variantId"],
      where: { active: true },
      _count: { _all: true },
    }),
    prisma.wishlistItem.count(),
    prisma.stockAlert.count({ where: { active: true } }),
    prisma.stockAlert.groupBy({
      by: ["userId"],
      where: { active: true },
    }),
  ]);

  const productIds = wishlistGroups.map((row) => row.productId);
  const variantIds = alertGroups.map((row) => row.variantId);

  const [products, variants] = await Promise.all([
    prisma.product.findMany({
      where: { id: { in: productIds } },
      select: {
        id: true,
        name: true,
        slug: true,
        active: true,
      },
    }),
    prisma.productVariant.findMany({
      where: { id: { in: variantIds } },
      select: {
        id: true,
        sku: true,
        size: true,
        color: true,
        stock: true,
        product: {
          select: { id: true, name: true, slug: true, active: true },
        },
      },
    }),
  ]);

  const productsById = new Map(products.map((product) => [product.id, product]));
  const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

  const topWishlisted = wishlistGroups
    .map((row) => {
      const product = productsById.get(row.productId);
      return product
        ? { product, count: row._count._all }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.count - a.count);

  const stockAlertDemand = alertGroups
    .map((row) => {
      const variant = variantsById.get(row.variantId);
      return variant
        ? { variant, count: row._count._all }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .sort((a, b) => b.count - a.count);

  return {
    summary: {
      totalWishlistItems,
      activeStockAlerts,
      alertCustomers: alertCustomers.length,
      notificationsConfigured: Boolean(
        env.RESEND_API_KEY && env.EMAIL_FROM,
      ),
    },
    topWishlisted,
    stockAlertDemand,
  };
}
