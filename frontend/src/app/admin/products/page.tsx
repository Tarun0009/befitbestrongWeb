"use client";

import { useState } from "react";
import Link from "next/link";
import {
  useAdminListProductsQuery,
  useAdminUpdateProductMutation,
} from "@/lib/catalogApi";
import { formatINR } from "@/lib/format";
import { StatusPill } from "@/components/StatusPill";

export default function AdminProductsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const { data, isFetching, refetch } = useAdminListProductsQuery({
    page,
    search: search || undefined,
    limit: 20,
  });
  const [updateProduct, { isLoading: saving }] =
    useAdminUpdateProductMutation();

  async function toggleActive(id: string, next: boolean) {
    await updateProduct({ id, body: { active: next } }).unwrap();
    refetch();
  }

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          placeholder="Search by name or slug…"
          className="w-full max-w-sm rounded-md border border-border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">
            {data ? `${data.total} products` : ""}
          </span>
          <Link
            href="/admin/products/new"
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            New product
          </Link>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-separate border-spacing-y-2 text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Product</th>
              <th className="px-3 py-2 font-medium">Category</th>
              <th className="px-3 py-2 text-right font-medium">Price</th>
              <th className="px-3 py-2 text-right font-medium">Variants</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr
                key={p.id}
                className="border-b border-border hover:bg-muted/50"
              >
                <td className="px-3 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{p.slug}</div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {p.category.name}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {formatINR(p.basePrice)}
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  {p.variantCount}
                </td>
                <td className="px-3 py-3">
                  {p.active ? (
                    <StatusPill tone="success">Active</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">Hidden</StatusPill>
                  )}
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/admin/products/${p.id}`}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      Edit
                    </Link>
                    <Link
                      href={`/shop/${p.slug}`}
                      target="_blank"
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted"
                    >
                      View
                    </Link>
                    <button
                      disabled={saving}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleActive(p.id, !p.active);
                      }}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
                    >
                      {p.active ? "Hide" : "Show"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {isFetching && !data && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            )}
            {data && data.items.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  No products match "{search}".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data && data.totalPages > 1 && (
        <footer className="mt-4 flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            disabled={page >= data.totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Next
          </button>
        </footer>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Toggling Active hits <code className="rounded bg-muted px-1 py-0.5">PATCH /admin/products/{"{id}"}</code>{" "}
        and the backend runs{" "}
        <code className="rounded bg-muted px-1 py-0.5">invalidateCatalog(id)</code>, which drops all cached listing keys tagged{" "}
        <code className="rounded bg-muted px-1 py-0.5">catalog:list</code>. The next storefront page load repopulates the cache.
      </p>
    </section>
  );
}
