import type { PrismaClient, ServiceZone } from "@prisma/client";

/**
 * Small development starter set for local/demo environments.
 * Import and review the official Department of Posts directory before production activation.
 *
 * Production coverage should be imported from the Department of Posts CSV with
 * scripts/importServiceAreas.ts and then reviewed by operations before it is
 * activated. Do not infer coverage from a 110/201 prefix.
 */
const STARTER_AREAS: Array<{
  pincode: string;
  zone: ServiceZone;
  city: string;
  state: string;
}> = [
  { pincode: "110001", zone: "DELHI", city: "New Delhi", state: "Delhi" },
  { pincode: "110020", zone: "DELHI", city: "New Delhi", state: "Delhi" },
  { pincode: "110025", zone: "DELHI", city: "New Delhi", state: "Delhi" },
  { pincode: "110044", zone: "DELHI", city: "New Delhi", state: "Delhi" },
  { pincode: "110092", zone: "DELHI", city: "Delhi", state: "Delhi" },
  { pincode: "110096", zone: "DELHI", city: "Delhi", state: "Delhi" },
  { pincode: "201301", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201303", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201304", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201305", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201306", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201307", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201309", zone: "NOIDA", city: "Noida", state: "Uttar Pradesh" },
  { pincode: "201001", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201002", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201003", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201005", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201006", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201009", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201010", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201011", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201012", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201013", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201014", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201015", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201016", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
  { pincode: "201017", zone: "GHAZIABAD", city: "Ghaziabad", state: "Uttar Pradesh" },
];

export async function seedServiceAreas(prisma: PrismaClient) {
  for (const area of STARTER_AREAS) {
    await prisma.serviceArea.upsert({
      where: { pincode: area.pincode },
      update: {},
      create: {
        ...area,
        active: true,
        prepaidEnabled: true,
        codEnabled: true,
        codMaxOrderAmount: 500_000,
        codFee: 0,
        estimatedDeliveryMinDays: 1,
        estimatedDeliveryMaxDays: 3,
      },
    });
  }
  console.log("[seed] service areas:", STARTER_AREAS.length);
}

