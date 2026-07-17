import { Worker, type ConnectionOptions } from "bullmq";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import {
  courierReconciliationQueue,
  type CourierEventJobData,
} from "../lib/queue.js";
import { getConfiguredCourierProvider } from "../modules/fulfillment/courier.registry.js";
import {
  applyCourierEvent,
  parseShiprocketWebhook,
} from "../modules/fulfillment/courierTracking.js";

const connection: ConnectionOptions = { url: env.REDIS_URL };

export function startCourierEventsWorker(): Worker<CourierEventJobData> | null {
  if (env.NODE_ENV === "test" || env.COURIER_PROVIDER !== "shiprocket") {
    return null;
  }
  const worker = new Worker<CourierEventJobData>(
    "courier-events",
    async (job) => {
      const event = await prisma.webhookEvent.findUnique({
        where: { id: job.data.webhookEventId },
      });
      if (!event || event.processedAt) return;
      const normalized = parseShiprocketWebhook(event.payload, event.eventId);
      if (!normalized) {
        await prisma.webhookEvent.update({
          where: { id: event.id },
          data: { processedAt: new Date() },
        });
        logger.warn(
          { eventId: event.eventId },
          "courier event ignored because its status is unsupported",
        );
        return;
      }

      await applyCourierEvent(normalized);
      await prisma.webhookEvent.update({
        where: { id: event.id },
        data: { processedAt: new Date() },
      });
    },
    { connection, concurrency: 3 },
  );
  worker.on("failed", (job, error) =>
    logger.warn({ jobId: job?.id, error }, "courier event job failed"),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "courier event worker error"),
  );
  logger.info("courier-events worker started");
  return worker;
}

export async function reconcileShipment(shipmentId: string) {
  const provider = getConfiguredCourierProvider();
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
  });
  if (!shipment) return { status: "missing" as const };
  if (shipment.provider !== provider.key) {
    return { status: "skipped" as const };
  }

  try {
    const event = await provider.trackShipment(shipment.trackingNumber);
    if (event) await applyCourierEvent(event);
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { lastSyncedAt: new Date(), syncError: null },
    });
    return { status: event ? ("updated" as const) : ("unchanged" as const) };
  } catch (error) {
    const message = (error instanceof Error ? error.message : "Sync failed")
      .replace(/[\r\n]+/g, " ")
      .slice(0, 500);
    await prisma.shipment.update({
      where: { id: shipment.id },
      data: { lastSyncedAt: new Date(), syncError: message },
    });
    throw error;
  }
}

export async function reconcileDueShipments(limit = 50) {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
  const shipments = await prisma.shipment.findMany({
    where: {
      provider: "shiprocket",
      status: {
        notIn: ["DELIVERED", "RETURNED", "CANCELLED"],
      },
      OR: [{ lastSyncedAt: null }, { lastSyncedAt: { lt: staleBefore } }],
    },
    orderBy: { lastSyncedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let updated = 0;
  let failed = 0;
  for (const shipment of shipments) {
    try {
      const result = await reconcileShipment(shipment.id);
      if (result.status === "updated") updated += 1;
    } catch {
      failed += 1;
    }
  }
  return { processed: shipments.length, updated, failed };
}

export async function scheduleCourierReconciliation() {
  if (env.COURIER_PROVIDER !== "shiprocket") return;
  await courierReconciliationQueue.add(
    "scan",
    {},
    {
      jobId: "courier-reconciliation-half-hourly",
      repeat: { every: 30 * 60 * 1000 },
    },
  );
}

export function startCourierReconciliationWorker() {
  if (env.NODE_ENV === "test" || env.COURIER_PROVIDER !== "shiprocket") {
    return null;
  }
  const worker = new Worker(
    "courier-reconciliation",
    async () => reconcileDueShipments(),
    { connection, concurrency: 1 },
  );
  worker.on("completed", (job, result) =>
    logger.info(
      { jobId: job.id, ...result },
      "courier reconciliation completed",
    ),
  );
  worker.on("failed", (job, error) =>
    logger.error(
      { jobId: job?.id, error },
      "courier reconciliation failed",
    ),
  );
  worker.on("error", (error) =>
    logger.error({ error }, "courier reconciliation worker error"),
  );
  return worker;
}
