import { Star } from "lucide-react";

export function RatingStars({
  value,
  count,
  size = "sm",
  showValue = false,
}: {
  value: number;
  count?: number;
  size?: "xs" | "sm" | "md";
  showValue?: boolean;
}) {
  const iconClass =
    size === "xs" ? "h-3 w-3" : size === "md" ? "h-5 w-5" : "h-4 w-4";
  const rounded = Math.round(value);

  return (
    <span
      className="inline-flex items-center gap-1"
      aria-label={
        value > 0
          ? value.toFixed(1) + " out of 5 stars"
          : "No ratings yet"
      }
    >
      <span className="inline-flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={
              iconClass +
              (star <= rounded
                ? " fill-primary text-primary"
                : " fill-muted text-border")
            }
          />
        ))}
      </span>
      {showValue && value > 0 && (
        <span className="text-xs font-semibold tabular-nums">
          {value.toFixed(1)}
        </span>
      )}
      {count !== undefined && (
        <span className="text-xs text-muted-foreground">
          {count > 0 ? "(" + count + ")" : "New"}
        </span>
      )}
    </span>
  );
}

export function StarRatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">Your rating</legend>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            className="rounded-md p-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label={"Rate " + star + " out of 5"}
            aria-pressed={star <= value}
          >
            <Star
              className={
                "h-7 w-7 transition-colors " +
                (star <= value
                  ? "fill-primary text-primary"
                  : "fill-muted text-border hover:text-primary")
              }
            />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
