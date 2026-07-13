import { publicEnv } from "@/config/publicEnv";
import type {
  CatalogListResponse,
  CatalogProductDetail,
} from "@/lib/catalogApi";

const API_URL = publicEnv.apiUrl;

const CATALOG_REVALIDATE_SECONDS = 600;

export async function getServerProduct(
  slug: string,
): Promise<CatalogProductDetail | null> {
  try {
    const response = await fetch(
      `${API_URL}/products/${encodeURIComponent(slug)}`,
      { next: { revalidate: CATALOG_REVALIDATE_SECONDS } },
    );
    if (!response.ok) return null;
    return (await response.json()) as CatalogProductDetail;
  } catch {
    return null;
  }
}

export async function getServerProductSlugs(): Promise<string[]> {
  const slugs = new Set<string>();
  let page = 1;
  let totalPages = 1;

  try {
    do {
      const response = await fetch(
        `${API_URL}/products?page=${page}&limit=60`,
        { next: { revalidate: CATALOG_REVALIDATE_SECONDS } },
      );
      if (!response.ok) break;

      const result = (await response.json()) as CatalogListResponse;
      result.items.forEach((product) => slugs.add(product.slug));
      totalPages = Math.max(1, result.totalPages);
      page += 1;
    } while (page <= totalPages && page <= 100);
  } catch {
    return [...slugs];
  }

  return [...slugs];
}

