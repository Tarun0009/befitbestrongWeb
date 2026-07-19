import type { PrismaClient } from "@prisma/client";

export async function seedServiceAreas(prisma: PrismaClient) {
  // Delivery coverage is now PAN India and is not seeded from a city/PIN
  // allow-list. The legacy table is retained for historical city metadata and
  // old order compatibility; checkout never uses it as an access gate.
  void prisma;
  console.log("[seed] service areas: skipped (PAN India delivery policy)");
}

