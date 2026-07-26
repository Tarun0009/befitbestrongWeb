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
import { catalogApi } from "@/lib/catalogApi";

const API_URL = publicEnv.apiUrl;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  credentials: "include",
  prepareHeaders: async (headers) => {
    attachDeviceSessionHeader(headers);
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set("Authorization", "Bearer " + token);
      }
    } catch {
      /* Public review reads still work when Firebase is unavailable. */
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
      /* Keep the original API error. */
    }
  }
  return result;
};

export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface CustomerReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  verifiedPurchase: boolean;
  status?: ReviewStatus;
  createdAt: string;
  updatedAt?: string;
  user?: { name: string };
}

export interface ProductReviewResponse {
  product: { id: string; slug: string; name: string };
  summary: {
    average: number;
    count: number;
    distribution: Array<{ rating: number; count: number }>;
  };
  items: CustomerReview[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ReviewEligibility {
  eligible: boolean;
  reason: "eligible" | "already_reviewed" | "no_delivered_purchase";
  existingReview: CustomerReview | null;
}

export interface AdminReview {
  id: string;
  rating: number;
  title: string | null;
  comment: string;
  verifiedPurchase: boolean;
  status: ReviewStatus;
  purchaseOrderId: string | null;
  moderatedAt: string | null;
  moderatedBy: string | null;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; slug: string };
  user: { id: string; name: string | null; email: string };
}

export const reviewsApi = createApi({
  reducerPath: "reviewsApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["ProductReviews", "ReviewEligibility", "AdminReviews"],
  endpoints: (builder) => ({
    getProductReviews: builder.query<
      ProductReviewResponse,
      { slug: string; page?: number; limit?: number }
    >({
      query: ({ slug, page = 1, limit = 10 }) => ({
        url: "/reviews/products/" + slug,
        params: { page, limit },
      }),
      providesTags: (_result, _error, arg) => [
        { type: "ProductReviews", id: arg.slug },
      ],
    }),
    getReviewEligibility: builder.query<ReviewEligibility, string>({
      query: (slug) => "/reviews/products/" + slug + "/eligibility",
      providesTags: (_result, _error, slug) => [
        { type: "ReviewEligibility", id: slug },
      ],
    }),
    createReview: builder.mutation<
      { review: CustomerReview },
      {
        slug: string;
        body: { rating: number; title?: string | null; comment: string };
      }
    >({
      query: ({ slug, body }) => ({
        url: "/reviews/products/" + slug,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        { type: "ReviewEligibility", id: arg.slug },
        "AdminReviews",
      ],
    }),
    adminListReviews: builder.query<
      {
        items: AdminReview[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
      },
      {
        status?: ReviewStatus;
        rating?: number;
        page?: number;
        limit?: number;
      }
    >({
      query: (params) => ({ url: "/admin/reviews", params }),
      providesTags: ["AdminReviews"],
    }),
    adminModerateReview: builder.mutation<
      {
        review: {
          id: string;
          status: ReviewStatus;
          productId: string;
          product: { slug: string };
        };
        ratingAvg: number;
        ratingCount: number;
      },
      { id: string; status: "APPROVED" | "REJECTED" }
    >({
      query: ({ id, status }) => ({
        url: "/admin/reviews/" + id + "/moderate",
        method: "PATCH",
        body: { status },
      }),
      invalidatesTags: (result) => [
        "AdminReviews",
        ...(result
          ? [
              {
                type: "ProductReviews" as const,
                id: result.review.product.slug,
              },
            ]
          : []),
      ],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            catalogApi.util.invalidateTags([
              "Products",
              "Search",
              { type: "Product", id: data.review.product.slug },
            ]),
          );
        } catch {
          /* The mutation error is surfaced by the caller. */
        }
      },
    }),
  }),
});

export const {
  useGetProductReviewsQuery,
  useGetReviewEligibilityQuery,
  useCreateReviewMutation,
  useAdminListReviewsQuery,
  useAdminModerateReviewMutation,
} = reviewsApi;

