import type { BundlePricingType, Prisma } from "@prisma/client";
import { prisma } from "../../config/db.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  calculateBundleAvailability,
  calculateBundlePrice,
} from "./bundlePolicy.js";

const bundleInclude = {
  items: {
    orderBy: { position: "asc" as const },
    include: {
      variant: {
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              active: true,
              currency: true,
              images: {
                orderBy: { position: "asc" as const },
                take: 1,
                select: { url: true, alt: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.BundleInclude;

type BundleWithItems = Prisma.BundleGetPayload<{ include: typeof bundleInclude }>;

export interface BundleWriteInput {
  name: string;
  description: string;
  imageUrl?: string | null;
  active: boolean;
  pricingType: BundlePricingType;
  value: number;
  startsAt?: Date | null;
  endsAt?: Date | null;
  items: Array<{ variantId: string; quantity: number }>;
}

export type BundleUpdateInput = Partial<BundleWriteInput>;

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function isScheduled(bundle: BundleWithItems, now = new Date()) {
  return !(
    (bundle.startsAt && bundle.startsAt > now) ||
    (bundle.endsAt && bundle.endsAt < now)
  );
}

export function presentBundle(bundle: BundleWithItems) {
  const componentTotal = bundle.items.reduce(
    (sum, item) => sum + item.variant.price * item.quantity,
    0,
  );
  const pricing = calculateBundlePrice(
    componentTotal,
    bundle.pricingType,
    bundle.value,
  );
  const availableUnits = calculateBundleAvailability(
    bundle.items.map((item) => ({
      stock: item.variant.stock,
      quantity: item.quantity,
      productActive: item.variant.product.active,
    })),
  );
  const scheduled = isScheduled(bundle);
  const configured = bundle.items.length >= 2 && pricing.savings > 0;

  return {
    id: bundle.id,
    name: bundle.name,
    slug: bundle.slug,
    description: bundle.description,
    imageUrl: bundle.imageUrl,
    active: bundle.active,
    pricingType: bundle.pricingType,
    value: bundle.value,
    startsAt: bundle.startsAt,
    endsAt: bundle.endsAt,
    componentTotal: pricing.componentTotal,
    unitPrice: pricing.unitPrice,
    savings: pricing.savings,
    savingsPercent: pricing.savingsPercent,
    availableUnits,
    sellable: bundle.active && scheduled && configured && availableUnits > 0,
    status:
      !bundle.active
        ? "INACTIVE"
        : !scheduled
          ? "OUTSIDE_SCHEDULE"
          : !configured
            ? "INVALID_PRICING"
            : availableUnits <= 0
              ? "OUT_OF_STOCK"
              : "AVAILABLE",
    items: bundle.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      position: item.position,
      sku: item.variant.sku,
      size: item.variant.size,
      color: item.variant.color,
      price: item.variant.price,
      stock: item.variant.stock,
      product: {
        id: item.variant.product.id,
        name: item.variant.product.name,
        slug: item.variant.product.slug,
        active: item.variant.product.active,
        currency: item.variant.product.currency,
        image: item.variant.product.images[0] ?? null,
      },
    })),
    createdAt: bundle.createdAt,
    updatedAt: bundle.updatedAt,
  };
}

async function validateWrite(input: BundleWriteInput) {
  const uniqueIds = [...new Set(input.items.map((item) => item.variantId))];
  if (uniqueIds.length < 2 || uniqueIds.length !== input.items.length) {
    throw new HttpError(
      400,
      "bundle_items_invalid",
      "A bundle needs at least two different variants",
    );
  }
  if (input.startsAt && input.endsAt && input.startsAt >= input.endsAt) {
    throw new HttpError(
      400,
      "bundle_dates_invalid",
      "Bundle end date must be after its start date",
    );
  }
  if (input.pricingType === "PERCENTAGE_OFF" && input.value > 90) {
    throw new HttpError(
      400,
      "bundle_discount_invalid",
      "Percentage savings cannot exceed 90%",
    );
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, price: true },
  });
  if (variants.length !== uniqueIds.length) {
    throw new HttpError(
      400,
      "bundle_variant_missing",
      "One or more bundle variants do not exist",
    );
  }
  const priceById = new Map(variants.map((variant) => [variant.id, variant.price]));
  const componentTotal = input.items.reduce(
    (sum, item) => sum + priceById.get(item.variantId)! * item.quantity,
    0,
  );
  const price = calculateBundlePrice(
    componentTotal,
    input.pricingType,
    input.value,
  );
  if (price.savings <= 0 || price.unitPrice <= 0) {
    throw new HttpError(
      400,
      "bundle_price_invalid",
      "Bundle pricing must be lower than the current component total",
    );
  }
}

export async function listPublicBundles() {
  const rows = await prisma.bundle.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
    include: bundleInclude,
  });
  const now = new Date();
  return {
    items: rows
      .filter(
        (row) =>
          (!row.startsAt || row.startsAt <= now) &&
          (!row.endsAt || row.endsAt >= now),
      )
      .map(presentBundle),
  };
}

export async function getPublicBundle(slug: string) {
  const row = await prisma.bundle.findUnique({
    where: { slug },
    include: bundleInclude,
  });
  if (!row || !row.active || !isScheduled(row)) {
    throw new HttpError(404, "bundle_not_found", "Bundle not found");
  }
  return { bundle: presentBundle(row) };
}

export async function getBundleForCart(id: string) {
  const row = await prisma.bundle.findUnique({
    where: { id },
    include: bundleInclude,
  });
  if (!row) {
    throw new HttpError(404, "bundle_not_found", "Bundle not found");
  }
  const bundle = presentBundle(row);
  if (!bundle.active || bundle.status === "OUTSIDE_SCHEDULE") {
    throw new HttpError(409, "bundle_unavailable", "This bundle is not available");
  }
  if (bundle.savings <= 0) {
    throw new HttpError(409, "bundle_price_invalid", "This bundle has no current saving");
  }
  return bundle;
}


export async function listBundleVariantOptions() {
  const items = await prisma.productVariant.findMany({
    where: { product: { active: true } },
    orderBy: [{ product: { name: "asc" } }, { createdAt: "asc" }],
    select: {
      id: true,
      sku: true,
      size: true,
      color: true,
      price: true,
      stock: true,
      product: { select: { id: true, name: true, slug: true } },
    },
  });
  return { items };
}

export async function listAdminBundles() {
  const rows = await prisma.bundle.findMany({
    orderBy: { createdAt: "desc" },
    include: bundleInclude,
  });
  return { items: rows.map(presentBundle) };
}

export async function createBundle(input: BundleWriteInput) {
  await validateWrite(input);
  const slug = slugify(input.name);
  if (!slug) {
    throw new HttpError(400, "bundle_name_invalid", "Bundle name is invalid");
  }
  const row = await prisma.bundle.create({
    data: {
      name: input.name,
      slug,
      description: input.description,
      imageUrl: input.imageUrl ?? null,
      active: input.active,
      pricingType: input.pricingType,
      value: input.value,
      startsAt: input.startsAt ?? null,
      endsAt: input.endsAt ?? null,
      items: {
        create: input.items.map((item, position) => ({ ...item, position })),
      },
    },
    include: bundleInclude,
  });
  return { bundle: presentBundle(row) };
}

export async function updateBundle(id: string, input: BundleUpdateInput) {
  const current = await prisma.bundle.findUnique({
    where: { id },
    include: bundleInclude,
  });
  if (!current) {
    throw new HttpError(404, "bundle_not_found", "Bundle not found");
  }

  const merged: BundleWriteInput = {
    name: input.name ?? current.name,
    description: input.description ?? current.description,
    imageUrl:
      input.imageUrl !== undefined ? input.imageUrl : current.imageUrl,
    active: input.active ?? current.active,
    pricingType: input.pricingType ?? current.pricingType,
    value: input.value ?? current.value,
    startsAt:
      input.startsAt !== undefined ? input.startsAt : current.startsAt,
    endsAt: input.endsAt !== undefined ? input.endsAt : current.endsAt,
    items:
      input.items ??
      current.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
  };
  await validateWrite(merged);
  const nextSlug = input.name !== undefined ? slugify(input.name) : current.slug;
  if (!nextSlug) {
    throw new HttpError(
      400,
      "bundle_name_invalid",
      "Bundle name is invalid",
    );
  }

  const row = await prisma.bundle.update({
    where: { id },
    data: {
      ...(input.name !== undefined
        ? { name: input.name, slug: nextSlug }
        : {}),
      ...(input.description !== undefined
        ? { description: input.description }
        : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.active !== undefined ? { active: input.active } : {}),
      ...(input.pricingType !== undefined
        ? { pricingType: input.pricingType }
        : {}),
      ...(input.value !== undefined ? { value: input.value } : {}),
      ...(input.startsAt !== undefined ? { startsAt: input.startsAt } : {}),
      ...(input.endsAt !== undefined ? { endsAt: input.endsAt } : {}),
      ...(input.items !== undefined
        ? {
            items: {
              deleteMany: {},
              create: input.items.map((item, position) => ({
                ...item,
                position,
              })),
            },
          }
        : {}),
    },
    include: bundleInclude,
  });
  return { bundle: presentBundle(row) };
}

export async function deleteBundle(id: string) {
  await prisma.bundle.delete({ where: { id } });
}