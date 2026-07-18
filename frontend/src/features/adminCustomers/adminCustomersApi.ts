import { createApi, fetchBaseQuery, type BaseQueryFn, type FetchArgs, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import { publicEnv } from "@/config/publicEnv";
import { getFirebaseAuth } from "@/lib/firebase";

export type CustomerRole = "CUSTOMER" | "ADMIN";

export interface AdminCustomer {
  id: string;
  email: string;
  name: string | null;
  role: CustomerRole;
  createdAt: string;
  updatedAt: string;
  _count: { orders: number; wishlistItems: number; subscriptions: number };
}

interface CustomerListResponse {
  items: AdminCustomer[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: publicEnv.apiUrl,
  credentials: "include",
  prepareHeaders: async (headers) => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
    } catch {
      // RequireAuth handles the unauthenticated screen; keep API errors explicit.
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
      // Keep the original auth error.
    }
  }
  return result;
};

export const adminCustomersApi = createApi({
  reducerPath: "adminCustomersApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["AdminCustomers", "AdminCustomer"],
  endpoints: (builder) => ({
    listCustomers: builder.query<CustomerListResponse, { page?: number; limit?: number; q?: string; role?: CustomerRole }>({
      query: (params) => ({ url: "/admin/users", params }),
      providesTags: (result) => result
        ? ["AdminCustomers", ...result.items.map((item) => ({ type: "AdminCustomer" as const, id: item.id }))]
        : ["AdminCustomers"],
    }),
    updateCustomerRole: builder.mutation<{ user: Pick<AdminCustomer, "id" | "email" | "role"> }, { id: string; role: CustomerRole }>({
      query: ({ id, role }) => ({ url: `/admin/users/${id}/role`, method: "POST", body: { role } }),
      invalidatesTags: (_result, _error, arg) => ["AdminCustomers", { type: "AdminCustomer", id: arg.id }],
    }),
  }),
});

export const { useListCustomersQuery, useUpdateCustomerRoleMutation } = adminCustomersApi;