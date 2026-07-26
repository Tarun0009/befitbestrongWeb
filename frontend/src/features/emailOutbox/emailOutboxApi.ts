import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { publicEnv } from "@/config/publicEnv";
import { getFirebaseAuth } from "@/lib/firebase";
import { attachDeviceSessionHeader } from "@/features/auth/deviceSession";

export type EmailOutboxStatus =
  | "PENDING"
  | "PROCESSING"
  | "SENT"
  | "DEAD_LETTER"
  | "CANCELLED";
export type EmailTemplate =
  | "ORDER_STATUS"
  | "ADMIN_ORDER_ALERT"
  | "SUBSCRIPTION_RENEWAL"
  | "BACK_IN_STOCK"
  | "ACCOUNT_SECURITY"
  | "EMAIL_CHANGE_CONFIRMATION";

export interface EmailOutboxEvent {
  id: string;
  fromStatus: EmailOutboxStatus | null;
  toStatus: EmailOutboxStatus;
  source: string;
  message: string | null;
  createdAt: string;
}

export interface EmailOutboxItem {
  id: string;
  template: EmailTemplate;
  recipientEmail: string;
  subject: string;
  referenceType: string;
  referenceId: string;
  status: EmailOutboxStatus;
  attemptCount: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastAttemptAt: string | null;
  providerMessageId: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  sentAt: string | null;
  deadLetteredAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: EmailOutboxEvent[];
}

export interface EmailOutboxResponse {
  items: EmailOutboxItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: Record<EmailOutboxStatus, number> & {
    configured: boolean;
    oldestPendingAt: string | null;
  };
}

const baseQuery = fetchBaseQuery({
  baseUrl: publicEnv.apiUrl,
  credentials: "include",
  prepareHeaders: async (headers) => {
    attachDeviceSessionHeader(headers);
    const user = getFirebaseAuth().currentUser;
    if (user) headers.set("Authorization", "Bearer " + (await user.getIdToken()));
    return headers;
  },
});

export const emailOutboxApi = createApi({
  reducerPath: "emailOutboxApi",
  baseQuery,
  tagTypes: ["EmailOutbox"],
  endpoints: (builder) => ({
    getEmailOutbox: builder.query<
      EmailOutboxResponse,
      {
        page?: number;
        limit?: number;
        status?: EmailOutboxStatus;
        template?: EmailTemplate;
      }
    >({
      query: (params) => ({ url: "/admin/email-outbox", params }),
      providesTags: ["EmailOutbox"],
    }),
    retryEmailOutbox: builder.mutation<
      {
        email: Pick<EmailOutboxItem, "id" | "status" | "nextAttemptAt" | "updatedAt">;
      },
      string
    >({
      query: (id) => ({
        url: `/admin/email-outbox/${id}/retry`,
        method: "POST",
      }),
      invalidatesTags: ["EmailOutbox"],
    }),
  }),
});

export const { useGetEmailOutboxQuery, useRetryEmailOutboxMutation } =
  emailOutboxApi;
