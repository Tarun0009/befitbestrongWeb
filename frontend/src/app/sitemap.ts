import type { MetadataRoute } from "next";
import { getServerProductSlugs } from "@/lib/catalogServer";
import { absoluteSiteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const products = await getServerProductSlugs();

  return [
    {
      url: absoluteSiteUrl("/"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: absoluteSiteUrl("/shop"),
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: absoluteSiteUrl("/bundles"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    ...products.map((slug) => ({
      url: absoluteSiteUrl(`/shop/${slug}`),
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
