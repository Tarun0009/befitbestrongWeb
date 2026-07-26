import { Prisma, type ReviewStatus } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { invalidateCatalog } from "../products/products.service.js";
import { decideReviewEligibility } from "./reviewPolicy.js";

export interface ReviewInput {
  rating: number;
  title?: string | null;
  comment: string;
}

interface ReviewProduct {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  ratingAvg: number;
  ratingCount: number;
}

async function findProduct(slug: string): Promise<ReviewProduct> {
  const product = await prisma.product.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      name: true,
      active: true,
      ratingAvg: true,
      ratingCount: true,
    },
  });
  if (!product || !product.active) {
    throw new HttpError(404, "product_not_found", "Product not found");
  }
  return product;
}

async function findDeliveredPurchase(
  userId: string,
  productSlug: string,
): Promise<{ orderId: string } | null> {
  const sql = [
    'SELECT oi."orderId"',
    'FROM "OrderItem" oi',
    'JOIN "Order" o ON o."id" = oi."orderId"',
    'LEFT JOIN "ProductVariant" pv ON pv."id" = oi."variantId"',
    'LEFT JOIN "Product" p ON p."id" = pv."productId"',
    'WHERE o."userId" = $1',
    'AND o."status" = \'DELIVERED\'',
    'AND (p."slug" = $2 OR oi."productSnapshot"->>\'slug\' = $2)',
    'ORDER BY o."createdAt" DESC',
    'LIMIT 1',
  ].join(" ");
  const rows = await prisma.$queryRawUnsafe<Array<{ orderId: string }>>(
    sql,
    userId,
    productSlug,
  );
  return rows[0] ?? null;
}

const existingReviewSelect = {
  id: true,
  rating: true,
  title: true,
  comment: true,
  verifiedPurchase: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ReviewSelect;

export async function getReviewEligibility(userId: string, productSlug: string) {
  const product = await findProduct(productSlug);
  const [existingReview, purchase] = await Promise.all([
    prisma.review.findUnique({
      where: {
        productId_userId: {
          productId: product.id,
          userId,
        },
      },
      select: existingReviewSelect,
    }),
    findDeliveredPurchase(userId, product.slug),
  ]);

  const decision = decideReviewEligibility({
    hasDeliveredPurchase: Boolean(purchase),
    hasExistingReview: Boolean(existingReview),
  });

  return {
    ...decision,
    existingReview,
  };
}

export async function createReview(
  userId: string,
  productSlug: string,
  input: ReviewInput,
) {
  const product = await findProduct(productSlug);
  const [existingReview, purchase] = await Promise.all([
    prisma.review.findUnique({
      where: {
        productId_userId: {
          productId: product.id,
          userId,
        },
      },
      select: { id: true },
    }),
    findDeliveredPurchase(userId, product.slug),
  ]);

  const decision = decideReviewEligibility({
    hasDeliveredPurchase: Boolean(purchase),
    hasExistingReview: Boolean(existingReview),
  });
  if (decision.reason === "already_reviewed") {
    throw new HttpError(
      409,
      "review_already_exists",
      "You have already reviewed this product",
    );
  }
  if (!decision.eligible || !purchase) {
    throw new HttpError(
      403,
      "verified_purchase_required",
      "Only customers with a delivered order can review this product",
    );
  }

  try {
    const review = await prisma.review.create({
      data: {
        productId: product.id,
        userId,
        purchaseOrderId: purchase.orderId,
        rating: input.rating,
        title: input.title?.trim() || null,
        comment: input.comment.trim(),
        verifiedPurchase: true,
        status: "PENDING",
      },
      select: existingReviewSelect,
    });
    return { review };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new HttpError(
        409,
        "review_already_exists",
        "You have already reviewed this product",
      );
    }
    throw error;
  }
}

export async function listProductReviews(
  productSlug: string,
  page: number,
  limit: number,
) {
  const product = await findProduct(productSlug);
  const where = {
    productId: product.id,
    status: "APPROVED" as const,
    user: { accountStatus: "ACTIVE" as const },
  };

  const [items, total, grouped] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        verifiedPurchase: true,
        createdAt: true,
        user: { select: { name: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({
      by: ["rating"],
      where,
      _count: { _all: true },
    }),
  ]);

  const groupedCounts = new Map(
    grouped.map((row) => [row.rating, row._count._all]),
  );

  return {
    product: {
      id: product.id,
      slug: product.slug,
      name: product.name,
    },
    summary: {
      average: product.ratingAvg,
      count: product.ratingCount,
      distribution: [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: groupedCounts.get(rating) ?? 0,
      })),
    },
    items: items.map((review) => ({
      ...review,
      user: {
        name: review.user.name?.trim() || "Verified customer",
      },
    })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function listAdminReviews(input: {
  status?: ReviewStatus;
  rating?: number;
  page: number;
  limit: number;
}) {
  const where = {
    user: { accountStatus: "ACTIVE" as const },
    ...(input.status ? { status: input.status } : {}),
    ...(input.rating ? { rating: input.rating } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (input.page - 1) * input.limit,
      take: input.limit,
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        verifiedPurchase: true,
        status: true,
        purchaseOrderId: true,
        moderatedAt: true,
        moderatedBy: true,
        createdAt: true,
        updatedAt: true,
        product: {
          select: { id: true, name: true, slug: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
    prisma.review.count({ where }),
  ]);

  return {
    items,
    total,
    page: input.page,
    limit: input.limit,
    totalPages: Math.max(1, Math.ceil(total / input.limit)),
  };
}

export async function moderateReview(
  reviewId: string,
  status: Extract<ReviewStatus, "APPROVED" | "REJECTED">,
  moderatorId: string,
) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.review.findUnique({
      where: { id: reviewId },
      select: { id: true, productId: true },
    });
    if (!current) {
      throw new HttpError(404, "review_not_found", "Review not found");
    }

    const review = await tx.review.update({
      where: { id: current.id },
      data: {
        status,
        moderatedAt: new Date(),
        moderatedBy: moderatorId,
      },
      select: {
        id: true,
        status: true,
        productId: true,
        product: { select: { slug: true } },
      },
    });

    const aggregate = await tx.review.aggregate({
      where: { productId: current.productId, status: "APPROVED" },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const ratingAvg = Math.round((aggregate._avg.rating ?? 0) * 100) / 100;
    const ratingCount = aggregate._count.rating;

    await tx.product.update({
      where: { id: current.productId },
      data: { ratingAvg, ratingCount },
    });

    return { review, ratingAvg, ratingCount };
  });

  await invalidateCatalog(result.review.productId);
  return result;
}
