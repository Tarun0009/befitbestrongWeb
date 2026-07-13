import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "./logger.js";

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
});

redis.on("error", (err) => logger.error({ err }, "redis error"));
redis.on("connect", () => logger.info("redis connected"));

export async function pingRedis(): Promise<boolean> {
  try {
    const pong = await redis.ping();
    return pong === "PONG";
  } catch (err) {
    logger.error({ err }, "redis ping failed");
    return false;
  }
}
