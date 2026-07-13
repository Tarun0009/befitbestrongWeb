import express, { type Express } from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { requestId } from "./middleware/requestId.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import routes from "./routes/index.js";
import webhookRoutes from "./modules/webhooks/webhooks.routes.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  if (env.TRUST_PROXY_HOPS > 0) {
    app.set("trust proxy", env.TRUST_PROXY_HOPS);
  }

  app.use(requestId);
  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: (req as { id?: string }).id }),
      serializers: {
        req(req) {
          return { method: req.method, url: req.url };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      credentials: true,
    }),
  );
  app.use(cookieParser());

  // Webhooks mount BEFORE express.json so signature verification can hash the
  // raw request body. The router installs its own express.raw parser.
  app.use("/webhooks", webhookRoutes);

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/", routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

