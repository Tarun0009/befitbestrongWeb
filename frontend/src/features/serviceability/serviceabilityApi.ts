import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { publicEnv } from "@/config/publicEnv";
import { getFirebaseAuth } from "@/lib/firebase";

export type ServiceZone = "DELHI" | "NOIDA" | "GHAZIABAD";

export type ServiceabilityResult =
  | { serviceable: false; pincode: string }
  | {
      serviceable: true;
      pincode: string;
      zone: ServiceZone;
      city: string;
      state: string;
      prepaidEnabled: boolean;
      codEnabled: boolean;
      codMaxOrderAmount: number;
      codFee: number;
      estimatedDeliveryMinDays: number;
      estimatedDeliveryMaxDays: number;
    };

export interface ServiceArea {
  id: string;
  pincode: string;
  zone: ServiceZone;
  city: string;
  state: string;
  active: boolean;
  prepaidEnabled: boolean;
  codEnabled: boolean;
  codMaxOrderAmount: number;
  codFee: number;
  estimatedDeliveryMinDays: number;
  estimatedDeliveryMaxDays: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceAreaDemand {
  pincode: string;
  uniqueRequesters: number;
  requestAttempts: number;
  lastRequestedAt: string | null;
}

const baseQuery = fetchBaseQuery({
  baseUrl: publicEnv.apiUrl,
  credentials: "include",
  prepareHeaders: async (headers) => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        headers.set("Authorization", "Bearer " + (await user.getIdToken()));
      }
    } catch {
      // Public checks and guest requests still work without a token.
    }
    return headers;
  },
});

export const serviceabilityApi = createApi({
  reducerPath: "serviceabilityApi",
  baseQuery,
  tagTypes: ["ServiceAreas", "ServiceAreaDemand"],
  endpoints: (builder) => ({
    checkServiceability: builder.query<ServiceabilityResult, string>({
      query: (pincode) => "/serviceability/" + pincode,
    }),
    requestServiceArea: builder.mutation<
      { accepted: true; message: string },
      {
        pincode: string;
        email?: string;
        phone?: string;
        productId?: string;
        source: "product" | "checkout" | "cart" | "footer" | "storefront";
      }
    >({
      query: (body) => ({
        url: "/serviceability/requests",
        method: "POST",
        body,
      }),
      invalidatesTags: ["ServiceAreaDemand"],
    }),
    adminListServiceAreas: builder.query<
      {
        items: ServiceArea[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      },
      {
        page?: number;
        limit?: number;
        zone?: ServiceZone;
        active?: "true" | "false";
        search?: string;
      }
    >({
      query: (params) => ({ url: "/admin/service-areas", params }),
      providesTags: ["ServiceAreas"],
    }),
    adminCreateServiceArea: builder.mutation<
      { area: ServiceArea },
      Omit<ServiceArea, "id" | "createdAt" | "updatedAt">
    >({
      query: (body) => ({
        url: "/admin/service-areas",
        method: "POST",
        body,
      }),
      invalidatesTags: ["ServiceAreas"],
    }),
    adminUpdateServiceArea: builder.mutation<
      { area: ServiceArea },
      { id: string; patch: Partial<Omit<ServiceArea, "id" | "createdAt" | "updatedAt">> }
    >({
      query: ({ id, patch }) => ({
        url: "/admin/service-areas/" + id,
        method: "PATCH",
        body: patch,
      }),
      invalidatesTags: ["ServiceAreas"],
    }),
    adminListServiceAreaDemand: builder.query<
      {
        items: ServiceAreaDemand[];
        total: number;
        page: number;
        limit: number;
      },
      { page?: number; limit?: number } | void
    >({
      query: (params) => ({
        url: "/admin/service-area-demand",
        params: params ?? {},
      }),
      providesTags: ["ServiceAreaDemand"],
    }),
  }),
});

export const {
  useLazyCheckServiceabilityQuery,
  useRequestServiceAreaMutation,
  useAdminListServiceAreasQuery,
  useAdminCreateServiceAreaMutation,
  useAdminUpdateServiceAreaMutation,
  useAdminListServiceAreaDemandQuery,
} = serviceabilityApi;

