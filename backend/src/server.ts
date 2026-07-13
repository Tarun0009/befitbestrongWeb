import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { getRuntimeConfigurationStatus } from "./config/runtimeConfig.js";
import { prisma } from "./config/db.js";
import { redis } from "./config/redis.js";
import { startPaymentEventsWorker } from "./jobs/paymentEvents.js";
import {
  scheduleSubscriptionRenewals,
  startSubscriptionRenewalsWorker,
} from "./jobs/subscriptionRenewals.js";

const app = createApp();
const runtimeConfiguration = getRuntimeConfigurationStatus(env);

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      nodeEnvironment: env.NODE_ENV,
      appEnvironment: env.APP_ENV,
      release: env.RELEASE_SHA ?? null,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      capabilities: runtimeConfiguration.capabilities,
    },
    "beFitBeStrong API listening",
  );
});

const paymentWorker = startPaymentEventsWorker();
const subscriptionWorker = startSubscriptionRenewalsWorker();
void scheduleSubscriptionRenewals().catch((error) => {
  logger.error({ error }, "subscription renewal schedule failed");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  server.close(async () => {
    await Promise.allSettled([
      paymentWorker?.close(),
      subscriptionWorker.close(),
      prisma.$disconnect(),
      redis.quit(),
    ]);
    process.exit(0);
  });
  setTimeout(() => {
    logger.error("forced shutdown after 10s");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "unhandled promise rejection");
});
process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "uncaught exception");
  process.exit(1);
});

