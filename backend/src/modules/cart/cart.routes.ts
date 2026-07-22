import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { rateLimit } from "../../middleware/rateLimit.js";
import { rateLimitPolicies } from "../../config/rateLimitConfig.js";
import { env } from "../../config/env.js";
import {
  addItem,
  clearCart,
  getCart,
  mergeGuestIntoUser,
  newGuestSessionId,
  removeItem,
  setItemQty,
  type CartOwner,
} from "./cart.service.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  addBundle,
  removeBundle,
  setBundleQuantity,
} from "../bundles/bundleCart.service.js";

const router = Router();

const CART_COOKIE = "cart_sid";
const COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    // Secure requires HTTPS. localhost:3005 ↔ localhost:4000 is same-site so
    // Lax is honored without needing Secure in dev.
    secure: env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_MS,
    path: "/",
  };
}

/**
 * Resolve the cart owner from either the signed-in user or a guest session
 * cookie. If neither exists, mint a guest session on the fly and set the
 * cookie so subsequent requests share the same cart.
 */
function resolveOwner(req: Request, res: Response): CartOwner {
  if (req.auth) {
    return { type: "user", id: req.auth.userId };
  }
  let sid = req.cookies?.[CART_COOKIE] as string | undefined;
  if (!sid || typeof sid !== "string" || sid.length < 8) {
    sid = newGuestSessionId();
    res.cookie(CART_COOKIE, sid, cookieOpts());
  }
  return { type: "guest", id: sid };
}

router.use(optionalAuth);
router.use(
  rateLimit({
    keyPrefix: "cart",
    ...rateLimitPolicies.authenticated,
    accountKeyBy: (req) => req.auth?.userId,
  }),
);

router.get("/", async (req, res, next) => {
  try {
    const owner = resolveOwner(req, res);
    const cart = await getCart(owner);
    res.setHeader("X-Cart-Owner", owner.type);
    res.json(cart);
  } catch (err) {
    next(err);
  }
});

const addBody = z.object({
  variantId: z.string().cuid(),
  quantity: z.number().int().positive().max(99).default(1),
}).strict();

router.post("/items", async (req, res, next) => {
  try {
    const body = addBody.parse(req.body);
    const owner = resolveOwner(req, res);
    const { cart, effective } = await addItem(
      owner,
      body.variantId,
      body.quantity,
    );
    res.status(201).json({ cart, effective });
  } catch (err) {
    next(err);
  }
});

const patchBody = z.object({
  quantity: z.number().int().nonnegative().max(99),
}).strict();

router.patch("/items/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    const { quantity } = patchBody.parse(req.body);
    const owner = resolveOwner(req, res);
    const cart = await setItemQty(owner, variantId, quantity);
    res.json(cart);
  } catch (err) {
    next(err);
  }
});

router.delete("/items/:variantId", async (req, res, next) => {
  try {
    const variantId = z.string().cuid().parse(req.params.variantId);
    const owner = resolveOwner(req, res);
    const cart = await removeItem(owner, variantId);
    res.json(cart);
  } catch (err) {
    next(err);
  }
});

router.post("/bundles", async (req, res, next) => {
  try {
    const body = z
      .object({
        bundleId: z.string().cuid(),
        quantity: z.number().int().positive().max(20).default(1),
      })
      .strict()
      .parse(req.body);
    const owner = resolveOwner(req, res);
    const effective = await addBundle(owner, body.bundleId, body.quantity);
    res.status(201).json({ cart: await getCart(owner), effective });
  } catch (error) {
    next(error);
  }
});

router.patch("/bundles/:bundleId", async (req, res, next) => {
  try {
    const bundleId = z.string().cuid().parse(req.params.bundleId);
    const { quantity } = z
      .object({ quantity: z.number().int().nonnegative().max(20) })
      .strict()
      .parse(req.body);
    const owner = resolveOwner(req, res);
    await setBundleQuantity(owner, bundleId, quantity);
    res.json(await getCart(owner));
  } catch (error) {
    next(error);
  }
});

router.delete("/bundles/:bundleId", async (req, res, next) => {
  try {
    const bundleId = z.string().cuid().parse(req.params.bundleId);
    const owner = resolveOwner(req, res);
    await removeBundle(owner, bundleId);
    res.json(await getCart(owner));
  } catch (error) {
    next(error);
  }
});

router.delete("/", async (req, res, next) => {
  try {
    const owner = resolveOwner(req, res);
    await clearCart(owner);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

/**
 * Called by the frontend right after a login succeeds. If a guest cookie is
 * present, merge that cart into the freshly-signed-in user's cart and clear
 * the cookie so subsequent requests use the user cart.
 *
 * Idempotent: with no cookie, or a cookie pointing at an empty hash, this
 * returns the current user cart unchanged.
 */
router.post("/merge", async (req, res, next) => {
  try {
    if (!req.auth) {
      throw new HttpError(401, "unauthenticated", "Login required to merge cart");
    }
    const sid = req.cookies?.[CART_COOKIE] as string | undefined;
    if (!sid) {
      const cart = await getCart({ type: "user", id: req.auth.userId });
      return res.json({ cart, merged: 0 });
    }
    const before = await getCart({ type: "user", id: req.auth.userId });
    const cart = await mergeGuestIntoUser(sid, req.auth.userId);
    res.clearCookie(CART_COOKIE, { path: "/" });
    res.json({
      cart,
      merged: Math.max(0, cart.count - before.count),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
