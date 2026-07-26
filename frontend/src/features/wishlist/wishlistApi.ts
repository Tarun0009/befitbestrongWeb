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
import type { CatalogListItem } from "@/lib/catalogApi";

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
      /* Preserve the API error. */
    }
  }
  return result;
};

export interface WishlistProduct extends CatalogListItem {
  totalStock: number;
  variantCount: number;
}

export interface WishlistItem {
  id: string;
  addedAt: string;
  product: WishlistProduct;
}

export interface WishlistResponse {
  productIds: string[];
  items: WishlistItem[];
}

export interface StockAlertItem {
  id: string;
  variantId: string;
  createdAt: string;
  variant: {
    sku: string;
    size: string | null;
    color: string | null;
    stock: number;
  };
  product: {
    id: string;
    slug: string;
    name: string;
    image: { url: string; alt: string | null } | null;
  };
}

export interface StockAlertsResponse {
  variantIds: string[];
  items: StockAlertItem[];
}

export interface AdminDemandResponse {
  summary: {
    totalWishlistItems: number;
    activeStockAlerts: number;
    alertCustomers: number;
    notificationsConfigured: boolean;
  };
  topWishlisted: Array<{
    product: {
      id: string;
      name: string;
      slug: string;
      active: boolean;
    };
    count: number;
  }>;
  stockAlertDemand: Array<{
    variant: {
      id: string;
      sku: string;
      size: string | null;
      color: string | null;
      stock: number;
      product: {
        id: string;
        name: string;
        slug: string;
        active: boolean;
      };
    };
    count: number;
  }>;
}

export const wishlistApi = createApi({
  reducerPath: "wishlistApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Wishlist", "StockAlerts", "AdminDemand"],
  endpoints: (builder) => ({
    getWishlist: builder.query<WishlistResponse, string>({
      query: () => "/wishlist",
      providesTags: (_result, _error, userKey) => [
        { type: "Wishlist", id: userKey },
      ],
    }),
    addWishlistItem: builder.mutation<
      { item: WishlistItem },
      { productId: string; userKey: string }
    >({
      query: ({ productId }) => ({
        url: "/wishlist/" + productId,
        method: "POST",
      }),
      async onQueryStarted(
        { productId, userKey },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          wishlistApi.util.updateQueryData(
            "getWishlist",
            userKey,
            (draft) => {
              if (!draft.productIds.includes(productId)) {
                draft.productIds.push(productId);
              }
            },
          ),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            wishlistApi.util.updateQueryData(
              "getWishlist",
              userKey,
              (draft) => {
                if (!draft.items.some((item) => item.product.id === productId)) {
                  draft.items.unshift(data.item);
                }
              },
            ),
          );
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["AdminDemand"],
    }),
    removeWishlistItem: builder.mutation<
      void,
      { productId: string; userKey: string }
    >({
      query: ({ productId }) => ({
        url: "/wishlist/" + productId,
        method: "DELETE",
      }),
      async onQueryStarted(
        { productId, userKey },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          wishlistApi.util.updateQueryData(
            "getWishlist",
            userKey,
            (draft) => {
              draft.productIds = draft.productIds.filter(
                (id) => id !== productId,
              );
              draft.items = draft.items.filter(
                (item) => item.product.id !== productId,
              );
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["AdminDemand"],
    }),
    getStockAlerts: builder.query<StockAlertsResponse, string>({
      query: () => "/stock-alerts",
      providesTags: (_result, _error, userKey) => [
        { type: "StockAlerts", id: userKey },
      ],
    }),
    subscribeStockAlert: builder.mutation<
      { item: StockAlertItem },
      { variantId: string; userKey: string }
    >({
      query: ({ variantId }) => ({
        url: "/stock-alerts/" + variantId,
        method: "POST",
      }),
      async onQueryStarted(
        { variantId, userKey },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          wishlistApi.util.updateQueryData(
            "getStockAlerts",
            userKey,
            (draft) => {
              if (!draft.variantIds.includes(variantId)) {
                draft.variantIds.push(variantId);
              }
            },
          ),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            wishlistApi.util.updateQueryData(
              "getStockAlerts",
              userKey,
              (draft) => {
                if (!draft.items.some((item) => item.variantId === variantId)) {
                  draft.items.unshift(data.item);
                }
              },
            ),
          );
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["AdminDemand"],
    }),
    unsubscribeStockAlert: builder.mutation<
      void,
      { variantId: string; userKey: string }
    >({
      query: ({ variantId }) => ({
        url: "/stock-alerts/" + variantId,
        method: "DELETE",
      }),
      async onQueryStarted(
        { variantId, userKey },
        { dispatch, queryFulfilled },
      ) {
        const patch = dispatch(
          wishlistApi.util.updateQueryData(
            "getStockAlerts",
            userKey,
            (draft) => {
              draft.variantIds = draft.variantIds.filter(
                (id) => id !== variantId,
              );
              draft.items = draft.items.filter(
                (item) => item.variantId !== variantId,
              );
            },
          ),
        );
        try {
          await queryFulfilled;
        } catch {
          patch.undo();
        }
      },
      invalidatesTags: ["AdminDemand"],
    }),
    adminGetDemand: builder.query<AdminDemandResponse, void>({
      query: () => "/admin/demand",
      providesTags: ["AdminDemand"],
    }),
  }),
});

export const {
  useGetWishlistQuery,
  useAddWishlistItemMutation,
  useRemoveWishlistItemMutation,
  useGetStockAlertsQuery,
  useSubscribeStockAlertMutation,
  useUnsubscribeStockAlertMutation,
  useAdminGetDemandQuery,
} = wishlistApi;

