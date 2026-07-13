import type { Request, Response, NextFunction } from "express";
import { redis } from "../config/redis.js";

interface RateLimitOptions {
  keyPrefix: string;
  max: number;
  windowSec: number;
  keyBy?: (req: Request) => string;
}

export function rateLimit(opts: RateLimitOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = (opts.keyBy?.(req) ?? req.ip ?? "unknown").toString();
    const key = `ratelimit:${opts.keyPrefix}:${identifier}`;

    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, opts.windowSec);
    }

    const remaining = Math.max(0, opts.max - count);
    res.setHeader("X-RateLimit-Limit", String(opts.max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));

    if (count > opts.max) {
      const ttl = await redis.ttl(key);
      res.setHeader("Retry-After", String(Math.max(ttl, 1)));
      return res.status(429).json({
        error: {
          code: "rate_limited",
          message: "Too many requests. Try again shortly.",
        },
      });
    }

    next();
  };
}
