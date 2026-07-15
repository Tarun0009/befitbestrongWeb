"use client";

import { useState, type FormEvent } from "react";
import {
  useAdminCreateCouponMutation,
  useAdminDeleteCouponMutation,
  useAdminListCouponsQuery,
  useAdminUpdateCouponMutation,
} from "@/lib/ordersApi";
import { formatINR } from "@/lib/format";

export default function AdminCouponsPage() {
  const { data, isLoading } = useAdminListCouponsQuery();
  const [createCoupon, { isLoading: creating }] =
    useAdminCreateCouponMutation();
  const [updateCoupon] = useAdminUpdateCouponMutation();
  const [deleteCoupon] = useAdminDeleteCouponMutation();

  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"PERCENTAGE" | "FIXED_AMOUNT">(
    "PERCENTAGE",
  );
  const [value, setValue] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [maximum, setMaximum] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const numericValue = Number(value);
    if (!numericValue || numericValue <= 0) {
      setError("Enter a valid discount value.");
      return;
    }

    try {
      await createCoupon({
        code: code.trim().toUpperCase(),
        description: description.trim() || null,
        type,
        value:
          type === "PERCENTAGE"
            ? Math.round(numericValue)
            : Math.round(numericValue * 100),
        minSubtotal: Math.round((Number(minimum) || 0) * 100),
        maxDiscount:
          type === "PERCENTAGE" && Number(maximum) > 0
            ? Math.round(Number(maximum) * 100)
            : null,
        active: true,
      }).unwrap();
      setCode("");
      setDescription("");
      setValue("");
      setMinimum("0");
      setMaximum("");
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setError(
        apiError.data?.error?.message ?? "Could not create this coupon.",
      );
    }
  }

  async function handleDelete(id: string, couponCode: string) {
    if (!window.confirm("Delete coupon " + couponCode + "?")) return;
    await deleteCoupon(id);
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <h2 className="text-xl font-semibold">Create coupon</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Discounts are validated and calculated by the backend during checkout.
        </p>

        <form
          onSubmit={handleCreate}
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <Field label="Code">
            <input
              required
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className={inputClass}
            />
          </Field>
          <Field label="Discount type">
            <select
              value={type}
              onChange={(event) =>
                setType(event.target.value as "PERCENTAGE" | "FIXED_AMOUNT")
              }
              className={inputClass}
            >
              <option value="PERCENTAGE">Percentage</option>
              <option value="FIXED_AMOUNT">Fixed amount</option>
            </select>
          </Field>
          <Field label={type === "PERCENTAGE" ? "Percentage" : "Amount (₹)"}>
            <input
              required
              type="number"
              min="1"
              max={type === "PERCENTAGE" ? "100" : undefined}
              step={type === "PERCENTAGE" ? "1" : "0.01"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Minimum order (₹)">
            <input
              type="number"
              min="0"
              step="0.01"
              value={minimum}
              onChange={(event) => setMinimum(event.target.value)}
              className={inputClass}
            />
          </Field>
          {type === "PERCENTAGE" && (
            <Field label="Maximum discount (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={maximum}
                onChange={(event) => setMaximum(event.target.value)}
                placeholder="No maximum"
                className={inputClass}
              />
            </Field>
          )}
          <Field label="Description" className="sm:col-span-2 lg:col-span-3">
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Shown internally and available to the storefront"
              className={inputClass}
            />
          </Field>

          {error && (
            <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-3">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={creating}
            className="h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60 sm:w-fit"
          >
            {creating ? "Creating…" : "Create coupon"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)] sm:p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">Coupons</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deactivate a code without deleting its configuration.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {data?.items.length ?? 0} total
          </span>
        </div>

        {isLoading ? (
          <div className="mt-5 h-36 animate-pulse rounded-xl bg-muted" />
        ) : data?.items.length ? (
          <div className="mt-5 overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Code</th>
                  <th className="px-4 py-3">Discount</th>
                  <th className="px-4 py-3">Minimum</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((coupon) => (
                  <tr key={coupon.id} className="border-t border-border">
                    <td className="px-4 py-3">
                      <p className="font-mono font-semibold">{coupon.code}</p>
                      {coupon.description && (
                        <p className="mt-1 max-w-xs truncate text-xs text-muted-foreground">
                          {coupon.description}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {coupon.type === "PERCENTAGE"
                        ? coupon.value + "%"
                        : formatINR(coupon.value)}
                      {coupon.maxDiscount !== null && (
                        <span className="block text-xs text-muted-foreground">
                          Max {formatINR(coupon.maxDiscount)}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {coupon.minSubtotal
                        ? formatINR(coupon.minSubtotal)
                        : "None"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          coupon.active
                            ? "rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700"
                            : "rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground"
                        }
                      >
                        {coupon.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          updateCoupon({
                            id: coupon.id,
                            body: { active: !coupon.active },
                          })
                        }
                        className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        {coupon.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(coupon.id, coupon.code)}
                        className="ml-2 px-2 py-1.5 text-xs font-semibold text-red-600"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-5 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No coupons yet.
          </p>
        )}
      </section>
    </div>
  );
}

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-[#faf9f6] px-3 text-sm outline-none transition focus:border-foreground/20 focus:bg-white focus:ring-2 focus:ring-primary/35";

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={"block " + className}>
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
