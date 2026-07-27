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
  credentials: "include",
  prepareHeaders: async (headers) => {
    attachDeviceSessionHeader(headers);
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) headers.set("Authorization", "Bearer " + (await user.getIdToken()));
    } catch {
      /* Protected endpoints surface their normal error. */
    }
    return headers;
  },
});
const baseQueryWithRefresh: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (args, api, extraOptions) => {
  let result = await rawBaseQuery(args, api, extraOptions);
  if (result.error?.status === 401) {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        await user.getIdToken(true);
        result = await rawBaseQuery(args, api, extraOptions);
      }
    } catch {
      /* Preserve the API response. */
    }
  }
  return result;
};

export interface SubscriptionPlan {
  id: string;
  name: string;
  active: boolean;
  discountPercent: number;
  allowedFrequencies: number[];
  variant: {
    id: string;
    sku: string;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
    discountedPrice: number;
    product: {
      id: string;
      name: string;
      slug: string;
      active: boolean;
      currency: string;
      image: { url: string; alt: string | null } | null;
    };
  };
  createdAt: string;
  updatedAt: string;
}

export type SubscriptionStatus = "ACTIVE" | "PAUSED" | "CANCELLED";
export type RenewalStatus = "READY" | "STOCK_BLOCKED" | "SKIPPED" | "ORDERED";

export interface UserSubscription {
  id: string;
  userId: string;
  planId: string;
  planNameSnapshot: string;
  discountPercent: number;
  quantity: number;
  frequencyDays: number;
  status: SubscriptionStatus;
  nextOrderAt: string;
  contactEmail: string;
  shippingSnapshot: Record<string, unknown>;
  createdFromOrderId: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
  plan: {
    id: string;
    name: string;
    active: boolean;
    allowedFrequencies: number[];
    variant: {
      id: string;
      sku: string;
      size: string | null;
      color: string | null;
      price: number;
      stock: number;
      product: {
        id: string;
        name: string;
        slug: string;
        active: boolean;
        currency: string;
        images: Array<{ url: string; alt: string | null }>;
      };
    };
  };
  renewals: Array<{
    id: string;
    scheduledFor: string;
    status: RenewalStatus;
    unitPriceSnapshot: number;
    discountedUnitPrice: number;
    quantity: number;
    notifiedAt: string | null;
    orderId: string | null;
    createdAt: string;
  }>;
}

export interface AdminSubscriptionsResponse {
  plans: SubscriptionPlan[];
  summary: { active: number; paused: number; cancelled: number };
  upcoming: Array<{
    id: string;
    status: SubscriptionStatus;
    quantity: number;
    frequencyDays: number;
    nextOrderAt: string;
    user: { email: string; name: string | null };
    plan: UserSubscription["plan"];
  }>;
  recentRenewals: Array<{
    id: string;
    scheduledFor: string;
    status: RenewalStatus;
    discountedUnitPrice: number;
    quantity: number;
    subscription: {
      user: { email: string; name: string | null };
      plan: UserSubscription["plan"];
    };
  }>;
}

export const subscriptionsApi = createApi({
  reducerPath: "subscriptionsApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Plans", "Subscriptions", "AdminSubscriptions"],
  endpoints: (builder) => ({
    listSubscriptionPlans: builder.query<{ items: SubscriptionPlan[] }, string | void>({
      query: (variantId) => ({ url: "/subscription-plans", params: variantId ? { variantId } : {} }),
      providesTags: ["Plans"],
    }),
    listSubscriptions: builder.query<{ items: UserSubscription[] }, string>({
      query: () => "/subscriptions",
      providesTags: (_result, _error, userKey) => [{ type: "Subscriptions", id: userKey }],
    }),
    enrollSubscription: builder.mutation<
      { subscription: UserSubscription },
      { planId: string; orderId: string; quantity: number; frequencyDays: number; userKey: string }
    >({
      query: ({ planId, orderId, quantity, frequencyDays }) => ({
        url: "/subscriptions",
        method: "POST",
        body: { planId, orderId, quantity, frequencyDays },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Subscriptions", id: arg.userKey },
        "AdminSubscriptions",
      ],
    }),
    controlSubscription: builder.mutation<
      { subscription: UserSubscription },
      { id: string; action: "pause" | "resume" | "skip" | "cancel"; userKey: string }
    >({
      query: ({ id, action }) => ({ url: "/subscriptions/" + id + "/" + action, method: "POST" }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Subscriptions", id: arg.userKey },
        "AdminSubscriptions",
      ],
    }),
    adminGetSubscriptions: builder.query<AdminSubscriptionsResponse, void>({
      query: () => "/admin/subscriptions",
      providesTags: ["AdminSubscriptions"],
    }),
    adminCreateSubscriptionPlan: builder.mutation<
      { plan: SubscriptionPlan },
      { name: string; variantId: string; discountPercent: number; allowedFrequencies: number[]; active: boolean }
    >({
      query: (body) => ({ url: "/admin/subscription-plans", method: "POST", body }),
      invalidatesTags: ["Plans", "AdminSubscriptions"],
    }),
    adminUpdateSubscriptionPlan: builder.mutation<
      { plan: SubscriptionPlan },
      { id: string; body: Partial<{ name: string; discountPercent: number; allowedFrequencies: number[]; active: boolean }> }
    >({
      query: ({ id, body }) => ({ url: "/admin/subscription-plans/" + id, method: "PATCH", body }),
      invalidatesTags: ["Plans", "AdminSubscriptions"],
    }),
    adminDeleteSubscriptionPlan: builder.mutation<void, string>({
      query: (id) => ({ url: "/admin/subscription-plans/" + id, method: "DELETE" }),
      invalidatesTags: ["Plans", "AdminSubscriptions"],
    }),
    adminProcessSubscriptions: builder.mutation<{ processed: number }, void>({
      query: () => ({ url: "/admin/subscriptions/process-due", method: "POST" }),
      invalidatesTags: ["AdminSubscriptions", "Subscriptions"],
    }),
  }),
});

export const {
  useListSubscriptionPlansQuery,
  useListSubscriptionsQuery,
  useEnrollSubscriptionMutation,
  useControlSubscriptionMutation,
  useAdminGetSubscriptionsQuery,
  useAdminCreateSubscriptionPlanMutation,
  useAdminUpdateSubscriptionPlanMutation,
  useAdminDeleteSubscriptionPlanMutation,
  useAdminProcessSubscriptionsMutation,
} = subscriptionsApi;
