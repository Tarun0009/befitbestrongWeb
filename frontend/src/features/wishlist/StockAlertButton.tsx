"use client";

import { Bell, BellRing } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/hooks";
import {
  useGetStockAlertsQuery,
  useSubscribeStockAlertMutation,
  useUnsubscribeStockAlertMutation,
} from "./wishlistApi";

export function StockAlertButton({
  variantId,
  productName,
  variantLabel,
  stock,
}: {
  variantId: string;
  productName: string;
  variantLabel: string;
  stock: number;
}) {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  const userKey = user?.uid ?? "";
  const { data } = useGetStockAlertsQuery(userKey, {
    skip: stock > 0 || status !== "authenticated" || !userKey,
  });
  const [subscribe, { isLoading: subscribing }] =
    useSubscribeStockAlertMutation();
  const [unsubscribe, { isLoading: unsubscribing }] =
    useUnsubscribeStockAlertMutation();
  const subscribed = data?.variantIds.includes(variantId) ?? false;
  const busy = subscribing || unsubscribing;

  if (stock > 0) return null;

  async function toggle() {
    if (status !== "authenticated" || !userKey) {
      router.push("/login");
      return;
    }
    if (busy) return;

    const args = { variantId, userKey };
    if (subscribed) {
      await unsubscribe(args);
    } else {
      await subscribe(args);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={
        subscribed
          ? "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary bg-primary/10 px-4 text-sm font-semibold"
          : "mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
      }
      aria-pressed={subscribed}
      aria-label={
        subscribed
          ? "Remove stock alert for " + productName + ", " + variantLabel
          : "Notify me when " + productName + ", " + variantLabel + " is available"
      }
    >
      {subscribed ? (
        <BellRing className="h-4 w-4 text-primary" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {busy
        ? "Saving…"
        : subscribed
          ? "Stock alert active"
          : status === "authenticated"
            ? "Notify me when available"
            : "Log in for a stock alert"}
    </button>
  );
}
