export function calculateOrderPoints(
  orderTotalPaise: number,
  pointsPerRupee: number,
): number {
  if (orderTotalPaise <= 0 || pointsPerRupee <= 0) return 0;
  return Math.floor(orderTotalPaise / 100) * pointsPerRupee;
}

export function calculateRedemptionDiscount(
  points: number,
  pointsPerRupee: number,
): number {
  if (points <= 0 || pointsPerRupee <= 0) return 0;
  if (points % pointsPerRupee !== 0) return 0;
  return (points / pointsPerRupee) * 100;
}
