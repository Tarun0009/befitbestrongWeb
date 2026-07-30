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
const PUBLIC_CATALOG_ENDPOINTS = new Set([
  "getCategories",
  "getProducts",
  "getProduct",
  "searchProducts",
]);

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: async (headers, { endpoint }) => {
    attachDeviceSessionHeader(headers);
    if (PUBLIC_CATALOG_ENDPOINTS.has(endpoint)) {
      return headers;
    }
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
  if (PUBLIC_CATALOG_ENDPOINTS.has(api.endpoint)) return result;
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

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  productCount: number;
}

export interface CatalogListItem {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  currency: string;
  dispatchHint: string | null;
  ratingAvg: number;
  ratingCount: number;
  category: { id: string; name: string; slug: string };
  image: { url: string; alt?: string | null } | null;
}

export interface CatalogListResponse {
  items: CatalogListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CatalogVariant {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price: number;
  stock: number;
}

export interface CatalogImage {
  id: string;
  url: string;
  alt: string | null;
  position: number;
}

export interface CatalogProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  compareAtPrice: number | null;
  currency: string;
  dispatchHint: string | null;
  ratingAvg: number;
  ratingCount: number;
  active: boolean;
  category: { id: string; name: string; slug: string };
  images: CatalogImage[];
  variants: CatalogVariant[];
}

export interface ProductListFilters {
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  limit?: number;
}

export interface AdminProductRow {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  currency: string;
  dispatchHint: string | null;
  active: boolean;
  category: { name: string; slug: string };
  variantCount: number;
  imageCount: number;
  createdAt: string;
}

export interface AdminProductDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  basePrice: number;
  compareAtPrice: number | null;
  currency: string;
  dispatchHint: string | null;
  active: boolean;
  categoryId: string;
  category: { id: string; name: string; slug: string };
  images: Array<{
    id: string;
    url: string;
    alt: string | null;
    position: number;
    provider: string | null;
    storageKey: string | null;
    assetId: string | null;
    version: number | null;
    width: number | null;
    height: number | null;
    bytes: number | null;
    format: string | null;
  }>;
  variants: Array<{
    id: string;
    sku: string;
    size: string | null;
    color: string | null;
    price: number;
    stock: number;
  }>;
}

export interface CreateProductBody {
  name: string;
  description: string;
  categoryId: string;
  basePrice: number;
  compareAtPrice?: number | null;
  dispatchHint?: string | null;
  active?: boolean;
  images?: Array<{ url: string; alt?: string }>;
  variants?: Array<{
    sku: string;
    size?: string;
    color?: string;
    price: number;
    stock: number;
  }>;
}

export type SearchSort = "relevance" | "newest" | "price_asc" | "price_desc";

export interface SearchParams {
  q?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: SearchSort;
  cursor?: string;
  page?: number;
  limit?: number;
}

export interface SearchItem {
  id: string;
  slug: string;
  name: string;
  basePrice: number;
  compareAtPrice: number | null;
  currency: string;
  dispatchHint: string | null;
  ratingAvg: number;
  ratingCount: number;
  category: { id: string; name: string; slug: string };
  image: { url: string; alt: string | null } | null;
  rank: number | null;
}

export interface SearchResponse {
  items: SearchItem[];
  total: number;
  page: number | null;
  limit: number;
  totalPages: number | null;
  nextCursor: string | null;
  sort: SearchSort;
  q: string | null;
}

export const catalogApi = createApi({
  reducerPath: "catalogApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: [
    "Products",
    "Product",
    "Categories",
    "AdminCategories",
    "AdminProducts",
    "AdminProduct",
    "Search",
  ],
  endpoints: (builder) => ({
    getCategories: builder.query<{ items: CatalogCategory[] }, void>({
      query: () => "/categories",
      providesTags: ["Categories"],
    }),
    getProducts: builder.query<CatalogListResponse, ProductListFilters>({
      query: (params) => ({ url: "/products", params }),
      providesTags: ["Products"],
    }),
    getProduct: builder.query<CatalogProductDetail, string>({
      query: (slug) => `/products/${slug}`,
      providesTags: (_r, _e, slug) => [{ type: "Product", id: slug }],
    }),
    searchProducts: builder.query<SearchResponse, SearchParams>({
      query: (params) => {
        const clean: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(params)) {
          if (v !== undefined && v !== "" && v !== null) {
            clean[k] = v as string | number;
          }
        }
        return { url: "/search", params: clean };
      },
      providesTags: ["Search"],
    }),

    adminListProducts: builder.query<
      {
        items: AdminProductRow[];
        total: number;
        page: number;
        totalPages: number;
      },
      { page?: number; search?: string; limit?: number }
    >({
      query: (params) => ({ url: "/admin/products", params }),
      providesTags: ["AdminProducts"],
    }),
    adminGetProduct: builder.query<{ product: AdminProductDetail }, string>({
      query: (id) => `/admin/products/${id}`,
      providesTags: (_r, _e, id) => [{ type: "AdminProduct" as const, id }],
    }),
    adminCreateProduct: builder.mutation<
      { product: AdminProductDetail },
      CreateProductBody
    >({
      query: (body) => ({ url: "/admin/products", method: "POST", body }),
      invalidatesTags: [
        "AdminProducts",
        "Products",
        "Categories",
        "Search",
      ],
    }),
    adminUpdateProduct: builder.mutation<
      { product: unknown },
      {
        id: string;
        body: Partial<{
          name: string;
          description: string;
          basePrice: number;
          compareAtPrice: number | null;
          dispatchHint: string | null;
          active: boolean;
          categoryId: string;
        }>;
      }
    >({
      query: ({ id, body }) => ({
        url: `/admin/products/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.id },
        "Products",
        "Categories",
        "Search",
      ],
    }),
    adminDeleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/products/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminProducts", "Products", "Search"],
    }),

    // Variant CRUD — used by the variant editor on the product edit page.
    adminCreateVariant: builder.mutation<
      { variant: AdminProductDetail["variants"][number] },
      {
        productId: string;
        body: {
          sku: string;
          size?: string;
          color?: string;
          price: number;
          stock: number;
        };
      }
    >({
      query: ({ productId, body }) => ({
        url: `/admin/products/${productId}/variants`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.productId },
        "Products",
        "Search",
      ],
    }),
    adminUpdateVariant: builder.mutation<
      { variant: AdminProductDetail["variants"][number] },
      {
        variantId: string;
        productId: string;
        body: Partial<{
          sku: string;
          size: string | null;
          color: string | null;
          price: number;
          stock: number;
        }>;
      }
    >({
      query: ({ variantId, body }) => ({
        url: `/admin/variants/${variantId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.productId },
        "Products",
        "Search",
      ],
    }),
    adminDeleteVariant: builder.mutation<
      void,
      { variantId: string; productId: string }
    >({
      query: ({ variantId }) => ({
        url: `/admin/variants/${variantId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.productId },
        "Products",
        "Search",
      ],
    }),

    // ---- Product images ----
    adminAddImage: builder.mutation<
      { image: AdminProductDetail["images"][number] },
      {
        productId: string;
        body: { url: string; alt?: string; position?: number };
      }
    >({
      query: ({ productId, body }) => ({
        url: `/admin/products/${productId}/images`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.productId },
        "Products",
        "Search",
      ],
    }),
    adminUpdateImage: builder.mutation<
      { image: AdminProductDetail["images"][number] },
      {
        imageId: string;
        productId: string;
        body: Partial<{
          url: string;
          alt: string | null;
          position: number;
        }>;
      }
    >({
      query: ({ imageId, body }) => ({
        url: `/admin/images/${imageId}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.productId },
        "Products",
        "Search",
      ],
    }),
    adminDeleteImage: builder.mutation<
      void,
      { imageId: string; productId: string }
    >({
      query: ({ imageId }) => ({
        url: `/admin/images/${imageId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminProducts",
        { type: "AdminProduct" as const, id: arg.productId },
        "Products",
        "Search",
      ],
    }),

    // ---- Admin categories ----
    adminListCategories: builder.query<
      {
        items: Array<{
          id: string;
          name: string;
          slug: string;
          description: string | null;
          parentId: string | null;
          productCount: number;
        }>;
      },
      void
    >({
      query: () => "/admin/categories",
      providesTags: ["AdminCategories"],
    }),
    adminCreateCategory: builder.mutation<
      { category: { id: string; name: string; slug: string } },
      { name: string; description?: string; parentId?: string }
    >({
      query: (body) => ({
        url: "/admin/categories",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AdminCategories", "Categories"],
    }),
    adminUpdateCategory: builder.mutation<
      { category: { id: string; name: string; slug: string } },
      {
        id: string;
        body: Partial<{
          name: string;
          description: string | null;
          parentId: string | null;
        }>;
      }
    >({
      query: ({ id, body }) => ({
        url: `/admin/categories/${id}`,
        method: "PATCH",
        body,
      }),
      invalidatesTags: [
        "AdminCategories",
        "Categories",
        "AdminProducts",
        "Products",
        "Search",
      ],
    }),
    adminDeleteCategory: builder.mutation<void, string>({
      query: (id) => ({ url: `/admin/categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["AdminCategories", "Categories"],
    }),
  }),
});

export const {
  useGetCategoriesQuery,
  useGetProductsQuery,
  useGetProductQuery,
  useSearchProductsQuery,
  useAdminListProductsQuery,
  useAdminGetProductQuery,
  useAdminCreateProductMutation,
  useAdminUpdateProductMutation,
  useAdminDeleteProductMutation,
  useAdminCreateVariantMutation,
  useAdminUpdateVariantMutation,
  useAdminDeleteVariantMutation,
  useAdminAddImageMutation,
  useAdminUpdateImageMutation,
  useAdminDeleteImageMutation,
  useAdminListCategoriesQuery,
  useAdminCreateCategoryMutation,
  useAdminUpdateCategoryMutation,
  useAdminDeleteCategoryMutation,
} = catalogApi;




