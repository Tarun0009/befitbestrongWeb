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

const rawBaseQuery = fetchBaseQuery({
  baseUrl: API_URL,
  prepareHeaders: async (headers) => {
    try {
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      // Firebase not configured yet — send unauthenticated request
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
      const auth = getFirebaseAuth();
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true);
        result = await rawBaseQuery(args, api, extraOptions);
      }
    } catch {
      // fall through with original 401
    }
  }
  return result;
};

export interface AuthUser {
  id: string;
  email: string;
  role: "CUSTOMER" | "ADMIN";
  name?: string | null;
}

interface UserResponse {
  user: AuthUser;
}

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Me"],
  endpoints: (builder) => ({
    createSession: builder.mutation<UserResponse, { idToken: string }>({
      query: (body) => ({ url: "/auth/session", method: "POST", body }),
      invalidatesTags: ["Me"],
    }),
    me: builder.query<UserResponse, void>({
      query: () => "/auth/me",
      providesTags: ["Me"],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: ["Me"],
    }),
  }),
});

export const {
  useCreateSessionMutation,
  useMeQuery,
  useLogoutMutation,
} = authApi;

