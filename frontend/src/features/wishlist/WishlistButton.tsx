"use client";

import { Heart } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppSelector } from "@/lib/hooks";
import {
  useAddWishlistItemMutation,
  useGetWishlistQuery,
  useRemoveWishlistItemMutation,
} from "./wishlistApi";

export function WishlistButton({
  productId,
  productName,
  variant = "icon",
}: {
  productId: string;
  productName: string;
  variant?: "icon" | "label";
}) {
  const router = useRouter();
  const { user, status } = useAppSelector((state) => state.auth);
  const userKey = user?.uid ?? "";
  const { data } = useGetWishlistQuery(userKey, {
    skip: status !== "authenticated" || !userKey,
  });
  const [addItem, { isLoading: adding }] = useAddWishlistItemMutation();
  const [removeItem, { isLoading: removing }] =
    useRemoveWishlistItemMutation();
  const saved = data?.productIds.includes(productId) ?? false;
  const busy = adding || removing;

  async function toggle() {
    if (status !== "authenticated" || !userKey) {
      router.push("/login");
      return;
    }
    if (busy) return;

    const args = { productId, userKey };
    if (saved) {
      await removeItem(args);
    } else {
      await addItem(args);
    }
  }

  if (variant === "label") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={
          saved
            ? "inline-flex h-10 items-center gap-2 rounded-lg border border-primary bg-primary/10 px-3 text-sm font-semibold"
            : "inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted"
        }
        aria-pressed={saved}
      >
        <Heart
          className={
            "h-4 w-4 " +
            (saved ? "fill-primary text-primary" : "text-foreground")
          }
        />
        {saved ? "Saved" : "Save for later"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background/95 text-foreground shadow-sm backdrop-blur transition hover:scale-105 hover:bg-background disabled:opacity-60"
      aria-label={
        saved
          ? "Remove " + productName + " from wishlist"
          : "Save " + productName + " to wishlist"
      }
      aria-pressed={saved}
      title={saved ? "Remove from wishlist" : "Save to wishlist"}
    >
      <Heart
        className={
          "h-4 w-4 " +
          (saved ? "fill-primary text-primary" : "text-foreground")
        }
      />
    </button>
  );
}
