import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis.js";
import { logger } from "../config/logger.js";

export interface RateLimitOptions {
  keyPrefix: string;
  /** Maximum requests per IP in the configured window. */
  max: number;
  /** Maximum requests per account in the configured window, when provided. */
  accountMax?: number;
  windowSec: number;
  backoffBaseSec: number;
  backoffMaxSec: number;
  keyBy?: (req: Request) => string | undefined;
  accountKeyBy?: (req: Request) => string | undefined;
}

interface BucketResult {
  limited: boolean;
  remaining: number;
  retryAfterSec: number;
}

function identifier(value: string | undefined) {
  const normalized = value?.trim();
  return normalized ? encodeURIComponent(normalized) : "unknown";
}

function bucketKey(prefix: string, kind: "ip" | "account", value: string) {
  return `ratelimit:${prefix}:${kind}:${identifier(value)}`;
}

function backoffKey(prefix: string, kind: "ip" | "account", value: string) {
  return `${bucketKey(prefix, kind, value)}:backoff`;
}

function violationKey(prefix: string, kind: "ip" | "account", value: string) {
  return `${bucketKey(prefix, kind, value)}:violations`;
}

async function checkBucket(
  prefix: string,
  kind: "ip" | "account",
  value: string,
  max: number,
  opts: Pick<RateLimitOptions, "windowSec" | "backoffBaseSec" | "backoffMaxSec">,
): Promise<BucketResult> {
  const countKey = bucketKey(prefix, kind, value);
  const blockedKey = backoffKey(prefix, kind, value);
  const violations = violationKey(prefix, kind, value);

  // Backoff is a short-lived, expiring pause. It is intentionally not a
  // permanent account lockout and does not require a support intervention.
  const existingBackoff = await redis.ttl(blockedKey);
  if (existingBackoff > 0) {
    return { limited: true, remaining: 0, retryAfterSec: existingBackoff };
  }

  const count = await redis.incr(countKey);
  if (count === 1) {
    await redis.expire(countKey, opts.windowSec);
  }

  if (count <= max) {
    // A successful request after a quiet period resets the exponential
    // sequence; the request window itself remains a fixed, bounded window.
    await redis.del(violations);
    return {
      limited: false,
      remaining: Math.max(0, max - count),
      retryAfterSec: 0,
    };
  }

  const attempts = await redis.incr(violations);
  if (attempts === 1) {
    await redis.expire(violations, opts.backoffMaxSec);
  }

  const exponent = Math.min(Math.max(attempts - 1, 0), 30);
  const retryAfterSec = Math.min(
    opts.backoffMaxSec,
    opts.backoffBaseSec * 2 ** exponent,
  );
  await redis.set(blockedKey, "1", "EX", retryAfterSec);

  return { limited: true, remaining: 0, retryAfterSec };
}

/**
 * Return an unverified Firebase subject hint for rate-limit bucketing only.
 * This value must never be used for authorization; `syncSession` still
 * verifies the token cryptographically. The IP bucket always remains active,
 * so a caller cannot bypass protection by changing this hint.
 */
export function firebaseAccountHint(req: Request): string | undefined {
  const token = req.body?.idToken;
  if (typeof token !== "string") return undefined;

  const payload = token.split(".")[1];
  if (!payload) return undefined;

  try {
    const decoded = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as { sub?: unknown };
    return typeof decoded.sub === "string" && decoded.sub.length > 0
      ? decoded.sub
      : undefined;
  } catch {
    return undefined;
  }
}

export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const ip = opts.keyBy?.(req) ?? req.ip ?? "unknown";
    const account = opts.accountKeyBy?.(req);
    const buckets = [
      {
        kind: "ip" as const,
        value: ip,
        max: opts.max,
      },
      ...(account
        ? [
            {
              kind: "account" as const,
              value: account,
              max: opts.accountMax ?? opts.max,
            },
          ]
        : []),
    ];

    try {
      const results = await Promise.all(
        buckets.map((bucket) =>
          checkBucket(opts.keyPrefix, bucket.kind, bucket.value, bucket.max, opts),
        ),
      );
      const limit = Math.min(...buckets.map((bucket) => bucket.max));
      const remaining = Math.min(...results.map((result) => result.remaining));
      const retryAfterSec = Math.max(
        ...results.map((result) => result.retryAfterSec),
      );

      res.setHeader("X-RateLimit-Limit", String(limit));
      res.setHeader("X-RateLimit-Remaining", String(remaining));
      res.setHeader(
        "X-RateLimit-Policy",
        `${limit};w=${opts.windowSec};scope=ip,account`,
      );

      if (results.some((result) => result.limited)) {
        res.setHeader("Retry-After", String(Math.max(retryAfterSec, 1)));
        return res.status(429).json({
          error: {
            code: "rate_limited",
            message: "Too many requests. Try again after the indicated delay.",
          },
        });
      }

      next();
    } catch (error) {
      // Redis is a protection layer, not a reason to take the storefront down.
      // If it is unavailable, allow the request and surface an operational
      // warning so monitoring can alert on the degraded protection.
      logger.warn(
        { err: error, keyPrefix: opts.keyPrefix },
        "rate limit store unavailable; allowing request",
      );
      next();
    }
  };
}
