"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { CheckCircle2, Loader2, MapPin, XCircle } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import { formatINR } from "@/lib/format";
import {
  useLazyCheckServiceabilityQuery,
  useRequestServiceAreaMutation,
  type ServiceabilityResult,
} from "./serviceabilityApi";

export function PincodeChecker({
  productId,
  value,
  onValueChange,
  onResult,
  source = "product",
  heading = "Check delivery availability",
}: {
  productId?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  onResult?: (result: ServiceabilityResult | null) => void;
  source?: "product" | "checkout" | "cart" | "footer" | "storefront";
  heading?: string;
}) {
  const user = useAppSelector((state) => state.auth.user);
  const [internalValue, setInternalValue] = useState("");
  const pincode = value ?? internalValue;
  const [result, setResult] = useState<ServiceabilityResult | null>(null);
  const [email, setEmail] = useState("");
  const [requestMessage, setRequestMessage] = useState<string | null>(null);
  const [check, { isFetching, error: checkError }] =
    useLazyCheckServiceabilityQuery();
  const [requestArea, { isLoading: requesting }] =
    useRequestServiceAreaMutation();

  useEffect(() => {
    if (value !== undefined || typeof window === "undefined") return;
    const saved = window.localStorage.getItem("delivery-pincode");
    if (saved && /^\d{6}$/.test(saved)) setInternalValue(saved);
  }, [value]);

  function updateValue(next: string) {
    const normalized = next.replace(/\D/g, "").slice(0, 6);
    if (onValueChange) onValueChange(normalized);
    else setInternalValue(normalized);
    setResult(null);
    setRequestMessage(null);
    onResult?.(null);
  }

  async function handleCheck() {
    if (!/^\d{6}$/.test(pincode)) return;
    setRequestMessage(null);
    try {
      const next = await check(pincode, true).unwrap();
      setResult(next);
      onResult?.(next);
      if (next.serviceable && typeof window !== "undefined") {
        window.localStorage.setItem("delivery-pincode", next.pincode);
      }
    } catch {
      setResult(null);
      onResult?.(null);
    }
  }

  async function handleRequest() {
    setRequestMessage(null);
    try {
      const response = await requestArea({
        pincode,
        email: (user?.email ?? email.trim()) || undefined,
        productId,
        source,
      }).unwrap();
      setRequestMessage(response.message);
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setRequestMessage(
        apiError.data?.error?.message ?? "Could not record your request.",
      );
    }
  }

  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary-foreground" />
        <h2 className="text-sm font-semibold">{heading}</h2>
      </div>
      <div className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={"delivery-pincode-" + (productId ?? source)}>
          PIN code
        </label>
        <input
          id={"delivery-pincode-" + (productId ?? source)}
          value={pincode}
          onChange={(event) => updateValue(event.target.value)}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void handleCheck();
            }
          }}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="6-digit PIN code"
          className="h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={pincode.length !== 6 || isFetching}
          className="inline-flex h-11 items-center justify-center rounded-lg bg-foreground px-4 text-sm font-semibold text-background disabled:opacity-50"
        >
          {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Check"}
        </button>
      </div>

      {checkError && (
        <p className="mt-3 text-xs text-red-600">
          Availability could not be checked. Please try again.
        </p>
      )}

      {result?.serviceable && (
        <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 text-sm text-emerald-800">
          <p className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" />
            Delivery is available in {result.city}
          </p>
          <p className="mt-1 text-xs leading-5">
            Estimated {result.estimatedDeliveryMinDays}–{result.estimatedDeliveryMaxDays} business days
            {" · "}
            {result.codEnabled
              ? "COD available" +
                (result.codFee ? " (" + formatINR(result.codFee) + " fee)" : "")
              : "Prepaid only"}
          </p>
        </div>
      )}

      {result && !result.serviceable && (
        <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-orange-800">
            <XCircle className="h-4 w-4" />
            We do not deliver here yet
          </p>
          <p className="mt-1 text-xs leading-5 text-orange-700">
            Request this area and we will use the demand to plan our next delivery zone.
          </p>
          {!user?.email && (
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email for launch updates"
              className="mt-3 h-10 w-full rounded-lg border border-orange-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-orange-300"
            />
          )}
          <button
            type="button"
            onClick={handleRequest}
            disabled={requesting || (!user?.email && !email.trim())}
            className="mt-2 inline-flex h-10 items-center rounded-lg bg-orange-700 px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            {requesting ? "Recording…" : "Request delivery in my area"}
          </button>
        </div>
      )}

      {requestMessage && (
        <p className="mt-3 text-xs leading-5 text-muted-foreground" role="status">
          {requestMessage}
        </p>
      )}
    </section>
  );
}


