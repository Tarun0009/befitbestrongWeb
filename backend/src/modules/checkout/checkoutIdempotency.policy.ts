import { createHash } from "node:crypto";
import type { CartOwner } from "../cart/cart.service.js";
import type { CheckoutAddress } from "./checkout.service.js";

export interface CheckoutRequestIdentity {
  userId: string | null;
  contactEmail: string;
  couponCode?: string | null;
  address: CheckoutAddress;
  paymentMethod: "PREPAID" | "COD";
  cartRevision: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function checkoutOwnerHash(owner: CartOwner): string {
  return sha256(`checkout-owner:v1:${owner.type}:${owner.id}`);
}

export function checkoutKeyHash(key: string): string {
  return sha256(`checkout-key:v1:${key}`);
}

export function checkoutRequestHash(input: CheckoutRequestIdentity): string {
  const canonicalRequest = {
    userId: input.userId,
    contactEmail: input.contactEmail.trim().toLowerCase(),
    couponCode: input.couponCode?.trim().toUpperCase() || null,
    paymentMethod: input.paymentMethod,
    cartRevision: input.cartRevision,
    address: {
      fullName: input.address.fullName.trim(),
      phone: input.address.phone.trim(),
      line1: input.address.line1.trim(),
      line2: input.address.line2?.trim() || null,
      city: input.address.city.trim(),
      state: input.address.state.trim(),
      pincode: input.address.pincode.trim(),
      country: input.address.country ?? "IN",
    },
  };

  return sha256(JSON.stringify(canonicalRequest));
}
