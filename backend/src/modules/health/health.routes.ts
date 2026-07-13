import { Router } from "express";
import { pingDatabase } from "../../config/db.js";
import { env } from "../../config/env.js";
import { pingRedis } from "../../config/redis.js";
import { getRuntimeConfigurationStatus } from "../../config/runtimeConfig.js";

const router = Router();

function livenessPayload() {
  return {
    status: "ok",
    service: "befitbestrong-api",
    environment: env.APP_ENV,
    release: env.RELEASE_SHA ?? null,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };
}

router.get(["/", "/live"], (_req, res) => {
  res.json(livenessPayload());
});

router.get(["/deep", "/ready"], async (req, res) => {
  const [database, cache] = await Promise.all([pingDatabase(), pingRedis()]);
  const configuration = getRuntimeConfigurationStatus(env);
  const ready = database && cache && configuration.ready;
  const isReadinessRoute = req.path === "/ready";

  res.status(ready ? 200 : 503).json({
    status: ready ? "ok" : "degraded",
    service: "befitbestrong-api",
    environment: configuration.environment,
    release: configuration.release,
    checks: {
      database: database ? "up" : "down",
      redis: cache ? "up" : "down",
      configuration: configuration.ready ? "ready" : "incomplete",
    },
    ...(isReadinessRoute
      ? {
          configuration: {
            required: configuration.required,
            capabilities: configuration.capabilities,
            trustProxyHops: configuration.trustProxyHops,
          },
        }
      : {}),
    timestamp: new Date().toISOString(),
  });
});

export default router;
