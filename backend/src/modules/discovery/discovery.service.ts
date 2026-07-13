import { prisma } from "../../config/db.js";
import { cacheWrap, stableHash } from "../../lib/cache.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { CATALOG_LIST_TAG } from "../products/products.service.js";
import {
  calculateRelatedProductScore,
  relatedProductReason,
} from "./discoveryPolicy.js";

const RECENT_TTL_SECONDS = 300;
const RELATED_TTL_SECONDS = 600;

export async function listRecentlyViewedProducts(slugs: string[]) {
  if (slugs.length === 0) return { data: [], cached: false };

  return cacheWrap(
    `discovery:recent:v1:${stableHash(slugs)}`,
    RECENT_TTL_SECONDS,
    [CATALOG_LIST_TAG],
    async () => {
      const products = await prisma.product.findMany({
        where: { active: true, slug: { in: slugs } },
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      });

      const bySlug = new Map(products.map((product) => [product.slug, product]));
      return slugs.flatMap((slug) => {
        const product = bySlug.get(slug);
        if (!product) return [];
        return [toCatalogItem(product)];
      });
    },
  );
}

export async function listRelatedProducts(slug: string, limit: number) {
  return cacheWrap(
    `discovery:related:v1:${slug}:${limit}`,
    RELATED_TTL_SECONDS,
    [CATALOG_LIST_TAG],
    async () => {
      const source = await prisma.product.findFirst({
        where: { slug, active: true },
        select: { id: true, basePrice: true, categoryId: true },
      });
      if (!source) {
        throw new HttpError(404, "product_not_found", "Product not found");
      }

      const candidates = await prisma.product.findMany({
        where: { active: true, id: { not: source.id } },
        orderBy: { createdAt: "desc" },
        take: 50,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true, alt: true },
          },
          variants: { select: { stock: true } },
        },
      });

      return candidates
        .map((candidate) => {
          const signals = {
            sourcePrice: source.basePrice,
            candidatePrice: candidate.basePrice,
            sameCategory: candidate.categoryId === source.categoryId,
            inStock: candidate.variants.some((variant) => variant.stock > 0),
            ratingAvg: candidate.ratingAvg,
            ratingCount: candidate.ratingCount,
          };
          return {
            candidate,
            score: calculateRelatedProductScore(signals),
            recommendationReason: relatedProductReason(
              signals,
              candidate.category.name,
            ),
          };
        })
        .sort(
          (left, right) =>
            right.score - left.score ||
            right.candidate.createdAt.getTime() -
              left.candidate.createdAt.getTime(),
        )
        .slice(0, limit)
        .map(({ candidate, recommendationReason }) => ({
          ...toCatalogItem(candidate),
          recommendationReason,
        }));
    },
  );
}

function toCatalogItem(product: {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  dispatchHint: string | null;
  ratingAvg: number;
  ratingCount: number;
  currency: string;
  category: { id: string; name: string; slug: string };
  images: Array<{ url: string; alt: string | null }>;
}) {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    dispatchHint: product.dispatchHint,
    ratingAvg: product.ratingAvg,
    ratingCount: product.ratingCount,
    currency: product.currency,
    category: product.category,
    image: product.images[0] ?? null,
  };
}
