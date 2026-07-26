import { publicEnv } from "@/config/publicEnv";
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { getFirebaseAuth } from "@/lib/firebase";
import { attachDeviceSessionHeader } from "@/features/auth/deviceSession";

const API_URL = publicEnv.apiUrl;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: async (headers) => {
    attachDeviceSessionHeader(headers);
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      /* anonymous */
    }
    return headers;
  },
});

const baseQueryWithRefresh: BaseQueryFn<
  string | FetchArgs,
  unknown,
  FetchBaseQueryError
> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        await user.getIdToken(true);
        result = await rawBaseQuery(args, api, extraOptions);
      }
    } catch {
      /* fall through */
    }
  }
  return result;
};

export interface AnalyticsSummary {
  revenueToday: number;
  ordersToday: number;
  ordersByStatus: Partial<Record<
    | "PENDING"
    | "PAID"
    | "SHIPPED"
    | "DELIVERED"
    | "CANCELLED"
    | "FAILED"
    | "REFUNDED",
    number
  >>;
  lowStockCount: number;
  lowStockItems: Array<{
    variantId: string;
    sku: string;
    stock: number;
    size: string | null;
    color: string | null;
    product: { id: string; name: string; slug: string };
  }>;
}

export interface TopProductsResponse {
  days: number;
  items: Array<{
    productId: string;
    name: string;
    slug: string;
    unitsSold: number;
    revenue: number;
    pctOfTop: number;
  }>;
}

export const adminAnalyticsApi = createApi({
  reducerPath: "adminAnalyticsApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["AnalyticsSummary", "TopProducts"],
  endpoints: (builder) => ({
    getAnalyticsSummary: builder.query<AnalyticsSummary, void>({
      query: () => "/admin/analytics/summary",
      providesTags: ["AnalyticsSummary"],
    }),
    getTopProducts: builder.query<
      TopProductsResponse,
      { days?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: "/admin/analytics/top-products",
        params: params ?? {},
      }),
      providesTags: ["TopProducts"],
    }),
  }),
});

export const { useGetAnalyticsSummaryQuery, useGetTopProductsQuery } =
  adminAnalyticsApi;

