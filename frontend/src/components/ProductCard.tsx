import Link from "next/link";
import type { CatalogListItem, SearchItem } from "@/lib/catalogApi";
import { formatINR } from "@/lib/format";
import { RatingStars } from "@/features/reviews/RatingStars";
import { WishlistButton } from "@/features/wishlist/WishlistButton";

type ProductCardProduct = CatalogListItem | SearchItem;

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductCardProduct;
  priority?: boolean;
}) {
  const hasSale =
    product.compareAtPrice !== null && product.compareAtPrice > product.basePrice;
  const discount = hasSale
    ? Math.round(
        ((product.compareAtPrice! - product.basePrice) /
          product.compareAtPrice!) *
          100,
      )
    : null;

  return (
    <article className="group overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-foreground/40">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Link
          href={"/shop/" + product.slug}
          className="block h-full w-full"
          aria-label={"View " + product.name}
        >
          {product.image?.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image.url}
              alt={product.image.alt ?? product.name}
              width={600}
              height={600}
              loading={priority ? "eager" : "lazy"}
              fetchPriority={priority ? "high" : "auto"}
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-primary/10 px-4 text-center text-xs uppercase tracking-widest text-muted-foreground">
              beFitBeStrong
            </div>
          )}
          {discount !== null && discount > 0 && (
            <span className="absolute left-3 top-3 rounded-md bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
              Save {discount}%
            </span>
          )}
        </Link>
        <div className="absolute right-3 top-3">
          <WishlistButton
            productId={product.id}
            productName={product.name}
          />
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div>
          <Link
            href={"/shop/" + product.slug}
            className="line-clamp-2 min-h-10 text-sm font-medium leading-5 hover:underline"
          >
            {product.name}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {product.category.name}
          </p>
          <div className="mt-2">
            <RatingStars
              value={product.ratingAvg}
              count={product.ratingCount}
              size="xs"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-base font-semibold tabular-nums">
            {formatINR(product.basePrice)}
          </span>
          {hasSale && (
            <span className="text-xs tabular-nums text-muted-foreground line-through">
              {formatINR(product.compareAtPrice!)}
            </span>
          )}
        </div>

        {product.dispatchHint && (
          <p className="inline-flex rounded-md bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary-foreground ring-1 ring-inset ring-primary/25">
            {product.dispatchHint}
          </p>
        )}
      </div>
    </article>
  );
}

