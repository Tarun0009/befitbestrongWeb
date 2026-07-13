"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { useAppSelector } from "@/lib/hooks";
import { useGetProductReviewsQuery } from "./reviewsApi";
import { RatingStars } from "./RatingStars";
import { ReviewComposer } from "./ReviewComposer";

export function ProductReviews({
  productSlug,
  initialAverage,
  initialCount,
}: {
  productSlug: string;
  initialAverage: number;
  initialCount: number;
}) {
  const [page, setPage] = useState(1);
  const authStatus = useAppSelector((state) => state.auth.status);
  const { data, isLoading, isError } = useGetProductReviewsQuery({
    slug: productSlug,
    page,
    limit: 6,
  });

  const summary = data?.summary ?? {
    average: initialAverage,
    count: initialCount,
    distribution: [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: 0,
    })),
  };

  return (
    <section id="reviews" className="mt-16 scroll-mt-36 border-t border-border pt-10">
      <div className="grid gap-8 lg:grid-cols-[300px_1fr]">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Customer feedback
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Reviews & ratings</h2>

          <div className="mt-6 rounded-xl border border-border p-5">
            <div className="flex items-end gap-3">
              <span className="text-5xl font-semibold tabular-nums">
                {summary.count > 0 ? summary.average.toFixed(1) : "—"}
              </span>
              <span className="pb-1 text-sm text-muted-foreground">out of 5</span>
            </div>
            <div className="mt-3">
              <RatingStars
                value={summary.average}
                count={summary.count}
                size="md"
              />
            </div>

            <div className="mt-5 space-y-2">
              {summary.distribution.map((row) => {
                const percentage =
                  summary.count > 0
                    ? Math.round((row.count / summary.count) * 100)
                    : 0;
                return (
                  <div
                    key={row.rating}
                    className="grid grid-cols-[24px_1fr_34px] items-center gap-2 text-xs"
                  >
                    <span>{row.rating}</span>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: percentage + "%" }}
                      />
                    </div>
                    <span className="text-right text-muted-foreground">
                      {row.count}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-4">
            {authStatus === "authenticated" ? (
              <ReviewComposer productSlug={productSlug} />
            ) : authStatus === "unauthenticated" ? (
              <Link
                href={"/login?next=/shop/" + productSlug + "%23reviews"}
                className="inline-flex rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
              >
                Log in to review a purchase
              </Link>
            ) : (
              <div className="h-10 animate-pulse rounded-lg bg-muted" />
            )}
          </div>
        </div>

        <div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-32 animate-pulse rounded-xl bg-muted"
                />
              ))}
            </div>
          ) : isError ? (
            <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
              Reviews could not be loaded right now.
            </p>
          ) : data?.items.length ? (
            <>
              <div className="space-y-3">
                {data.items.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-xl border border-border p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <RatingStars value={review.rating} size="sm" />
                        {review.title && (
                          <h3 className="mt-2 font-semibold">{review.title}</h3>
                        )}
                      </div>
                      <time className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </time>
                    </div>
                    <p className="mt-3 whitespace-pre-line text-sm leading-6 text-muted-foreground">
                      {review.comment}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
                      <span className="font-medium">{review.user?.name}</span>
                      {review.verifiedPurchase && (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Verified purchase
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              {data.totalPages > 1 && (
                <div className="mt-5 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {data.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPage((current) =>
                        Math.min(data.totalPages, current + 1),
                      )
                    }
                    disabled={page === data.totalPages}
                    className="rounded-lg border border-border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-10 text-center">
              <p className="font-medium">No approved reviews yet.</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Delivered customers can be the first to share their experience.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
