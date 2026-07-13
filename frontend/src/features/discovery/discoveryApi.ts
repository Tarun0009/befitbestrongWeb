import { publicEnv } from "@/config/publicEnv";
import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { CatalogListItem } from "@/lib/catalogApi";

const API_URL = publicEnv.apiUrl;

export interface RelatedProduct extends CatalogListItem {
  recommendationReason: string;
}

export const discoveryApi = createApi({
  reducerPath: "discoveryApi",
  baseQuery: fetchBaseQuery({ baseUrl: API_URL }),
  endpoints: (builder) => ({
    getRecentlyViewedProducts: builder.query<
      { items: CatalogListItem[] },
      string[]
    >({
      query: (slugs) => ({
        url: "/discovery/recently-viewed",
        params: { slugs: slugs.join(",") },
      }),
      keepUnusedDataFor: 300,
    }),
    getRelatedProducts: builder.query<
      { items: RelatedProduct[] },
      { slug: string; limit?: number }
    >({
      query: ({ slug, limit = 4 }) => ({
        url: `/discovery/related/${slug}`,
        params: { limit },
      }),
      keepUnusedDataFor: 600,
    }),
  }),
});

export const {
  useGetRecentlyViewedProductsQuery,
  useGetRelatedProductsQuery,
} = discoveryApi;

