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
      /* Public reads remain anonymous. */
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

export type BundlePricingType = "FIXED_PRICE" | "PERCENTAGE_OFF";
export type BundleStatus =
  | "INACTIVE"
  | "OUTSIDE_SCHEDULE"
  | "INVALID_PRICING"
  | "OUT_OF_STOCK"
  | "AVAILABLE";

export interface BundleItem {
  id: string;
  variantId: string;
  quantity: number;
  position: number;
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
    image: { url: string; alt: string | null } | null;
  };
}

export interface Bundle {
  id: string;
  name: string;
  slug: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  pricingType: BundlePricingType;
  value: number;
  startsAt: string | null;
  endsAt: string | null;
  componentTotal: number;
  unitPrice: number;
  savings: number;
  savingsPercent: number;
  availableUnits: number;
  sellable: boolean;
  status: BundleStatus;
  items: BundleItem[];
  createdAt: string;
  updatedAt: string;
}


export interface BundleVariantOption {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  stock: number;
  product: { id: string; name: string; slug: string };
}

export interface BundleWriteInput {
  name: string;
  description: string;
  imageUrl?: string | null;
  active: boolean;
  pricingType: BundlePricingType;
  value: number;
  startsAt?: string | null;
  endsAt?: string | null;
  items: Array<{ variantId: string; quantity: number }>;
}

export type BundleUpdateInput = Partial<BundleWriteInput>;

export const bundlesApi = createApi({
  reducerPath: "bundlesApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Bundles", "Bundle", "AdminBundles"],
  endpoints: (builder) => ({
    listBundles: builder.query<{ items: Bundle[] }, void>({
      query: () => "/bundles",
      providesTags: ["Bundles"],
    }),
    getBundle: builder.query<{ bundle: Bundle }, string>({
      query: (slug) => "/bundles/" + slug,
      providesTags: (_result, _error, slug) => [{ type: "Bundle", id: slug }],
    }),
    adminBundleOptions: builder.query<{ items: BundleVariantOption[] }, void>({
      query: () => "/admin/bundles/options",
    }),    adminListBundles: builder.query<{ items: Bundle[] }, void>({
      query: () => "/admin/bundles",
      providesTags: ["AdminBundles"],
    }),
    adminCreateBundle: builder.mutation<{ bundle: Bundle }, BundleWriteInput>({
      query: (body) => ({ url: "/admin/bundles", method: "POST", body }),
      invalidatesTags: ["Bundles", "AdminBundles"],
    }),
    adminUpdateBundle: builder.mutation<
      { bundle: Bundle },
      { id: string; body: BundleUpdateInput }
    >({
      query: ({ id, body }) => ({
        url: "/admin/bundles/" + id,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        "Bundles",
        "AdminBundles",
        { type: "Bundle", id: arg.id },
      ],
    }),
    adminDeleteBundle: builder.mutation<void, string>({
      query: (id) => ({ url: "/admin/bundles/" + id, method: "DELETE" }),
      invalidatesTags: ["Bundles", "AdminBundles"],
    }),
  }),
});

export const {
  useListBundlesQuery,
  useGetBundleQuery,
  useAdminBundleOptionsQuery,
  useAdminListBundlesQuery,
  useAdminCreateBundleMutation,
  useAdminUpdateBundleMutation,
  useAdminDeleteBundleMutation,
} = bundlesApi;
