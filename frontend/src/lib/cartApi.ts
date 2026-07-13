import { publicEnv } from "@/config/publicEnv";
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from "@reduxjs/toolkit/query/react";
import { getFirebaseAuth } from "@/lib/firebase";

const API_URL = publicEnv.apiUrl;

/**
 * Cart requests must include cookies (the guest session lives in `cart_sid`)
 * AND the Firebase bearer token when the user is signed in. Backend decides
 * ownership based on whichever it finds; auth wins over cookie.
 */
const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  credentials: "include",
  prepareHeaders: async (headers) => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      /* firebase not configured — anonymous request */
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

export interface CartLine {
  variantId: string;
  productId: string;
  slug: string;
  name: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  currency: string;
  stock: number;
  quantity: number;
  subtotal: number;
  image: { url: string; alt: string | null } | null;
  outOfStock: boolean;
  cappedByStock: boolean;
}


export interface BundleCartLine {
  bundleId: string;
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  componentTotal: number;
  savings: number;
  savingsPercent: number;
  subtotal: number;
  availableUnits: number;
  currency: string;
  cappedByStock: boolean;
  items: Array<{
    variantId: string;
    quantity: number;
    sku: string;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
    product: {
      id: string;
      name: string;
      slug: string;
      image: { url: string; alt: string | null } | null;
    };
  }>;
}

export type CartNotice =
  | {
      kind: "capped";
      variantId: string;
      requested: number;
      effective: number;
    }
  | { kind: "removed_variant"; variantId: string }
  | { kind: "inactive_product"; variantId: string }
  | { kind: "removed_bundle"; bundleId: string }
  | {
      kind: "capped_bundle";
      bundleId: string;
      requested: number;
      effective: number;
    };

export interface Cart {
  items: CartLine[];
  bundles: BundleCartLine[];
  count: number;
  subtotal: number;
  retailSubtotal: number;
  bundleSavings: number;
  currency: string | null;
  notices: CartNotice[];
}

export const emptyCart: Cart = {
  items: [],
  bundles: [],
  count: 0,
  subtotal: 0,
  retailSubtotal: 0,
  bundleSavings: 0,
  currency: null,
  notices: [],
};


function recalculateCart(cart: Cart) {
  const itemCount = cart.items.reduce((sum, item) => sum + item.quantity, 0);
  const bundleCount = cart.bundles.reduce(
    (sum, bundle) =>
      sum +
      bundle.items.reduce(
        (itemSum, item) => itemSum + item.quantity * bundle.quantity,
        0,
      ),
    0,
  );
  const itemSubtotal = cart.items.reduce((sum, item) => sum + item.subtotal, 0);
  const bundleSubtotal = cart.bundles.reduce(
    (sum, bundle) => sum + bundle.subtotal,
    0,
  );
  const bundleRetail = cart.bundles.reduce(
    (sum, bundle) => sum + bundle.componentTotal * bundle.quantity,
    0,
  );
  cart.count = itemCount + bundleCount;
  cart.subtotal = itemSubtotal + bundleSubtotal;
  cart.retailSubtotal = itemSubtotal + bundleRetail;
  cart.bundleSavings = bundleRetail - bundleSubtotal;
}

export const cartApi = createApi({
  reducerPath: "cartApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Cart"],
  endpoints: (builder) => ({
    getCart: builder.query<Cart, void>({
      query: () => "/cart",
      providesTags: ["Cart"],
    }),
    addItem: builder.mutation<
      { cart: Cart; effective: number },
      { variantId: string; quantity?: number }
    >({
      query: (body) => ({ url: "/cart/items", method: "POST", body }),
      // Optimistic: bump the count in the cached cart so the header badge
      // updates without waiting for the round-trip. The real cart response
      // replaces this snapshot on success.
      onQueryStarted: async (arg, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          cartApi.util.updateQueryData("getCart", undefined, (draft) => {
            const line = draft.items.find(
              (i) => i.variantId === arg.variantId,
            );
            if (line) {
              const next = line.quantity + (arg.quantity ?? 1);
              line.quantity = Math.min(next, line.stock);
              line.subtotal = line.price * line.quantity;
            } else {
              // Unknown variant → bump count only; server will hydrate the row.
            }
            recalculateCart(draft);
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            cartApi.util.updateQueryData("getCart", undefined, () => data.cart),
          );
        } catch {
          patch.undo();
        }
      },
    }),
    setItemQty: builder.mutation<
      Cart,
      { variantId: string; quantity: number }
    >({
      query: ({ variantId, quantity }) => ({
        url: `/cart/items/${variantId}`,
        method: "PATCH",
        body: { quantity },
      }),
      onQueryStarted: async (arg, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          cartApi.util.updateQueryData("getCart", undefined, (draft) => {
            if (arg.quantity <= 0) {
              draft.items = draft.items.filter(
                (i) => i.variantId !== arg.variantId,
              );
            } else {
              const line = draft.items.find(
                (i) => i.variantId === arg.variantId,
              );
              if (line) {
                line.quantity = Math.min(arg.quantity, line.stock);
                line.subtotal = line.price * line.quantity;
              }
            }
            recalculateCart(draft);
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            cartApi.util.updateQueryData("getCart", undefined, () => data),
          );
        } catch {
          patch.undo();
        }
      },
    }),
    removeItem: builder.mutation<Cart, string>({
      query: (variantId) => ({
        url: `/cart/items/${variantId}`,
        method: "DELETE",
      }),
      onQueryStarted: async (variantId, { dispatch, queryFulfilled }) => {
        const patch = dispatch(
          cartApi.util.updateQueryData("getCart", undefined, (draft) => {
            draft.items = draft.items.filter((i) => i.variantId !== variantId);
            recalculateCart(draft);
          }),
        );
        try {
          const { data } = await queryFulfilled;
          dispatch(
            cartApi.util.updateQueryData("getCart", undefined, () => data),
          );
        } catch {
          patch.undo();
        }
      },
    }),
    addBundle: builder.mutation<
      { cart: Cart; effective: number },
      { bundleId: string; quantity?: number }
    >({
      query: (body) => ({ url: "/cart/bundles", method: "POST", body }),
      onQueryStarted: async (_, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(cartApi.util.updateQueryData("getCart", undefined, () => data.cart));
        } catch {
          /* Server remains authoritative for composite pricing. */
        }
      },
    }),
    setBundleQty: builder.mutation<
      Cart,
      { bundleId: string; quantity: number }
    >({
      query: ({ bundleId, quantity }) => ({
        url: "/cart/bundles/" + bundleId,
        method: "PATCH",
        body: { quantity },
      }),
      onQueryStarted: async (_, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(cartApi.util.updateQueryData("getCart", undefined, () => data));
        } catch {
          /* Preserve the previous cart. */
        }
      },
    }),
    removeBundle: builder.mutation<Cart, string>({
      query: (bundleId) => ({
        url: "/cart/bundles/" + bundleId,
        method: "DELETE",
      }),
      onQueryStarted: async (_, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(cartApi.util.updateQueryData("getCart", undefined, () => data));
        } catch {
          /* Preserve the previous cart. */
        }
      },
    }),
    clearCart: builder.mutation<void, void>({
      query: () => ({ url: "/cart", method: "DELETE" }),
      invalidatesTags: ["Cart"],
    }),
    mergeGuestCart: builder.mutation<
      { cart: Cart; merged: number },
      void
    >({
      query: () => ({ url: "/cart/merge", method: "POST" }),
      onQueryStarted: async (_, { dispatch, queryFulfilled }) => {
        try {
          const { data } = await queryFulfilled;
          dispatch(
            cartApi.util.updateQueryData(
              "getCart",
              undefined,
              () => data.cart,
            ),
          );
        } catch {
          /* nothing to roll back */
        }
      },
    }),
  }),
});

export const {
  useGetCartQuery,
  useAddItemMutation,
  useSetItemQtyMutation,
  useRemoveItemMutation,
  useAddBundleMutation,
  useSetBundleQtyMutation,
  useRemoveBundleMutation,
  useClearCartMutation,
  useMergeGuestCartMutation,
} = cartApi;

