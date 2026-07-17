"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  useAdminGetOrderQuery,
  useAdminGetFulfillmentConfigQuery,
  useAdminBookCourierMutation,
  useAdminGetCourierRatesMutation,
  useAdminCreateShipmentMutation,
  useAdminCreateRefundMutation,
  useAdminReconcileRefundMutation,
  useAdminOrderTransitionMutation,
  type AdminTransitionAction,
  type OrderStatus,
  type RefundIntentStatus,
} from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";

const ACTION_BY_TARGET: Record<
  Extract<OrderStatus, "SHIPPED" | "DELIVERED" | "CANCELLED">,
  { label: string; action: AdminTransitionAction; danger?: boolean }
> = {
  SHIPPED: { label: "Mark shipped", action: "ship" },
  DELIVERED: { label: "Mark delivered", action: "deliver" },
  CANCELLED: { label: "Cancel", action: "cancel", danger: true },
};

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const { data, isLoading, error } = useAdminGetOrderQuery(params.id, {
    skip: !params.id,
  });
  const [runTransition, { isLoading: acting }] =
    useAdminOrderTransitionMutation();
  const [createRefund, { isLoading: refunding }] =
    useAdminCreateRefundMutation();
  const [reconcileRefund, { isLoading: reconcilingRefund }] =
    useAdminReconcileRefundMutation();
  const [createShipment, { isLoading: dispatching }] =
    useAdminCreateShipmentMutation();
  const { data: fulfillmentConfig } = useAdminGetFulfillmentConfigQuery();
  const [bookCourier, { isLoading: bookingCourier }] =
    useAdminBookCourierMutation();
  const [getCourierRates, { isLoading: loadingRates }] =
    useAdminGetCourierRatesMutation();
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundRequestKey, setRefundRequestKey] = useState<string | null>(null);
  const [refundSuccess, setRefundSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);
  const [dispatchForm, setDispatchForm] = useState({
    carrier: "",
    service: "",
    trackingNumber: "",
    trackingUrl: "",
    estimatedDeliveryAt: "",
    note: "",
  });
  const [parcelForm, setParcelForm] = useState({
    weightKg: "0.5",
    lengthCm: "15",
    breadthCm: "10",
    heightCm: "10",
    courierId: "",
    pickupDate: "",
  });
  const [courierRates, setCourierRates] = useState<
    Array<{
      courierId: string;
      courierName: string;
      rate: number;
      codCharges: number;
      estimatedDays?: number;
      rating?: number;
    }>
  >([]);

  if (error) {
    return (
      <div className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
        Order not found.
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  const { order, allowedTransitions, refundSummary } = data;
  const buttons = allowedTransitions
    .filter((status) => status !== "SHIPPED")
    .map((s) =>
      s in ACTION_BY_TARGET
        ? { to: s, ...ACTION_BY_TARGET[s as keyof typeof ACTION_BY_TARGET] }
        : null,
    )
    .filter((b): b is NonNullable<typeof b> => Boolean(b));
  const canDispatch = allowedTransitions.includes("SHIPPED");
  const canCreateShipment = canDispatch && !order.shipments?.length;

  function parcelRequest() {
    return {
      weightKg: Number(parcelForm.weightKg),
      lengthCm: Number(parcelForm.lengthCm),
      breadthCm: Number(parcelForm.breadthCm),
      heightCm: Number(parcelForm.heightCm),
      ...(parcelForm.courierId.trim()
        ? { courierId: parcelForm.courierId.trim() }
        : {}),
      ...(parcelForm.pickupDate
        ? { pickupDate: parcelForm.pickupDate }
        : {}),
    };
  }

  async function handleRateCheck() {
    setActionError(null);
    try {
      const result = await getCourierRates({
        id: order.id,
        body: parcelRequest(),
      }).unwrap();
      setCourierRates(result.items);
      if (result.items.length === 0) {
        setActionError(
          "No courier service is available for this parcel and destination.",
        );
      }
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(
        e.data?.error?.message ?? "Courier rates could not be loaded.",
      );
    }
  }

  async function handleCourierBooking(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setActionError(null);
    setDispatchSuccess(null);
    try {
      await bookCourier({
        id: order.id,
        body: parcelRequest(),
      }).unwrap();
      setDispatchSuccess(
        "AWB, label, and pickup are ready. The order will move to shipped when the courier confirms pickup.",
      );
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(
        e.data?.error?.message ?? "Courier booking could not be completed.",
      );
    }
  }

  async function handleDispatch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setDispatchSuccess(null);
    try {
      await createShipment({
        id: order.id,
        body: {
          carrier: dispatchForm.carrier.trim(),
          trackingNumber: dispatchForm.trackingNumber.trim(),
          ...(dispatchForm.service.trim()
            ? { service: dispatchForm.service.trim() }
            : {}),
          ...(dispatchForm.trackingUrl.trim()
            ? { trackingUrl: dispatchForm.trackingUrl.trim() }
            : {}),
          ...(dispatchForm.estimatedDeliveryAt
            ? {
                estimatedDeliveryAt: new Date(
                  dispatchForm.estimatedDeliveryAt,
                ).toISOString(),
              }
            : {}),
          ...(dispatchForm.note.trim()
            ? { note: dispatchForm.note.trim() }
            : {}),
        },
      }).unwrap();
      setDispatchForm({
        carrier: "",
        service: "",
        trackingNumber: "",
        trackingUrl: "",
        estimatedDeliveryAt: "",
        note: "",
      });
      setDispatchSuccess("Shipment created and customer tracking is now active.");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(e.data?.error?.message ?? "Could not dispatch this order.");
    }
  }

  async function handleAction(action: AdminTransitionAction) {
    setActionError(null);
    try {
      await runTransition({
        id: order.id,
        action,
        note: note.trim() || undefined,
      }).unwrap();
      setNote("");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(e.data?.error?.message ?? "Transition failed.");
    }
  }

  async function handleRefund(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setActionError(null);
    setRefundSuccess(null);
    const amount = refundAmount.trim()
      ? Math.round(Number(refundAmount) * 100)
      : refundSummary.refundableAmount;
    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0 ||
      amount > refundSummary.refundableAmount
    ) {
      setActionError("Enter an amount within the available refundable balance.");
      return;
    }
    if (refundReason.trim().length < 3) {
      setActionError("Add a refund reason with at least 3 characters.");
      return;
    }

    // Retain the same key after an ambiguous network failure. A successful
    // response clears it so the next commercial action receives a new key.
    const idempotencyKey = refundRequestKey ?? crypto.randomUUID();
    setRefundRequestKey(idempotencyKey);
    try {
      const result = await createRefund({
        id: order.id,
        amount,
        reason: refundReason.trim(),
        idempotencyKey,
      }).unwrap();
      const latest = result.intents[0];
      setRefundSuccess(
        latest?.status === "PROCESSED"
          ? "Refund processed and recorded in the ledger."
          : "Refund accepted. Provider confirmation is being reconciled.",
      );
      setRefundAmount("");
      setRefundReason("");
      setRefundRequestKey(null);
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(e.data?.error?.message ?? "Refund could not be submitted.");
    }
  }

  async function handleRefundReconcile(refundId: string) {
    setActionError(null);
    setRefundSuccess(null);
    try {
      await reconcileRefund({ id: refundId, orderId: order.id }).unwrap();
      setRefundSuccess("Refund status refreshed from the payment provider.");
    } catch (err) {
      const e = err as { data?: { error?: { message?: string } } };
      setActionError(
        e.data?.error?.message ?? "Refund status could not be refreshed.",
      );
    }
  }

  return (
    <div>
      <nav className="mb-6 text-sm text-muted-foreground">
        <Link href="/admin/orders" className="hover:text-foreground">
          Orders
        </Link>{" "}
        / <span className="font-mono">{order.id}</span>
      </nav>

      <header className="flex items-baseline justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground">
            Order
          </p>
          <h1 className="mt-2 text-3xl font-semibold tabular-nums">
            {formatINR(order.total)}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {order.user?.name ?? "Guest checkout"} · {order.user?.email ?? order.contactEmail}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Placed {new Date(order.createdAt).toLocaleString("en-IN")}
          </p>
        </div>
        <StatusPill status={order.status} />
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section>
            <h2 className="font-medium">Items</h2>
            <ul className="mt-3 space-y-3">
              {order.items.map((line) => (
                <li
                  key={line.id}
                  className="flex gap-4 rounded-lg border border-border p-5"
                >
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md bg-muted">
                    {line.productSnapshot.image?.url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={line.productSnapshot.image.url}
                        alt={
                          line.productSnapshot.image.alt ??
                          line.productSnapshot.name
                        }
                        className="h-full w-full object-cover"
                      />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">
                          {line.productSnapshot.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[
                            line.productSnapshot.size,
                            line.productSnapshot.color,
                          ]
                            .filter(Boolean)
                            .join(" / ") || line.productSnapshot.sku}
                        </p>
                        <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                          {formatINR(line.unitPrice)} × {line.quantity}
                        </p>
                      </div>
                      <p className="text-sm font-medium tabular-nums">
                        {formatINR(line.subtotal)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h2 className="font-medium">History</h2>
            <ol className="mt-3 space-y-2 border-l border-border pl-4">
              {order.history.map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-foreground" />
                  <p className="text-sm">
                    {h.fromStatus ? (
                      <>
                        <span className="text-muted-foreground">
                          {h.fromStatus}
                        </span>{" "}
                        →{" "}
                      </>
                    ) : (
                      <span className="text-muted-foreground">created — </span>
                    )}
                    <span className="font-medium">{h.toStatus}</span>{" "}
                    <span className="text-xs text-muted-foreground">
                      · {h.actorKind}
                    </span>
                  </p>
                  {h.note && (
                    <p className="text-xs text-muted-foreground">
                      {h.note}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {new Date(h.createdAt).toLocaleString("en-IN")}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-lg border border-border p-5">
            <h2 className="font-medium">Fulfillment</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Courier handoff and customer-visible tracking.
            </p>

            {canCreateShipment && fulfillmentConfig?.configured && (
              <form
                className="mt-4 space-y-3 rounded-lg border border-primary/20 bg-primary/[0.035] p-3"
                onSubmit={handleCourierBooking}
              >
                <div>
                  <p className="text-sm font-semibold">Book with Shiprocket</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Creates the provider order, AWB, label, and pickup request.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-xs font-medium">Weight (kg)</span>
                    <input
                      required
                      type="number"
                      min="0.05"
                      max="100"
                      step="0.01"
                      value={parcelForm.weightKg}
                      onChange={(event) =>
                        setParcelForm({
                          ...parcelForm,
                          weightKg: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Length (cm)</span>
                    <input
                      required
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      value={parcelForm.lengthCm}
                      onChange={(event) =>
                        setParcelForm({
                          ...parcelForm,
                          lengthCm: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Breadth (cm)</span>
                    <input
                      required
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      value={parcelForm.breadthCm}
                      onChange={(event) =>
                        setParcelForm({
                          ...parcelForm,
                          breadthCm: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Height (cm)</span>
                    <input
                      required
                      type="number"
                      min="1"
                      max="300"
                      step="0.1"
                      value={parcelForm.heightCm}
                      onChange={(event) =>
                        setParcelForm({
                          ...parcelForm,
                          heightCm: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  disabled={loadingRates}
                  onClick={handleRateCheck}
                  className="w-full rounded-md border border-primary/25 bg-background px-3 py-2 text-xs font-semibold text-primary hover:bg-primary/[0.05] disabled:opacity-60"
                >
                  {loadingRates ? "Checking service…" : "Compare courier rates"}
                </button>
                {courierRates.length > 0 && (
                  <div className="space-y-2">
                    {courierRates.slice(0, 5).map((rate) => (
                      <button
                        key={rate.courierId}
                        type="button"
                        onClick={() =>
                          setParcelForm({
                            ...parcelForm,
                            courierId: rate.courierId,
                          })
                        }
                        className={`w-full rounded-md border p-2 text-left text-xs ${
                          parcelForm.courierId === rate.courierId
                            ? "border-primary bg-primary/[0.06]"
                            : "border-border bg-background hover:bg-muted/30"
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            {rate.courierName}
                          </span>
                          <span className="tabular-nums">
                            {formatINR(rate.rate)}
                          </span>
                        </span>
                        <span className="mt-1 block text-muted-foreground">
                          {rate.estimatedDays
                            ? `${rate.estimatedDays} days`
                            : "ETA unavailable"}
                          {rate.codCharges > 0
                            ? ` · COD ${formatINR(rate.codCharges)}`
                            : ""}
                          {rate.rating
                            ? ` · Rating ${rate.rating.toFixed(1)}`
                            : ""}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                <label className="block">
                  <span className="text-xs font-medium">
                    Courier ID (optional)
                  </span>
                  <input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={parcelForm.courierId}
                    onChange={(event) =>
                      setParcelForm({
                        ...parcelForm,
                        courierId: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                    placeholder="Auto-select recommended courier"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium">
                    Pickup date (optional)
                  </span>
                  <input
                    type="date"
                    value={parcelForm.pickupDate}
                    onChange={(event) =>
                      setParcelForm({
                        ...parcelForm,
                        pickupDate: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="submit"
                  disabled={bookingCourier}
                  className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {bookingCourier ? "Booking courier…" : "Book AWB and pickup"}
                </button>
              </form>
            )}

            {canCreateShipment && !fulfillmentConfig?.configured && (
              <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Automated booking is not configured. Manual dispatch remains
                available below.
              </p>
            )}

            {canCreateShipment && (
              <form className="mt-4 space-y-3" onSubmit={handleDispatch}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Manual fallback
                </p>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  <label className="block">
                    <span className="text-sm font-medium">Carrier</span>
                    <input
                      required
                      list="carrier-options"
                      value={dispatchForm.carrier}
                      onChange={(event) =>
                        setDispatchForm({
                          ...dispatchForm,
                          carrier: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Delhivery"
                    />
                    <datalist id="carrier-options">
                      <option value="Delhivery" />
                      <option value="Blue Dart" />
                      <option value="DTDC" />
                      <option value="India Post" />
                      <option value="Shiprocket" />
                    </datalist>
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Service (optional)</span>
                    <input
                      value={dispatchForm.service}
                      onChange={(event) =>
                        setDispatchForm({
                          ...dispatchForm,
                          service: event.target.value,
                        })
                      }
                      className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      placeholder="Surface"
                    />
                  </label>
                </div>
                <label className="block">
                  <span className="text-sm font-medium">Tracking number</span>
                  <input
                    required
                    value={dispatchForm.trackingNumber}
                    onChange={(event) =>
                      setDispatchForm({
                        ...dispatchForm,
                        trackingNumber: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm uppercase outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="AWB123456789"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Tracking URL (optional)</span>
                  <input
                    type="url"
                    value={dispatchForm.trackingUrl}
                    onChange={(event) =>
                      setDispatchForm({
                        ...dispatchForm,
                        trackingUrl: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="https://carrier.example/track/..."
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Estimated delivery</span>
                  <input
                    type="datetime-local"
                    value={dispatchForm.estimatedDeliveryAt}
                    onChange={(event) =>
                      setDispatchForm({
                        ...dispatchForm,
                        estimatedDeliveryAt: event.target.value,
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">Dispatch note</span>
                  <textarea
                    value={dispatchForm.note}
                    onChange={(event) =>
                      setDispatchForm({
                        ...dispatchForm,
                        note: event.target.value,
                      })
                    }
                    rows={2}
                    maxLength={500}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Package handed to courier"
                  />
                </label>
                <button
                  type="submit"
                  disabled={dispatching}
                  className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                >
                  {dispatching ? "Creating shipment…" : "Dispatch order"}
                </button>
              </form>
            )}

            {dispatchSuccess && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {dispatchSuccess}
              </p>
            )}
            {actionError && (
              <p className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {actionError}
              </p>
            )}

            {order.shipments?.length ? (
              <ul className="mt-4 space-y-3">
                {order.shipments.map((shipment) => (
                  <li
                    key={shipment.id}
                    className="rounded-md border border-border bg-muted/25 p-3 text-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {shipment.carrier}
                          {shipment.service ? ` · ${shipment.service}` : ""}
                        </p>
                        <p className="mt-1 font-mono text-xs">
                          {shipment.trackingNumber}
                        </p>
                      </div>
                      <span className="rounded-full bg-background px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ring-border">
                        {formatShipmentStatus(shipment.status)}
                      </span>
                    </div>
                    {shipment.trackingUrl && (
                      <a
                        href={shipment.trackingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-block text-xs font-medium underline underline-offset-4"
                      >
                        Open carrier tracking ↗
                      </a>
                    )}
                    {shipment.labelUrl && (
                      <a
                        href={shipment.labelUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-3 mt-2 inline-block text-xs font-medium underline underline-offset-4"
                      >
                        Print label ↗
                      </a>
                    )}
                    {shipment.pickupScheduledAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Pickup scheduled{" "}
                        {new Date(
                          shipment.pickupScheduledAt,
                        ).toLocaleString("en-IN")}
                      </p>
                    )}
                    {shipment.estimatedDeliveryAt && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Estimated{" "}
                        {new Date(
                          shipment.estimatedDeliveryAt,
                        ).toLocaleString("en-IN")}
                      </p>
                    )}
                    {shipment.events[0]?.description && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Latest: {shipment.events[0].description}
                      </p>
                    )}
                    {shipment.syncError && (
                      <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
                        Sync issue: {shipment.syncError}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              !canCreateShipment && (
                <p className="mt-3 text-sm text-muted-foreground">
                  No tracking record is attached to this order.
                </p>
              )
            )}
          </section>

          <section className="rounded-lg border border-border p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-medium">Refunds</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Ledger-backed provider refunds with automatic reconciliation.
                </p>
              </div>
              {refundSummary.pendingAmount > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
                  Provider confirmation pending
                </span>
              )}
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
              <RefundMetric
                label="Processed"
                value={formatINR(refundSummary.processedAmount)}
              />
              <RefundMetric
                label="Pending"
                value={formatINR(refundSummary.pendingAmount)}
              />
              <RefundMetric
                label="Available"
                value={formatINR(refundSummary.refundableAmount)}
              />
            </dl>

            {refundSummary.canRefund && (
              <form
                onSubmit={handleRefund}
                className="mt-4 space-y-3 rounded-lg border border-border bg-muted/20 p-3"
              >
                <label className="block">
                  <span className="text-xs font-medium">Refund amount</span>
                  <div className="mt-1 flex rounded-md border border-border bg-background focus-within:ring-2 focus-within:ring-primary/30">
                    <span className="border-r border-border px-3 py-2 text-sm text-muted-foreground">
                      ₹
                    </span>
                    <input
                      required={refundSummary.partialRefundAllowed}
                      type="number"
                      min="0.01"
                      max={(refundSummary.refundableAmount / 100).toFixed(2)}
                      step="0.01"
                      value={refundAmount}
                      onChange={(event) => setRefundAmount(event.target.value)}
                      readOnly={!refundSummary.partialRefundAllowed}
                      placeholder={(refundSummary.refundableAmount / 100).toFixed(2)}
                      className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none read-only:text-muted-foreground"
                    />
                  </div>
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    {refundSummary.partialRefundAllowed
                      ? "Delivered orders may be refunded partially or in full."
                      : "Before delivery, only the complete remaining amount can be refunded."}
                  </span>
                </label>
                <label className="block">
                  <span className="text-xs font-medium">Reason</span>
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    rows={2}
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Customer return, damaged item, pricing correction…"
                  />
                </label>
                <button
                  type="submit"
                  disabled={refunding}
                  className="w-full rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                >
                  {refunding
                    ? "Submitting safely…"
                    : `Refund ${refundAmount ? formatINR(Math.round(Number(refundAmount) * 100) || 0) : formatINR(refundSummary.refundableAmount)}`}
                </button>
              </form>
            )}

            {refundSuccess && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                {refundSuccess}
              </p>
            )}

            {order.refundIntents.length > 0 ? (
              <ol className="mt-4 space-y-3">
                {order.refundIntents.map((refund) => (
                  <li
                    key={refund.id}
                    className="rounded-md border border-border bg-background p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold tabular-nums">
                          {formatINR(refund.amount)} · {refund.kind.toLowerCase()}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {refund.reason}
                        </p>
                      </div>
                      <RefundStatusPill status={refund.status} />
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Requested {new Date(refund.createdAt).toLocaleString("en-IN")}
                      {refund.providerRefundId
                        ? ` · ${refund.providerRefundId}`
                        : " · provider id pending"}
                    </p>
                    {refund.failureMessage && (
                      <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {refund.failureMessage}
                      </p>
                    )}
                    {refund.events[0]?.message && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Latest: {refund.events[0].message}
                      </p>
                    )}
                    {[
                      "PENDING",
                      "RECONCILIATION_REQUIRED",
                    ].includes(refund.status) && (
                      <button
                        type="button"
                        disabled={reconcilingRefund}
                        onClick={() => handleRefundReconcile(refund.id)}
                        className="mt-3 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted/40 disabled:opacity-60"
                      >
                        {reconcilingRefund ? "Checking…" : "Check provider now"}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-4 text-sm text-muted-foreground">
                No refund has been requested for this order.
              </p>
            )}
          </section>

          <section className="rounded-lg border border-border p-5">
            <h2 className="font-medium">Actions</h2>
            {buttons.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                No transitions available from {order.status}.
              </p>
            ) : (
              <>
                <label className="mt-3 block">
                  <span className="text-sm font-medium">Note (optional)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Tracking id, refund reason, …"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {buttons.map((b) => (
                    <button
                      key={b.action}
                      onClick={() => handleAction(b.action)}
                      disabled={acting}
                      className={
                        b.danger
                          ? "rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:opacity-60"
                          : "rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      }
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>

          <section className="rounded-lg border border-border p-5">
            <h2 className="font-medium">Shipping</h2>
            <address className="mt-3 not-italic text-sm text-muted-foreground">
              <p className="text-foreground">{order.addressSnapshot.fullName}</p>
              <p>{order.addressSnapshot.line1}</p>
              {order.addressSnapshot.line2 && (
                <p>{order.addressSnapshot.line2}</p>
              )}
              <p>
                {order.addressSnapshot.city}, {order.addressSnapshot.state}{" "}
                {order.addressSnapshot.pincode}
              </p>
              <p>{order.addressSnapshot.country ?? "IN"}</p>
              <p className="mt-1">Phone: {order.addressSnapshot.phone}</p>
            </address>
          </section>

          {order.payment && (
            <section className="rounded-lg border border-border p-5">
              <h2 className="font-medium">Payment</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <Row
                  label="Method"
                  value={order.paymentMethod === "COD" ? "Cash on delivery" : "Paid online"}
                />
                <Row label="Provider" value={order.payment.provider} />
                <Row label="Status" value={order.payment.status} />
                <Row
                  label="Order id"
                  value={order.payment.providerOrderId}
                  mono
                />
                {order.payment.providerPaymentId && (
                  <Row
                    label="Payment id"
                    value={order.payment.providerPaymentId}
                    mono
                  />
                )}
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}

function formatShipmentStatus(status: string) {
  return status
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`max-w-[60%] truncate ${mono ? "font-mono" : ""}`}
      >
        {value}
      </span>
    </div>
  );
}

function RefundMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-xs font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function RefundStatusPill({ status }: { status: RefundIntentStatus }) {
  const tone: Record<RefundIntentStatus, string> = {
    REQUESTED: "bg-blue-50 text-blue-700 ring-blue-200",
    PROCESSING: "bg-blue-50 text-blue-700 ring-blue-200",
    PENDING: "bg-amber-50 text-amber-800 ring-amber-200",
    PROCESSED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    FAILED: "bg-red-50 text-red-700 ring-red-200",
    RECONCILIATION_REQUIRED: "bg-amber-50 text-amber-800 ring-amber-200",
  };
  return (
    <span
      className={`max-w-[9rem] rounded-full px-2 py-1 text-center text-[10px] font-semibold leading-tight ring-1 ring-inset ${tone[status]}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

function StatusPill({ status }: { status: OrderStatus }) {
  const tone: Record<OrderStatus, string> = {
    PENDING:
      "bg-orange-500/10 text-orange-600 ring-1 ring-inset ring-orange-500/20",
    CONFIRMED:
      "bg-blue-500/10 text-blue-700 ring-1 ring-inset ring-blue-500/20",
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

