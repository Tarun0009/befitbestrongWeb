export type BundlePricingType = "FIXED_PRICE" | "PERCENTAGE_OFF";

export interface BundlePrice {
  componentTotal: number;
  unitPrice: number;
  savings: number;
  savingsPercent: number;
}

export function calculateBundlePrice(
  componentTotal: number,
  pricingType: BundlePricingType,
  value: number,
): BundlePrice {
  if (componentTotal <= 0 || value <= 0) {
    return { componentTotal, unitPrice: componentTotal, savings: 0, savingsPercent: 0 };
  }

  const requested =
    pricingType === "FIXED_PRICE"
      ? value
      : componentTotal - Math.floor((componentTotal * Math.min(value, 100)) / 100);
  const unitPrice = Math.max(0, Math.min(componentTotal, requested));
  const savings = componentTotal - unitPrice;
  const savingsPercent =
    componentTotal > 0 ? Math.round((savings / componentTotal) * 100) : 0;

  return { componentTotal, unitPrice, savings, savingsPercent };
}

export function calculateBundleAvailability(
  items: Array<{ stock: number; quantity: number; productActive: boolean }>,
): number {
  if (items.length < 2) return 0;
  return items.reduce((available, item) => {
    if (!item.productActive || item.quantity <= 0) return 0;
    return Math.min(available, Math.floor(item.stock / item.quantity));
  }, Number.MAX_SAFE_INTEGER);
}