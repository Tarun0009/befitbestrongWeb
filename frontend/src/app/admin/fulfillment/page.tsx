"use client";

import { useState } from "react";
import Link from "next/link";
import { RefreshCw, Truck, XCircle } from "lucide-react";
import {
  useAdminCancelCourierShipmentMutation,
  useAdminGetFulfillmentConfigQuery,
  useAdminListShipmentsQuery,
  useAdminReconcileShipmentMutation,
  type ShipmentStatus,
} from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUSES: ShipmentStatus[] = [
  "LABEL_CREATED",
  "PICKED_UP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RTO_IN_TRANSIT",
  "RETURNED",
  "CANCELLED",
];

export default function AdminFulfillmentPage() {
  const [status, setStatus] = useState<ShipmentStatus | undefined>();
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: config } = useAdminGetFulfillmentConfigQuery();
  const { data, isFetching, error } = useAdminListShipmentsQuery({
    status,
    page,
    limit: 25,
  });
  const [reconcile, { isLoading: reconciling }] =
    useAdminReconcileShipmentMutation();
  const [cancelShipment, { isLoading: cancelling }] =
    useAdminCancelCourierShipmentMutation();

  async function handleReconcile(id: string) {
    setActionError(null);
    try {
      await reconcile(id).unwrap();
    } catch (err) {
      const response = err as { data?: { error?: { message?: string } } };
      setActionError(
        response.data?.error?.message ?? "Shipment sync failed.",
      );
    }
  }

  async function handleCancel(id: string) {
    if (
      !window.confirm(
        "Cancel this AWB with the courier? This does not cancel or refund the customer order.",
      )
    ) {
      return;
    }
    setActionError(null);
    try {
      await cancelShipment(id).unwrap();
    } catch (err) {
      const response = err as { data?: { error?: { message?: string } } };
      setActionError(
        response.data?.error?.message ?? "Shipment cancellation failed.",
      );
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Courier operations</h2>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              AWBs, labels, pickups, tracking synchronization, and exceptions.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
              config?.configured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-800",
            )}
          >
            {config?.configured
              ? config.provider + " connected"
              : "Manual fallback active"}
          </span>
        </div>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Shipment status">
          <FilterChip
            label="All shipments"
            active={!status}
            onClick={() => {
              setStatus(undefined);
              setPage(1);
            }}
          />
          {STATUSES.map((item) => (
            <FilterChip
              key={item}
              label={formatStatus(item)}
              active={status === item}
              onClick={() => {
                setStatus(item);
                setPage(1);
              }}
            />
          ))}
        </nav>
      </section>

      {(error || actionError) && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {actionError ?? "Fulfillment operations could not be loaded."}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <header className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">
              {status ? formatStatus(status) : "All shipments"}
            </h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data?.total ?? 0} matching shipment
              {(data?.total ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          {isFetching && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Updating…
            </span>
          )}
        </header>

        {!data || data.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <Truck className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">No shipments found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Dispatch an eligible order to create the first fulfillment record.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b border-black/[0.06] bg-[#faf9f6]">
                <tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  <th className="px-5 py-4">Order</th>
                  <th className="px-5 py-4">Courier / AWB</th>
                  <th className="px-5 py-4">Shipment</th>
                  <th className="px-5 py-4">Pickup / sync</th>
                  <th className="px-5 py-4 text-right">Total</th>
                  <th className="px-5 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className={isFetching ? "opacity-60" : undefined}>
                {data.items.map((shipment) => (
                  <tr
                    key={shipment.id}
                    className="border-b border-black/[0.055] last:border-0 hover:bg-[#fcfbf8]"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={"/admin/orders/" + shipment.order.id}
                        className="font-mono text-xs font-semibold hover:underline"
                      >
                        #{shipment.order.id.slice(0, 10)}
                      </Link>
                      <p className="mt-1 max-w-[13rem] truncate text-[11px] text-muted-foreground">
                        {shipment.order.contactEmail}
                      </p>
                      <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                        {shipment.order.paymentMethod}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-semibold">{shipment.carrier}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">
                        {shipment.trackingNumber}
                      </p>
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        via {shipment.provider}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <ShipmentPill status={shipment.status} />
                      {shipment.events[0]?.description && (
                        <p className="mt-2 max-w-[14rem] text-[11px] text-muted-foreground">
                          {shipment.events[0].description}
                        </p>
                      )}
                      {shipment.syncError && (
                        <p className="mt-2 max-w-[14rem] text-[11px] text-red-700">
                          {shipment.syncError}
                        </p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <p>
                        {shipment.pickupScheduledAt
                          ? new Date(
                              shipment.pickupScheduledAt,
                            ).toLocaleString("en-IN")
                          : "Not scheduled"}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Sync:{" "}
                        {shipment.lastSyncedAt
                          ? new Date(shipment.lastSyncedAt).toLocaleString(
                              "en-IN",
                            )
                          : "waiting"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-right font-semibold tabular-nums">
                      {formatINR(shipment.order.total)}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        {shipment.labelUrl && (
                          <a
                            href={shipment.labelUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold hover:bg-black/[0.03]"
                          >
                            Label
                          </a>
                        )}
                        {shipment.provider === "shiprocket" && (
                          <button
                            type="button"
                            disabled={reconciling}
                            onClick={() => handleReconcile(shipment.id)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold hover:bg-black/[0.03] disabled:opacity-50"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Sync
                          </button>
                        )}
                        {shipment.provider === "shiprocket" &&
                          ["LABEL_CREATED", "DELIVERY_FAILED"].includes(
                            shipment.status,
                          ) && (
                            <button
                              type="button"
                              disabled={cancelling}
                              onClick={() => handleCancel(shipment.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Cancel AWB
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-black/[0.06] bg-[#faf9f6] px-5 py-4">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {data.totalPages}
            </span>
            <button
              type="button"
              disabled={page >= data.totalPages}
              onClick={() => setPage((value) => value + 1)}
              className="rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </footer>
        )}
      </section>
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
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full px-3.5 py-2 text-xs font-semibold",
        active
          ? "bg-[#171714] text-white"
          : "border border-black/10 bg-white text-muted-foreground hover:bg-black/[0.03]",
      )}
    >
      {label}
    </button>
  );
}

function ShipmentPill({ status }: { status: ShipmentStatus }) {
  const failure = ["DELIVERY_FAILED", "RTO_IN_TRANSIT"].includes(status);
  const complete = status === "DELIVERED";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider",
        complete
          ? "bg-emerald-100 text-emerald-700"
          : failure
            ? "bg-red-100 text-red-700"
            : "bg-violet-100 text-violet-700",
      )}
    >
      {formatStatus(status)}
    </span>
  );
}

function formatStatus(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
