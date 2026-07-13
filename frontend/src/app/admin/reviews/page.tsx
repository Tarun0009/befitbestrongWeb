"use client";

import { useState } from "react";
import Link from "next/link";
import {
  type ReviewStatus,
  useAdminListReviewsQuery,
  useAdminModerateReviewMutation,
} from "@/features/reviews/reviewsApi";
import { RatingStars } from "@/features/reviews/RatingStars";

const statuses: Array<"ALL" | ReviewStatus> = [
  "ALL",
  "PENDING",
  "APPROVED",
  "REJECTED",
];

export default function AdminReviewsPage() {
  const [status, setStatus] = useState<"ALL" | ReviewStatus>("PENDING");
  const [page, setPage] = useState(1);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data, isLoading, isFetching } = useAdminListReviewsQuery({
    status: status === "ALL" ? undefined : status,
    page,
    limit: 20,
  });
  const [moderateReview] = useAdminModerateReviewMutation();

  async function moderate(
    id: string,
    nextStatus: "APPROVED" | "REJECTED",
  ) {
    if (
      nextStatus === "REJECTED" &&
      !window.confirm("Reject this review? It will not appear publicly.")
    ) {
      return;
    }

    setBusyId(id);
    setError(null);
    try {
      await moderateReview({ id, status: nextStatus }).unwrap();
    } catch (caught) {
      const apiError = caught as {
        data?: { error?: { message?: string } };
      };
      setError(
        apiError.data?.error?.message ??
          "The moderation action could not be saved.",
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Review moderation</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only approved verified-purchase reviews affect storefront ratings.
          </p>
        </div>
        <span className="text-sm text-muted-foreground">
          {data?.total ?? 0} matching
        </span>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {statuses.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setStatus(item);
              setPage(1);
            }}
            className={
              item === status
                ? "rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                : "rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
            }
          >
            {item === "ALL" ? "All" : titleCase(item)}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-5 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {isLoading ? (
        <div className="mt-6 h-48 animate-pulse rounded-xl bg-muted" />
      ) : data?.items.length ? (
        <div className={"mt-6 space-y-3 " + (isFetching ? "opacity-70" : "")}>
          {data.items.map((review) => (
            <article
              key={review.id}
              className="rounded-xl border border-border p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={review.status} />
                    {review.verifiedPurchase && (
                      <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-700">
                        Verified purchase
                      </span>
                    )}
                  </div>
                  <Link
                    href={"/shop/" + review.product.slug}
                    className="mt-3 block font-semibold hover:underline"
                  >
                    {review.product.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {review.user.name || review.user.email} ·{" "}
                    {new Date(review.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <RatingStars value={review.rating} showValue />
              </div>

              {review.title && (
                <h3 className="mt-4 font-semibold">{review.title}</h3>
              )}
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                {review.comment}
              </p>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                {review.status !== "APPROVED" && (
                  <button
                    type="button"
                    onClick={() => moderate(review.id, "APPROVED")}
                    disabled={busyId === review.id}
                    className="rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60"
                  >
                    {busyId === review.id ? "Saving…" : "Approve"}
                  </button>
                )}
                {review.status !== "REJECTED" && (
                  <button
                    type="button"
                    onClick={() => moderate(review.id, "REJECTED")}
                    disabled={busyId === review.id}
                    className="rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 disabled:opacity-60"
                  >
                    Reject
                  </button>
                )}
                {review.purchaseOrderId && (
                  <Link
                    href={"/admin/orders/" + review.purchaseOrderId}
                    className="ml-auto rounded-lg border border-border px-4 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    View source order
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-6 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No reviews match this filter.
        </p>
      )}

      {data && data.totalPages > 1 && (
        <div className="mt-6 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={page === 1}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {data.totalPages}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(data.totalPages, current + 1))
            }
            disabled={page === data.totalPages}
            className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

function titleCase(value: ReviewStatus) {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

function StatusPill({ status }: { status: ReviewStatus }) {
  const className =
    status === "APPROVED"
      ? "bg-emerald-500/10 text-emerald-700"
      : status === "REJECTED"
        ? "bg-red-500/10 text-red-700"
        : "bg-orange-500/10 text-orange-700";
  return (
    <span className={"rounded-full px-2 py-1 text-xs font-medium " + className}>
      {titleCase(status)}
    </span>
  );
}
