import { Router, type Request } from "express";
import { z } from "zod";
import { optionalAuth } from "../../middleware/optionalAuth.js";
import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { getCart, type CartOwner } from "../cart/cart.service.js";
import {
  cancelCheckout,
  createCheckoutSession,
  devCompleteOrder,
} from "./checkout.service.js";
import { isRazorpayConfigured } from "../../lib/razorpay.js";
import { calculateCouponDiscount } from "./coupon.service.js";

const router = Router();
const CART_COOKIE = "cart_sid";

router.get("/config", (_req, res) => {
  res.json({
    razorpayConfigured: isRazorpayConfigured(),
    razorpayKeyId: env.RAZORPAY_KEY_ID ?? null,
    devMode: env.NODE_ENV !== "production",
  });
});

router.use(optionalAuth);

const addressBody = z.object({
  fullName: z.string().trim().min(1).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^(?:\+91)?[6-9]\d{9}$/, "Enter a valid Indian mobile number"),
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().min(1).max(80),
  state: z.string().trim().min(1).max(80),
  pincode: z.string().trim().regex(/^\d{6}$/),
  country: z.literal("IN").optional(),
});

const sessionBody = z.object({
  email: z.string().trim().email().optional(),
  couponCode: z.string().trim().max(32).optional().nullable(),
  paymentMethod: z.enum(["PREPAID", "COD"]).default("PREPAID"),
  address: addressBody,
});

function resolveCheckoutOwner(req: Request): CartOwner {
  if (req.auth) {
    return { type: "user", id: req.auth.userId };
  }
  const sid = req.cookies?.[CART_COOKIE] as string | undefined;
  if (!sid || typeof sid !== "string" || sid.length < 8) {
    throw new HttpError(
      400,
      "guest_cart_missing",
      "Your guest cart session has expired. Please return to your cart.",
    );
  }
  return { type: "guest", id: sid };
}

router.post("/coupon/validate", async (req, res, next) => {
  try {
    const { code } = z
      .object({ code: z.string().trim().min(2).max(32) })
      .parse(req.body);
    const cart = await getCart(resolveCheckoutOwner(req));
    if (cart.items.length === 0) {
      throw new HttpError(400, "empty_cart", "Cart is empty");
    }
    const result = await calculateCouponDiscount(
      code,
      cart.subtotal,
      req.auth?.userId ?? null,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/session", async (req, res, next) => {
  try {
    const { address, email, couponCode, paymentMethod } = sessionBody.parse(req.body);
    const contactEmail = (req.auth?.email ?? email)?.trim().toLowerCase();
    if (!contactEmail) {
      throw new HttpError(
        400,
        "email_required",
        "Email is required for guest checkout",
      );
    }
    const result = await createCheckoutSession({
      userId: req.auth?.userId ?? null,
      contactEmail,
      couponCode,
      cartOwner: resolveCheckoutOwner(req),
      address,
      paymentMethod,
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

const orderAccessBody = z.object({
  orderId: z.string().cuid(),
  guestAccessToken: z.string().min(32).max(200).optional(),
});

router.post("/cancel", async (req, res, next) => {
  try {
    const { orderId, guestAccessToken } = orderAccessBody.parse(req.body);
    await cancelCheckout(
      req.auth?.userId ?? null,
      guestAccessToken ?? null,
      orderId,
    );
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

router.post("/dev-complete", async (req, res, next) => {
  try {
    if (env.NODE_ENV === "production") {
      return res.status(404).json({
        error: { code: "not_found", message: "Not available" },
      });
    }
    const { orderId, guestAccessToken } = orderAccessBody.parse(req.body);
    await devCompleteOrder(
      req.auth?.userId ?? null,
      guestAccessToken ?? null,
      orderId,
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
