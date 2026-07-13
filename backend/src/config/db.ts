import { PrismaClient } from "@prisma/client";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const prisma = new PrismaClient({
  log:
    env.NODE_ENV === "development"
      ? [
          { level: "warn", emit: "event" },
          { level: "error", emit: "event" },
        ]
      : [{ level: "error", emit: "event" }],
});

prisma.$on("warn", (e) => logger.warn({ prisma: e }, "prisma warn"));
prisma.$on("error", (e) => logger.error({ prisma: e }, "prisma error"));

export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (err) {
    logger.error({ err }, "database ping failed");
    return false;
  }
}
