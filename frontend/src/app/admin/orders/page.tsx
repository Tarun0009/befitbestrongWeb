"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  useAdminListOrdersQuery,
  type OrderStatus,
} from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "REFUNDED",
];

export default function AdminOrdersPage() {
  return (
    <Suspense fallback={<div className="h-40 animate-pulse rounded-lg bg-muted" />}>
      <AdminOrdersContent />
    </Suspense>
  );
}

function AdminOrdersContent() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") as OrderStatus | null) ?? undefined;
  const page = Number(params.get("page") ?? "1");

  const { data, isFetching, error } = useAdminListOrdersQuery({
    status,
    page,
    limit: 20,
  });

  function setQuery(next: { status?: OrderStatus | null; page?: number | null }) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === undefined) p.delete(k);
      else p.set(k, String(v));
    }
    if (next.status !== undefined) p.delete("page");
    router.push(`/admin/orders${p.toString() ? `?${p.toString()}` : ""}`);
  }

  return (
    <div>
      <nav className="flex flex-wrap gap-2">
        <FilterChip
          label="All"
          active={!status}
          onClick={() => setQuery({ status: null })}
        />
        {STATUSES.map((s) => (
          <FilterChip
            key={s}
            label={s}
            active={status === s}
            onClick={() => setQuery({ status: s })}
          />
        ))}
      </nav>

      {error && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          Couldn't load orders.
        </div>
      )}

      {isFetching && !data ? (
        <div className="mt-6 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="mt-10 text-sm text-muted-foreground">
          No orders {status ? `in ${status}` : "yet"}.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-separate border-spacing-y-2 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-muted-foreground">
                <th className="px-3 py-2">Order</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Items</th>
                <th className="px-3 py-2">Total</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Placed</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/admin/orders/${o.id}`)}
                  className="cursor-pointer border-b border-border hover:bg-muted/50"
                >
                  <td className="px-3 py-3">
                    <span className="font-mono text-xs">
                      {o.id.slice(0, 12)}…
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div>{o.user?.name ?? "Guest checkout"}</div>
                    <div className="text-xs text-muted-foreground">
                      {o.user?.email ?? o.contactEmail}
                    </div>
                  </td>
                  <td className="px-3 py-3 tabular-nums">{o._count.items}</td>
                  <td className="px-3 py-3 tabular-nums">
                    {formatINR(o.total)}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill status={o.status} />
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground">
                    {new Date(o.createdAt).toLocaleString("en-IN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <footer className="mt-6 flex items-center justify-between text-sm">
          <button
            disabled={data.page <= 1}
            onClick={() => setQuery({ page: data.page - 1 })}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </span>
          <button
            disabled={data.page >= data.totalPages}
            onClick={() => setQuery({ page: data.page + 1 })}
            className="rounded-md border border-border px-3 py-1.5 hover:bg-muted disabled:opacity-40"
          >
            Next
          </button>
        </footer>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary px-3 py-1 text-xs text-primary-foreground"
          : "rounded-full border border-border px-3 py-1 text-xs hover:bg-muted"
      }
    >
      {label}
    </button>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = {
    PENDING:
      "bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/20",
    PAID:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    SHIPPED:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    DELIVERED:
      "bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/20",
    CANCELLED: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
    FAILED: "border border-red-300 bg-red-50 text-red-700",
    REFUNDED: "bg-muted text-muted-foreground ring-1 ring-inset ring-border",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${tone[status]}`}>
      {status}
    </span>
  );
}




