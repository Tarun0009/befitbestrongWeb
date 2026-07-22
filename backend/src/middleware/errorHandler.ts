import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../config/logger.js";

export class HttpError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound(_req: Request, res: Response) {
  res.status(404).json({
    error: {
      code: "not_found",
      message: "The requested resource was not found",
    },
  });
}

function isServerError(status: number) {
  return status >= 500;
}

function publicHttpErrorMessage(error: HttpError) {
  // Provider, database, filesystem, and network messages can contain URLs,
  // SQL fragments, hostnames, or local paths. Keep those details in logs only.
  return isServerError(error.status)
    ? "We couldn't complete that request right now. Please try again shortly."
    : error.message;
}

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: "validation_error",
        message: "Request validation failed",
        details: err.flatten(),
      },
    });
  }

  if (err instanceof HttpError) {
    if (isServerError(err.status)) {
      logger.error({ err, requestId: req.id }, "handled server error");
    }
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: publicHttpErrorMessage(err),
      },
    });
  }

  logger.error({ err, requestId: req.id }, "unhandled error");

  return res.status(500).json({
    error: {
      code: "internal_error",
      message: "Something went wrong",
    },
  });
}
