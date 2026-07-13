export const MAX_RECENTLY_VIEWED = 12;

const PRODUCT_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeRecentlyViewedSlugs(values: string[]): string[] {
  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const rawValue of values) {
    const value = rawValue.trim().toLowerCase();
    if (!PRODUCT_SLUG.test(value) || seen.has(value)) continue;
    seen.add(value);
    normalized.push(value);
    if (normalized.length === MAX_RECENTLY_VIEWED) break;
  }

  return normalized;
}

export interface RelatedProductSignals {
  sourcePrice: number;
  candidatePrice: number;
  sameCategory: boolean;
  inStock: boolean;
  ratingAvg: number;
  ratingCount: number;
}

export function calculateRelatedProductScore(
  signals: RelatedProductSignals,
): number {
  const distance =
    Math.abs(signals.candidatePrice - signals.sourcePrice) /
    Math.max(signals.sourcePrice, 1);
  const priceScore = Math.max(0, 40 - Math.round(distance * 40));
  const categoryScore = signals.sameCategory ? 100 : 0;
  const stockScore = signals.inStock ? 20 : 0;
  const reviewScore =
    Math.min(10, signals.ratingCount) + Math.round(signals.ratingAvg * 2);

  return categoryScore + priceScore + stockScore + reviewScore;
}

export function relatedProductReason(
  signals: Pick<
    RelatedProductSignals,
    "sourcePrice" | "candidatePrice" | "sameCategory" | "ratingCount"
  >,
  categoryName: string,
): string {
  if (signals.sameCategory) return `More in ${categoryName}`;

  const priceDistance =
    Math.abs(signals.candidatePrice - signals.sourcePrice) /
    Math.max(signals.sourcePrice, 1);
  if (priceDistance <= 0.25) return "Similar price";
  if (signals.ratingCount > 0) return "Customer favourite";
  return "Explore something new";
}
