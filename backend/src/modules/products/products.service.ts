import { prisma } from "../../config/db.js";
import { cacheWrap, invalidateTags, stableHash } from "../../lib/cache.js";
import { HttpError } from "../../middleware/errorHandler.js";

const LIST_TTL_SEC = 600;
const DETAIL_TTL_SEC = 600;

export const CATALOG_LIST_TAG = "catalog:list";
export const productTag = (productId: string) => `catalog:product:${productId}`;

export interface ListFilters {
  productIds?: string[];
  categorySlug?: string;
  minPrice?: number;
  maxPrice?: number;
  page: number;
  limit: number;
}

export async function listProducts(filters: ListFilters) {
  const key = `products:list:v2:${stableHash(filters)}`;

  return cacheWrap(
    key,
    LIST_TTL_SEC,
    [CATALOG_LIST_TAG],
    async () => {
      const where = {
        active: true,
        ...(filters.productIds
          ? { id: { in: filters.productIds } }
          : {}),
        ...(filters.categorySlug
          ? { category: { slug: filters.categorySlug } }
          : {}),
        ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
          ? {
              basePrice: {
                ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
                ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
              },
            }
          : {}),
      };

      const [items, total] = await Promise.all([
        prisma.product.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (filters.page - 1) * filters.limit,
          take: filters.limit,
          include: {
            category: { select: { id: true, name: true, slug: true } },
            images: {
              orderBy: { position: "asc" },
              take: 1,
              select: { url: true, alt: true },
            },
          },
        }),
        prisma.product.count({ where }),
      ]);

      return {
        items: items.map((p) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          basePrice: p.basePrice,
          compareAtPrice: p.compareAtPrice,
          dispatchHint: p.dispatchHint,
          ratingAvg: p.ratingAvg,
          ratingCount: p.ratingCount,
          currency: p.currency,
          category: p.category,
          image: p.images[0] ?? null,
        })),
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.max(1, Math.ceil(total / filters.limit)),
      };
    },
  );
}

export async function getProductBySlug(slug: string) {
  const key = `products:detail:v2:${slug}`;

  const result = await cacheWrap(
    key,
    DETAIL_TTL_SEC,
    [CATALOG_LIST_TAG], // we invalidate list-tag on any mutation, so detail flows too
    async () => {
      const product = await prisma.product.findUnique({
        where: { slug },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: { orderBy: { position: "asc" } },
          variants: {
            orderBy: { createdAt: "asc" },
            select: {
              id: true,
              sku: true,
              size: true,
              color: true,
              price: true,
              stock: true,
            },
          },
        },
      });
      if (!product) return null;
      return {
        id: product.id,
        slug: product.slug,
        name: product.name,
        description: product.description,
        basePrice: product.basePrice,
        compareAtPrice: product.compareAtPrice,
        dispatchHint: product.dispatchHint,
        ratingAvg: product.ratingAvg,
        ratingCount: product.ratingCount,
        currency: product.currency,
        active: product.active,
        category: product.category,
        images: product.images.map((i) => ({
          id: i.id,
          url: i.url,
          alt: i.alt,
          position: i.position,
        })),
        variants: product.variants,
      };
    },
  );

  if (!result.data) {
    throw new HttpError(404, "product_not_found", "Product not found");
  }

  return result;
}

export async function listCategories() {
  return cacheWrap("categories:all", LIST_TTL_SEC, [CATALOG_LIST_TAG], async () => {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
      include: {
        _count: { select: { products: { where: { active: true } } } },
      },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      description: c.description,
      productCount: c._count.products,
    }));
  });
}

export async function invalidateCatalog(productId?: string) {
  const tags = [CATALOG_LIST_TAG];
  if (productId) tags.push(productTag(productId));
  await invalidateTags(tags);
}

