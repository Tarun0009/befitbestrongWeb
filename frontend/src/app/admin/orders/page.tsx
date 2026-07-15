"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight, ClipboardList, SlidersHorizontal } from "lucide-react";
import {
  useAdminListOrdersQuery,
  type OrderStatus,
} from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PAID",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "FAILED",
  "REFUNDED",
];

export default function AdminOrdersPage() {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-2xl border border-black/[0.07] bg-white" />
      }
    >
      <AdminOrdersContent />
    </Suspense>
  );
}

function AdminOrdersContent() {
  const router = useRouter();
  const params = useSearchParams();
  const status = (params.get("status") as OrderStatus | null) ?? undefined;
  const page = Math.max(1, Number(params.get("page") ?? "1"));

  const { data, isFetching, error } = useAdminListOrdersQuery({
    status,
    page,
    limit: 20,
  });

  function setQuery(next: { status?: OrderStatus | null; page?: number | null }) {
    const nextParams = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === null || value === undefined) nextParams.delete(key);
      else nextParams.set(key, String(value));
    }
    if (next.status !== undefined) nextParams.delete("page");
    router.push(
      "/admin/orders" +
        (nextParams.toString() ? "?" + nextParams.toString() : ""),
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-4 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-5">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <SlidersHorizontal className="h-4 w-4" />
          Filter order pipeline
        </div>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Order status">
          <FilterChip
            label="All orders"
            active={!status}
            onClick={() => setQuery({ status: null })}
          />
          {STATUSES.map((item) => (
            <FilterChip
              key={item}
              label={titleCase(item)}
              active={status === item}
              onClick={() => setQuery({ status: item })}
            />
          ))}
        </nav>
      </section>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          Orders could not be loaded. Check the API connection and try again.
        </div>
      )}

      {isFetching && !data ? (
        <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white p-5">
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-14 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        </section>
      ) : !data || data.items.length === 0 ? (
        <section className="flex flex-col items-center rounded-2xl border border-dashed border-black/10 bg-white px-6 py-16 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f2f0e9] text-muted-foreground">
            <ClipboardList className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-sm font-semibold">No orders found</h2>
          <p className="mt-1 max-w-sm text-xs leading-5 text-muted-foreground">
            {status
              ? "There are currently no " +
                titleCase(status).toLowerCase() +
                " orders."
              : "New customer orders will appear here as soon as checkout is completed."}
          </p>
          {status && (
            <button
              type="button"
              onClick={() => setQuery({ status: null })}
              className="mt-4 rounded-xl border border-black/10 bg-white px-4 py-2 text-xs font-semibold hover:bg-black/[0.03]"
            >
              View all orders
            </button>
          )}
        </section>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
          <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold">
                {status ? titleCase(status) + " orders" : "All orders"}
              </h2>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {data.total} matching order{data.total === 1 ? "" : "s"}
              </p>
            </div>
            {isFetching && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Updating…
              </span>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="border-b border-black/[0.06] bg-[#faf9f6]">
                <tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Customer</th>
                  <th className="px-5 py-4 text-center">Items</th>
                  <th className="px-5 py-4 text-right">Total</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Placed</th>
                  <th className="px-5 py-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className={isFetching ? "opacity-60" : undefined}>
                {data.items.map((order) => (
                  <tr
                    key={order.id}
                    className="border-b border-black/[0.055] last:border-0 hover:bg-[#fcfbf8]"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={"/admin/orders/" + order.id}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        #{order.id.slice(0, 10)}
                      </Link>
                    </td>
                    <td className="px-5 py-4">
                      <p className="max-w-[16rem] truncate font-semibold">
                        {order.user?.name ?? "Guest checkout"}
                      </p>
                      <p className="mt-1 max-w-[16rem] truncate text-[11px] text-muted-foreground">
                        {order.user?.email ?? order.contactEmail}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-center tabular-nums text-muted-foreground">
                      {order._count.items}
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">
                      {formatINR(order.total)}
                      <p className="mt-1 text-[10px] font-medium text-muted-foreground">
                        {order.paymentMethod === "COD" ? "COD" : "Online"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <OrderStatusPill status={order.status} />
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-xs font-medium">
                        {new Date(order.createdAt).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {new Date(order.createdAt).toLocaleTimeString("en-IN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        href={"/admin/orders/" + order.id}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-black/10 px-3 text-xs font-semibold text-muted-foreground transition hover:bg-black/[0.04] hover:text-foreground"
                      >
                        Open
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <footer className="flex items-center justify-between border-t border-black/[0.06] bg-[#faf9f6] px-5 py-4 text-sm">
              <button
                type="button"
                disabled={data.page <= 1}
                onClick={() => setQuery({ page: data.page - 1 })}
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
                disabled={data.page >= data.totalPages}
                onClick={() => setQuery({ page: data.page + 1 })}
                className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-black/[0.03] disabled:opacity-40"
              >
                Next
              </button>
            </footer>
          )}
        </section>
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
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3.5 py-2 text-xs font-semibold transition",
        active
          ? "bg-[#171714] text-white shadow-sm"
          : "border border-black/10 bg-white text-muted-foreground hover:bg-black/[0.03] hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

function OrderStatusPill({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = {
    PENDING: "bg-orange-100 text-orange-700",
    CONFIRMED: "bg-blue-100 text-blue-700",
    PAID: "bg-blue-100 text-blue-700",
    SHIPPED: "bg-violet-100 text-violet-700",
    DELIVERED: "bg-emerald-100 text-emerald-700",
    CANCELLED: "bg-slate-100 text-slate-600",
    FAILED: "bg-red-100 text-red-700",
    REFUNDED: "bg-rose-100 text-rose-700",
  };

  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        tone[status],
      )}
    >
      {titleCase(status)}
    </span>
  );
}

function titleCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

