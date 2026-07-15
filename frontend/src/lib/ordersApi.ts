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
  credentials: "include",
  prepareHeaders: async (headers) => {
    try {
      const user = getFirebaseAuth().currentUser;
      if (user) {
        const token = await user.getIdToken();
        headers.set("Authorization", `Bearer ${token}`);
      }
    } catch {
      /* anonymous */
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

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED"
  | "FAILED"
  | "REFUNDED";

export type PaymentMethod = "PREPAID" | "COD";

export interface CheckoutAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface CheckoutSessionResponse {
  orderId: string;
  amount: number;
  currency: string;
  paymentMethod: PaymentMethod;
  paymentFee: number;
  razorpay: {
    orderId: string;
    keyId: string;
  } | null;
  guestAccessToken: string | null;
}

export interface CheckoutConfig {
  razorpayConfigured: boolean;
  razorpayKeyId: string | null;
  devMode: boolean;
}

export interface CouponValidation {
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  discount: number;
  subtotal: number;
  total: number;
}

export interface OrderListItem {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: number;
  currency: string;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    productSnapshot: {
      name: string;
      slug: string;
      image?: { url: string; alt: string | null } | null;
      sku: string;
      size?: string | null;
      color?: string | null;
    };
  }>;
}

export interface OrderHistoryEntry {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorKind: "system" | "guest" | "customer" | "admin";
  note: string | null;
  createdAt: string;
}

export interface OrderDetail extends Omit<OrderListItem, "items"> {
  subtotal: number;
  discount: number;
  bundleDiscount: number;
  couponDiscount: number;
  couponCode: string | null;
  shipping: number;
  paymentFee: number;
  tax: number;
  addressSnapshot: CheckoutAddress;
  contactEmail: string;
  userId: string | null;
  items: Array<{
    id: string;
    variantId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    productSnapshot: OrderListItem["items"][number]["productSnapshot"];
  }>;
  payment: {
    provider: string;
    providerOrderId: string;
    providerPaymentId: string | null;
    status: string;
    amount: number;
    currency: string;
  } | null;
  history: OrderHistoryEntry[];
}

export interface AdminCoupon {
  id: string;
  code: string;
  description: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminCouponInput {
  code: string;
  description?: string | null;
  type: "PERCENTAGE" | "FIXED_AMOUNT";
  value: number;
  minSubtotal?: number;
  maxDiscount?: number | null;
  active?: boolean;
}
export interface AdminOrderListItem {
  id: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  total: number;
  currency: string;
  createdAt: string;
  contactEmail: string;
  user: { id: string; email: string; name: string | null } | null;
  _count: { items: number };
}

export interface AdminOrderDetail extends OrderDetail {
  user: { id: string; email: string; name: string | null } | null;
}

export type AdminTransitionAction =
  | "ship"
  | "deliver"
  | "cancel"
  | "refund";

export const ordersApi = createApi({
  reducerPath: "ordersApi",
  baseQuery: baseQueryWithRefresh,
  tagTypes: [
    "Order",
    "Orders",
    "CheckoutConfig",
    "AdminOrder",
    "AdminOrders",
    "AdminCoupons",
  ],
  endpoints: (builder) => ({
    getCheckoutConfig: builder.query<CheckoutConfig, void>({
      query: () => "/checkout/config",
      providesTags: ["CheckoutConfig"],
    }),
    validateCoupon: builder.mutation<CouponValidation, { code: string }>({
      query: (body) => ({
        url: "/checkout/coupon/validate",
        method: "POST",
        body,
      }),
    }),
    createCheckoutSession: builder.mutation<
      CheckoutSessionResponse,
      {
        address: CheckoutAddress;
        email?: string;
        couponCode?: string;
        paymentMethod: PaymentMethod;
      }
    >({
      query: (body) => ({ url: "/checkout/session", method: "POST", body }),
      invalidatesTags: ["Orders"],
    }),
    cancelCheckout: builder.mutation<
      void,
      { orderId: string; guestAccessToken?: string }
    >({
      query: (body) => ({ url: "/checkout/cancel", method: "POST", body }),
      invalidatesTags: ["Orders"],
    }),
    devCompleteOrder: builder.mutation<
      { ok: true },
      { orderId: string; guestAccessToken?: string }
    >({
      query: (body) => ({
        url: "/checkout/dev-complete",
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, arg) => [
        "Orders",
        { type: "Order", id: arg.orderId },
      ],
    }),
    listOrders: builder.query<
      {
        items: OrderListItem[];
        total: number;
        page: number;
        totalPages: number;
      },
      { page?: number; limit?: number } | void
    >({
      query: (params) => ({ url: "/orders", params: params ?? {} }),
      providesTags: (result) =>
        result
          ? [
              "Orders",
              ...result.items.map((o) => ({
                type: "Order" as const,
                id: o.id,
              })),
            ]
          : ["Orders"],
    }),
    getOrder: builder.query<
      { order: OrderDetail },
      { id: string; guestAccessToken?: string }
    >({
      query: ({ id, guestAccessToken }) => ({
        url: "/orders/" + id,
        headers: guestAccessToken
          ? { "X-Guest-Order-Token": guestAccessToken }
          : undefined,
      }),
      providesTags: (_result, _error, arg) => [
        { type: "Order", id: arg.id },
      ],
    }),

    adminListCoupons: builder.query<{ items: AdminCoupon[] }, void>({
      query: () => "/admin/coupons",
      providesTags: ["AdminCoupons"],
    }),
    adminCreateCoupon: builder.mutation<
      { coupon: AdminCoupon },
      AdminCouponInput
    >({
      query: (body) => ({
        url: "/admin/coupons",
        method: "POST",
        body,
      }),
      invalidatesTags: ["AdminCoupons"],
    }),
    adminUpdateCoupon: builder.mutation<
      { coupon: AdminCoupon },
      { id: string; body: Partial<AdminCouponInput> }
    >({
      query: ({ id, body }) => ({
        url: "/admin/coupons/" + id,
        method: "PATCH",
        body,
      }),
      invalidatesTags: ["AdminCoupons"],
    }),
    adminDeleteCoupon: builder.mutation<void, string>({
      query: (id) => ({
        url: "/admin/coupons/" + id,
        method: "DELETE",
      }),
      invalidatesTags: ["AdminCoupons"],
    }),
    // ---- Admin ----
    adminListOrders: builder.query<
      {
        items: AdminOrderListItem[];
        total: number;
        page: number;
        totalPages: number;
      },
      { page?: number; limit?: number; status?: OrderStatus }
    >({
      query: (params) => ({ url: "/admin/orders", params }),
      providesTags: (result) =>
        result
          ? [
              "AdminOrders",
    "AdminCoupons",
              ...result.items.map((o) => ({
                type: "AdminOrder" as const,
                id: o.id,
              })),
            ]
          : ["AdminOrders"],
    }),
    adminGetOrder: builder.query<
      { order: AdminOrderDetail; allowedTransitions: OrderStatus[] },
      string
    >({
      query: (id) => `/admin/orders/${id}`,
      providesTags: (_r, _e, id) => [{ type: "AdminOrder", id }],
    }),
    adminOrderTransition: builder.mutation<
      { order: { id: string; status: OrderStatus } },
      { id: string; action: AdminTransitionAction; note?: string }
    >({
      query: ({ id, action, note }) => ({
        url: `/admin/orders/${id}/${action}`,
        method: "POST",
        body: note ? { note } : {},
      }),
      invalidatesTags: (_r, _e, arg) => [
        "AdminOrders",
    "AdminCoupons",
        { type: "AdminOrder", id: arg.id },
        { type: "Order", id: arg.id },
        "Orders",
      ],
    }),
  }),
});

export const {
  useGetCheckoutConfigQuery,
  useValidateCouponMutation,
  useCreateCheckoutSessionMutation,
  useCancelCheckoutMutation,
  useDevCompleteOrderMutation,
  useListOrdersQuery,
  useGetOrderQuery,
  useAdminListCouponsQuery,
  useAdminCreateCouponMutation,
  useAdminUpdateCouponMutation,
  useAdminDeleteCouponMutation,
  useAdminListOrdersQuery,
  useAdminGetOrderQuery,
  useAdminOrderTransitionMutation,
} = ordersApi;
