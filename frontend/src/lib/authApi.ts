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
  accountStatus: "ACTIVE" | "DELETION_PENDING";
  deletionScheduledFor?: string | null;
}

export interface AccountSession {
  id: string;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
}

interface UserResponse {
  user: AuthUser;
}

export const authApi = createApi({
  reducerPath: "authApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: ["Me", "Sessions"],
  endpoints: (builder) => ({
    createSession: builder.mutation<UserResponse, { idToken: string }>({
      query: (body) => ({ url: "/auth/session", method: "POST", body }),
      invalidatesTags: ["Me", "Sessions"],
    }),
    me: builder.query<UserResponse, void>({
      query: () => "/auth/me",
      providesTags: ["Me"],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: "/auth/logout", method: "POST" }),
      invalidatesTags: ["Me", "Sessions"],
    }),
    requestEmailChange: builder.mutation<
      { status: "confirmation_required"; pendingEmail: string; expiresAt: string },
      { newEmail: string }
    >({
      query: (body) => ({ url: "/auth/email-change", method: "POST", body }),
    }),
    passwordChanged: builder.mutation<void, void>({
      query: () => ({ url: "/auth/security/password-changed", method: "POST" }),
      invalidatesTags: ["Me"],
    }),
    deleteAccount: builder.mutation<
      { status: "deletion_pending"; scheduledFor: string },
      { confirmation: "DELETE" }
    >({
      query: (body) => ({ url: "/auth/account", method: "DELETE", body }),
      invalidatesTags: ["Me"],
    }),
    sessions: builder.query<{ sessions: AccountSession[] }, void>({
      query: () => "/auth/sessions",
      providesTags: ["Sessions"],
    }),
    revokeSession: builder.mutation<{ revoked: true; current: boolean }, string>({
      query: (id) => ({ url: `/auth/sessions/${id}`, method: "DELETE" }),
      invalidatesTags: ["Sessions"],
    }),
    restoreAccount: builder.mutation<
      { user: { id: string; email: string; accountStatus: "ACTIVE" } },
      void
    >({
      query: () => ({ url: "/auth/account/restore", method: "POST" }),
      invalidatesTags: ["Me"],
    }),
  }),
});

export const {
  useCreateSessionMutation,
  useMeQuery,
  useLogoutMutation,
  useRequestEmailChangeMutation,
  usePasswordChangedMutation,
  useDeleteAccountMutation,
  useSessionsQuery,
  useRevokeSessionMutation,
  useRestoreAccountMutation,
} = authApi;
