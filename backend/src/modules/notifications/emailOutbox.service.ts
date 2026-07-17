import { randomUUID } from "node:crypto";
import {
  Prisma,
  type EmailOutbox,
  type EmailOutboxStatus,
  type EmailTemplate,
} from "@prisma/client";
import { prisma } from "../../config/db.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  emailRequestHash,
  nextEmailAttemptAt,
  normalizeProviderIdempotencyKey,
} from "./emailOutbox.policy.js";
import {
  createResendProvider,
  EmailProviderError,
  type EmailProviderAdapter,
} from "./resend.provider.js";

export type EmailOutboxTx = Prisma.TransactionClient;

export interface EnqueueEmailInput {
  idempotencyKey: string;
  template: EmailTemplate;
  recipientEmail: string;
  fromEmail?: string | null;
  subject: string;
  html: string;
  referenceType: string;
  referenceId: string;
  referenceVersion?: string | null;
}

export async function enqueueEmail(
  tx: EmailOutboxTx,
  input: EnqueueEmailInput,
): Promise<EmailOutbox> {
  const requestHash = emailRequestHash(input);
  // Prisma's read-then-write upsert can still race across interactive
  // transactions. A transaction-scoped PostgreSQL lock serializes producers
  // for this application key and is released automatically on commit/rollback.
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${input.idempotencyKey}, 0))::text AS locked
  `;
  const existing = await tx.emailOutbox.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existing) {
    if (existing.requestHash !== requestHash) {
      throw new HttpError(
        409,
        "email_idempotency_conflict",
        "This email idempotency key was reused with different content",
      );
    }
    return existing;
  }
  return tx.emailOutbox.create({
    data: {
      idempotencyKey: input.idempotencyKey,
      requestHash,
      providerIdempotencyKey: normalizeProviderIdempotencyKey(
        `email_${randomUUID().replaceAll("-", "")}`,
      ),
      template: input.template,
      recipientEmail: input.recipientEmail.trim().toLowerCase(),
      fromEmail: input.fromEmail ?? env.EMAIL_FROM ?? null,
      subject: input.subject,
      html: input.html,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceVersion: input.referenceVersion ?? null,
      maxAttempts: env.EMAIL_OUTBOX_MAX_ATTEMPTS,
      events: {
        create: {
          fromStatus: null,
          toStatus: "PENDING",
          source: "application",
          message: "Email committed to the durable outbox",
        },
      },
    },
  });
}

async function cancelIfSourceChanged(
  tx: EmailOutboxTx,
  row: EmailOutbox,
): Promise<EmailOutbox | null> {
  if (row.template !== "BACK_IN_STOCK") return null;
  const alert = await tx.stockAlert.findUnique({
    where: { id: row.referenceId },
    select: { active: true, updatedAt: true },
  });
  if (
    alert?.active &&
    row.referenceVersion &&
    alert.updatedAt.toISOString() === row.referenceVersion
  ) {
    return null;
  }
  const cancelled = await tx.emailOutbox.update({
    where: { id: row.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      leaseExpiresAt: null,
    },
  });
  await tx.emailOutboxEvent.create({
    data: {
      emailOutboxId: row.id,
      fromStatus: row.status,
      toStatus: "CANCELLED",
      source: "source_validation",
      message: "Stock alert was removed or superseded before delivery",
    },
  });
  return cancelled;
}

async function claimEmail(id: string, now: Date): Promise<EmailOutbox | null> {
  return prisma.$transaction(async (tx) => {
    const current = await tx.emailOutbox.findUnique({ where: { id } });
    if (!current) return null;
    if (["SENT", "DEAD_LETTER", "CANCELLED"].includes(current.status)) {
      return current;
    }
    const cancelled = await cancelIfSourceChanged(tx, current);
    if (cancelled) return cancelled;
    const claimed = await tx.emailOutbox.updateMany({
      where: {
        id,
        OR: [
          { status: "PENDING", nextAttemptAt: { lte: now } },
          { status: "PROCESSING", leaseExpiresAt: { lte: now } },
        ],
      },
      data: {
        status: "PROCESSING",
        attemptCount: { increment: 1 },
        lastAttemptAt: now,
        leaseExpiresAt: new Date(now.getTime() + 2 * 60_000),
        fromEmail: current.fromEmail ?? env.EMAIL_FROM ?? null,
      },
    });
    if (claimed.count !== 1) return null;
    await tx.emailOutboxEvent.create({
      data: {
        emailOutboxId: id,
        fromStatus: current.status,
        toStatus: "PROCESSING",
        source: "worker",
        message: "Email delivery attempt claimed",
      },
    });
    return tx.emailOutbox.findUniqueOrThrow({ where: { id } });
  });
}

async function recordSent(row: EmailOutbox, providerMessageId: string) {
  return prisma.$transaction(async (tx) => {
    const now = new Date();
    const updated = await tx.emailOutbox.updateMany({
      where: { id: row.id, status: "PROCESSING" },
      data: {
        status: "SENT",
        providerMessageId,
        sentAt: now,
        leaseExpiresAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
    if (updated.count !== 1) {
      return tx.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
    }
    if (row.template === "SUBSCRIPTION_RENEWAL") {
      await tx.subscriptionRenewal.updateMany({
        where: { id: row.referenceId, notifiedAt: null },
        data: { notifiedAt: now },
      });
    }
    if (row.template === "BACK_IN_STOCK" && row.referenceVersion) {
      await tx.stockAlert.updateMany({
        where: {
          id: row.referenceId,
          active: true,
          updatedAt: new Date(row.referenceVersion),
        },
        data: { active: false, notifiedAt: now },
      });
    }
    await tx.emailOutboxEvent.create({
      data: {
        emailOutboxId: row.id,
        fromStatus: "PROCESSING",
        toStatus: "SENT",
        source: "provider_api",
        message: "Resend accepted the email",
        payload: { providerMessageId },
      },
    });
    return tx.emailOutbox.findUniqueOrThrow({ where: { id: row.id } });
  });
}

function failureDetails(error: unknown) {
  if (error instanceof EmailProviderError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      retryAfterMs: error.retryAfterMs,
      providerStatus: error.status,
    };
  }
  return {
    code: "email_delivery_unknown",
    message: error instanceof Error ? error.message.slice(0, 300) : "Unknown email failure",
    retryable: true,
    retryAfterMs: undefined,
    providerStatus: undefined,
  };
}

async function recordFailure(row: EmailOutbox, error: unknown) {
  const failure = failureDetails(error);
  const now = new Date();
  const nextAttempt = failure.retryable
    ? nextEmailAttemptAt({
        attemptCount: row.attemptCount,
        maxAttempts: row.maxAttempts,
        now,
        retryAfterMs: failure.retryAfterMs,
      })
    : null;
  const status: EmailOutboxStatus = nextAttempt ? "PENDING" : "DEAD_LETTER";
  return prisma.$transaction(async (tx) => {
    const updated = await tx.emailOutbox.update({
      where: { id: row.id },
      data: {
        status,
        nextAttemptAt: nextAttempt ?? row.nextAttemptAt,
        leaseExpiresAt: null,
        lastErrorCode: failure.code,
        lastErrorMessage: failure.message,
        ...(status === "DEAD_LETTER" ? { deadLetteredAt: now } : {}),
      },
    });
    await tx.emailOutboxEvent.create({
      data: {
        emailOutboxId: row.id,
        fromStatus: "PROCESSING",
        toStatus: status,
        source: "provider_api",
        message: failure.message,
        payload: {
          code: failure.code,
          retryable: failure.retryable,
          ...(failure.providerStatus
            ? { providerStatus: failure.providerStatus }
            : {}),
        },
      },
    });
    return updated;
  });
}

export async function processEmailOutbox(
  id: string,
  provider: EmailProviderAdapter | null = createResendProvider(),
) {
  if (!provider) {
    return { status: "configuration_missing" as const, email: null };
  }
  const claimed = await claimEmail(id, new Date());
  if (!claimed) return { status: "not_claimed" as const, email: null };
  if (claimed.status !== "PROCESSING") {
    return { status: claimed.status.toLowerCase(), email: claimed };
  }
  if (!claimed.fromEmail) {
    return {
      status: "configuration_missing" as const,
      email: await recordFailure(
        claimed,
        new EmailProviderError(
          "email_from_missing",
          "EMAIL_FROM is not configured",
          false,
        ),
      ),
    };
  }
  try {
    const result = await provider.send({
      from: claimed.fromEmail,
      to: claimed.recipientEmail,
      subject: claimed.subject,
      html: claimed.html,
      idempotencyKey: claimed.providerIdempotencyKey,
    });
    return { status: "sent" as const, email: await recordSent(claimed, result.id) };
  } catch (error) {
    logger.error(
      { err: error, emailOutboxId: claimed.id, template: claimed.template },
      "email outbox delivery failed",
    );
    const email = await recordFailure(claimed, error);
    return { status: email.status.toLowerCase(), email };
  }
}

export async function processDueEmails(input: {
  batchSize?: number;
  provider?: EmailProviderAdapter | null;
  now?: Date;
} = {}) {
  const provider = input.provider === undefined ? createResendProvider() : input.provider;
  if (!provider) {
    return { configured: false, candidates: 0, sent: 0, pending: 0, dead: 0, cancelled: 0 };
  }
  const now = input.now ?? new Date();
  const candidates = await prisma.emailOutbox.findMany({
    where: {
      OR: [
        { status: "PENDING", nextAttemptAt: { lte: now } },
        { status: "PROCESSING", leaseExpiresAt: { lte: now } },
      ],
    },
    orderBy: { nextAttemptAt: "asc" },
    take: input.batchSize ?? env.EMAIL_OUTBOX_BATCH_SIZE,
    select: { id: true },
  });
  let sent = 0;
  let pending = 0;
  let dead = 0;
  let cancelled = 0;
  for (const candidate of candidates) {
    const result = await processEmailOutbox(candidate.id, provider);
    if (result.status === "sent") sent += 1;
    else if (result.status === "pending") pending += 1;
    else if (result.status === "dead_letter") dead += 1;
    else if (result.status === "cancelled") cancelled += 1;
  }
  return { configured: true, candidates: candidates.length, sent, pending, dead, cancelled };
}

export async function retryEmailOutbox(id: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.emailOutbox.findUnique({ where: { id } });
    if (!current) throw new HttpError(404, "email_outbox_not_found", "Email not found");
    if (current.status === "SENT" || current.status === "CANCELLED") {
      throw new HttpError(409, "email_not_retryable", `Cannot retry a ${current.status} email`);
    }
    if (current.status === "PROCESSING") {
      throw new HttpError(409, "email_processing", "Email is currently being processed");
    }
    const updated = await tx.emailOutbox.update({
      where: { id },
      data: {
        status: "PENDING",
        attemptCount: 0,
        nextAttemptAt: new Date(),
        deadLetteredAt: null,
        leaseExpiresAt: null,
      },
    });
    await tx.emailOutboxEvent.create({
      data: {
        emailOutboxId: id,
        fromStatus: current.status,
        toStatus: "PENDING",
        source: "admin",
        message: `Manual retry requested by ${actorId}`,
      },
    });
    return updated;
  });
}
