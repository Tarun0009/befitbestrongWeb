import { env } from "./env.js";

/**
 * Rate-limit policies are kept in one place so route modules only choose an
 * endpoint category and key prefix. Tune the values through environment
 * variables; no route code needs to change for a traffic-policy adjustment.
 */
export const rateLimitPolicies = {
  auth: {
    max: env.RATE_LIMIT_AUTH_IP_MAX,
    accountMax: env.RATE_LIMIT_AUTH_ACCOUNT_MAX,
    windowSec: env.RATE_LIMIT_AUTH_WINDOW_SEC,
    backoffBaseSec: env.RATE_LIMIT_AUTH_BACKOFF_BASE_SEC,
    backoffMaxSec: env.RATE_LIMIT_AUTH_BACKOFF_MAX_SEC,
  },
  public: {
    max: env.RATE_LIMIT_PUBLIC_IP_MAX,
    accountMax: env.RATE_LIMIT_PUBLIC_ACCOUNT_MAX,
    windowSec: env.RATE_LIMIT_PUBLIC_WINDOW_SEC,
    backoffBaseSec: env.RATE_LIMIT_PUBLIC_BACKOFF_BASE_SEC,
    backoffMaxSec: env.RATE_LIMIT_PUBLIC_BACKOFF_MAX_SEC,
  },
  authenticated: {
    max: env.RATE_LIMIT_AUTHENTICATED_IP_MAX,
    accountMax: env.RATE_LIMIT_AUTHENTICATED_ACCOUNT_MAX,
    windowSec: env.RATE_LIMIT_AUTHENTICATED_WINDOW_SEC,
    backoffBaseSec: env.RATE_LIMIT_AUTHENTICATED_BACKOFF_BASE_SEC,
    backoffMaxSec: env.RATE_LIMIT_AUTHENTICATED_BACKOFF_MAX_SEC,
  },
  serviceability: {
    max: env.RATE_LIMIT_SERVICEABILITY_IP_MAX,
    accountMax: env.RATE_LIMIT_SERVICEABILITY_ACCOUNT_MAX,
    windowSec: env.RATE_LIMIT_SERVICEABILITY_WINDOW_SEC,
    backoffBaseSec: env.RATE_LIMIT_SERVICEABILITY_BACKOFF_BASE_SEC,
    backoffMaxSec: env.RATE_LIMIT_SERVICEABILITY_BACKOFF_MAX_SEC,
  },
} as const;
