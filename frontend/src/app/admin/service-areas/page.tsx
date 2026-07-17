"use client";

import { useState, type FormEvent } from "react";
import {
  Banknote,
  MapPinned,
  Plus,
  Radar,
  Search,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { formatINR } from "@/lib/format";
import {
  useAdminCreateServiceAreaMutation,
  useAdminListServiceAreaDemandQuery,
  useAdminListServiceAreasQuery,
  useAdminUpdateServiceAreaMutation,
  type ServiceArea,
  type ServiceZone,
} from "@/features/serviceability/serviceabilityApi";

interface AreaDraft {
  pincode: string;
  zone: ServiceZone;
  city: string;
  state: string;
  codEnabled: boolean;
  codMaxRupees: string;
  codFeeRupees: string;
  minDays: string;
  maxDays: string;
}

const EMPTY_DRAFT: AreaDraft = {
  pincode: "",
  zone: "DELHI",
  city: "Delhi",
  state: "Delhi",
  codEnabled: true,
  codMaxRupees: "5000",
  codFeeRupees: "0",
  minDays: "1",
  maxDays: "3",
};

export default function AdminServiceAreasPage() {
  const [search, setSearch] = useState("");
  const [zone, setZone] = useState<ServiceZone | "ALL">("ALL");
  const [draft, setDraft] = useState<AreaDraft>(EMPTY_DRAFT);
  const [formError, setFormError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyAreaId, setBusyAreaId] = useState<string | null>(null);
  const { data, isFetching, error } = useAdminListServiceAreasQuery({
    limit: 100,
    search: search || undefined,
    zone: zone === "ALL" ? undefined : zone,
  });
  const { data: demand, isFetching: demandLoading } =
    useAdminListServiceAreaDemandQuery({ limit: 30 });
  const [createArea, { isLoading: creating }] =
    useAdminCreateServiceAreaMutation();
  const [updateArea] = useAdminUpdateServiceAreaMutation();

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      await createArea({
        pincode: draft.pincode,
        zone: draft.zone,
        city: draft.city,
        state: draft.state,
        active: true,
        prepaidEnabled: true,
        codEnabled: draft.codEnabled,
        codMaxOrderAmount: Math.round(Number(draft.codMaxRupees) * 100),
        codFee: Math.round(Number(draft.codFeeRupees) * 100),
        estimatedDeliveryMinDays: Number(draft.minDays),
        estimatedDeliveryMaxDays: Number(draft.maxDays),
      }).unwrap();
      setDraft(EMPTY_DRAFT);
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setFormError(
        apiError.data?.error?.message ?? "Could not add this service area.",
      );
    }
  }

  function prepareDemandPincode(pincode: string) {
    setDraft((current) => ({ ...current, pincode }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function toggle(
    area: ServiceArea,
    field: "active" | "prepaidEnabled" | "codEnabled",
  ) {
    if (busyAreaId) return;
    setBusyAreaId(area.id);
    setActionError(null);
    try {
      await updateArea({
        id: area.id,
        patch: { [field]: !area[field] },
      }).unwrap();
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setActionError(
        apiError.data?.error?.message ?? "Could not update this service area.",
      );
    } finally {
      setBusyAreaId(null);
    }
  }

  const activeCount = data?.items.filter((item) => item.active).length ?? 0;
  const codCount =
    data?.items.filter((item) => item.active && item.codEnabled).length ?? 0;

  return (
    <div className="space-y-7">
      <section className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="Coverage PINs"
          value={String(data?.total ?? 0)}
          note={activeCount + " active in this view"}
          icon={<MapPinned className="h-5 w-5" />}
        />
        <Metric
          label="COD enabled"
          value={String(codCount)}
          note="Active PINs in this view"
          icon={<Banknote className="h-5 w-5" />}
        />
        <Metric
          label="Expansion demand"
          value={String(demand?.total ?? 0)}
          note="Unsupported PINs requested"
          icon={<Radar className="h-5 w-5" />}
        />
      </section>

      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
            <Plus className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Add a serviceable PIN</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              New coverage is active immediately. Confirm operations can fulfil it first.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreate} className="mt-5 grid gap-4 md:grid-cols-4">
          <Field label="PIN code">
            <input
              required
              pattern="\d{6}"
              inputMode="numeric"
              value={draft.pincode}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  pincode: event.target.value.replace(/\D/g, "").slice(0, 6),
                })
              }
              className={inputClass}
              placeholder="110001"
            />
          </Field>
          <Field label="Zone">
            <select
              value={draft.zone}
              onChange={(event) => {
                const next = event.target.value as ServiceZone;
                setDraft({
                  ...draft,
                  zone: next,
                  city:
                    next === "NOIDA"
                      ? "Noida"
                      : next === "GHAZIABAD"
                        ? "Ghaziabad"
                        : "Delhi",
                  state: next === "DELHI" ? "Delhi" : "Uttar Pradesh",
                });
              }}
              className={inputClass}
            >
              <option value="DELHI">Delhi</option>
              <option value="NOIDA">Noida</option>
              <option value="GHAZIABAD">Ghaziabad</option>
            </select>
          </Field>
          <Field label="City">
            <input
              required
              value={draft.city}
              onChange={(event) => setDraft({ ...draft, city: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="State">
            <input
              required
              value={draft.state}
              onChange={(event) => setDraft({ ...draft, state: event.target.value })}
              className={inputClass}
            />
          </Field>
          <Field label="COD limit (₹)">
            <input
              required
              min="0"
              type="number"
              value={draft.codMaxRupees}
              onChange={(event) =>
                setDraft({ ...draft, codMaxRupees: event.target.value })
              }
              className={inputClass}
            />
          </Field>
          <Field label="COD fee (₹)">
            <input
              required
              min="0"
              type="number"
              value={draft.codFeeRupees}
              onChange={(event) =>
                setDraft({ ...draft, codFeeRupees: event.target.value })
              }
              className={inputClass}
            />
          </Field>
          <Field label="Delivery days">
            <div className="flex items-center gap-2">
              <input
                required
                min="0"
                max="30"
                type="number"
                aria-label="Minimum delivery days"
                value={draft.minDays}
                onChange={(event) =>
                  setDraft({ ...draft, minDays: event.target.value })
                }
                className={inputClass}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                required
                min="0"
                max="45"
                type="number"
                aria-label="Maximum delivery days"
                value={draft.maxDays}
                onChange={(event) =>
                  setDraft({ ...draft, maxDays: event.target.value })
                }
                className={inputClass}
              />
            </div>
          </Field>
          <div className="flex items-end gap-3">
            <label className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-black/10 px-3 text-xs font-semibold">
              <input
                type="checkbox"
                checked={draft.codEnabled}
                onChange={(event) =>
                  setDraft({ ...draft, codEnabled: event.target.checked })
                }
              />
              COD enabled
            </label>
            <button
              type="submit"
              disabled={creating || draft.pincode.length !== 6}
              className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {creating ? "Adding…" : "Add PIN"}
            </button>
          </div>
        </form>
        {formError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            {formError}
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <header className="flex flex-col gap-4 border-b border-black/[0.06] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Current coverage</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Server-enforced payment and delivery rules per PIN.
            </p>
          </div>
          <div className="flex gap-2">
            <label className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search PIN or city"
                className="h-10 rounded-xl border border-black/10 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
              />
            </label>
            <select
              value={zone}
              onChange={(event) =>
                setZone(event.target.value as ServiceZone | "ALL")
              }
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm"
            >
              <option value="ALL">All zones</option>
              <option value="DELHI">Delhi</option>
              <option value="NOIDA">Noida</option>
              <option value="GHAZIABAD">Ghaziabad</option>
            </select>
          </div>
        </header>

        {actionError && (
          <p className="border-b border-red-200 bg-red-50 px-5 py-3 text-xs text-red-700">
            {actionError}
          </p>
        )}
        {error ? (
          <p className="p-5 text-sm text-red-700">Coverage could not be loaded.</p>
        ) : !data?.items.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No service areas match this filter.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[980px] w-full text-sm">
              <thead className="bg-[#faf9f6] text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-4">PIN / zone</th>
                  <th className="px-5 py-4">Location</th>
                  <th className="px-5 py-4">ETA</th>
                  <th className="px-5 py-4">COD policy</th>
                  <th className="px-5 py-4 text-center">Prepaid</th>
                  <th className="px-5 py-4 text-center">COD</th>
                  <th className="px-5 py-4 text-center">Coverage</th>
                </tr>
              </thead>
              <tbody className={isFetching ? "opacity-60" : ""}>
                {data.items.map((area) => (
                  <tr key={area.id} className="border-t border-black/[0.055]">
                    <td className="px-5 py-4">
                      <p className="font-mono text-xs font-bold">{area.pincode}</p>
                      <p className="mt-1 text-[10px] font-semibold text-muted-foreground">
                        {area.zone}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-medium">{area.city}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{area.state}</p>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {area.estimatedDeliveryMinDays}–{area.estimatedDeliveryMaxDays} days
                    </td>
                    <td className="px-5 py-4 text-xs">
                      <p>Limit {formatINR(area.codMaxOrderAmount)}</p>
                      <p className="mt-1 text-muted-foreground">
                        Fee {area.codFee ? formatINR(area.codFee) : "Free"}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Toggle
                        enabled={area.prepaidEnabled}
                        label="prepaid"
                        disabled={busyAreaId === area.id}
                        onClick={() => toggle(area, "prepaidEnabled")}
                      />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Toggle
                        enabled={area.codEnabled}
                        label="COD"
                        disabled={busyAreaId === area.id}
                        onClick={() => toggle(area, "codEnabled")}
                      />
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Toggle
                        enabled={area.active}
                        label="coverage"
                        disabled={busyAreaId === area.id}
                        onClick={() => toggle(area, "active")}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <header className="border-b border-black/[0.06] p-5">
          <h2 className="text-sm font-semibold">Expansion demand</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Ranked by request attempts; unique requesters prevent one person from appearing as many customers.
          </p>
        </header>
        {demandLoading ? (
          <div className="h-40 animate-pulse bg-muted/40" />
        ) : !demand?.items.length ? (
          <p className="p-10 text-center text-sm text-muted-foreground">
            No unsupported-area requests yet.
          </p>
        ) : (
          <ul className="divide-y divide-black/[0.055]">
            {demand.items.map((item, index) => (
              <li
                key={item.pincode}
                className="grid gap-3 px-5 py-4 sm:grid-cols-[3rem_1fr_auto_auto] sm:items-center"
              >
                <span className="text-xs font-bold text-muted-foreground">
                  #{index + 1}
                </span>
                <div>
                  <p className="font-mono text-sm font-bold">{item.pincode}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last request{" "}
                    {item.lastRequestedAt
                      ? new Date(item.lastRequestedAt).toLocaleString("en-IN")
                      : "—"}
                  </p>
                </div>
                <div className="text-xs">
                  <strong>{item.uniqueRequesters}</strong> unique ·{" "}
                  <strong>{item.requestAttempts}</strong> attempts
                </div>
                <button
                  type="button"
                  onClick={() => prepareDemandPincode(item.pincode)}
                  className="h-9 rounded-lg border border-black/10 px-3 text-xs font-semibold hover:bg-black/[0.03]"
                >
                  Add coverage
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          {label}
        </p>
        <span className="text-muted-foreground">{icon}</span>
      </div>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </article>
  );
}

function Toggle({
  enabled,
  label,
  onClick,
  disabled = false,
}: {
  enabled: boolean;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const Icon = enabled ? ToggleRight : ToggleLeft;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={(enabled ? "Disable " : "Enable ") + label}
      aria-pressed={enabled}
      className={
        "inline-flex items-center gap-1.5 text-xs font-semibold disabled:cursor-wait disabled:opacity-50 " +
        (enabled ? "text-emerald-700" : "text-muted-foreground")
      }
    >
      <Icon className="h-6 w-6" />
      {enabled ? "On" : "Off"}
    </button>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "mt-1.5 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30";

