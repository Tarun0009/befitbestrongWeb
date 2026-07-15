import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { publicEnv } from "@/config/publicEnv";
import { getFirebaseAuth } from "@/lib/firebase";
import type { OrderStatus, PaymentMethod } from "@/lib/ordersApi";

export type AdminNotificationType = "ORDER_PAID" | "ORDER_COD_PLACED";

export interface AdminNotification {
  id: string;
  type: AdminNotificationType;
  orderId: string;
  title: string;
  message: string;
  metadata: { paymentMethod?: PaymentMethod } | null;
  createdAt: string;
  readAt: string | null;
  order: {
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    total: number;
    currency: string;
    contactEmail: string;
  };
}

const baseQuery = fetchBaseQuery({
  baseUrl: publicEnv.apiUrl,
  credentials: "include",
  prepareHeaders: async (headers) => {
    const user = getFirebaseAuth().currentUser;
    if (user) {
      headers.set("Authorization", "Bearer " + (await user.getIdToken()));
    }
    return headers;
  },
});

export const adminNotificationsApi = createApi({
  reducerPath: "adminNotificationsApi",
  baseQuery,
  tagTypes: ["AdminNotifications"],
  endpoints: (builder) => ({
    getAdminNotifications: builder.query<
      { items: AdminNotification[]; unreadCount: number },
      { unreadOnly?: "true" | "false"; limit?: number } | void
    >({
      query: (params) => ({
        url: "/admin/notifications",
        params: params ?? {},
      }),
      providesTags: ["AdminNotifications"],
    }),
    markAdminNotificationRead: builder.mutation<
      { receipt: { notificationId: string; userId: string; readAt: string } },
      string
    >({
      query: (id) => ({
        url: "/admin/notifications/" + id + "/read",
        method: "POST",
      }),
      invalidatesTags: ["AdminNotifications"],
    }),
    markAllAdminNotificationsRead: builder.mutation<
      { read: number },
      void
    >({
      query: () => ({
        url: "/admin/notifications/read-all",
        method: "POST",
      }),
      invalidatesTags: ["AdminNotifications"],
    }),
  }),
});

export const {
  useGetAdminNotificationsQuery,
  useMarkAdminNotificationReadMutation,
  useMarkAllAdminNotificationsReadMutation,
} = adminNotificationsApi;

