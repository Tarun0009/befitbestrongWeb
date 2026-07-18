"use client";

import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Grid2X2, Layers3, SlidersHorizontal, Tag } from "lucide-react";
import { useGetCategoriesQuery, useSearchProductsQuery, type SearchSort } from "@/lib/catalogApi";
import { ProductCard } from "@/components/ProductCard";

const SORT_OPTIONS: { value: SearchSort; label: string }[] = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

export default function ShopPage() {
  return <Suspense fallback={<ShopPageSkeleton />}><ShopContent /></Suspense>;
}

function ShopContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? undefined;
  const category = searchParams.get("category") ?? undefined;
  const minPriceParam = searchParams.get("minPrice");
  const maxPriceParam = searchParams.get("maxPrice");
  const sortParam = (searchParams.get("sort") as SearchSort | null) ?? undefined;
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const minPrice = minPriceParam ? Number(minPriceParam) : undefined;
  const maxPrice = maxPriceParam ? Number(maxPriceParam) : undefined;
  const effectiveSort: SearchSort = sortParam ?? (q ? "relevance" : "newest");
  const searchArgs = useMemo(() => ({ q, category, minPrice, maxPrice, sort: effectiveSort, page, limit: 12 }), [q, category, minPrice, maxPrice, effectiveSort, page]);
  const { data: catData } = useGetCategoriesQuery();
  const { data, isFetching, error, refetch } = useSearchProductsQuery(searchArgs);
  const [minInput, setMinInput] = useState(minPrice !== undefined ? String(minPrice / 100) : "");
  const [maxInput, setMaxInput] = useState(maxPrice !== undefined ? String(maxPrice / 100) : "");

  useEffect(() => {
    setMinInput(minPrice !== undefined ? String(minPrice / 100) : "");
    setMaxInput(maxPrice !== undefined ? String(maxPrice / 100) : "");
  }, [minPrice, maxPrice]);

  function pushQuery(next: { q?: string | null; category?: string | null; minPrice?: number | null; maxPrice?: number | null; sort?: SearchSort | null; page?: number | null }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined || value === "") params.delete(key);
      else params.set(key, String(value));
    }
    if (next.page === undefined) params.delete("page");
    router.push(`/shop${params.toString() ? `?${params.toString()}` : ""}`);
  }

  function applyPriceFilter(event: FormEvent) {
    event.preventDefault();
    const min = minInput ? Math.round(Number(minInput) * 100) : null;
    const max = maxInput ? Math.round(Number(maxInput) * 100) : null;
    pushQuery({ minPrice: Number.isFinite(min) ? min : null, maxPrice: Number.isFinite(max) ? max : null });
  }

  function clearFilters() {
    pushQuery({ q: null, category: null, minPrice: null, maxPrice: null, sort: null });
  }

  const activeFilters = Number(Boolean(q)) + Number(Boolean(category)) + Number(minPrice !== undefined) + Number(maxPrice !== undefined);
  const categories = catData?.items ?? [];
  const catalogTotal = categories.reduce((total, item) => total + item.productCount, 0);

  return (
    <main className="min-h-screen bg-[#f7f6f2]">
      <div className="mx-auto max-w-[1280px] px-4 py-7 sm:px-6 sm:py-9 lg:px-8 lg:py-11">
        <header className="relative overflow-hidden rounded-[2rem] bg-[#191916] px-5 py-7 text-white shadow-[0_18px_60px_rgba(23,23,20,0.14)] sm:px-8 sm:py-9 lg:px-10">
          <div className="pointer-events-none absolute -right-20 -top-28 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-7 sm:flex-row sm:items-end">
            <div>
              <p className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-primary"><Layers3 className="h-3.5 w-3.5" /> Shop all</p>
              <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-[-0.04em] sm:text-5xl">{q ? `Results for “${q}”` : "Everything you need to train."}</h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-white/60 sm:text-base">{q ? "Browse the closest matches across our training collection." : "Supplements, equipment, apparel, and accessories selected for the work."}</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-white/10 bg-white/[0.07] px-4 py-3 text-left sm:min-w-32 sm:text-right"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/45">Showing</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data?.total ?? "—"}</p><p className="text-[11px] text-white/50">products</p></div>
          </div>
        </header>

        <section className="mt-6" aria-labelledby="category-heading">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Find your lane</p><h2 id="category-heading" className="mt-1 text-lg font-semibold tracking-tight">Shop by category</h2></div><span className="hidden text-xs text-muted-foreground sm:block">{categories.length} categories</span></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            <CategoryTile active={!category} label="All products" count={catalogTotal || data?.total} icon={Grid2X2} onClick={() => pushQuery({ category: null })} />
            {categories.map((item) => <CategoryTile key={item.slug} active={category === item.slug} label={item.name} count={item.productCount} icon={Tag} onClick={() => pushQuery({ category: item.slug })} />)}
          </div>
        </section>

        <div className="mt-7 flex items-center justify-between gap-3 lg:hidden">
          <details className="group relative"><summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-black/10 bg-white px-3.5 py-2.5 text-xs font-semibold shadow-sm"><SlidersHorizontal className="h-4 w-4" /> Filters{activeFilters > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] text-primary-foreground">{activeFilters}</span>}<ChevronRight className="h-3.5 w-3.5 transition group-open:rotate-90" /></summary><div className="absolute left-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-black/10 bg-white p-4 shadow-xl"><FilterPanel minInput={minInput} maxInput={maxInput} setMinInput={setMinInput} setMaxInput={setMaxInput} applyPriceFilter={applyPriceFilter} clearFilters={clearFilters} activeFilters={activeFilters} /></div></details>
          <SortSelect value={effectiveSort} hasQuery={Boolean(q)} onChange={(value) => pushQuery({ sort: value })} />
        </div>

        <div className="mt-7 grid gap-7 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="hidden lg:block"><div className="sticky top-28 rounded-2xl border border-black/[0.07] bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Filters</h2>{activeFilters > 0 && <button type="button" onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline">Clear all</button>}</div><div className="mt-5"><FilterPanel minInput={minInput} maxInput={maxInput} setMinInput={setMinInput} setMaxInput={setMaxInput} applyPriceFilter={applyPriceFilter} clearFilters={clearFilters} activeFilters={activeFilters} /></div></div></aside>

          <section className="min-w-0" aria-labelledby="results-heading">
            <div className="hidden items-center justify-between lg:flex"><div><h2 id="results-heading" className="text-lg font-semibold tracking-tight">{category ? categories.find((item) => item.slug === category)?.name ?? "Products" : q ? "Search results" : "Latest products"}</h2><p className="mt-1 text-xs text-muted-foreground">{data ? `${data.total} product${data.total === 1 ? "" : "s"}` : "Loading products…"}{activeFilters > 0 && <><span className="mx-1.5">·</span><button type="button" onClick={clearFilters} className="font-semibold text-primary hover:underline">Clear filters</button></>}</p></div><SortSelect value={effectiveSort} hasQuery={Boolean(q)} onChange={(value) => pushQuery({ sort: value })} /></div>
            {error && <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert"><span>Products could not be loaded right now.</span><button type="button" onClick={() => void refetch()} className="text-xs font-semibold underline">Try again</button></div>}
            {isFetching && !data ? <SkeletonGrid /> : data && data.items.length === 0 ? <EmptyResults hasQuery={Boolean(q)} clearFilters={clearFilters} /> : <div className={`mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 ${isFetching ? "opacity-60" : ""}`}>{data?.items.map((product, index) => <ProductCard key={product.id} product={product} priority={index < 4} />)}</div>}
            {data && data.totalPages && data.totalPages > 1 && <nav className="mt-8 flex items-center justify-between rounded-2xl border border-black/[0.07] bg-white px-4 py-3 shadow-sm" aria-label="Product pages"><button type="button" disabled={(data.page ?? 1) <= 1 || isFetching} onClick={() => pushQuery({ page: (data.page ?? 1) - 1 })} className="inline-flex items-center gap-1 rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" /> Previous</button><span className="text-xs text-muted-foreground" aria-live="polite">Page {data.page} of {data.totalPages}</span><button type="button" disabled={(data.page ?? 1) >= data.totalPages || isFetching} onClick={() => pushQuery({ page: (data.page ?? 1) + 1 })} className="inline-flex items-center gap-1 rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">Next <ChevronRight className="h-4 w-4" /></button></nav>}
          </section>
        </div>
      </div>
    </main>
  );
}

function CategoryTile({ label, count, active, icon: Icon, onClick }: { label: string; count?: number; active: boolean; icon: typeof Tag; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`group flex min-h-[4.6rem] items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition sm:px-4 ${active ? "border-foreground bg-foreground text-background shadow-sm" : "border-black/[0.07] bg-white text-foreground shadow-sm hover:-translate-y-0.5 hover:border-black/20"}`}><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${active ? "bg-primary text-primary-foreground" : "bg-[#f3f1eb] text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block truncate text-xs font-semibold sm:text-sm">{label}</span><span className={`mt-1 block text-[10px] ${active ? "text-background/60" : "text-muted-foreground"}`}>{count === undefined ? "Browse collection" : `${count} product${count === 1 ? "" : "s"}`}</span></span></button>;
}

function FilterPanel({ minInput, maxInput, setMinInput, setMaxInput, applyPriceFilter, clearFilters, activeFilters }: { minInput: string; maxInput: string; setMinInput: (value: string) => void; setMaxInput: (value: string) => void; applyPriceFilter: (event: FormEvent) => void; clearFilters: () => void; activeFilters: number }) {
  return <div><div className="flex items-center justify-between"><p className="text-xs font-semibold">Price range</p>{activeFilters > 0 && <button type="button" onClick={clearFilters} className="text-[11px] font-semibold text-primary hover:underline lg:hidden">Reset</button>}</div><form onSubmit={applyPriceFilter} className="mt-3 space-y-3"><div className="grid grid-cols-2 gap-2"><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Min<input type="number" min={0} step={1} value={minInput} onChange={(event) => setMinInput(event.target.value)} placeholder="₹0" className="mt-1.5 h-10 w-full rounded-xl border border-black/10 bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Max<input type="number" min={0} step={1} value={maxInput} onChange={(event) => setMaxInput(event.target.value)} placeholder="Any" className="mt-1.5 h-10 w-full rounded-xl border border-black/10 bg-background px-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label></div><button type="submit" className="w-full rounded-xl bg-foreground px-3 py-2.5 text-xs font-semibold text-background transition hover:opacity-90">Apply price</button></form></div>;
}

function SortSelect({ value, hasQuery, onChange }: { value: SearchSort; hasQuery: boolean; onChange: (value: SearchSort) => void }) {
  return <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">Sort<select value={value} onChange={(event) => onChange(event.target.value as SearchSort)} className="rounded-xl border border-black/10 bg-white px-3 py-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">{SORT_OPTIONS.map((option) => <option key={option.value} value={option.value} disabled={option.value === "relevance" && !hasQuery}>{option.label}</option>)}</select></label>;
}

function EmptyResults({ hasQuery, clearFilters }: { hasQuery: boolean; clearFilters: () => void }) {
  return <section className="mt-5 rounded-3xl border border-dashed border-black/15 bg-white px-6 py-16 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#f3f1eb] text-muted-foreground"><Tag className="h-5 w-5" /></span><h2 className="mt-4 text-lg font-semibold">No products found</h2><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{hasQuery ? "Try a broader search or browse a category." : "Try removing a filter to see more products."}</p><button type="button" onClick={clearFilters} className="mt-5 rounded-xl bg-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground">Clear filters</button></section>;
}

function SkeletonGrid() {
  return <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{Array.from({ length: 8 }).map((_, index) => <div key={index} className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white"><div className="aspect-square animate-pulse bg-muted" /><div className="space-y-2 p-4"><div className="h-4 w-3/4 animate-pulse rounded bg-muted" /><div className="h-3 w-1/2 animate-pulse rounded bg-muted" /><div className="h-5 w-1/3 animate-pulse rounded bg-muted" /></div></div>)}</div>;
}

function ShopPageSkeleton() {
  return <main className="min-h-screen bg-[#f7f6f2] px-4 py-7 sm:px-6 sm:py-9"><div className="mx-auto max-w-[1280px]"><div className="h-48 animate-pulse rounded-[2rem] bg-[#e8e5dd]" /><SkeletonGrid /></div></main>;
}