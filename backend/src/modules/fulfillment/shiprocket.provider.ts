import { env } from "../../config/env.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { normalizeShiprocketStatus } from "./fulfillment.policy.js";
import type {
  CourierOrder,
  CourierProvider,
  CourierRate,
  CourierRateRequest,
  NormalizedCourierEvent,
  ProviderAwbResult,
  ProviderLabelResult,
  ProviderOrderResult,
  ProviderPickupResult,
} from "./courier.types.js";

const API_ORIGIN = "https://apiv2.shiprocket.in/v1/external";
let cachedToken: { value: string; expiresAt: number } | null = null;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function safeProviderMessage(payload: unknown, fallback: string) {
  const body = record(payload);
  const message =
    stringValue(body.message) ??
    stringValue(body.error) ??
    stringValue(record(body.response).message);
  return (message ?? fallback).slice(0, 300);
}

async function authenticate() {
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) {
    throw new HttpError(
      503,
      "courier_not_configured",
      "Shiprocket credentials are not configured",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const response = await fetch(API_ORIGIN + "/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: env.SHIPROCKET_EMAIL,
      password: env.SHIPROCKET_PASSWORD,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  const token = stringValue(record(payload).token);
  if (!response.ok || !token) {
    throw new HttpError(
      502,
      "courier_auth_failed",
      safeProviderMessage(payload, "Shiprocket authentication failed"),
    );
  }

  // Shiprocket documents a ten-day token lifetime. Refresh a day early.
  cachedToken = {
    value: token,
    expiresAt: Date.now() + 9 * 24 * 60 * 60 * 1000,
  };
  return token;
}

async function request(
  path: string,
  init: { method?: string; body?: object } = {},
  retryAuth = true,
): Promise<unknown> {
  const token = await authenticate();
  const response = await fetch(API_ORIGIN + path, {
    method: init.method ?? "GET",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const payload: unknown = await response.json().catch(() => ({}));
  if (response.status === 401 && retryAuth) {
    cachedToken = null;
    return request(path, init, false);
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      "courier_provider_error",
      safeProviderMessage(payload, `Shiprocket request failed (${response.status})`),
    );
  }
  return payload;
}

function splitName(fullName: string) {
  const [firstName, ...rest] = fullName.trim().split(/\s+/);
  return {
    firstName: firstName || "Customer",
    lastName: rest.join(" ") || ".",
  };
}

function rupees(paise: number) {
  return Number((paise / 100).toFixed(2));
}

function shiprocketCountry(value?: string) {
  if (!value || value.toUpperCase() === "IN") return "India";
  return value;
}

export class ShiprocketProvider implements CourierProvider {
  readonly key = "shiprocket";
  readonly configured = Boolean(
    env.SHIPROCKET_EMAIL &&
      env.SHIPROCKET_PASSWORD &&
      env.SHIPROCKET_PICKUP_LOCATION &&
      env.SHIPROCKET_PICKUP_PINCODE &&
      env.SHIPROCKET_WEBHOOK_SECRET,
  );

  async getRates(input: CourierRateRequest): Promise<CourierRate[]> {
    if (!env.SHIPROCKET_PICKUP_PINCODE) {
      throw new HttpError(
        503,
        "courier_not_configured",
        "Shiprocket pickup pincode is not configured",
      );
    }
    const params = new URLSearchParams({
      pickup_postcode: env.SHIPROCKET_PICKUP_PINCODE,
      delivery_postcode: input.deliveryPincode,
      cod: input.paymentMethod === "COD" ? "1" : "0",
      weight: String(input.parcel.weightKg),
      length: String(input.parcel.lengthCm),
      breadth: String(input.parcel.breadthCm),
      height: String(input.parcel.heightCm),
      declared_value: String(rupees(input.orderValue)),
      mode: "Surface",
    });
    const payload = await request(
      "/courier/serviceability/?" + params.toString(),
    );
    const companies = record(record(payload).data).available_courier_companies;
    if (!Array.isArray(companies)) return [];
    return companies
      .map((rawCompany): CourierRate | null => {
        const company = record(rawCompany);
        const courierId = stringValue(company.courier_company_id);
        const courierName = stringValue(company.courier_name);
        const rate =
          numberValue(company.rate) ??
          numberValue(company.freight_charge);
        if (!courierId || !courierName || rate === undefined) return null;
        return {
          courierId,
          courierName,
          rate: Math.round(rate * 100),
          codCharges: Math.round(
            (numberValue(company.cod_charges) ?? 0) * 100,
          ),
          estimatedDays: numberValue(company.estimated_delivery_days),
          etd: stringValue(company.etd),
          rating: numberValue(company.rating),
        };
      })
      .filter((rate): rate is CourierRate => Boolean(rate))
      .sort((left, right) => left.rate - right.rate);
  }

  async findOrder(
    externalOrderRef: string,
  ): Promise<ProviderOrderResult | null> {
    const payload = await request(
      "/orders?search=" + encodeURIComponent(externalOrderRef),
    );
    const body = record(payload);
    const rawData = body.data;
    const items = Array.isArray(rawData)
      ? rawData
      : Array.isArray(record(rawData).data)
        ? (record(rawData).data as unknown[])
        : [];
    for (const rawItem of items) {
      const item = record(rawItem);
      const reference =
        stringValue(item.channel_order_id) ??
        stringValue(item.order_id);
      if (reference !== externalOrderRef) continue;
      const shipments = Array.isArray(item.shipments)
        ? item.shipments
        : [];
      const providerOrderId = stringValue(item.id);
      const providerShipmentId =
        stringValue(record(shipments[0]).id) ??
        stringValue(item.shipment_id);
      if (providerOrderId && providerShipmentId) {
        return { providerOrderId, providerShipmentId };
      }
    }
    return null;
  }

  async createOrder(order: CourierOrder): Promise<ProviderOrderResult> {
    if (!env.SHIPROCKET_PICKUP_LOCATION) {
      throw new HttpError(
        503,
        "courier_not_configured",
        "Shiprocket pickup location is not configured",
      );
    }
    const name = splitName(order.address.fullName);
    const payload = await request("/orders/create/adhoc", {
      method: "POST",
      body: {
        order_id: order.externalOrderRef,
        order_date: order.createdAt
          .toISOString()
          .replace("T", " ")
          .slice(0, 19),
        pickup_location: env.SHIPROCKET_PICKUP_LOCATION,
        billing_customer_name: name.firstName,
        billing_last_name: name.lastName,
        billing_address: order.address.line1,
        billing_address_2: order.address.line2 ?? "",
        billing_city: order.address.city,
        billing_pincode: order.address.pincode,
        billing_state: order.address.state,
        billing_country: shiprocketCountry(order.address.country),
        billing_email: order.contactEmail,
        billing_phone: order.address.phone,
        shipping_is_billing: true,
        order_items: order.items.map((item) => ({
          name: item.name,
          sku: item.sku,
          units: item.quantity,
          selling_price: rupees(item.unitPrice),
          discount: 0,
          tax: 0,
          hsn: "",
        })),
        payment_method: order.paymentMethod === "COD" ? "COD" : "Prepaid",
        shipping_charges: rupees(order.shipping),
        giftwrap_charges: 0,
        transaction_charges: 0,
        total_discount: rupees(order.discount),
        sub_total: rupees(order.subtotal),
        length: order.parcel.lengthCm,
        breadth: order.parcel.breadthCm,
        height: order.parcel.heightCm,
        weight: order.parcel.weightKg,
      },
    });
    const body = record(payload);
    const providerOrderId = stringValue(body.order_id);
    const providerShipmentId = stringValue(body.shipment_id);
    if (!providerOrderId || !providerShipmentId) {
      throw new HttpError(
        502,
        "courier_invalid_response",
        "Shiprocket did not return order and shipment identifiers",
      );
    }
    return { providerOrderId, providerShipmentId };
  }

  async assignAwb(
    providerShipmentId: string,
    courierId?: string,
  ): Promise<ProviderAwbResult> {
    const payload = await request("/courier/assign/awb", {
      method: "POST",
      body: {
        shipment_id: Number(providerShipmentId),
        ...(courierId ? { courier_id: Number(courierId) } : {}),
      },
    });
    const body = record(payload);
    const data = record(record(body.response).data);
    const trackingNumber =
      stringValue(data.awb_code) ?? stringValue(body.awb_code);
    const carrier =
      stringValue(data.courier_name) ??
      stringValue(body.courier_name) ??
      "Shiprocket";
    if (!trackingNumber) {
      throw new HttpError(
        502,
        "courier_awb_failed",
        safeProviderMessage(payload, "Shiprocket did not assign an AWB"),
      );
    }
    return {
      trackingNumber,
      carrier,
      courierId:
        stringValue(data.courier_company_id) ??
        stringValue(body.courier_company_id) ??
        courierId,
    };
  }

  async generateLabel(
    providerShipmentId: string,
  ): Promise<ProviderLabelResult> {
    const payload = await request("/courier/generate/label", {
      method: "POST",
      body: { shipment_id: [Number(providerShipmentId)] },
    });
    const labelUrl = stringValue(record(payload).label_url);
    if (!labelUrl) {
      throw new HttpError(
        502,
        "courier_label_failed",
        safeProviderMessage(payload, "Shiprocket did not return a label"),
      );
    }
    return { labelUrl };
  }

  async schedulePickup(
    providerShipmentId: string,
    pickupDate?: string,
  ): Promise<ProviderPickupResult> {
    const payload = await request("/courier/generate/pickup", {
      method: "POST",
      body: {
        shipment_id: [Number(providerShipmentId)],
        ...(pickupDate ? { pickup_date: [pickupDate] } : {}),
      },
    });
    const body = record(payload);
    const response = record(body.response);
    const date =
      stringValue(response.pickup_scheduled_date) ??
      stringValue(body.pickup_scheduled_date);
    const pickupScheduledAt = date ? new Date(date) : new Date();
    return {
      pickupScheduledAt: Number.isNaN(pickupScheduledAt.getTime())
        ? new Date()
        : pickupScheduledAt,
    };
  }

  async cancelShipment(trackingNumber: string): Promise<void> {
    await request("/orders/cancel/shipment/awbs", {
      method: "POST",
      body: { awbs: [trackingNumber] },
    });
  }

  async trackShipment(
    trackingNumber: string,
  ): Promise<NormalizedCourierEvent | null> {
    const payload = await request(
      "/courier/track/awb/" + encodeURIComponent(trackingNumber),
    );
    const trackingData = record(record(payload).tracking_data);
    const tracks = Array.isArray(trackingData.shipment_track)
      ? trackingData.shipment_track
      : [];
    const current = record(tracks[0]);
    const activities = Array.isArray(trackingData.shipment_track_activities)
      ? trackingData.shipment_track_activities
      : [];
    const latest = record(activities[0]);
    const statusText =
      stringValue(current.current_status) ??
      stringValue(latest["sr-status-label"]) ??
      stringValue(latest.activity);
    if (!statusText) return null;
    const status = normalizeShiprocketStatus(statusText);
    if (!status) return null;
    const occurredText =
      stringValue(latest.date) ??
      stringValue(current.current_timestamp) ??
      new Date().toISOString();
    const occurredAt = new Date(occurredText);
    const eventTime = Number.isNaN(occurredAt.getTime())
      ? new Date()
      : occurredAt;
    const etdText = stringValue(current.etd);
    const estimatedDeliveryAt = etdText ? new Date(etdText) : undefined;
    return {
      eventId: `reconcile:${trackingNumber}:${status}:${eventTime.toISOString()}`,
      trackingNumber,
      providerShipmentId: stringValue(current.shipment_id),
      status,
      description: stringValue(latest.activity) ?? statusText,
      location: stringValue(latest.location),
      occurredAt: eventTime,
      estimatedDeliveryAt:
        estimatedDeliveryAt && !Number.isNaN(estimatedDeliveryAt.getTime())
          ? estimatedDeliveryAt
          : undefined,
    };
  }
}

export const shiprocketProvider = new ShiprocketProvider();
