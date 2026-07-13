import { redis } from "../../config/redis.js";
import { HttpError } from "../../middleware/errorHandler.js";
import type { CartOwner } from "../cart/cart.service.js";
import { getBundleForCart } from "./bundle.service.js";

const TTL_SEC = 60 * 60 * 24 * 30;

export interface BundleCartLine {
  bundleId: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  componentTotal: number;
  savings: number;
  savingsPercent: number;
  subtotal: number;
  availableUnits: number;
  currency: string;
  cappedByStock: boolean;
  items: Array<{
    variantId: string;
    quantity: number;
    sku: string;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
    product: {
      id: string;
      name: string;
      slug: string;
      image: { url: string; alt: string | null } | null;
    };
  }>;
}

export type BundleCartNotice =
  | { kind: "removed_bundle"; bundleId: string }
  | {
      kind: "capped_bundle";
      bundleId: string;
      requested: number;
      effective: number;
    };

export function bundleOwnerKey(owner: CartOwner) {
  return `cart:${owner.type}:${owner.id}:bundles`;
}

export async function hydrateBundleCart(owner: CartOwner): Promise<{
  bundles: BundleCartLine[];
  notices: BundleCartNotice[];
}> {
  const key = bundleOwnerKey(owner);
  const raw = await redis.hgetall(key);
  const bundleIds = Object.keys(raw);
  if (!bundleIds.length) return { bundles: [], notices: [] };

  const bundles: BundleCartLine[] = [];
  const notices: BundleCartNotice[] = [];
  const prunes: string[] = [];
  const clamps: Array<[string, string]> = [];

  await Promise.all(
    bundleIds.map(async (bundleId) => {
      const requested = Number(raw[bundleId]) || 0;
      try {
        const bundle = await getBundleForCart(bundleId);
        const effective = Math.min(requested, bundle.availableUnits);
        if (effective <= 0) {
          prunes.push(bundleId);
          notices.push({ kind: "removed_bundle", bundleId });
          return;
        }
        const capped = effective < requested;
        if (capped) {
          clamps.push([bundleId, String(effective)]);
          notices.push({
            kind: "capped_bundle",
            bundleId,
            requested,
            effective,
          });
        }
        bundles.push({
          bundleId: bundle.id,
          slug: bundle.slug,
          name: bundle.name,
          description: bundle.description,
          imageUrl: bundle.imageUrl ?? bundle.items[0]?.product.image?.url ?? null,
          quantity: effective,
          unitPrice: bundle.unitPrice,
          componentTotal: bundle.componentTotal,
          savings: bundle.savings,
          savingsPercent: bundle.savingsPercent,
          subtotal: bundle.unitPrice * effective,
          availableUnits: bundle.availableUnits,
          currency: bundle.items[0]?.product.currency ?? "INR",
          cappedByStock: capped,
          items: bundle.items.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
            sku: item.sku,
            size: item.size,
            color: item.color,
            price: item.price,
            stock: item.stock,
            product: {
              id: item.product.id,
              name: item.product.name,
              slug: item.product.slug,
              image: item.product.image,
            },
          })),
        });
      } catch (error) {
        if (error instanceof HttpError && error.status < 500) {
          prunes.push(bundleId);
          notices.push({ kind: "removed_bundle", bundleId });
          return;
        }
        throw error;
      }
    }),
  );

  if (prunes.length || clamps.length) {
    const pipeline = redis.multi();
    if (prunes.length) pipeline.hdel(key, ...prunes);
    for (const [bundleId, quantity] of clamps) {
      pipeline.hset(key, bundleId, quantity);
    }
    if (bundleIds.length > prunes.length) pipeline.expire(key, TTL_SEC);
    await pipeline.exec();
  }

  bundles.sort((a, b) => a.name.localeCompare(b.name));
  return { bundles, notices };
}

export async function addBundle(
  owner: CartOwner,
  bundleId: string,
  quantity: number,
) {
  if (quantity <= 0) {
    throw new HttpError(400, "invalid_quantity", "Quantity must be positive");
  }
  const bundle = await getBundleForCart(bundleId);
  if (bundle.availableUnits <= 0) {
    throw new HttpError(409, "bundle_out_of_stock", "This bundle is out of stock");
  }
  const key = bundleOwnerKey(owner);
  const current = Number((await redis.hget(key, bundleId)) ?? 0);
  const effective = Math.min(current + quantity, bundle.availableUnits);
  await redis.hset(key, bundleId, String(effective));
  await redis.expire(key, TTL_SEC);
  return effective;
}

export async function setBundleQuantity(
  owner: CartOwner,
  bundleId: string,
  quantity: number,
) {
  const key = bundleOwnerKey(owner);
  if (quantity <= 0) {
    await redis.hdel(key, bundleId);
    return;
  }
  const bundle = await getBundleForCart(bundleId);
  if (bundle.availableUnits <= 0) {
    throw new HttpError(409, "bundle_out_of_stock", "This bundle is out of stock");
  }
  await redis.hset(key, bundleId, String(Math.min(quantity, bundle.availableUnits)));
  await redis.expire(key, TTL_SEC);
}

export async function removeBundle(owner: CartOwner, bundleId: string) {
  await redis.hdel(bundleOwnerKey(owner), bundleId);
}

export async function clearBundleCart(owner: CartOwner) {
  await redis.del(bundleOwnerKey(owner));
}

export async function mergeGuestBundles(guestSessionId: string, userId: string) {
  const guestOwner: CartOwner = { type: "guest", id: guestSessionId };
  const userOwner: CartOwner = { type: "user", id: userId };
  const guestKey = bundleOwnerKey(guestOwner);
  const userKey = bundleOwnerKey(userOwner);
  const [guest, user] = await Promise.all([
    redis.hgetall(guestKey),
    redis.hgetall(userKey),
  ]);
  const ids = [...new Set([...Object.keys(guest), ...Object.keys(user)])];
  const fields: string[] = [];

  for (const id of ids) {
    try {
      const bundle = await getBundleForCart(id);
      const desired =
        (Number(guest[id]) || 0) + (Number(user[id]) || 0);
      const effective = Math.min(desired, bundle.availableUnits);
      if (effective > 0) fields.push(id, String(effective));
    } catch (error) {
      if (!(error instanceof HttpError) || error.status >= 500) throw error;
    }
  }

  const pipeline = redis.multi();
  pipeline.del(guestKey);
  pipeline.del(userKey);
  if (fields.length) {
    pipeline.hset(userKey, ...fields);
    pipeline.expire(userKey, TTL_SEC);
  }
  await pipeline.exec();
}