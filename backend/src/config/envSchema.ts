import { z } from "zod";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const stringBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

function serviceUrl(protocols: string[], label: string) {
  return z.string().url().superRefine((value, context) => {
    const protocol = new URL(value).protocol;
    if (!protocols.includes(protocol)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${label} must use ${protocols.join(" or ")}`,
      });
    }
  });
}

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ENV: z.enum(["local", "staging", "production"]).default("local"),
  PORT: z.coerce.number().int().positive().max(65_535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace"])
    .default("debug"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),
  RELEASE_SHA: emptyToUndefined(z.string().min(7).max(64).optional()),

  DATABASE_URL: serviceUrl(["postgresql:", "postgres:"], "DATABASE_URL"),
  REDIS_URL: serviceUrl(["redis:", "rediss:"], "REDIS_URL"),

  CORS_ORIGIN: z.string().min(1).default("http://localhost:3005"),
  FRONTEND_URL: z.string().url().default("http://localhost:3005"),

  FIREBASE_PROJECT_ID: emptyToUndefined(z.string().min(1).optional()),
  FIREBASE_CLIENT_EMAIL: emptyToUndefined(z.string().email().optional()),
  FIREBASE_PRIVATE_KEY: emptyToUndefined(z.string().min(1).optional()),

  RAZORPAY_KEY_ID: emptyToUndefined(z.string().min(1).optional()),
  RAZORPAY_KEY_SECRET: emptyToUndefined(z.string().min(1).optional()),
  RAZORPAY_WEBHOOK_SECRET: emptyToUndefined(z.string().min(16).optional()),

  RESEND_API_KEY: emptyToUndefined(z.string().min(1).optional()),
  EMAIL_FROM: emptyToUndefined(z.string().email().optional()),
  EMAIL_DELIVERY_REQUIRED: stringBoolean,
});

type ParsedEnvironment = z.infer<typeof baseEnvSchema>;

type OptionalKey =
  | "FIREBASE_PROJECT_ID"
  | "FIREBASE_CLIENT_EMAIL"
  | "FIREBASE_PRIVATE_KEY"
  | "RAZORPAY_KEY_ID"
  | "RAZORPAY_KEY_SECRET"
  | "RAZORPAY_WEBHOOK_SECRET"
  | "RESEND_API_KEY"
  | "EMAIL_FROM";

function validateGroup(
  data: ParsedEnvironment,
  context: z.RefinementCtx,
  fields: OptionalKey[],
  label: string,
  required: boolean,
) {
  const present = fields.filter((field) => Boolean(data[field]));
  if (present.length === 0 && !required) return;
  if (present.length === fields.length) return;

  for (const field of fields) {
    if (!data[field]) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [field],
        message: `${field} is required to complete ${label} configuration`,
      });
    }
  }
}

function isLocalHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  );
}

export const backendEnvSchema = baseEnvSchema.superRefine((data, context) => {
  const deployed = data.APP_ENV !== "local";
  const production = data.APP_ENV === "production";

  if (deployed && data.NODE_ENV !== "production") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["NODE_ENV"],
      message: "NODE_ENV must be production for staging or production deployments",
    });
  }
  if (data.NODE_ENV === "production" && data.APP_ENV === "local") {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["APP_ENV"],
      message: "APP_ENV must be staging or production when NODE_ENV is production",
    });
  }
  if (deployed && ["debug", "trace"].includes(data.LOG_LEVEL)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["LOG_LEVEL"],
      message: "Deployed environments must use info or a more restrictive log level",
    });
  }

  const origins = data.CORS_ORIGIN.split(",").map((origin) => origin.trim());
  for (const origin of origins) {
    if (!origin || origin === "*") {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: "CORS_ORIGIN must contain explicit origins and cannot use *",
      });
      continue;
    }
    try {
      const parsed = new URL(origin);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== origin) {
        throw new Error("not an origin");
      }
      if (deployed && (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["CORS_ORIGIN"],
          message: "Deployed CORS origins must be non-local HTTPS origins",
        });
      }
    } catch {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["CORS_ORIGIN"],
        message: `Invalid exact CORS origin: ${origin}`,
      });
    }
  }

  const frontendUrl = new URL(data.FRONTEND_URL);
  if (
    deployed &&
    (frontendUrl.protocol !== "https:" || isLocalHostname(frontendUrl.hostname))
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["FRONTEND_URL"],
      message: "Deployed FRONTEND_URL must be a non-local HTTPS URL",
    });
  }

  validateGroup(
    data,
    context,
    ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"],
    "Firebase Admin",
    deployed,
  );
  validateGroup(
    data,
    context,
    ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    "Razorpay",
    deployed,
  );
  validateGroup(
    data,
    context,
    ["RESEND_API_KEY", "EMAIL_FROM"],
    "email delivery",
    data.EMAIL_DELIVERY_REQUIRED,
  );

  if (
    deployed &&
    data.FIREBASE_PRIVATE_KEY &&
    !data.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").includes("BEGIN PRIVATE KEY")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["FIREBASE_PRIVATE_KEY"],
      message: "FIREBASE_PRIVATE_KEY is not a PEM private key",
    });
  }
  if (
    production &&
    data.RAZORPAY_KEY_ID &&
    !data.RAZORPAY_KEY_ID.startsWith("rzp_live_")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RAZORPAY_KEY_ID"],
      message: "Production requires a Razorpay live key (rzp_live_...)",
    });
  }
});

export type BackendEnvironment = z.infer<typeof backendEnvSchema>;

export function parseBackendEnvironment(
  input: Record<string, unknown>,
): BackendEnvironment {
  return backendEnvSchema.parse(input);
}
