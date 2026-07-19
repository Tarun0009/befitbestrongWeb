import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { publicEnv } from "@/config/publicEnv";
import { getFirebaseAuth } from "@/lib/firebase";

export type ServiceabilityResult =
  | { serviceable: false; pincode: string }
  | {
      serviceable: true;
      pincode: string;
      zone: "DELHI" | "NOIDA" | "GHAZIABAD" | null;
      city: string | null;
      state: string | null;
      prepaidEnabled: boolean;
      codEnabled: boolean;
      codMaxOrderAmount: number;
      codFee: number;
      estimatedDeliveryMinDays: number;
      estimatedDeliveryMaxDays: number;
  };

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
  endpoints: (builder) => ({
    checkServiceability: builder.query<ServiceabilityResult, string>({
      query: (pincode) => "/serviceability/" + pincode,
    }),
  }),
});

export const {
  useLazyCheckServiceabilityQuery,
} = serviceabilityApi;

