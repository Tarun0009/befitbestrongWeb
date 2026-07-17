import type { PaymentMethod } from "@prisma/client";

export interface CourierPackage {
  weightKg: number;
  lengthCm: number;
  breadthCm: number;
  heightCm: number;
  courierId?: string;
  pickupDate?: string;
}

export interface CourierAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface CourierOrderItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
}

export interface CourierOrder {
  id: string;
  externalOrderRef: string;
  createdAt: Date;
  contactEmail: string;
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  address: CourierAddress;
  items: CourierOrderItem[];
  parcel: CourierPackage;
}

export interface ProviderOrderResult {
  providerOrderId: string;
  providerShipmentId: string;
}

export interface ProviderAwbResult {
  trackingNumber: string;
  carrier: string;
  courierId?: string;
}

export interface ProviderLabelResult {
  labelUrl: string;
}

export interface ProviderPickupResult {
  pickupScheduledAt: Date;
}

export interface CourierRateRequest {
  deliveryPincode: string;
  paymentMethod: PaymentMethod;
  orderValue: number;
  parcel: CourierPackage;
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

export interface NormalizedCourierEvent {
  eventId: string;
  trackingNumber?: string;
  providerShipmentId?: string;
  status:
    | "LABEL_CREATED"
    | "PICKED_UP"
    | "IN_TRANSIT"
    | "OUT_FOR_DELIVERY"
    | "DELIVERED"
    | "DELIVERY_FAILED"
    | "RTO_IN_TRANSIT"
    | "RETURNED"
    | "CANCELLED";
  description?: string;
  location?: string;
  occurredAt: Date;
  estimatedDeliveryAt?: Date;
}

export interface CourierProvider {
  readonly key: string;
  readonly configured: boolean;
  findOrder(externalOrderRef: string): Promise<ProviderOrderResult | null>;
  getRates(input: CourierRateRequest): Promise<CourierRate[]>;
  createOrder(order: CourierOrder): Promise<ProviderOrderResult>;
  assignAwb(
    providerShipmentId: string,
    courierId?: string,
  ): Promise<ProviderAwbResult>;
  generateLabel(providerShipmentId: string): Promise<ProviderLabelResult>;
  schedulePickup(
    providerShipmentId: string,
    pickupDate?: string,
  ): Promise<ProviderPickupResult>;
  cancelShipment(trackingNumber: string): Promise<void>;
  trackShipment(trackingNumber: string): Promise<NormalizedCourierEvent | null>;
}
