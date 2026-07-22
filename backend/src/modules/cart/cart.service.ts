import { randomUUID } from "node:crypto";
import { redis } from "../../config/redis.js";
import { prisma } from "../../config/db.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  hydrateBundleCart,
  mergeGuestBundles,
  bundleOwnerKey,
  type BundleCartLine,
  type BundleCartNotice,
} from "../bundles/bundleCart.service.js";
import { appendCartRevision } from "./cartRevision.service.js";

/**
 * Cart storage.
 *
 * Each user has one Redis hash. Field = variantId, value = quantity (string
 * because Redis). Whole hash is TTL'd on every write so abandoned carts vanish
 * automatically without a sweeper.
 *
 *   cart:user:{userId}       — signed-in users (canonical, never expires while
 *                              the user is active; TTL bumped on every write)
 *   cart:guest:{sessionId}   — pre-signup / unauthenticated visitors
 *
 * All product/variant lookups happen at read time — nothing about product
 * pricing or stock is copied into the cart. Prices change → cart reflects
 * that immediately. Stock is checked, not reserved (Phase 6 will do that).
 */

const TTL_SEC = 60 * 60 * 24 * 30; // 30 days

export type OwnerType = "user" | "guest";

export interface CartOwner {
  type: OwnerType;
  id: string; // userId (users) or sessionId (guests)
}

export function ownerKey(owner: CartOwner): string {
  return owner.type === "user"
    ? `cart:user:${owner.id}`
    : `cart:guest:${owner.id}`;
}

export function newGuestSessionId(): string {
  return randomUUID();
}

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  currency: string;
  stock: number;
  quantity: number;
  subtotal: number;
  image: { url: string; alt: string | null } | null;
  outOfStock: boolean;
  cappedByStock: boolean;
}

export interface Cart {
  items: CartLine[];
  bundles: BundleCartLine[];
  count: number;
  subtotal: number;
  retailSubtotal: number;
  bundleSavings: number;
  currency: string | null;
  /** Set only if the caller's quantity was clamped or the variant vanished. */
  notices: CartNotice[];
}

export type CartNotice =
  | { kind: "capped"; variantId: string; requested: number; effective: number }
  | { kind: "removed_variant"; variantId: string }
  | { kind: "inactive_product"; variantId: string }
  | BundleCartNotice;

async function readHash(key: string): Promise<Record<string, string>> {
  return redis.hgetall(key);
}

export async function getCart(owner: CartOwner): Promise<Cart> {
  const key = ownerKey(owner);
  const [raw, bundleState] = await Promise.all([
    readHash(key),
    hydrateBundleCart(owner),
  ]);
  const base = await hydrate(owner, key, raw);
  const bundleSubtotal = bundleState.bundles.reduce(
    (sum, bundle) => sum + bundle.subtotal,
    0,
  );
  const bundleRetail = bundleState.bundles.reduce(
    (sum, bundle) => sum + bundle.componentTotal * bundle.quantity,
    0,
  );
  const bundleCount = bundleState.bundles.reduce(
    (sum, bundle) =>
      sum + bundle.items.reduce(
        (itemSum, item) => itemSum + item.quantity * bundle.quantity,
        0,
      ),
    0,
  );
  return {
    items: base.items,
    bundles: bundleState.bundles,
    count: base.count + bundleCount,
    subtotal: base.subtotal + bundleSubtotal,
    retailSubtotal: base.subtotal + bundleRetail,
    bundleSavings: bundleRetail - bundleSubtotal,
    currency: base.currency ?? bundleState.bundles[0]?.currency ?? null,
    notices: [...base.notices, ...bundleState.notices],
  };
}

export async function addItem(
  owner: CartOwner,
  variantId: string,
  qty: number,
): Promise<{ cart: Cart; effective: number }> {
  if (qty <= 0) {
    throw new HttpError(400, "invalid_quantity", "Quantity must be positive");
  }
  const key = ownerKey(owner);

  // Look up stock before mutating so we can clamp.
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true, product: { select: { active: true } } },
  });
  if (!variant || !variant.product.active) {
    throw new HttpError(404, "variant_not_found", "Variant unavailable");
  }
  if (variant.stock <= 0) {
    throw new HttpError(409, "out_of_stock", "Variant is out of stock");
  }

  const current = Number((await redis.hget(key, variantId)) ?? 0);
  const desired = current + qty;
  const effective = Math.min(desired, variant.stock);

  const pipeline = redis.multi();
  pipeline.hset(key, variantId, String(effective));
  pipeline.expire(key, TTL_SEC);
  await appendCartRevision(pipeline, owner).exec();

  const cart = await getCart(owner);
  return { cart, effective };
}

export async function setItemQty(
  owner: CartOwner,
  variantId: string,
  qty: number,
): Promise<Cart> {
  const key = ownerKey(owner);
  if (qty <= 0) {
    const pipeline = redis.multi();
    pipeline.hdel(key, variantId);
    pipeline.expire(key, TTL_SEC);
    await appendCartRevision(pipeline, owner).exec();
    return getCart(owner);
  }

  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: { stock: true, product: { select: { active: true } } },
  });
  if (!variant || !variant.product.active) {
    throw new HttpError(404, "variant_not_found", "Variant unavailable");
  }
  if (variant.stock <= 0) {
    throw new HttpError(409, "out_of_stock", "Variant is out of stock");
  }

  const effective = Math.min(qty, variant.stock);
  const pipeline = redis.multi();
  pipeline.hset(key, variantId, String(effective));
  pipeline.expire(key, TTL_SEC);
  await appendCartRevision(pipeline, owner).exec();
  return getCart(owner);
}

export async function removeItem(
  owner: CartOwner,
  variantId: string,
): Promise<Cart> {
  const key = ownerKey(owner);
  const pipeline = redis.multi();
  pipeline.hdel(key, variantId);
  pipeline.expire(key, TTL_SEC);
  await appendCartRevision(pipeline, owner).exec();
  return getCart(owner);
}

export async function clearCart(owner: CartOwner): Promise<void> {
  const pipeline = redis.multi();
  pipeline.del(ownerKey(owner));
  pipeline.del(bundleOwnerKey(owner));
  await appendCartRevision(pipeline, owner).exec();
}

/**
 * Merge a guest cart into a user cart. Sums quantities per variant, then caps
 * each line at the variant's current stock. Deletes the guest hash. Safe to
 * call when the guest cart is empty (no-op).
 */
export async function mergeGuestIntoUser(
  guestSessionId: string,
  userId: string,
): Promise<Cart> {
  const guestKey = ownerKey({ type: "guest", id: guestSessionId });
  const userKey = ownerKey({ type: "user", id: userId });

  const guest = await readHash(guestKey);
  const variantIds = Object.keys(guest);

  if (variantIds.length === 0) {
    await redis.del(guestKey);
    await mergeGuestBundles(guestSessionId, userId);
    return getCart({ type: "user", id: userId });
  }

  const user = await readHash(userKey);
  const merged: Record<string, number> = {};
  for (const [vid, qtyStr] of Object.entries(user)) {
    merged[vid] = Number(qtyStr) || 0;
  }
  for (const [vid, qtyStr] of Object.entries(guest)) {
    merged[vid] = (merged[vid] ?? 0) + (Number(qtyStr) || 0);
  }

  // Cap merged quantities at current stock (per variant, one round-trip).
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: Object.keys(merged) } },
    select: { id: true, stock: true, product: { select: { active: true } } },
  });
  const stockById = new Map(
    variants.map((v) => [v.id, v.product.active ? v.stock : 0]),
  );

  const pipeline = redis.multi();
  pipeline.del(guestKey);

  const finalFields: string[] = [];
  for (const [vid, qty] of Object.entries(merged)) {
    const cap = stockById.get(vid) ?? 0;
    const effective = Math.min(qty, cap);
    if (effective > 0) {
      finalFields.push(vid, String(effective));
    }
  }

  pipeline.del(userKey);
  if (finalFields.length > 0) {
    pipeline.hset(userKey, ...finalFields);
    pipeline.expire(userKey, TTL_SEC);
  }
  appendCartRevision(pipeline, { type: "guest", id: guestSessionId });
  appendCartRevision(pipeline, { type: "user", id: userId });
  await pipeline.exec();
  await mergeGuestBundles(guestSessionId, userId);

  logger.info(
    {
      userId,
      guestSessionId,
      guestLines: variantIds.length,
      merged: finalFields.length / 2,
    },
    "cart merged",
  );

  return getCart({ type: "user", id: userId });
}

/**
 * Take a raw Redis hash and hydrate it into a fully-populated cart. Handles:
 *   - stale variantIds (deleted product → notice + remove from hash)
 *   - stock changes (quantity clamped down + notice)
 *   - active=false products (removed + notice)
 * Fires a follow-up cleanup write when it prunes anything, so read is
 * self-healing but the cost is bounded to changed lines.
 */
interface HydratedItems {
  items: CartLine[];
  count: number;
  subtotal: number;
  currency: string | null;
  notices: CartNotice[];
}

async function hydrate(
  owner: CartOwner,
  key: string,
  raw: Record<string, string>,
): Promise<HydratedItems> {
  const variantIds = Object.keys(raw);
  if (variantIds.length === 0) {
    return { items: [], count: 0, subtotal: 0, currency: null, notices: [] };
  }

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: variantIds } },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          name: true,
          currency: true,
          active: true,
          images: {
            orderBy: { position: "asc" },
            take: 1,
            select: { url: true, alt: true },
          },
        },
      },
    },
  });

  const byId = new Map(variants.map((v) => [v.id, v]));
  const items: CartLine[] = [];
  const notices: CartNotice[] = [];
  const prunes: string[] = [];
  const clamps: Array<[string, string]> = [];
  let currency: string | null = null;

  for (const vid of variantIds) {
    const stored = Number(raw[vid]) || 0;
    const v = byId.get(vid);
    if (!v) {
      notices.push({ kind: "removed_variant", variantId: vid });
      prunes.push(vid);
      continue;
    }
    if (!v.product.active) {
      notices.push({ kind: "inactive_product", variantId: vid });
      prunes.push(vid);
      continue;
    }

    const effective = Math.min(stored, v.stock);
    const capped = effective < stored;
    if (capped && effective > 0) {
      clamps.push([vid, String(effective)]);
      notices.push({
        kind: "capped",
        variantId: vid,
        requested: stored,
        effective,
      });
    } else if (effective === 0) {
      prunes.push(vid);
      notices.push({
        kind: "capped",
        variantId: vid,
        requested: stored,
        effective: 0,
      });
      continue;
    }

    currency = currency ?? v.product.currency;
    items.push({
      variantId: v.id,
      productId: v.product.id,
      slug: v.product.slug,
      name: v.product.name,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: v.price,
      currency: v.product.currency,
      stock: v.stock,
      quantity: effective,
      subtotal: v.price * effective,
      image: v.product.images[0]
        ? { url: v.product.images[0].url, alt: v.product.images[0].alt }
        : null,
      outOfStock: v.stock === 0,
      cappedByStock: capped,
    });
  }

  // Self-heal Redis if state drifted from the source of truth.
  if (prunes.length > 0 || clamps.length > 0) {
    const pipeline = redis.multi();
    if (prunes.length > 0) pipeline.hdel(key, ...prunes);
    for (const [vid, qty] of clamps) pipeline.hset(key, vid, qty);
    if (Object.keys(raw).length > prunes.length) pipeline.expire(key, TTL_SEC);
    appendCartRevision(pipeline, owner);
    await pipeline.exec();
  }

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  return { items, count, subtotal, currency, notices };
}
