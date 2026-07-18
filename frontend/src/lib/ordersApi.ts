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

export type ShipmentStatus =
  | "LABEL_CREATED"
  | "PICKED_UP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "DELIVERY_FAILED"
  | "RTO_IN_TRANSIT"
  | "RETURNED"
  | "CANCELLED";

export interface ShipmentEvent {
  id: string;
  status: ShipmentStatus;
  description: string | null;
  location: string | null;
  occurredAt: string;
}

export interface Shipment {
  id: string;
  provider?: string;
  carrier: string;
  service: string | null;
  trackingNumber: string;
  trackingUrl: string | null;
  labelUrl?: string | null;
  status: ShipmentStatus;
  estimatedDeliveryAt: string | null;
  pickupScheduledAt?: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  events: ShipmentEvent[];
}

export type CourierBookingStatus =
  | "PENDING"
  | "ORDER_CREATED"
  | "AWB_ASSIGNED"
  | "READY"
  | "FAILED"
  | "CANCELLED";

export interface CourierBooking {
  id: string;
  status: CourierBookingStatus;
  provider: string;
  providerOrderId: string | null;
  providerShipmentId: string | null;
  carrier: string | null;
  trackingNumber: string | null;
  labelUrl: string | null;
  attemptCount: number;
  error: string | null;
  shipment: Shipment | null;
}

export interface CourierRate {
  courierId: string;
  courierName: string;
  rate: number;
  codCharges: number;
  estimatedDays?: number;
  etd?: string;
  rating?: number;
}

export interface AdminFulfillmentShipment extends Shipment {
  provider: string;
  labelUrl: string | null;
  pickupScheduledAt: string | null;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
  updatedAt: string;
  order: {
    id: string;
    status: OrderStatus;
    paymentMethod: PaymentMethod;
    contactEmail: string;
    total: number;
    currency: string;
  };
  courierBooking: {
    id: string;
    status: CourierBookingStatus;
    attemptCount: number;
    error: string | null;
  } | null;
}

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
  reservationExpiresAt: string | null;
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

export type RefundIntentStatus =
  | "REQUESTED"
  | "PROCESSING"
  | "PENDING"
  | "PROCESSED"
  | "FAILED"
  | "RECONCILIATION_REQUIRED";

export interface RefundEvent {
  id: string;
  fromStatus: RefundIntentStatus | null;
  toStatus: RefundIntentStatus;
  source: string;
  message: string | null;
  createdAt: string;
}

export interface RefundIntent {
  id: string;
  kind: "FULL" | "PARTIAL";
  amount: number;
  currency: string;
  reason: string;
  status: RefundIntentStatus;
  provider: string;
  providerRefundId: string | null;
  providerStatus: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  nextReconcileAt: string | null;
  createdAt: string;
  updatedAt: string;
  events: RefundEvent[];
}

export interface RefundSummary {
  paymentAmount: number;
  processedAmount: number;
  pendingAmount: number;
  refundableAmount: number;
  canRefund: boolean;
  partialRefundAllowed: boolean;
}

export interface CustomerRefund {
  id: string;
  kind: "FULL" | "PARTIAL";
  amount: number;
  currency: string;
  reason: string;
  status: RefundIntentStatus;
  createdAt: string;
  processedAt: string | null;
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
  shipments: Shipment[];
  refunds: CustomerRefund[];
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

export interface AdminOrderDetail extends Omit<OrderDetail, "refunds"> {
  user: { id: string; email: string; name: string | null } | null;
  refundIntents: RefundIntent[];
}

export type AdminTransitionAction =
  | "ship"
  | "deliver"
  | "cancel";

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
    "AdminShipments",
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
        idempotencyKey: string;
      }
    >({
      query: ({ idempotencyKey, ...body }) => ({
        url: "/checkout/session",
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      }),
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
    cancelOrder: builder.mutation<
      { order: { id: string; status: "CANCELLED" } },
      { id: string; reason?: string }
    >({
      query: ({ id, reason }) => ({
        url: `/orders/${id}/cancel`,
        method: "POST",
        body: reason ? { reason } : {},
      }),
      invalidatesTags: (_result, _error, arg) => [
        "Orders",
        { type: "Order", id: arg.id },
        "AdminOrders",
        { type: "AdminOrder", id: arg.id },
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
      {
        order: AdminOrderDetail;
        refundSummary: RefundSummary;
        allowedTransitions: OrderStatus[];
      },
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
    adminCreateRefund: builder.mutation<
      { intents: RefundIntent[]; summary: RefundSummary },
      {
        id: string;
        amount: number;
        reason: string;
        idempotencyKey: string;
      }
    >({
      query: ({ id, idempotencyKey, ...body }) => ({
        url: `/admin/orders/${id}/refunds`,
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        "AdminOrders",
        { type: "AdminOrder", id: arg.id },
        { type: "Order", id: arg.id },
        "Orders",
      ],
    }),
    adminReconcileRefund: builder.mutation<
      { intents: RefundIntent[]; summary: RefundSummary },
      { id: string; orderId: string }
    >({
      query: ({ id }) => ({
        url: `/admin/refunds/${id}/reconcile`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, arg) => [
        "AdminOrders",
        { type: "AdminOrder", id: arg.orderId },
        { type: "Order", id: arg.orderId },
        "Orders",
      ],
    }),
    adminCreateShipment: builder.mutation<
      {
        shipment: Shipment;
        order: { id: string; status: "SHIPPED" };
      },
      {
        id: string;
        body: {
          carrier: string;
          service?: string;
          trackingNumber: string;
          trackingUrl?: string;
          estimatedDeliveryAt?: string;
          note?: string;
        };
      }
    >({
      query: ({ id, body }) => ({
        url: `/admin/orders/${id}/shipments`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        "AdminOrders",
        { type: "AdminOrder", id: arg.id },
        { type: "Order", id: arg.id },
        "Orders",
      ],
    }),
    adminGetFulfillmentConfig: builder.query<
      {
        provider: "manual" | "shiprocket";
        configured: boolean;
        manualFallback: boolean;
      },
      void
    >({
      query: () => "/admin/fulfillment/config",
    }),
    adminBookCourier: builder.mutation<
      { booking: CourierBooking },
      {
        id: string;
        body: {
          weightKg: number;
          lengthCm: number;
          breadthCm: number;
          heightCm: number;
          courierId?: string;
          pickupDate?: string;
        };
      }
    >({
      query: ({ id, body }) => ({
        url: `/admin/orders/${id}/courier-booking`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [
        "AdminShipments",
        { type: "AdminOrder", id: arg.id },
        { type: "Order", id: arg.id },
      ],
    }),
    adminGetCourierRates: builder.mutation<
      { items: CourierRate[] },
      {
        id: string;
        body: {
          weightKg: number;
          lengthCm: number;
          breadthCm: number;
          heightCm: number;
          courierId?: string;
          pickupDate?: string;
        };
      }
    >({
      query: ({ id, body }) => ({
        url: `/admin/orders/${id}/courier-rates`,
        method: "POST",
        body,
      }),
    }),
    adminListShipments: builder.query<
      {
        items: AdminFulfillmentShipment[];
        total: number;
        page: number;
        totalPages: number;
      },
      {
        page?: number;
        limit?: number;
        status?: ShipmentStatus;
        provider?: string;
      }
    >({
      query: (params) => ({ url: "/admin/fulfillment/shipments", params }),
      providesTags: (result) =>
        result
          ? [
              "AdminShipments",
              ...result.items.map((shipment) => ({
                type: "AdminShipments" as const,
                id: shipment.id,
              })),
            ]
          : ["AdminShipments"],
    }),
    adminReconcileShipment: builder.mutation<
      { result: { status: "missing" | "skipped" | "updated" | "unchanged" } },
      string
    >({
      query: (id) => ({
        url: `/admin/shipments/${id}/reconcile`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, id) => [
        "AdminShipments",
        { type: "AdminShipments", id },
      ],
    }),
    adminCancelCourierShipment: builder.mutation<{ ok: true }, string>({
      query: (id) => ({
        url: `/admin/shipments/${id}/cancel`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, id) => [
        "AdminShipments",
        { type: "AdminShipments", id },
        "AdminOrders",
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
  useCancelOrderMutation,
  useAdminListCouponsQuery,
  useAdminCreateCouponMutation,
  useAdminUpdateCouponMutation,
  useAdminDeleteCouponMutation,
  useAdminListOrdersQuery,
  useAdminGetOrderQuery,
  useAdminOrderTransitionMutation,
  useAdminCreateRefundMutation,
  useAdminReconcileRefundMutation,
  useAdminCreateShipmentMutation,
  useAdminGetFulfillmentConfigQuery,
  useAdminBookCourierMutation,
  useAdminGetCourierRatesMutation,
  useAdminListShipmentsQuery,
  useAdminReconcileShipmentMutation,
  useAdminCancelCourierShipmentMutation,
} = ordersApi;
