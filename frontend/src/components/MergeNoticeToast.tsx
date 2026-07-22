"use client";

import { useEffect } from "react";
import { useAppDispatch, useAppSelector } from "@/lib/hooks";
import { clearMergeNotice } from "@/features/cart/cartSlice";

/**
 * Site-wide toast surfaced after a guest→user cart merge. Reads
 * `cartUi.mergeNotice` populated by AuthBridge post-login. Auto-dismisses
 * after 8s so it never blocks the UI even if the user ignores it.
 */
export function MergeNoticeToast() {
  const notice = useAppSelector((state) => state.cartUi.mergeNotice);
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => dispatch(clearMergeNotice()), 8000);
    return () => window.clearTimeout(timer);
  }, [notice, dispatch]);

  if (!notice) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 z-50 w-[min(92vw,26rem)] -translate-x-1/2 rounded-lg border border-border bg-background p-4 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-medium">Your cart was merged</p>
          <p className="mt-1 text-muted-foreground">{buildMessage(notice)}</p>
        </div>
        <button
          onClick={() => dispatch(clearMergeNotice())}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

function buildMessage(notice: {
  addedLines: number;
  bumpedLines: number;
  cappedLines: number;
  droppedLines: number;
}): string {
  const parts: string[] = [];
  if (notice.addedLines > 0) {
    parts.push(`${notice.addedLines} new item${notice.addedLines === 1 ? "" : "s"} added`);
  }
  if (notice.bumpedLines > 0) {
    parts.push(
      `quantity increased for ${notice.bumpedLines} item${notice.bumpedLines === 1 ? "" : "s"}`,
    );
  }
  if (notice.cappedLines > 0) {
    parts.push(
      `${notice.cappedLines} line${notice.cappedLines === 1 ? "" : "s"} capped by stock`,
    );
  }
  if (notice.droppedLines > 0) {
    parts.push(
      `${notice.droppedLines} unavailable item${notice.droppedLines === 1 ? "" : "s"} removed`,
    );
  }
  return parts.join(" · ") + " from your guest cart.";
}
