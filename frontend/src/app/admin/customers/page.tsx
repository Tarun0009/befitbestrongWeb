"use client";

import { useState, type FormEvent } from "react";
import { Search, ShieldCheck, UserRound } from "lucide-react";
import {
  useListCustomersQuery,
  useUpdateCustomerRoleMutation,
  type CustomerRole,
} from "@/features/adminCustomers/adminCustomersApi";

const ROLES: Array<CustomerRole | "ALL"> = ["ALL", "CUSTOMER", "ADMIN"];

export default function AdminCustomersPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<CustomerRole | "ALL">("ALL");
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, isFetching, error } = useListCustomersQuery({
    page,
    limit: 20,
    q: search || undefined,
    role: role === "ALL" ? undefined : role,
  });
  const [updateRole, { isLoading: updating }] = useUpdateCustomerRoleMutation();

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  async function changeRole(id: string, nextRole: CustomerRole) {
    setActionError(null);
    try {
      await updateRole({ id, role: nextRole }).unwrap();
    } catch (caught) {
      const apiError = caught as { data?: { error?: { message?: string } } };
      setActionError(apiError.data?.error?.message ?? "Could not update this account.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <UserRound className="h-4 w-4" /> Customer directory
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight">Accounts and access</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Search customer accounts, review order activity at a glance, and change an access role deliberately.
            </p>
          </div>
          <div className="rounded-xl bg-[#f4f3ef] px-3 py-2 text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">Visible accounts</p>
            <p className="mt-1 text-lg font-semibold">{data?.total ?? "—"}</p>
          </div>
        </div>
        <form onSubmit={submitSearch} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search by name or email</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search by name or email"
              maxLength={120}
              className="h-11 w-full rounded-xl border border-black/10 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </label>
          <select
            aria-label="Filter by role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value as CustomerRole | "ALL");
              setPage(1);
            }}
            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            {ROLES.map((item) => <option key={item} value={item}>{item === "ALL" ? "All roles" : item}</option>)}
          </select>
          <button type="submit" className="h-11 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:brightness-95">Search</button>
        </form>
      </section>

      {actionError && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{actionError}</div>}
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">Customers could not be loaded. Check the API connection and try again.</div>}

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <div className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Customer accounts</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">Roles affect administrative access only; order history remains auditable.</p>
          </div>
          {isFetching && <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Updating…</span>}
        </div>
        {isFetching && !data ? (
          <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-14 animate-pulse rounded-xl bg-muted" />)}</div>
        ) : !data || data.items.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f2f0e9] text-muted-foreground"><UserRound className="h-5 w-5" /></span>
            <h3 className="mt-4 text-sm font-semibold">No accounts found</h3>
            <p className="mt-1 text-xs text-muted-foreground">Try a different name, email, or role filter.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-[850px] w-full text-sm">
                <thead className="border-b border-black/[0.06] bg-[#faf9f6]"><tr className="text-left text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground"><th className="px-5 py-4">Customer</th><th className="px-5 py-4">Role</th><th className="px-5 py-4 text-center">Orders</th><th className="px-5 py-4 text-center">Wishlist</th><th className="px-5 py-4">Joined</th><th className="px-5 py-4 text-right">Access</th></tr></thead>
                <tbody className={isFetching ? "opacity-60" : undefined}>
                  {data.items.map((customer) => (
                    <tr key={customer.id} className="border-b border-black/[0.055] last:border-0 hover:bg-[#fcfbf8]">
                      <td className="px-5 py-4"><p className="font-semibold">{customer.name?.trim() || "Unnamed customer"}</p><p className="mt-1 max-w-[22rem] truncate text-[11px] text-muted-foreground">{customer.email}</p></td>
                      <td className="px-5 py-4"><span className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-[#f8f7f3] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"><ShieldCheck className="h-3 w-3" /> {customer.role}</span></td>
                      <td className="px-5 py-4 text-center font-semibold">{customer._count.orders}</td><td className="px-5 py-4 text-center font-semibold">{customer._count.wishlistItems}</td>
                      <td className="px-5 py-4 text-xs text-muted-foreground">{new Date(customer.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                      <td className="px-5 py-4 text-right"><select aria-label={`Change role for ${customer.email}`} disabled={updating} value={customer.role} onChange={(event) => void changeRole(customer.id, event.target.value as CustomerRole)} className="rounded-lg border border-black/10 bg-white px-2.5 py-2 text-xs font-semibold outline-none focus:border-primary disabled:opacity-50"><option value="CUSTOMER">Customer</option><option value="ADMIN">Admin</option></select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-black/[0.06] px-5 py-4"><p className="text-xs text-muted-foreground">Page {data.page} of {data.totalPages}</p><div className="flex gap-2"><button type="button" disabled={page <= 1 || isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))} className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button><button type="button" disabled={page >= data.totalPages || isFetching} onClick={() => setPage((current) => current + 1)} className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>
          </>
        )}
      </section>
    </div>
  );
}