"use client";

import { useMemo, useState } from "react";
import type { CatalogListItem } from "@/lib/catalogApi";
import { ProductCard } from "@/components/ProductCard";

export function TabbedFeaturedGrid({
  products,
  loading,
}: {
  products: CatalogListItem[];
  loading?: boolean;
}) {
  const tabs = useMemo(() => {
    const categories = Array.from(
      new Map(products.map((p) => [p.category.slug, p.category])).values(),
    );
    return [{ slug: "all", name: "All" }, ...categories].slice(0, 6);
  }, [products]);
  const [active, setActive] = useState("all");

  const visible = useMemo(() => {
    const scoped =
      active === "all"
        ? products
        : products.filter((p) => p.category.slug === active);
    return scoped.slice(0, 8);
  }, [active, products]);

  if (loading && products.length === 0) {
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="h-72 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.slug}
            type="button"
            onClick={() => setActive(tab.slug)}
            className={
              active === tab.slug
                ? "shrink-0 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
                : "shrink-0 rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            }
          >
            {tab.name}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">
          No products ready for this section yet.
        </p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
