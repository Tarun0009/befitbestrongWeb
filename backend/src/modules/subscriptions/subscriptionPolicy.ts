export function calculateSubscriptionPrice(
  unitPrice: number,
  discountPercent: number,
): number {
  if (unitPrice <= 0) return 0;
  const discount = Math.min(Math.max(discountPercent, 0), 100);
  return unitPrice - Math.floor((unitPrice * discount) / 100);
}

export function addFrequencyDays(date: Date, frequencyDays: number): Date {
  return new Date(date.getTime() + frequencyDays * 24 * 60 * 60 * 1000);
}