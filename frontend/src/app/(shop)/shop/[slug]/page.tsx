"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  BadgeCheck,
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
  const [imageZoom, setImageZoom] = useState({
    active: false,
    x: 50,
    y: 50,
  });
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
    setImageZoom({ active: false, x: 50, y: 50 });
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
  const overviewPoints = data.description
    .split(/(?<=[.!?])\s+/)
    .map((point) => point.trim())
    .filter(Boolean)
    .slice(0, 3);

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

  function updateImageZoom(event: React.PointerEvent<HTMLButtonElement>) {
    if (event.pointerType !== "mouse") return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.min(
      100,
      Math.max(0, ((event.clientX - bounds.left) / bounds.width) * 100),
    );
    const y = Math.min(
      100,
      Math.max(0, ((event.clientY - bounds.top) / bounds.height) * 100),
    );
    setImageZoom({ active: true, x, y });
  }

  function resetImageZoom() {
    setImageZoom((current) =>
      current.active ? { ...current, active: false } : current,
    );
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

        <div className="grid gap-10 md:grid-cols-[minmax(0,1.02fr)_minmax(320px,0.98fr)] md:gap-8 lg:gap-14">
          <div className="min-w-0 md:sticky md:top-36 md:self-start">
            <div className={data.images.length > 1 ? "min-w-0 md:grid md:grid-cols-[76px_minmax(0,1fr)] md:gap-4" : "min-w-0"}>
              {data.images.length > 1 && (
                <div className="order-2 mt-3 flex gap-3 overflow-x-auto pb-1 md:order-1 md:mt-0 md:max-h-[32rem] md:flex-col md:overflow-y-auto md:overflow-x-hidden md:overscroll-contain">
                  {data.images.map((image, index) => (
                    <button
                      key={image.id}
                      type="button"
                      onClick={() => setActiveImage(index)}
                      className={
                        index === activeImage
                          ? "h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-foreground bg-muted p-1 shadow-sm md:h-[76px] md:w-[76px]"
                          : "h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted p-1 opacity-75 hover:opacity-100 md:h-[76px] md:w-[76px]"
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
                        className="h-full w-full rounded-lg bg-white object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="order-1 min-w-0 md:order-2">
            <div className="group relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted shadow-sm">
              {currentImage?.url && !mainImageFailed ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  onPointerEnter={updateImageZoom}
                  onPointerMove={updateImageZoom}
                  onPointerLeave={resetImageZoom}
                  className="h-full w-full touch-manipulation md:cursor-zoom-in"
                  aria-label="Open larger product image"
                  aria-haspopup="dialog"
                  aria-describedby="product-image-zoom-help"
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
                    className="h-full w-full object-cover transition-transform duration-200 ease-out"
                    style={{
                      transform: imageZoom.active ? "scale(1.75)" : "scale(1)",
                      transformOrigin: `${imageZoom.x}% ${imageZoom.y}%`,
                    }}
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
                  <span className="hidden md:inline">Hover to zoom · </span>
                  View larger
                </span>
              )}

              <span id="product-image-zoom-help" className="sr-only">
                On desktop, move your pointer over the image to zoom into the product. Click to open the full image viewer.
              </span>

              {data.images.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={() => moveImage(-1)}
                    className="absolute left-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/95 shadow-sm transition-colors hover:bg-background focus:bg-background"
                    aria-label="Previous image"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(1)}
                    className="absolute right-3 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full border border-border bg-background/95 shadow-sm transition-colors hover:bg-background focus:bg-background"
                    aria-label="Next image"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
              <p className="mt-3 text-center text-xs text-muted-foreground md:hidden" aria-live="polite">
                Image {activeImage + 1} of {data.images.length}
              </p>
              </div>
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {data.category.name}
              </p>
              {stock > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
                  In stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground ring-1 ring-inset ring-border">
                  Currently unavailable
                </span>
              )}
            </div>
            <h1 className="mt-3 text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl">
              {data.name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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
              <span className="text-xs text-muted-foreground">
                {data.ratingCount > 0
                  ? data.ratingCount + " rating" + (data.ratingCount === 1 ? "" : "s")
                  : "Be the first to review"}
              </span>
              <WishlistButton
                productId={data.id}
                productName={data.name}
                variant="label"
              />
            </div>

            <div className="mt-6 rounded-2xl border border-border bg-muted/30 p-5">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
                <p className="text-3xl font-semibold tabular-nums">
                  {formatINR(displayPrice)}
                </p>
                {hasSale && (
                  <>
                    <span className="text-base tabular-nums text-muted-foreground line-through">
                      {formatINR(data.compareAtPrice!)}
                    </span>
                    {discount !== null && discount > 0 && (
                      <span className="rounded-full bg-primary/20 px-2.5 py-1 text-xs font-bold text-foreground ring-1 ring-inset ring-primary/35">
                        Save {discount}%
                      </span>
                    )}
                  </>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Final delivery charges and available payment methods are shown at checkout.
              </p>
              <div className="mt-4 grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
                <InfoItem
                  icon={<Truck className="h-4 w-4" />}
                  title="Dispatch"
                  body={data.dispatchHint || "Estimate shown at checkout"}
                />
                <InfoItem
                  icon={<BadgeCheck className="h-4 w-4" />}
                  title="Secure order"
                  body="Order status confirmed after payment"
                />
              </div>
            </div>

            {data.variants.length > 0 && (
              <section className="mt-8 rounded-2xl border border-border p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Choose your option</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Select a size, flavour, or colour before adding to cart.
                    </p>
                  </div>
                  {activeVariant && (
                    <span className="text-xs text-muted-foreground">
                      SKU {activeVariant.sku}
                    </span>
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                            ? "min-h-14 rounded-xl border-2 border-foreground bg-foreground px-3 py-2 text-left text-background shadow-sm"
                            : "min-h-14 rounded-xl border border-border px-3 py-2 text-left hover:border-foreground/50 hover:bg-muted"
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

            <div className="mt-5 rounded-2xl border border-foreground/10 bg-foreground p-4 text-background shadow-lg shadow-foreground/10">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={stock === 0 || adding}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
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
                  className="min-h-12 rounded-xl border border-background/20 bg-background/10 px-4 text-sm font-semibold text-background hover:bg-background/15"
                >
                  View cart
                </button>
              </div>
              {addError && (
                <p className="mt-3 text-xs font-medium text-red-300" role="alert">
                  {addError}
                </p>
              )}
            </div>

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

            <div className="mt-5">
              <PincodeChecker />
            </div>

            <SubscriptionPlanHint variantId={activeVariant?.id ?? null} />

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <TrustItem
                icon={<Truck className="h-4 w-4" />}
                title="Dispatch information"
                body={data.dispatchHint || "See the current dispatch estimate at checkout."}
              />
              <TrustItem
                icon={<RotateCcw className="h-4 w-4" />}
                title="Returns policy"
                body="Review the shipping and returns policy before ordering."
              />
              <TrustItem
                icon={<ShieldCheck className="h-4 w-4" />}
                title="Checkout status"
                body="Payment and order status are confirmed before completion."
              />
            </div>

            <section className="mt-10 border-t border-border pt-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Product overview
              </p>
              <h2 className="mt-2 text-xl font-semibold">Made for your training routine</h2>
              {overviewPoints.length > 1 ? (
                <ul className="mt-5 space-y-3">
                  {overviewPoints.map((point) => (
                    <li key={point} className="flex gap-3 text-sm leading-6 text-muted-foreground">
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-4 whitespace-pre-line text-sm leading-7 text-muted-foreground">
                  {data.description}
                </p>
              )}
              {overviewPoints.length > 1 && (
                <details className="group mt-5 rounded-xl border border-border px-4">
                  <summary className="cursor-pointer list-none py-3 text-sm font-semibold marker:hidden">
                    <span className="flex items-center justify-between gap-3">
                      Full product description
                      <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    </span>
                  </summary>
                  <p className="whitespace-pre-line border-t border-border pb-4 pt-4 text-sm leading-7 text-muted-foreground">
                    {data.description}
                  </p>
                </details>
              )}
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
          {data.images.length > 1 && (
            <>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveImage(-1);
                }}
                className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:left-6"
                aria-label="Previous product image"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  moveImage(1);
                }}
                className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 sm:right-6"
                aria-label="Next product image"
              >
                <ChevronRight className="h-6 w-6" />
              </button>
              <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white backdrop-blur">
                {activeImage + 1} / {data.images.length}
              </span>
            </>
          )}
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

function InfoItem({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex min-w-0 gap-2.5">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/20 text-primary-emphasis">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{body}</p>
      </div>
    </div>
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
