"use client";

import { useState } from "react";
import Link from "next/link";
import { MailCheck, RefreshCw, TriangleAlert } from "lucide-react";
import {
  useGetEmailOutboxQuery,
  useRetryEmailOutboxMutation,
  type EmailOutboxStatus,
  type EmailTemplate,
} from "@/features/emailOutbox/emailOutboxApi";
import { cn } from "@/lib/utils";

const statuses: EmailOutboxStatus[] = [
  "PENDING",
  "PROCESSING",
  "SENT",
  "DEAD_LETTER",
  "CANCELLED",
];
const templates: EmailTemplate[] = [
  "ORDER_STATUS",
  "ADMIN_ORDER_ALERT",
  "SUBSCRIPTION_RENEWAL",
  "BACK_IN_STOCK",
];

export default function AdminEmailDeliveryPage() {
  const [status, setStatus] = useState<EmailOutboxStatus | undefined>();
  const [template, setTemplate] = useState<EmailTemplate | undefined>();
  const [page, setPage] = useState(1);
  const [actionError, setActionError] = useState<string | null>(null);
  const { data, error, isFetching } = useGetEmailOutboxQuery({
    page,
    limit: 25,
    status,
    template,
  });
  const [retryEmail, { isLoading: retrying }] = useRetryEmailOutboxMutation();

  async function handleRetry(id: string) {
    setActionError(null);
    try {
      await retryEmail(id).unwrap();
    } catch (reason) {
      const response = reason as { data?: { error?: { message?: string } } };
      setActionError(response.data?.error?.message ?? "Email could not be requeued.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/[0.07] bg-white p-5 shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MailCheck className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">Transactional email outbox</h2>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Customer, order-operations, subscription, and stock-alert emails are
              committed before delivery and retried with stable provider keys.
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
              data?.summary.configured
                ? "bg-emerald-100 text-emerald-700"
                : "bg-amber-100 text-amber-800",
            )}
          >
            {data?.summary.configured ? "Resend connected" : "Provider not configured"}
          </span>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {statuses.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setStatus(status === item ? undefined : item);
                setPage(1);
              }}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition",
                status === item
                  ? "border-primary bg-primary/[0.07]"
                  : "border-black/[0.07] bg-[#faf9f6] hover:bg-black/[0.025]",
              )}
            >
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {formatStatus(item)}
              </span>
              <span className="mt-1 block text-xl font-semibold tabular-nums">
                {data?.summary[item] ?? 0}
              </span>
            </button>
          ))}
        </div>

        <label className="mt-4 block max-w-xs">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Message type
          </span>
          <select
            value={template ?? ""}
            onChange={(event) => {
              setTemplate((event.target.value || undefined) as EmailTemplate | undefined);
              setPage(1);
            }}
            className="mt-1 h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
          >
            <option value="">All message types</option>
            {templates.map((item) => (
              <option key={item} value={item}>
                {formatStatus(item)}
              </option>
            ))}
          </select>
        </label>
      </section>

      {(error || actionError) && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError ?? "Email delivery records could not be loaded."}
        </div>
      )}

      {!data?.summary.configured && (data?.summary.PENDING ?? 0) > 0 && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          Messages remain durable but cannot leave the queue until RESEND_API_KEY
          and EMAIL_FROM are configured.
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-black/[0.07] bg-white shadow-[0_10px_35px_rgba(23,23,20,0.04)]">
        <header className="flex items-center justify-between border-b border-black/[0.06] px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold">Delivery records</h2>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {data?.total ?? 0} matching message{(data?.total ?? 0) === 1 ? "" : "s"}
            </p>
          </div>
          {isFetching && <span className="text-xs text-muted-foreground">Updating…</span>}
        </header>

        {!data || data.items.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <MailCheck className="mx-auto h-6 w-6 text-muted-foreground" />
            <p className="mt-3 text-sm font-semibold">No delivery records found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              New transactional messages will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b border-black/[0.06] bg-[#faf9f6] text-left text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-4">Message</th>
                  <th className="px-5 py-4">Recipient</th>
                  <th className="px-5 py-4">Status</th>
                  <th className="px-5 py-4">Reference</th>
                  <th className="px-5 py-4">Timing</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={isFetching ? "opacity-60" : undefined}>
                {data.items.map((email) => (
                  <tr key={email.id} className="border-b border-black/[0.055] align-top last:border-0 hover:bg-[#fcfbf8]">
                    <td className="max-w-[18rem] px-5 py-4">
                      <p className="font-semibold">{email.subject}</p>
                      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        {formatStatus(email.template)}
                      </p>
                      {email.lastErrorMessage && (
                        <p className="mt-2 text-xs text-red-700">{email.lastErrorMessage}</p>
                      )}
                    </td>
                    <td className="px-5 py-4 text-xs">{email.recipientEmail}</td>
                    <td className="px-5 py-4">
                      <StatusPill status={email.status} />
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        Attempt {email.attemptCount}/{email.maxAttempts}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-xs">
                      {email.referenceType === "Order" ? (
                        <Link href={`/admin/orders/${email.referenceId}`} className="font-mono font-semibold hover:underline">
                          #{email.referenceId.slice(-10)}
                        </Link>
                      ) : (
                        <span className="font-mono">{email.referenceId.slice(-12)}</span>
                      )}
                      <details className="mt-2 text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer">Timeline</summary>
                        <ol className="mt-2 space-y-1.5">
                          {email.events.map((event) => (
                            <li key={event.id}>
                              {formatStatus(event.toStatus)} · {new Date(event.createdAt).toLocaleString("en-IN")}
                            </li>
                          ))}
                        </ol>
                      </details>
                    </td>
                    <td className="px-5 py-4 text-xs text-muted-foreground">
                      <p>Created {new Date(email.createdAt).toLocaleString("en-IN")}</p>
                      {email.sentAt && <p className="mt-1">Sent {new Date(email.sentAt).toLocaleString("en-IN")}</p>}
                      {email.status === "PENDING" && <p className="mt-1">Next {new Date(email.nextAttemptAt).toLocaleString("en-IN")}</p>}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {(email.status === "DEAD_LETTER" || email.status === "PENDING") && (
                        <button
                          type="button"
                          disabled={retrying}
                          onClick={() => handleRetry(email.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold hover:bg-black/[0.03] disabled:opacity-60"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.totalPages > 1 && (
          <footer className="flex items-center justify-between border-t border-black/[0.06] px-5 py-4">
            <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40">
              Previous
            </button>
            <span className="text-xs text-muted-foreground">Page {page} of {data.totalPages}</span>
            <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)} className="rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40">
              Next
            </button>
          </footer>
        )}
      </section>
    </div>
  );
}

function formatStatus(value: string) {
  return value.toLowerCase().split("_").map((part) => part[0]?.toUpperCase() + part.slice(1)).join(" ");
}

function StatusPill({ status }: { status: EmailOutboxStatus }) {
  const tone: Record<EmailOutboxStatus, string> = {
    PENDING: "bg-amber-100 text-amber-800",
    PROCESSING: "bg-blue-100 text-blue-700",
    SENT: "bg-emerald-100 text-emerald-700",
    DEAD_LETTER: "bg-red-100 text-red-700",
    CANCELLED: "bg-slate-100 text-slate-600",
  };
  return <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider", tone[status])}>{formatStatus(status)}</span>;
}
