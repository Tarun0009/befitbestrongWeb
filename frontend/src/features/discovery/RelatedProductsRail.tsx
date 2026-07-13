"use client";

import { Sparkles } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { useGetRelatedProductsQuery } from "./discoveryApi";

export function RelatedProductsRail({
  slug,
  categoryName,
}: {
  slug: string;
  categoryName: string;
}) {
  const { data, isLoading, isError } = useGetRelatedProductsQuery({ slug });

  if (isError || (!isLoading && !data?.items.length)) return null;

  return (
    <section className="border-t border-border py-12" aria-labelledby="related-products-title">
      <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        Chosen from current catalog signals
      </p>
      <h2 id="related-products-title" className="mt-2 text-2xl font-semibold tracking-tight">
        More for your {categoryName.toLowerCase()} setup
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        Ranked by category fit, price proximity, live stock, and customer ratings.
      </p>

      {isLoading ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="aspect-[3/4] animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {data?.items.map((product) => (
            <div key={product.id}>
              <p className="mb-2 text-xs font-medium text-primary">
                {product.recommendationReason}
              </p>
              <ProductCard product={product} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
