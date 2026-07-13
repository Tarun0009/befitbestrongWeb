"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, X } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { cn } from "@/lib/utils";
import { useGetRecentlyViewedProductsQuery } from "./discoveryApi";
import {
  clearRecentlyViewed,
  readRecentlyViewed,
  RECENTLY_VIEWED_EVENT,
} from "./recentlyViewed";

export function RecentlyViewedRail({
  currentSlug,
  className,
}: {
  currentSlug?: string;
  className?: string;
}) {
  const [slugs, setSlugs] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => {
      setSlugs(readRecentlyViewed().map((entry) => entry.slug));
    };
    sync();
    window.addEventListener(RECENTLY_VIEWED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENTLY_VIEWED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const requestedSlugs = useMemo(
    () => slugs.filter((slug) => slug !== currentSlug).slice(0, 6),
    [currentSlug, slugs],
  );
  const { data, isLoading } = useGetRecentlyViewedProductsQuery(
    requestedSlugs,
    { skip: requestedSlugs.length === 0 },
  );
  const products = useMemo(() => {
    const bySlug = new Map(data?.items.map((product) => [product.slug, product]));
    return requestedSlugs.flatMap((slug) => {
      const product = bySlug.get(slug);
      return product ? [product] : [];
    });
  }, [data, requestedSlugs]);

  if (requestedSlugs.length === 0) return null;
  if (!isLoading && products.length === 0) return null;

  return (
    <section className={cn("py-12", className)} aria-labelledby="recently-viewed-title">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <Clock3 className="h-4 w-4" aria-hidden="true" />
            Your browsing history
          </p>
          <h2 id="recently-viewed-title" className="mt-2 text-2xl font-semibold tracking-tight">
            Recently viewed
          </h2>
        </div>
        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear history
        </button>
      </div>

      {isLoading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {requestedSlugs.slice(0, 4).map((slug) => (
            <div key={slug} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 4).map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </section>
  );
}
