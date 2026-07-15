"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ExternalLink,
  Eye,
  EyeOff,
  PackageSearch,
  Pencil,
  Plus,
  Search,
  X,
} from "lucide-react";
import {
  useAdminListProductsQuery,
  useAdminUpdateProductMutation,
} from "@/lib/catalogApi";
import { formatINR } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isFetching, isError } =
    useAdminListProductsQuery({
      page,
      search: search || undefined,
      limit: 20,
    });
  const [updateProduct] = useAdminUpdateProductMutation();

  function handleSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput("");
    setSearch("");
    setPage(1);
  }

  async function toggleActive(id: string, next: boolean) {
    setBusyId(id);
    setActionError(null);
    try {
      await updateProduct({ id, body: { active: next } }).unwrap();
    } catch (caught) {
      const apiError = caught as {
        data?: { error?: { message?: string } };
      };
      setActionError(
        apiError.data?.error?.message ??
          "The product visibility could not be updated.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-4 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <form
            onSubmit={handleSearch}
            role="search"
            className="flex w-full max-w-2xl gap-2"
          >
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search products</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search product name or slug"
                className="h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] pl-10 pr-10 text-sm outline-none transition placeholder:text-muted-foreground focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-black/[0.05] hover:text-foreground"
                  aria-label="Clear product search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </label>
            <button
              type="submit"
              className="h-11 rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold shadow-sm hover:bg-black/[0.03]"
            >
              Search
            </button>
          </form>

          <div className="flex items-center justify-between gap-4 lg:justify-end">
            <div className="text-right">
              <p className="text-xs font-semibold text-foreground">
                {data ? data.total : "—"} products
              </p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {search ? "Filtered catalog" : "Complete catalog"}
              </p>
            </div>
            <Link
              href="/admin/products/new"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95"
            >
              <Plus className="h-4 w-4" />
              New product
            </Link>
          </div>
        </div>
      </section>

      {actionError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Products could not be loaded. Check the API connection and try again.
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <div className="overflow-x-auto">
          <table className="min-w-[880px] w-full text-sm">
            <thead className="border-b border-black/[0.06] bg-[#faf9f6]">
              <tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">Category</th>
                <th className="px-5 py-4 text-right">Price</th>
                <th className="px-5 py-4 text-right">Variants</th>
                <th className="px-5 py-4">Visibility</th>
                <th className="px-5 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className={isFetching && data ? "opacity-60" : undefined}>
              {data?.items.map((product) => (
                <tr
                  key={product.id}
                  className="border-b border-black/[0.055] last:border-0 hover:bg-[#fcfbf8]"
                >
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f2f0e9] text-sm font-bold text-muted-foreground">
                        {product.name.charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <Link
                          href={"/admin/products/" + product.id}
                          className="block max-w-xs truncate font-semibold hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="mt-1 max-w-xs truncate text-[11px] text-muted-foreground">
                          /{product.slug}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {product.category.name}
                  </td>
                  <td className="px-5 py-4 text-right font-semibold tabular-nums">
                    {formatINR(product.basePrice)}
                  </td>
                  <td className="px-5 py-4 text-right tabular-nums text-muted-foreground">
                    {product.variantCount}
                  </td>
                  <td className="px-5 py-4">
                    {product.active ? (
                      <StatusPill tone="success">Active</StatusPill>
                    ) : (
                      <StatusPill tone="neutral">Hidden</StatusPill>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-1.5">
                      <Link
                        href={"/admin/products/" + product.id}
                        className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
                        aria-label={"Edit " + product.name}
                        title="Edit product"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <Link
                        href={"/shop/" + product.slug}
                        target="_blank"
                        className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
                        aria-label={"View " + product.name + " on storefront"}
                        title="View on storefront"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                      <button
                        type="button"
                        disabled={busyId === product.id}
                        onClick={() =>
                          toggleActive(product.id, !product.active)
                        }
                        className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground disabled:opacity-40"
                        aria-label={
                          (product.active ? "Hide " : "Show ") + product.name
                        }
                        title={
                          product.active
                            ? "Hide from storefront"
                            : "Show on storefront"
                        }
                      >
                        {product.active ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {isFetching && !data &&
                Array.from({ length: 6 }).map((_, index) => (
                  <tr
                    key={index}
                    className="border-b border-black/[0.055] last:border-0"
                  >
                    <td colSpan={6} className="px-5 py-4">
                      <div className="h-10 animate-pulse rounded-xl bg-muted" />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {data && data.items.length === 0 && (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f2f0e9] text-muted-foreground">
              <PackageSearch className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-sm font-semibold">No products found</h2>
            <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
              {search
                ? 'No catalog items match "' + search + '". Try a broader search.'
                : "Create the first product to start building the storefront catalog."}
            </p>
            {search ? (
              <button
                type="button"
                onClick={clearSearch}
                className="mt-4 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-semibold hover:bg-black/[0.03]"
              >
                Clear search
              </button>
            ) : (
              <Link
                href="/admin/products/new"
                className="mt-4 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
              >
                Create product
              </Link>
            )}
          </div>
        )}

        {data && data.totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-black/[0.06] bg-[#faf9f6] px-5 py-4 text-sm">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-black/[0.03] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page <strong className="text-foreground">{data.page}</strong> of{" "}
              {data.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((current) => current + 1)}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-black/[0.03] disabled:opacity-40"
            >
              Next
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}
