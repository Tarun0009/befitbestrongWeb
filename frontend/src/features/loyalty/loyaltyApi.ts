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
      if (user) {
        headers.set("Authorization", "Bearer " + (await user.getIdToken()));
      }
    } catch {
      /* Protected requests surface their normal authentication error. */
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
      /* Preserve the original API error. */
    }
  }
  return result;
};

export type LoyaltyEntryType =
  | "ORDER_EARN"
  | "ORDER_REFUND_REVERSAL"
  | "REFERRAL_BONUS"
  | "REFERRAL_REVERSAL"
  | "COUPON_REDEMPTION"
  | "REDEMPTION_RESTORE"
  | "ADMIN_ADJUSTMENT";

export type ReferralStatus = "PENDING" | "REWARDED" | "CANCELLED";

export interface LoyaltyConfig {
  enabled: boolean;
  earnPointsPerRupee: number;
  redeemPointsPerRupee: number;
  minRedeemPoints: number;
  maxRedeemPointsPerCoupon: number | null;
  referralBonusReferrer: number;
  referralBonusReferred: number;
  couponValidityDays: number;
}

export interface LoyaltyEntry {
  id: string;
  type: LoyaltyEntryType;
  points: number;
  description: string;
  orderId: string | null;
  couponCode: string | null;
  createdAt: string;
}

export interface LoyaltyAccountResponse {
  account: {
    id: string;
    pointsBalance: number;
    lifetimePointsEarned: number;
    lifetimePointsRedeemed: number;
    referralCode: string;
  };
  config: LoyaltyConfig;
  entries: LoyaltyEntry[];
  receivedReferral: {
    id: string;
    code: string;
    status: ReferralStatus;
    rewardedAt: string | null;
    referrer: { name: string | null };
  } | null;
  referrals: {
    total: number;
    pending: number;
    rewarded: number;
    cancelled: number;
  };
}

export interface RewardCoupon {
  code: string;
  discount: number;
  points: number;
  expiresAt: string;
}

export interface AdminLoyaltyResponse {
  config: LoyaltyConfig & {
    id: string;
    createdAt: string;
    updatedAt: string;
  };
  summary: {
    pointsOutstanding: number;
    lifetimeEarned: number;
    lifetimeRedeemed: number;
    ledgerEntries: number;
    referralsPending: number;
    referralsRewarded: number;
    referralsCancelled: number;
  };
  topUsers: Array<{
    id: string;
    email: string;
    name: string | null;
    pointsBalance: number;
    lifetimePointsEarned: number;
    lifetimePointsRedeemed: number;
  }>;
  recentEntries: Array<{
    id: string;
    type: LoyaltyEntryType;
    points: number;
    description: string;
    createdAt: string;
    user: { id: string; email: string; name: string | null };
  }>;
}

export const loyaltyApi = createApi({
  reducerPath: "loyaltyApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Loyalty", "AdminLoyalty"],
  endpoints: (builder) => ({
    getLoyalty: builder.query<LoyaltyAccountResponse, string>({
      query: () => "/loyalty",
      providesTags: (_result, _error, userKey) => [
        { type: "Loyalty", id: userKey },
      ],
    }),
    applyReferral: builder.mutation<
      { referral: LoyaltyAccountResponse["receivedReferral"] },
      { code: string; userKey: string }
    >({
      query: ({ code }) => ({
        url: "/loyalty/referral",
        method: "POST",
        body: { code },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Loyalty", id: arg.userKey },
        "AdminLoyalty",
      ],
    }),
    redeemPoints: builder.mutation<
      { coupon: RewardCoupon },
      { points: number; userKey: string }
    >({
      query: ({ points }) => ({
        url: "/loyalty/redeem",
        method: "POST",
        body: { points },
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "Loyalty", id: arg.userKey },
        "AdminLoyalty",
      ],
    }),
    adminGetLoyalty: builder.query<AdminLoyaltyResponse, void>({
      query: () => "/admin/loyalty",
      providesTags: ["AdminLoyalty"],
    }),
    adminUpdateLoyaltyConfig: builder.mutation<
      { config: AdminLoyaltyResponse["config"] },
      Partial<LoyaltyConfig>
    >({
      query: (body) => ({
        url: "/admin/loyalty/config",
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["Loyalty", "AdminLoyalty"],
    }),
    adminAdjustLoyaltyPoints: builder.mutation<
      { entry: LoyaltyEntry },
      { userId: string; points: number; reason: string }
    >({
      query: ({ userId, points, reason }) => ({
        url: "/admin/loyalty/users/" + userId + "/adjust",
        method: "POST",
        body: { points, reason },
      }),
      invalidatesTags: ["Loyalty", "AdminLoyalty"],
    }),
  }),
});

export const {
  useGetLoyaltyQuery,
  useApplyReferralMutation,
  useRedeemPointsMutation,
  useAdminGetLoyaltyQuery,
  useAdminUpdateLoyaltyConfigMutation,
  useAdminAdjustLoyaltyPointsMutation,
} = loyaltyApi;
