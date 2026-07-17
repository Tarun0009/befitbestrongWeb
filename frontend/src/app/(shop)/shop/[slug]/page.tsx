"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
  X,
  ZoomIn,
} from "lucide-react";
import { useGetProductQuery, type CatalogVariant } from "@/lib/catalogApi";
import { useAddItemMutation } from "@/lib/cartApi";
import { useAppDispatch } from "@/lib/hooks";
import { setLastAdded } from "@/features/cart/cartSlice";
import { formatINR } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";
import { RatingStars } from "@/features/reviews/RatingStars";

import { WishlistButton } from "@/features/wishlist/WishlistButton";
import { StockAlertButton } from "@/features/wishlist/StockAlertButton";
import { SubscriptionPlanHint } from "@/features/subscriptions/SubscriptionPlanHint";
import { RecentlyViewedTracker } from "@/features/discovery/RecentlyViewedTracker";
import { PincodeChecker } from "@/features/serviceability/PincodeChecker";
const ProductReviews = dynamic(
  () => import("@/features/reviews/ProductReviews").then((module) => module.ProductReviews),
  { loading: BelowFoldLoading },
);
const RecentlyViewedRail = dynamic(
  () => import("@/features/discovery/RecentlyViewedRail").then((module) => module.RecentlyViewedRail),
  { loading: BelowFoldLoading },
);
const RelatedProductsRail = dynamic(
  () => import("@/features/discovery/RelatedProductsRail").then((module) => module.RelatedProductsRail),
  { loading: BelowFoldLoading },
);

function BelowFoldLoading() {
  return (
    <div className="my-10 h-32 animate-pulse rounded-xl bg-muted" role="status">
      <span className="sr-only">Loading more product information</span>
    </div>
  );
}

export default function ProductDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { data, isFetching, error } = useGetProductQuery(slug, { skip: !slug });

  const [activeImage, setActiveImage] = useState(0);
  const [mainImageFailed, setMainImageFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const lightboxCloseRef = useRef<HTMLButtonElement>(null);
  const lightboxRestoreFocusRef = useRef<HTMLElement | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [addError, setAddError] = useState<string | null>(null);
  const router = useRouter();
  const dispatch = useAppDispatch();
  const [addItem, { isLoading: adding }] = useAddItemMutation();

  const activeVariant: CatalogVariant | null = useMemo(() => {
    if (!data) return null;
    if (variantId) {
      return data.variants.find((variant) => variant.id === variantId) ?? null;
    }
    return (
      data.variants.find((variant) => variant.stock > 0) ??
      data.variants[0] ??
      null
    );
  }, [data, variantId]);

  useEffect(() => {
    setActiveImage(0);
    setVariantId(null);
    setQty(1);
    setAddError(null);
  }, [slug]);

  useEffect(() => {
    setMainImageFailed(false);
  }, [activeImage]);

  useEffect(() => {
    setQty(1);
    setAddError(null);
  }, [activeVariant?.id]);

  useEffect(() => {
    if (!lightboxOpen) return;
    lightboxRestoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      lightboxCloseRef.current?.focus();
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setLightboxOpen(false);
      if (event.key === "Tab") {
        event.preventDefault();
        lightboxCloseRef.current?.focus();
      }
      const imageCount = data?.images.length ?? 0;
      if (imageCount > 1 && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
        event.preventDefault();
        setActiveImage((current) => {
          const direction = event.key === "ArrowLeft" ? -1 : 1;
          return (current + direction + imageCount) % imageCount;
        });
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      const restoreTarget = lightboxRestoreFocusRef.current;
      if (restoreTarget?.isConnected) restoreTarget.focus();
      lightboxRestoreFocusRef.current = null;
    };
  }, [data?.images.length, lightboxOpen]);

  if (error) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="rounded-xl border border-red-300 bg-red-50 p-5 text-sm text-red-700">
          <p className="font-semibold">This product is not available.</p>
          <p className="mt-1">It may have been removed or temporarily disabled.</p>
        </div>
        <Link
          href="/shop"
          className="mt-5 inline-flex rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
        >
          Browse products
        </Link>
      </main>
    );
  }

  if (!data || isFetching) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="aspect-square animate-pulse rounded-xl bg-muted" />
          <div className="space-y-4">
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
            <div className="h-12 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-8 w-36 animate-pulse rounded bg-muted" />
            <div className="h-24 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </main>
    );
  }

  const displayPrice = activeVariant?.price ?? data.basePrice;
  const hasSale =
    data.compareAtPrice !== null && data.compareAtPrice > displayPrice;
  const discount = hasSale
    ? Math.round(
        ((data.compareAtPrice! - displayPrice) / data.compareAtPrice!) * 100,
      )
    : null;
  const stock = activeVariant?.stock ?? 0;
  const clampedQty = Math.min(Math.max(qty, 1), Math.max(stock, 1));
  const currentImage = data.images[activeImage] ?? null;

  async function handleAddToCart() {
    if (!activeVariant || stock === 0) return;
    setAddError(null);
    try {
      const response = await addItem({
        variantId: activeVariant.id,
        quantity: clampedQty,
      }).unwrap();
      dispatch(setLastAdded({ name: data!.name, variantId: activeVariant.id }));
      if (response.effective < clampedQty) {
        setAddError(
          "Only " + response.effective + " in stock — your cart was adjusted.",
        );
      }
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setAddError(
        apiError.data?.error?.message ?? "Could not add this item to your cart.",
      );
    }
  }

  function moveImage(direction: -1 | 1) {
    if (data!.images.length < 2) return;
    setActiveImage((current) => {
      const next = current + direction;
      if (next < 0) return data!.images.length - 1;
      if (next >= data!.images.length) return 0;
      return next;
    });
  }

  return (
    <>
      <RecentlyViewedTracker slug={data.slug} />
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-8 sm:px-6 sm:pb-16 sm:pt-12">
        <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:text-sm">
          <Link href="/" className="hover:text-foreground">
            Home
          </Link>
          <span>/</span>
          <Link href="/shop" className="hover:text-foreground">
            Shop
          </Link>
          <span>/</span>
          <Link
            href={"/shop?category=" + data.category.slug}
            className="hover:text-foreground"
          >
            {data.category.name}
          </Link>
        </nav>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:gap-14">
          <div className="lg:sticky lg:top-36 lg:self-start">
            <div className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted">
              {currentImage?.url && !mainImageFailed ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="h-full w-full cursor-zoom-in"
                  aria-label="Open larger product image"
                  aria-haspopup="dialog"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={currentImage.url}
                    alt={currentImage.alt ?? data.name}
                    width={1000}
                    height={1000}
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    onError={() => setMainImageFailed(true)}
                  />
                </button>
              ) : (
                <div className="flex h-full flex-col items-center justify-center bg-[radial-gradient(circle_at_top,#fff7d0,transparent_55%)] px-6 text-center">
                  <span className="grid h-16 w-16 place-items-center rounded-xl bg-foreground text-lg font-black tracking-[-0.08em] text-primary">
                    BFS
                  </span>
                  <p className="mt-4 text-sm font-medium text-muted-foreground">
                    Product image coming soon
                  </p>
                </div>
              )}

              {discount !== null && discount > 0 && (
                <span className="absolute left-4 top-4 rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground shadow-sm">
                  Save {discount}%
                </span>
              )}

              {currentImage?.url && !mainImageFailed && (
                <span className="pointer-events-none absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-md bg-background/90 px-2.5 py-1.5 text-xs font-medium shadow-sm backdrop-blur">
                  <ZoomIn className="h-3.5 w-3.5" />
                  View larger
                </span>
              )}

              {data.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => moveImage(-1)}
                    className="absolute left-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow-sm opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 focus:opacity-100"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(1)}
                    className="absolute right-3 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-full bg-background/90 shadow-sm opacity-0 transition-opacity hover:bg-background group-hover:opacity-100 focus:opacity-100"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>

            {data.images.length > 1 && (
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {data.images.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    className={
                      index === activeImage
                        ? "h-20 w-20 shrink-0 overflow-hidden rounded-lg border-2 border-foreground bg-muted"
                        : "h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-border bg-muted opacity-75 hover:opacity-100"
                    }
                    aria-label={"Show image " + (index + 1)}
                    aria-current={index === activeImage ? "true" : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt=""
                      width={160}
                      height={160}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {data.category.name}
            </p>
            <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              {data.name}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a
                href="#reviews"
                className="inline-flex items-center gap-2 hover:opacity-80"
              >
                <RatingStars
                  value={data.ratingAvg}
                  count={data.ratingCount}
                  showValue
                />
              </a>
              <WishlistButton
                productId={data.id}
                productName={data.name}
                variant="label"
              />
            </div>

            <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-2">
              <p className="text-3xl font-semibold tabular-nums">
                {formatINR(displayPrice)}
              </p>
              {hasSale && (
                <>
                  <span className="text-base tabular-nums text-muted-foreground line-through">
                    {formatINR(data.compareAtPrice!)}
                  </span>
                  {discount !== null && discount > 0 && (
                    <span className="rounded-md bg-primary/15 px-2 py-1 text-xs font-bold text-foreground ring-1 ring-inset ring-primary/40">
                      {discount}% off
                    </span>
                  )}
                </>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Shipping is calculated at checkout.
            </p>

            {data.dispatchHint && (
              <p className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary/12 px-3 py-2 text-xs font-semibold text-foreground ring-1 ring-inset ring-primary/30">
                <Truck className="h-4 w-4 text-primary-foreground" />
                {data.dispatchHint}
              </p>
            )}

            {data.variants.length > 0 && (
              <section className="mt-8">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Choose a variant</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Availability and price update with your selection.
                    </p>
                  </div>
                  {activeVariant && (
                    <span className="text-xs text-muted-foreground">
                      SKU {activeVariant.sku}
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {data.variants.map((variant) => {
                    const isActive = activeVariant?.id === variant.id;
                    const label =
                      [variant.size, variant.color].filter(Boolean).join(" / ") ||
                      variant.sku;
                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setVariantId(variant.id)}
                        aria-pressed={isActive}
                        className={
                          isActive
                            ? "min-h-14 rounded-lg border-2 border-foreground bg-foreground px-3 py-2 text-left text-background"
                            : "min-h-14 rounded-lg border border-border px-3 py-2 text-left hover:border-foreground/50 hover:bg-muted"
                        }
                      >
                        <span className="block text-sm font-semibold">{label}</span>
                        <span
                          className={
                            isActive
                              ? "mt-0.5 block text-[11px] text-background/70"
                              : "mt-0.5 block text-[11px] text-muted-foreground"
                          }
                        >
                          {variant.stock === 0
                            ? "Out of stock"
                            : formatINR(variant.price)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="mt-6 flex items-center justify-between gap-4 border-y border-border py-4">
              {stock > 0 ? (
                <StatusPill tone="success">
                  In stock · {stock} available
                </StatusPill>
              ) : (
                <StatusPill tone="neutral">Out of stock</StatusPill>
              )}

              {stock > 0 && (
                <div className="flex items-center rounded-lg border border-border">
                  <button
                    type="button"
                    onClick={() => setQty((current) => Math.max(1, current - 1))}
                    className="grid h-10 w-10 place-items-center hover:bg-muted disabled:opacity-40"
                    disabled={clampedQty <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-10 text-center text-sm font-semibold tabular-nums">
                    {clampedQty}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQty((current) => Math.min(stock, current + 1))
                    }
                    className="grid h-10 w-10 place-items-center hover:bg-muted disabled:opacity-40"
                    disabled={clampedQty >= stock}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="mt-5 rounded-xl border border-border bg-muted/25 p-4">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={stock === 0 || adding}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <ShoppingBag className="h-4 w-4" />
                  {adding
                    ? "Adding…"
                    : stock === 0
                      ? "Out of stock"
                      : "Add to cart"}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/cart")}
                  className="min-h-12 rounded-lg border border-border bg-background px-4 text-sm font-semibold hover:bg-muted"
                >
                  View cart
                </button>
              </div>
              {addError && (
                <p className="mt-3 text-xs font-medium text-red-600" role="alert">
                  {addError}
                </p>
              )}
              {activeVariant && (
                <StockAlertButton
                  variantId={activeVariant.id}
                  productName={data.name}
                  variantLabel={
                    [activeVariant.size, activeVariant.color]
                      .filter(Boolean)
                      .join(" / ") || activeVariant.sku
                  }
                  stock={activeVariant.stock}
                />
              )}
            </div>

            <div className="mt-5">
              <PincodeChecker productId={data.id} source="product" />
            </div>

            <SubscriptionPlanHint variantId={activeVariant?.id ?? null} />

            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              <TrustItem
                icon={<Truck className="h-4 w-4" />}
                title="Fast dispatch"
                body={data.dispatchHint || "Packed quickly and tracked."}
              />
              <TrustItem
                icon={<RotateCcw className="h-4 w-4" />}
                title="Easy returns"
                body="30-day returns on eligible unopened items."
              />
              <TrustItem
                icon={<ShieldCheck className="h-4 w-4" />}
                title="Secure checkout"
                body="Protected payment and order processing."
              />
            </div>

            <section className="mt-10 border-t border-border pt-7">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Product details
              </p>
              <h2 className="mt-2 text-xl font-semibold">What you need to know</h2>
              <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                {data.description}
              </p>
            </section>
          </div>
        </div>

        <RelatedProductsRail
          slug={data.slug}
          categoryName={data.category.name}
        />

        <RecentlyViewedRail currentSlug={data.slug} />

        <ProductReviews
          productSlug={data.slug}
          initialAverage={data.ratingAvg}
          initialCount={data.ratingCount}
        />
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 p-3 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur sm:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0">
            <p className="truncate text-xs text-muted-foreground">{data.name}</p>
            <p className="font-semibold tabular-nums">{formatINR(displayPrice)}</p>
          </div>
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={stock === 0 || adding}
            className="ml-auto inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <ShoppingBag className="h-4 w-4" />
            {adding ? "Adding…" : stock === 0 ? "Out of stock" : "Add to cart"}
          </button>
        </div>
      </div>

      {lightboxOpen && currentImage?.url && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center bg-black/90 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Product image viewer"
          aria-describedby="product-image-viewer-help"
          onClick={() => setLightboxOpen(false)}
        >
          <p id="product-image-viewer-help" className="sr-only">
            Use the left and right arrow keys to change images. Press Escape to close.
          </p>
          <button
            ref={lightboxCloseRef}
            type="button"
            onClick={() => setLightboxOpen(false)}
            className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
            aria-label="Close image viewer"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={currentImage.url}
            alt={currentImage.alt ?? data.name}
            width={1600}
            height={1600}
            decoding="async"
            className="max-h-full max-w-full rounded-lg object-contain"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function TrustItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
          {icon}
        </span>
        {title}
      </div>
      <p className="mt-2 text-xs leading-5 text-muted-foreground">{body}</p>
    </div>
  );
}
