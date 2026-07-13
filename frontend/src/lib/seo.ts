import type { CatalogProductDetail } from "@/lib/catalogApi";
import {
  absoluteSiteUrl,
  DEFAULT_SHARE_IMAGE,
  SITE_NAME,
} from "@/lib/site";

export function compactDescription(value: string, maxLength = 160): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, maxLength - 1).trimEnd()}…`;
}

export function socialImageUrl(value?: string | null): string {
  if (!value) return DEFAULT_SHARE_IMAGE;

  try {
    const url = new URL(value);
    if (url.hostname === "images.unsplash.com") {
      url.searchParams.set("w", "1200");
      url.searchParams.set("h", "630");
      url.searchParams.set("fit", "crop");
    }
    return url.toString();
  } catch {
    return DEFAULT_SHARE_IMAGE;
  }
}
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function productJsonLd(product: CatalogProductDetail) {
  const productUrl = absoluteSiteUrl(`/shop/${product.slug}`);
  const images = product.images.map((image) => image.url);
  const offers = product.variants.length
    ? product.variants.map((variant) => ({
        "@type": "Offer",
        sku: variant.sku,
        price: (variant.price / 100).toFixed(2),
        priceCurrency: product.currency,
        availability:
          variant.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
        itemCondition: "https://schema.org/NewCondition",
        url: productUrl,
      }))
    : [
        {
          "@type": "Offer",
          price: (product.basePrice / 100).toFixed(2),
          priceCurrency: product.currency,
          availability: "https://schema.org/OutOfStock",
          itemCondition: "https://schema.org/NewCondition",
          url: productUrl,
        },
      ];

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    description: compactDescription(product.description, 500),
    category: product.category.name,
    image: images,
    sku: product.variants[0]?.sku,
    brand: {
      "@type": "Brand",
      name: SITE_NAME,
    },
    ...(product.ratingCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: product.ratingAvg.toFixed(1),
            reviewCount: product.ratingCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    offers,
  };
}

export function productBreadcrumbJsonLd(product: CatalogProductDetail) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: absoluteSiteUrl("/"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Shop",
        item: absoluteSiteUrl("/shop"),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: product.name,
        item: absoluteSiteUrl(`/shop/${product.slug}`),
      },
    ],
  };
}

