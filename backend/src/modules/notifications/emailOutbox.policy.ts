import { createHash } from "node:crypto";

export function emailRequestHash(input: {
  template: string;
  recipientEmail: string;
  subject: string;
  html: string;
  referenceType: string;
  referenceId: string;
  referenceVersion?: string | null;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        template: input.template,
        recipientEmail: input.recipientEmail.trim().toLowerCase(),
        subject: input.subject,
        html: input.html,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
        referenceVersion: input.referenceVersion ?? null,
      }),
    )
    .digest("hex");
}

export function nextEmailAttemptAt(input: {
  attemptCount: number;
  maxAttempts: number;
  now: Date;
  retryAfterMs?: number | null;
}): Date | null {
  if (input.attemptCount >= input.maxAttempts) return null;
  const exponential = Math.min(
    60_000 * 2 ** Math.max(0, input.attemptCount - 1),
    3_600_000,
  );
  const providerDelay = Math.max(0, input.retryAfterMs ?? 0);
  const delay = Math.min(Math.max(exponential, providerDelay), 3_600_000);
  return new Date(input.now.getTime() + delay);
}

export function normalizeProviderIdempotencyKey(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9_\-/]/g, "_");
  return normalized.slice(0, 256);
}
