"use client";

import Link from "next/link";
import { useGetSiteConfigQuery } from "@/lib/siteConfigApi";

/**
 * Thin promo strip above the header. Reads dynamic content from
 * /site-config so marketing can edit the message + promo code without a
 * deploy. Hides entirely when admin disables it or during the initial fetch.
 */
export function AnnouncementBar() {
  const { data } = useGetSiteConfigQuery();
  if (!data || !data.announcement.enabled) return null;

  const { text, code, ctaText, ctaHref } = data.announcement;

  return (
    <div className="bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-2 text-xs sm:text-sm">
        <p className="font-medium">
          {text}
          {code && (
            <>
              <span className="mx-2 opacity-40">·</span>
              Use{" "}
              <code className="rounded bg-primary-foreground/10 px-1.5 py-0.5 font-mono text-[0.85em]">
                {code}
              </code>{" "}
              at checkout
            </>
          )}
        </p>
        {ctaText && ctaHref && (
          <Link
            href={ctaHref}
            className="hidden shrink-0 underline underline-offset-4 hover:opacity-80 sm:inline"
          >
            {ctaText}
          </Link>
        )}
      </div>
    </div>
  );
}
