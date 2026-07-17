"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CreditCard,
  LockKeyhole,
  Mail,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import { useGetCartQuery, type Cart } from "@/lib/cartApi";
import {
  useCreateCheckoutSessionMutation,
  useDevCompleteOrderMutation,
  useGetCheckoutConfigQuery,
  useValidateCouponMutation,
  type CheckoutAddress,
  type CouponValidation,
  type PaymentMethod,
} from "@/lib/ordersApi";
import { useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";
import { PincodeChecker } from "@/features/serviceability/PincodeChecker";
import type { ServiceabilityResult } from "@/features/serviceability/serviceabilityApi";

declare global {
  interface Window {
    Razorpay?: new (options: unknown) => { open: () => void };
  }
}

const EMPTY_ADDRESS: CheckoutAddress = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  pincode: "",
  country: "IN",
};

function storeGuestOrderToken(orderId: string, token: string | null) {
  if (token && typeof window !== "undefined") {
    window.sessionStorage.setItem("guest-order:" + orderId, token);
  }
}

function randomCheckoutKey(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function CheckoutPage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const { data: cart, isLoading: cartLoading } = useGetCartQuery();
  const { data: config } = useGetCheckoutConfigQuery();
  const [createSession, { isLoading: creating }] =
    useCreateCheckoutSessionMutation();
  const [devComplete] = useDevCompleteOrderMutation();

  const [email, setEmail] = useState(user?.email ?? "");
  const [address, setAddress] = useState<CheckoutAddress>({
    ...EMPTY_ADDRESS,
    fullName: user?.name ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [coupon, setCoupon] = useState<CouponValidation | null>(null);
  const [serviceability, setServiceability] =
    useState<ServiceabilityResult | null>(null);
  const [paymentMethod, setPaymentMethod] =
    useState<PaymentMethod>("PREPAID");
  const [step, setStep] = useState<"details" | "review">("details");
  const checkoutAttempt = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedPincode = window.localStorage.getItem("delivery-pincode");
      if (savedPincode && /^\d{6}$/.test(savedPincode)) {
        setAddress((current) => ({
          ...current,
          pincode: current.pincode || savedPincode,
        }));
      }
    }
  }, []);

  useEffect(() => {
    if (user?.email) setEmail(user.email);
    if (user?.name) {
      setAddress((current) => ({
        ...current,
        fullName: current.fullName || user.name || "",
      }));
    }
  }, [user]);

  useEffect(() => {
    if (
      !cartLoading &&
      cart &&
      cart.items.length === 0 &&
      cart.bundles.length === 0
    ) {
      router.replace("/cart");
    }
  }, [cart, cartLoading, router]);

  function handleDetailsSubmit(event: FormEvent) {
    event.preventDefault();
    if (
      !serviceability?.serviceable ||
      serviceability.pincode !== address.pincode
    ) {
      setError("Check your PIN code and confirm that delivery is available.");
      return;
    }
    setError(null);
    setStep("review");
  }

  async function handlePay() {
    setError(null);
    const checkoutBody = {
      address,
      email: user?.email ?? email.trim(),
      couponCode: coupon?.code,
      paymentMethod,
    };
    const fingerprint = JSON.stringify(checkoutBody);
    if (
      !checkoutAttempt.current ||
      checkoutAttempt.current.fingerprint !== fingerprint
    ) {
      checkoutAttempt.current = { fingerprint, key: randomCheckoutKey() };
    }
    try {
      const session = await createSession({
        ...checkoutBody,
        idempotencyKey: checkoutAttempt.current.key,
      }).unwrap();

      storeGuestOrderToken(session.orderId, session.guestAccessToken);

      if (session.paymentMethod === "COD") {
        router.push("/checkout/success?orderId=" + session.orderId);
        return;
      }

      if (
        session.razorpay &&
        config?.razorpayConfigured &&
        typeof window !== "undefined" &&
        window.Razorpay
      ) {
        const razorpay = new window.Razorpay({
          key: session.razorpay.keyId,
          amount: session.amount,
          currency: session.currency,
          order_id: session.razorpay.orderId,
          name: "beFitBeStrong",
          description: "Order " + session.orderId,
          prefill: {
            name: address.fullName,
            contact: address.phone,
            email: user?.email ?? email,
          },
          handler: () => {
            router.push("/checkout/success?orderId=" + session.orderId);
          },
          modal: {
            ondismiss: () => {
              router.push("/checkout/failure?orderId=" + session.orderId);
            },
          },
          theme: { color: "#f5b800" },
        });
        razorpay.open();
      } else if (config?.devMode) {
        await devComplete({
          orderId: session.orderId,
          guestAccessToken: session.guestAccessToken ?? undefined,
        }).unwrap();
        router.push("/checkout/success?orderId=" + session.orderId);
      } else {
        setError(
          "The payment provider is not configured. Please try again later.",
        );
      }
    } catch (caught) {
      const apiError = caught as {
        status?: number | string;
        data?: { error?: { code?: string; message?: string } };
      };
      const retrySameAttempt =
        apiError.status === "FETCH_ERROR" ||
        apiError.status === "TIMEOUT_ERROR" ||
        apiError.data?.error?.code === "checkout_in_progress";
      if (!retrySameAttempt) checkoutAttempt.current = null;
      setError(
        apiError.data?.error?.message ?? "Could not start checkout.",
      );
    }
  }

  if (cartLoading || !cart) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <div className="h-48 animate-pulse rounded-xl bg-muted" />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      {config?.razorpayConfigured && (
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="afterInteractive"
        />
      )}

      <header className="max-w-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Secure checkout
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Complete your order
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {step === "details"
            ? "Add contact and delivery details. No account is required."
            : "Review everything before starting payment."}
        </p>
      </header>

      {!user && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
          <span>
            Checking out as a guest. Your receipt will be sent by email.
          </span>
          <Link
            href="/login"
            className="font-semibold underline underline-offset-4"
          >
            Already have an account? Log in
          </Link>
        </div>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {step === "details" ? (
          <DetailsForm
            email={email}
            onEmailChange={setEmail}
            emailLocked={Boolean(user?.email)}
            address={address}
            onAddressChange={setAddress}
            serviceability={serviceability}
            onServiceabilityChange={(result) => {
              setServiceability(result);
              if (result?.serviceable) {
                setAddress((current) => ({
                  ...current,
                  city: result.city,
                  state: result.state,
                  pincode: result.pincode,
                }));
                const payableBeforeFee = coupon?.total ?? cart.subtotal;
                if (
                  !result.codEnabled ||
                  payableBeforeFee + result.codFee >
                    result.codMaxOrderAmount
                ) {
                  setPaymentMethod("PREPAID");
                } else if (!result.prepaidEnabled) {
                  setPaymentMethod("COD");
                }
              }
            }}
            error={error}
            onSubmit={handleDetailsSubmit}
          />
        ) : (
          <ReviewPanel
            email={user?.email ?? email}
            address={address}
            onEdit={() => setStep("details")}
            onPay={handlePay}
            paying={creating}
            error={error}
            devMode={!config?.razorpayConfigured && Boolean(config?.devMode)}
            serviceability={serviceability}
            paymentMethod={paymentMethod}
            onPaymentMethodChange={setPaymentMethod}
            amountBeforeFee={coupon?.total ?? cart.subtotal}
          />
        )}

        <OrderSummary
          cart={cart}
          coupon={coupon}
          onCouponChange={setCoupon}
          paymentMethod={paymentMethod}
          paymentFee={
            paymentMethod === "COD" && serviceability?.serviceable
              ? serviceability.codFee
              : 0
          }
        />
      </div>
    </main>
  );
}

function DetailsForm({
  email,
  onEmailChange,
  emailLocked,
  address,
  onAddressChange,
  serviceability,
  onServiceabilityChange,
  error,
  onSubmit,
}: {
  email: string;
  onEmailChange: (value: string) => void;
  emailLocked: boolean;
  address: CheckoutAddress;
  onAddressChange: (address: CheckoutAddress) => void;
  serviceability: ServiceabilityResult | null;
  onServiceabilityChange: (result: ServiceabilityResult | null) => void;
  error: string | null;
  onSubmit: (event: FormEvent) => void;
}) {
  const setAddress = (patch: Partial<CheckoutAddress>) =>
    onAddressChange({ ...address, ...patch });

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      <section className="rounded-xl border border-border p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Mail className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold">Contact</h2>
            <p className="text-xs text-muted-foreground">
              Used for your receipt and order updates.
            </p>
          </div>
        </div>
        <Field label="Email" className="mt-5">
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => onEmailChange(event.target.value)}
            readOnly={emailLocked}
            className={inputClass + (emailLocked ? " bg-muted" : "")}
          />
        </Field>
      </section>

      <section className="rounded-xl border border-border p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MapPin className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold">Delivery address</h2>
            <p className="text-xs text-muted-foreground">
              Enter the address exactly as it should appear on the shipment.
            </p>
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              required
              autoComplete="name"
              value={address.fullName}
              onChange={(event) =>
                setAddress({ fullName: event.target.value })
              }
              className={inputClass}
            />
          </Field>
          <Field label="Phone">
            <input
              required
              type="tel"
              autoComplete="tel"
              value={address.phone}
              onChange={(event) => setAddress({ phone: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Address line 1" className="sm:col-span-2">
            <input
              required
              autoComplete="address-line1"
              value={address.line1}
              onChange={(event) => setAddress({ line1: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="Address line 2 (optional)" className="sm:col-span-2">
            <input
              autoComplete="address-line2"
              value={address.line2 ?? ""}
              onChange={(event) => setAddress({ line2: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="City">
            <input
              required
              autoComplete="address-level2"
              value={address.city}
              onChange={(event) => setAddress({ city: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              required
              autoComplete="address-level1"
              value={address.state}
              onChange={(event) => setAddress({ state: event.target.value })}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="mt-5">
          <PincodeChecker
            value={address.pincode}
            onValueChange={(pincode) => setAddress({ pincode })}
            onResult={onServiceabilityChange}
            source="checkout"
            heading="Confirm delivery for this PIN code"
          />
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!serviceability?.serviceable}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:opacity-50 sm:w-auto"
      >
        Continue to review
      </button>
    </form>
  );
}

function ReviewPanel({
  email,
  address,
  onEdit,
  onPay,
  paying,
  error,
  devMode,
  serviceability,
  paymentMethod,
  onPaymentMethodChange,
  amountBeforeFee,
}: {
  email: string;
  address: CheckoutAddress;
  onEdit: () => void;
  onPay: () => void;
  paying: boolean;
  error: string | null;
  devMode: boolean;
  serviceability: ServiceabilityResult | null;
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  amountBeforeFee: number;
}) {
  const supported = serviceability?.serviceable ? serviceability : null;
  const codEligible = Boolean(
    supported?.codEnabled &&
      amountBeforeFee + supported.codFee <= supported.codMaxOrderAmount,
  );
  const paymentValid =
    paymentMethod === "COD"
      ? codEligible
      : Boolean(supported?.prepaidEnabled);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Contact
            </p>
            <p className="mt-1 text-sm">{email}</p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            className="text-sm font-semibold underline underline-offset-4"
          >
            Edit
          </button>
        </div>

        <div className="mt-5 border-t border-border pt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Shipping to
          </p>
          <address className="mt-2 not-italic text-sm leading-6 text-muted-foreground">
            <p className="font-medium text-foreground">{address.fullName}</p>
            <p>{address.line1}</p>
            {address.line2 && <p>{address.line2}</p>}
            <p>
              {address.city}, {address.state} {address.pincode}
            </p>
            <p>Phone: {address.phone}</p>
          </address>
        </div>
      </section>

      <section className="rounded-xl border border-border p-5 sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Payment method
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={!supported?.prepaidEnabled}
            onClick={() => onPaymentMethodChange("PREPAID")}
            className={
              "rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 " +
              (paymentMethod === "PREPAID"
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-muted/40")
            }
          >
            <CreditCard className="h-5 w-5" />
            <span className="mt-3 block text-sm font-semibold">Pay online</span>
            <span className="mt-1 block text-xs opacity-70">
              Secure Razorpay checkout
            </span>
          </button>
          <button
            type="button"
            disabled={!codEligible}
            onClick={() => onPaymentMethodChange("COD")}
            className={
              "rounded-xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-45 " +
              (paymentMethod === "COD"
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:bg-muted/40")
            }
          >
            <Banknote className="h-5 w-5" />
            <span className="mt-3 block text-sm font-semibold">
              Cash on delivery
            </span>
            <span className="mt-1 block text-xs opacity-70">
              {supported?.codFee
                ? formatINR(supported.codFee) + " handling fee"
                : "Pay when your order arrives"}
            </span>
          </button>
        </div>
        {supported?.codEnabled && !codEligible && (
          <p className="mt-3 text-xs leading-5 text-orange-700">
            COD is limited to {formatINR(supported.codMaxOrderAmount)} for this
            PIN code. Online payment is still available.
          </p>
        )}
      </section>

      {devMode && paymentMethod === "PREPAID" && (
        <p className="rounded-lg bg-orange-500/10 px-3 py-2 text-sm text-orange-700 ring-1 ring-inset ring-orange-500/20">
          Development mode: payment will be simulated locally.
        </p>
      )}

      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={onPay}
        disabled={paying || !paymentValid}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:opacity-60"
      >
        {paymentMethod === "COD" ? (
          <Banknote className="h-4 w-4" />
        ) : (
          <LockKeyhole className="h-4 w-4" />
        )}
        {paying
          ? "Placing order…"
          : paymentMethod === "COD"
            ? "Place cash on delivery order"
            : devMode
              ? "Place order (dev mode)"
              : "Pay securely with Razorpay"}
      </button>
      <Link
        href="/cart"
        className="block text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        Return to cart
      </Link>
    </div>
  );
}

function OrderSummary({
  cart,
  coupon,
  onCouponChange,
  paymentMethod,
  paymentFee,
}: {
  cart: Cart;
  coupon: CouponValidation | null;
  onCouponChange: (coupon: CouponValidation | null) => void;
  paymentMethod: PaymentMethod;
  paymentFee: number;
}) {
  const [code, setCode] = useState("");
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validateCoupon, { isLoading }] = useValidateCouponMutation();

  async function applyCoupon(event: FormEvent) {
    event.preventDefault();
    setCouponError(null);
    try {
      const result = await validateCoupon({ code: code.trim() }).unwrap();
      onCouponChange(result);
      setCode(result.code);
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      onCouponChange(null);
      setCouponError(
        apiError.data?.error?.message ?? "This coupon could not be applied.",
      );
    }
  }

  const total = (coupon?.total ?? cart.subtotal) + paymentFee;

  return (
    <aside className="h-fit rounded-xl border border-border p-5 lg:sticky lg:top-36">
      <div className="flex items-center gap-2">
        <ShoppingBag className="h-4 w-4" />
        <h2 className="font-semibold">Order summary</h2>
      </div>
      <ul className="mt-4 space-y-4">
        {cart.bundles.map((bundle) => (
          <li key={bundle.bundleId} className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary-foreground">Bundle</p>
                <p className="font-semibold">{bundle.name} × {bundle.quantity}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{bundle.items.map((item) => item.quantity + "× " + item.product.name).join(" · ")}</p>
              </div>
              <div className="shrink-0 text-right"><p className="font-semibold tabular-nums">{formatINR(bundle.subtotal)}</p><p className="text-[11px] text-emerald-700">Save {formatINR(bundle.savings * bundle.quantity)}</p></div>
            </div>
          </li>
        ))}
        {cart.items.map((line) => (
          <li key={line.variantId} className="flex gap-3 text-sm">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
              {line.image?.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={line.image.url}
                  alt={line.image.alt ?? line.name}
                  className="h-full w-full object-cover"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 font-medium">{line.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Quantity {line.quantity}
              </p>
            </div>
            <span className="shrink-0 font-medium tabular-nums">
              {formatINR(line.subtotal)}
            </span>
          </li>
        ))}
      </ul>

      <form onSubmit={applyCoupon} className="mt-5 border-t border-border pt-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Coupon code
        </label>
        <div className="mt-2 flex gap-2">
          <input
            value={code}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="ENTER CODE"
            maxLength={32}
            className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm font-medium uppercase outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            type="submit"
            disabled={isLoading || code.trim().length < 2}
            className="h-10 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-50"
          >
            {isLoading ? "Checking…" : "Apply"}
          </button>
        </div>
        {coupon && (
          <div className="mt-2 flex items-center justify-between rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700">
            <span>
              <strong>{coupon.code}</strong> applied
            </span>
            <button
              type="button"
              onClick={() => {
                onCouponChange(null);
                setCode("");
              }}
              className="font-semibold underline underline-offset-2"
            >
              Remove
            </button>
          </div>
        )}
        {couponError && (
          <p className="mt-2 text-xs text-red-600">{couponError}</p>
        )}
      </form>

      <dl className="mt-5 space-y-2 border-t border-border pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatINR(cart.retailSubtotal)}</dd>
        </div>
        {coupon && (
          <div className="flex justify-between text-emerald-700">
            <dt>Discount ({coupon.code})</dt>
            <dd className="tabular-nums">−{formatINR(coupon.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <dt>Shipping</dt>
          <dd>Free</dd>
        </div>
        {paymentMethod === "COD" && paymentFee > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <dt>COD handling fee</dt>
            <dd>{formatINR(paymentFee)}</dd>
          </div>
        )}
        <div className="flex justify-between border-t border-border pt-3 text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatINR(total)}</dd>
        </div>
      </dl>
    </aside>
  );
}

const inputClass =  "mt-1.5 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={"block " + className}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}

