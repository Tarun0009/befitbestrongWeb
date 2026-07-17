import { PrismaClient } from "@prisma/client";
import { seedServiceAreas } from "../prisma/serviceAreaSeed.js";

const prisma = new PrismaClient();

seedServiceAreas(prisma)
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

