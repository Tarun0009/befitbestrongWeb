import {
  calculateRelatedProductScore,
  MAX_RECENTLY_VIEWED,
  normalizeRecentlyViewedSlugs,
  relatedProductReason,
} from "../src/modules/discovery/discoveryPolicy.js";

describe("discovery policy", () => {
  it("normalizes, de-duplicates, and preserves recency order", () => {
    expect(
      normalizeRecentlyViewedSlugs([
        " Training-Gloves ",
        "whey-protein",
        "training-gloves",
        "bad slug!",
        "",
      ]),
    ).toEqual(["training-gloves", "whey-protein"]);
  });

  it("caps browser history before it reaches the database", () => {
    const input = Array.from({ length: 20 }, (_, index) => `product-${index}`);
    expect(normalizeRecentlyViewedSlugs(input)).toHaveLength(
      MAX_RECENTLY_VIEWED,
    );
  });

  it("strongly prefers an available same-category candidate", () => {
    const sameCategory = calculateRelatedProductScore({
      sourcePrice: 100_00,
      candidatePrice: 140_00,
      sameCategory: true,
      inStock: true,
      ratingAvg: 0,
      ratingCount: 0,
    });
    const otherCategory = calculateRelatedProductScore({
      sourcePrice: 100_00,
      candidatePrice: 100_00,
      sameCategory: false,
      inStock: true,
      ratingAvg: 5,
      ratingCount: 10,
    });
    expect(sameCategory).toBeGreaterThan(otherCategory);
  });

  it("creates an explainable recommendation label", () => {
    expect(
      relatedProductReason(
        {
          sourcePrice: 100_00,
          candidatePrice: 130_00,
          sameCategory: true,
          ratingCount: 0,
        },
        "Accessories",
      ),
    ).toBe("More in Accessories");
    expect(
      relatedProductReason(
        {
          sourcePrice: 100_00,
          candidatePrice: 110_00,
          sameCategory: false,
          ratingCount: 0,
        },
        "Equipment",
      ),
    ).toBe("Similar price");
  });
});
