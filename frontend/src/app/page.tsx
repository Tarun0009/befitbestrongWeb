"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import {
  useGetCategoriesQuery,
  useGetProductsQuery,
  type CatalogListItem,
} from "@/lib/catalogApi";
import { useGetSiteConfigQuery } from "@/lib/siteConfigApi";
import { HeroCarousel } from "@/components/HeroCarousel";
import { TabbedFeaturedGrid } from "@/components/TabbedFeaturedGrid";
import { DEFAULT_HOMEPAGE_CONTENT } from "@/features/homepage/homepageContent";

const RecentlyViewedRail = dynamic(
  () =>
    import("@/features/discovery/RecentlyViewedRail").then(
      (module) => module.RecentlyViewedRail,
    ),
  { ssr: false },
);

export default function HomePage() {
  const { data: config } = useGetSiteConfigQuery();
  const { data: cats } = useGetCategoriesQuery();
  const { data: recent, isLoading: productsLoading } = useGetProductsQuery({ limit: 12 });

  const featured = useMemo<CatalogListItem[]>(() => {
    if (!recent) return [];
    const featuredIds = config?.featuredProductIds ?? [];
    if (featuredIds.length === 0) return recent.items.slice(0, 12);
    const byId = new Map(recent.items.map((p) => [p.id, p]));
    const ordered = featuredIds
      .map((id) => byId.get(id))
      .filter((p): p is CatalogListItem => Boolean(p));
    const filler = recent.items.filter((p) => !featuredIds.includes(p.id));
    return [...ordered, ...filler].slice(0, 12);
  }, [config, recent]);

  const fallbackHeroImage = featured.find((p) => p.image?.url)?.image?.url;
  const spotlight = config?.spotlight;
  const homepage = config?.homepage ?? DEFAULT_HOMEPAGE_CONTENT;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <HeroCarousel
        config={config}
        fallbackImage={fallbackHeroImage}
      />

      {homepage.valueProps.enabled && homepage.valueProps.items.length > 0 && (
        <section className="border-b border-border bg-muted/40">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
          {homepage.valueProps.items.map((item) => (
            <div key={item.mark + "-" + item.title} className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
                {item.mark}
              </span>
              <span>
                <span className="block text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                  {item.body}
                </span>
              </span>
            </div>
          ))}
        </div>
        </section>
      )}

      {homepage.categories.enabled && homepage.categories.items.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {homepage.categories.eyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {homepage.categories.title}
            </h2>
          </div>
          <Link
            href={homepage.categories.ctaHref}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
          >
            {homepage.categories.ctaLabel}
          </Link>
        </div>

        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {homepage.categories.items.map((tile) => {
            const meta = cats?.items.find((c) => c.slug === tile.slug);
            return (
              <Link
                key={tile.slug}
                href={`/shop?category=${tile.slug}`}
                className="group overflow-hidden rounded-lg border border-border bg-background transition-colors hover:border-foreground/40"
              >
                <div className="aspect-[4/3] overflow-hidden bg-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={tile.imageUrl}
                    alt={tile.title + " collection"}
                    width={900}
                    height={675}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                  />
                </div>
                <div className="p-4">
                  <p className="text-xs font-medium uppercase tracking-widest text-primary-emphasis">
                    {tile.tag}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold">{tile.title}</h3>
                    {meta && (
                      <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary-foreground ring-1 ring-inset ring-primary/25">
                        {meta.productCount}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 min-h-10 text-sm leading-5 text-muted-foreground">
                    {tile.blurb}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
        </section>
      )}

      {homepage.featured.enabled && (
        <section className="border-y border-border bg-muted/35">
        <div className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                {homepage.featured.eyebrow}
              </p>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight">
                {homepage.featured.title}
              </h2>
            </div>
            <Link
              href={homepage.featured.ctaHref}
              className="text-sm font-medium underline underline-offset-4 hover:text-muted-foreground"
            >
              {homepage.featured.ctaLabel}
            </Link>
          </div>
          <div className="mt-7">
            <TabbedFeaturedGrid products={featured} loading={productsLoading} />
          </div>
        </div>
        </section>
      )}

      {homepage.recentlyViewedEnabled && (
        <div className="mx-auto max-w-6xl px-6">
          <RecentlyViewedRail />
        </div>
      )}
      {spotlight?.enabled && spotlight.title && (
        <section className="border-b border-border">
          <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 sm:py-16 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              {spotlight.eyebrow && (
                <p className="text-xs font-medium uppercase tracking-widest text-primary-emphasis">
                  {spotlight.eyebrow}
                </p>
              )}
              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                {spotlight.title}
              </h2>
              {spotlight.body && (
                <p className="mt-4 max-w-xl leading-7 text-muted-foreground">
                  {spotlight.body}
                </p>
              )}
              {spotlight.ctaLabel && spotlight.ctaHref && (
                <Link
                  href={spotlight.ctaHref}
                  className="mt-7 inline-flex rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
                >
                  {spotlight.ctaLabel}
                </Link>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              {homepage.spotlightBullets.map((item) => (
                <div
                  key={item.title}
                  className="rounded-lg border border-border bg-background p-4"
                >
                  <p className="font-semibold">{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {homepage.support.enabled && (
        <section className="mx-auto max-w-6xl px-6 py-14 sm:py-16">
        <div className="grid gap-6 border-y border-border py-10 lg:grid-cols-[1fr_420px] lg:items-center">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              {homepage.support.eyebrow}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">
              {homepage.support.title}
            </h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground">
              {homepage.support.body}
            </p>
          </div>
          <div className="rounded-lg border border-border bg-muted/35 p-5">
            <p className="text-sm leading-6 text-muted-foreground">
              {homepage.support.cardBody}
            </p>
            <Link
              href={homepage.support.ctaHref}
              className="mt-4 inline-flex rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
            >
              {homepage.support.ctaLabel}
            </Link>
          </div>
        </div>
        </section>
      )}
    </main>
  );
}
