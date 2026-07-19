"use client";

import { useEffect, useState, type KeyboardEvent } from "react";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { formatINR } from "@/lib/format";
import {
  useLazyCheckServiceabilityQuery,
  type ServiceabilityResult,
} from "./serviceabilityApi";

export function PincodeChecker({
  value,
  onValueChange,
  onResult,
  heading = "Check delivery availability",
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  onResult?: (result: ServiceabilityResult | null) => void;
  heading?: string;
}) {
  const [internalValue, setInternalValue] = useState("");
  const pincode = value ?? internalValue;
  const [result, setResult] = useState<ServiceabilityResult | null>(null);
  const [check, { isFetching, error: checkError }] =
    useLazyCheckServiceabilityQuery();

  useEffect(() => {
    if (value !== undefined || typeof window === "undefined") return;
    const saved = window.localStorage.getItem("delivery-pincode");
    if (saved && /^[1-9]\d{5}$/.test(saved)) setInternalValue(saved);
  }, [value]);

  function updateValue(next: string) {
    const normalized = next.replace(/\D/g, "").slice(0, 6);
    if (onValueChange) onValueChange(normalized);
    else setInternalValue(normalized);
    setResult(null);
    onResult?.(null);
  }

  async function handleCheck() {
    if (!/^[1-9]\d{5}$/.test(pincode)) return;
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

  const inputId = "delivery-pincode-checker";

  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary-foreground" />
        <h2 className="text-sm font-semibold">{heading}</h2>
      </div>
      <div className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor={inputId}>
          PIN code
        </label>
        <input
          id={inputId}
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
            Delivery is available across India
            {result.city ? " · " + result.city : ""}
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
    </section>
  );
}


