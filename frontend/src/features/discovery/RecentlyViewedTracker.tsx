"use client";

import { useEffect } from "react";
import { rememberProduct } from "./recentlyViewed";

export function RecentlyViewedTracker({ slug }: { slug: string }) {
  useEffect(() => {
    rememberProduct(slug);
  }, [slug]);

  return null;
}
