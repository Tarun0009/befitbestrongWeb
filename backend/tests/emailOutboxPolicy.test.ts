import { describe, expect, it } from "@jest/globals";
import {
  emailRequestHash,
  nextEmailAttemptAt,
  normalizeProviderIdempotencyKey,
} from "../src/modules/notifications/emailOutbox.policy.js";

describe("email outbox policy", () => {
  const message = {
    template: "ORDER_STATUS",
    recipientEmail: " USER@Example.COM ",
    subject: "Order update",
    html: "<p>Ready</p>",
    referenceType: "Order",
    referenceId: "order-1",
  };

  it("normalizes recipient case while binding the hash to frozen content", () => {
    expect(emailRequestHash(message)).toBe(
      emailRequestHash({ ...message, recipientEmail: "user@example.com" }),
    );
    expect(emailRequestHash(message)).not.toBe(
      emailRequestHash({ ...message, subject: "Different update" }),
    );
  });

  it("uses bounded exponential retries and stops at the attempt limit", () => {
    const now = new Date("2026-07-16T00:00:00.000Z");
    expect(
      nextEmailAttemptAt({ attemptCount: 1, maxAttempts: 8, now })?.getTime(),
    ).toBe(now.getTime() + 60_000);
    expect(
      nextEmailAttemptAt({ attemptCount: 8, maxAttempts: 10, now })?.getTime(),
    ).toBe(now.getTime() + 3_600_000);
    expect(
      nextEmailAttemptAt({ attemptCount: 8, maxAttempts: 8, now }),
    ).toBeNull();
  });

  it("honors provider retry-after without allowing unbounded delay", () => {
    const now = new Date("2026-07-16T00:00:00.000Z");
    expect(
      nextEmailAttemptAt({
        attemptCount: 1,
        maxAttempts: 8,
        now,
        retryAfterMs: 120_000,
      })?.getTime(),
    ).toBe(now.getTime() + 120_000);
    expect(
      nextEmailAttemptAt({
        attemptCount: 1,
        maxAttempts: 8,
        now,
        retryAfterMs: 9_000_000,
      })?.getTime(),
    ).toBe(now.getTime() + 3_600_000);
  });

  it("produces provider-safe idempotency keys within Resend's limit", () => {
    const key = normalizeProviderIdempotencyKey("email key!?" + "x".repeat(300));
    expect(key).toMatch(/^[A-Za-z0-9_\-/]+$/);
    expect(key).toHaveLength(256);
  });
});
