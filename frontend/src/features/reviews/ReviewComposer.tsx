"use client";

import { useState, type FormEvent } from "react";
import {
  useCreateReviewMutation,
  useGetReviewEligibilityQuery,
} from "./reviewsApi";
import { RatingStars, StarRatingInput } from "./RatingStars";

export function ReviewComposer({
  productSlug,
  compact = false,
}: {
  productSlug: string;
  compact?: boolean;
}) {
  const { data, isLoading, isError } =
    useGetReviewEligibilityQuery(productSlug);
  const [createReview, { isLoading: submitting }] =
    useCreateReviewMutation();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
    );
  }

  if (isError || !data) {
    return null;
  }

  if (data.existingReview) {
    const review = data.existingReview;
    const copy =
      review.status === "APPROVED"
        ? "Your review is live."
        : review.status === "REJECTED"
          ? "Your review was not approved."
          : "Your review is awaiting moderation.";
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <RatingStars value={review.rating} size="xs" />
          <span className="text-xs font-semibold">{copy}</span>
        </div>
        {review.title && (
          <p className="mt-2 text-sm font-medium">{review.title}</p>
        )}
      </div>
    );
  }

  if (!data.eligible) {
    return compact ? null : (
      <p className="text-sm text-muted-foreground">
        Reviews are available after a delivered purchase.
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          compact
            ? "mt-3 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
            : "rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background"
        }
      >
        Write a verified review
      </button>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (comment.trim().length < 20) {
      setError("Please write at least 20 characters.");
      return;
    }

    try {
      await createReview({
        slug: productSlug,
        body: {
          rating,
          title: title.trim() || null,
          comment: comment.trim(),
        },
      }).unwrap();
      setOpen(false);
      setTitle("");
      setComment("");
      setRating(5);
    } catch (caught) {
      const apiError = caught as {
        data?: { error?: { message?: string } };
      };
      setError(
        apiError.data?.error?.message ??
          "Your review could not be submitted.",
      );
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        compact
          ? "mt-3 rounded-lg border border-border bg-muted/20 p-4"
          : "rounded-xl border border-border bg-background p-5"
      }
    >
      <StarRatingInput value={rating} onChange={setRating} />

      <label className="mt-4 block">
        <span className="text-sm font-medium">Title (optional)</span>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={100}
          placeholder="What stood out?"
          className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </label>

      <label className="mt-4 block">
        <span className="text-sm font-medium">Your experience</span>
        <textarea
          required
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          minLength={20}
          maxLength={1000}
          rows={compact ? 3 : 4}
          placeholder="Share what you used it for, quality, fit, flavour, or results."
          className="mt-1.5 w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="mt-1 block text-right text-xs text-muted-foreground">
          {comment.length}/1000
        </span>
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit for approval"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="rounded-lg border border-border px-4 py-2.5 text-sm font-semibold hover:bg-muted"
        >
          Cancel
        </button>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        Verified reviews are checked before they appear publicly.
      </p>
    </form>
  );
}
