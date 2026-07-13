export interface RecentlyViewedEntry {
  slug: string;
  viewedAt: number;
}

export const RECENTLY_VIEWED_EVENT = "befitbestrong:recently-viewed";
const STORAGE_KEY = "befitbestrong:recently-viewed:v1";
const MAX_ITEMS = 12;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function canUseStorage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage);
  } catch {
    return false;
  }
}

export function readRecentlyViewed(): RecentlyViewedEntry[] {
  if (!canUseStorage()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const seen = new Set<string>();
    return parsed
      .flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const value = entry as Partial<RecentlyViewedEntry>;
        const slug = typeof value.slug === "string" ? value.slug : "";
        if (
          !SLUG_PATTERN.test(slug) ||
          typeof value.viewedAt !== "number" ||
          !Number.isFinite(value.viewedAt) ||
          seen.has(slug)
        ) {
          return [];
        }
        seen.add(slug);
        return [{ slug, viewedAt: value.viewedAt }];
      })
      .sort((left, right) => right.viewedAt - left.viewedAt)
      .slice(0, MAX_ITEMS);
  } catch {
    return [];
  }
}

export function rememberProduct(slug: string): void {
  if (!canUseStorage() || !SLUG_PATTERN.test(slug)) return;

  const next = [
    { slug, viewedAt: Date.now() },
    ...readRecentlyViewed().filter((entry) => entry.slug !== slug),
  ].slice(0, MAX_ITEMS);

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
  } catch {
    // Storage can be disabled in privacy modes; browsing should still work.
  }
}

export function clearRecentlyViewed(): void {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event(RECENTLY_VIEWED_EVENT));
  } catch {
    // Storage is an enhancement, never a requirement.
  }
}


