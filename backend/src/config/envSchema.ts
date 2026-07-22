import { z } from "zod";

const emptyToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema);

const stringBoolean = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const stringBooleanDefaultTrue = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

const RAZORPAY_PRODUCTION_API = "https://api.razorpay.com/v1";

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

  // Rate limits are configuration rather than route constants, so operators
  // can tune them for traffic and provider limits without a code deploy.
  RATE_LIMIT_AUTH_IP_MAX: z.coerce.number().int().positive().max(100_000).default(10),
  RATE_LIMIT_AUTH_ACCOUNT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(5),
  RATE_LIMIT_AUTH_WINDOW_SEC: z.coerce.number().int().positive().max(86_400).default(60),
  RATE_LIMIT_AUTH_BACKOFF_BASE_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(5),
  RATE_LIMIT_AUTH_BACKOFF_MAX_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(300),

  RATE_LIMIT_PUBLIC_IP_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(120),
  RATE_LIMIT_PUBLIC_ACCOUNT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(240),
  RATE_LIMIT_PUBLIC_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(60),
  RATE_LIMIT_PUBLIC_BACKOFF_BASE_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(2),
  RATE_LIMIT_PUBLIC_BACKOFF_MAX_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(60),

  RATE_LIMIT_AUTHENTICATED_IP_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(180),
  RATE_LIMIT_AUTHENTICATED_ACCOUNT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(120),
  RATE_LIMIT_AUTHENTICATED_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(60),
  RATE_LIMIT_AUTHENTICATED_BACKOFF_BASE_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(1),
  RATE_LIMIT_AUTHENTICATED_BACKOFF_MAX_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(30),

  RATE_LIMIT_SERVICEABILITY_IP_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(30),
  RATE_LIMIT_SERVICEABILITY_ACCOUNT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .max(100_000)
    .default(60),
  RATE_LIMIT_SERVICEABILITY_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(3_600),
  RATE_LIMIT_SERVICEABILITY_BACKOFF_BASE_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(5),
  RATE_LIMIT_SERVICEABILITY_BACKOFF_MAX_SEC: z.coerce
    .number()
    .int()
    .positive()
    .max(86_400)
    .default(600),

  CHECKOUT_RESERVATION_MINUTES: z.coerce
    .number()
    .int()
    .min(5)
    .max(60)
    .default(15),
  CHECKOUT_EXPIRY_SCAN_SECONDS: z.coerce
    .number()
    .int()
    .min(15)
    .max(3600)
    .default(60),
  CHECKOUT_EXPIRY_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(500)
    .default(50),
  PAYMENT_RECONCILIATION_SCAN_SECONDS: z.coerce
    .number()
    .int()
    .min(15)
    .max(3600)
    .default(30),
  PAYMENT_RECONCILIATION_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25),
  PAYMENT_RECONCILIATION_INITIAL_DELAY_SECONDS: z.coerce
    .number()
    .int()
    .min(5)
    .max(600)
    .default(20),
  PAYMENT_RECONCILIATION_MAX_DELAY_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  PAYMENT_CREATED_GRACE_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(3600)
    .default(300),
  WEBHOOK_RECOVERY_MIN_AGE_SECONDS: z.coerce
    .number()
    .int()
    .min(15)
    .max(3600)
    .default(60),
  WEBHOOK_RECOVERY_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(50),
  REFUND_RECONCILIATION_SCAN_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),
  REFUND_RECONCILIATION_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25),

  FIREBASE_PROJECT_ID: emptyToUndefined(z.string().min(1).optional()),
  FIREBASE_CLIENT_EMAIL: emptyToUndefined(z.string().email().optional()),
  FIREBASE_PRIVATE_KEY: emptyToUndefined(z.string().min(1).optional()),
  FIREBASE_AUTH_EMULATOR_HOST: emptyToUndefined(z.string().min(1).optional()),

  // Existing deployments keep payments enabled by default. Set this to false
  // for a deliberate COD-only launch while Razorpay is being onboarded.
  PAYMENTS_ENABLED: stringBooleanDefaultTrue,
  RAZORPAY_KEY_ID: emptyToUndefined(z.string().min(1).optional()),
  RAZORPAY_KEY_SECRET: emptyToUndefined(z.string().min(1).optional()),
  RAZORPAY_WEBHOOK_SECRET: emptyToUndefined(z.string().min(16).optional()),
  RAZORPAY_API_BASE_URL: z.string().url().default(RAZORPAY_PRODUCTION_API),
  RAZORPAY_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(5_000),
  RAZORPAY_HTTP_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(5)
    .default(3),
  RAZORPAY_HTTP_RETRY_BASE_MS: z.coerce
    .number()
    .int()
    .min(50)
    .max(2_000)
    .default(250),

  RESEND_API_KEY: emptyToUndefined(z.string().min(1).optional()),
  EMAIL_FROM: emptyToUndefined(z.string().email().optional()),
  ADMIN_NOTIFICATION_EMAIL: emptyToUndefined(z.string().email().optional()),
  EMAIL_DELIVERY_REQUIRED: stringBoolean,
  EMAIL_HTTP_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(500)
    .max(30_000)
    .default(8_000),
  EMAIL_OUTBOX_SCAN_SECONDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(3600)
    .default(30),
  EMAIL_OUTBOX_BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25),
  EMAIL_OUTBOX_MAX_ATTEMPTS: z.coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(8),

  COURIER_PROVIDER: z.enum(["manual", "shiprocket"]).default("manual"),
  SHIPROCKET_EMAIL: emptyToUndefined(z.string().email().optional()),
  SHIPROCKET_PASSWORD: emptyToUndefined(z.string().min(8).optional()),
  SHIPROCKET_PICKUP_LOCATION: emptyToUndefined(z.string().min(1).max(100).optional()),
  SHIPROCKET_PICKUP_PINCODE: emptyToUndefined(z.string().regex(/^\d{6}$/).optional()),
  SHIPROCKET_WEBHOOK_SECRET: emptyToUndefined(z.string().min(16).optional()),
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
  | "EMAIL_FROM"
  | "SHIPROCKET_EMAIL"
  | "SHIPROCKET_PASSWORD"
  | "SHIPROCKET_PICKUP_LOCATION"
  | "SHIPROCKET_PICKUP_PINCODE"
  | "SHIPROCKET_WEBHOOK_SECRET";

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
  const firebaseEmulator = Boolean(data.FIREBASE_AUTH_EMULATOR_HOST);

  const backoffPolicies = [
    [
      "auth",
      data.RATE_LIMIT_AUTH_BACKOFF_BASE_SEC,
      data.RATE_LIMIT_AUTH_BACKOFF_MAX_SEC,
    ],
    [
      "public",
      data.RATE_LIMIT_PUBLIC_BACKOFF_BASE_SEC,
      data.RATE_LIMIT_PUBLIC_BACKOFF_MAX_SEC,
    ],
    [
      "authenticated",
      data.RATE_LIMIT_AUTHENTICATED_BACKOFF_BASE_SEC,
      data.RATE_LIMIT_AUTHENTICATED_BACKOFF_MAX_SEC,
    ],
    [
      "serviceability",
      data.RATE_LIMIT_SERVICEABILITY_BACKOFF_BASE_SEC,
      data.RATE_LIMIT_SERVICEABILITY_BACKOFF_MAX_SEC,
    ],
  ] as const;
  for (const [label, base, maximum] of backoffPolicies) {
    if (base > maximum) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [`RATE_LIMIT_${label.toUpperCase()}_BACKOFF_BASE_SEC`],
        message: `Rate-limit backoff base must not exceed the ${label} maximum`,
      });
    }
  }

  if (firebaseEmulator) {
    if (deployed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIREBASE_AUTH_EMULATOR_HOST"],
        message: "Firebase Auth Emulator is allowed only when APP_ENV=local",
      });
    }
    if (
      !/^(localhost|127\.0\.0\.1):\d+$/.test(
        data.FIREBASE_AUTH_EMULATOR_HOST!,
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIREBASE_AUTH_EMULATOR_HOST"],
        message:
          "FIREBASE_AUTH_EMULATOR_HOST must be a loopback host and port without a protocol",
      });
    }
    if (!data.FIREBASE_PROJECT_ID?.startsWith("demo-")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["FIREBASE_PROJECT_ID"],
        message:
          "Firebase Auth Emulator requires a demo- project ID to prevent accidental production access",
      });
    }
  }

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

  if (!firebaseEmulator) {
    validateGroup(
      data,
      context,
      ["FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY"],
      "Firebase Admin",
      deployed,
    );
  }
  validateGroup(
    data,
    context,
    ["RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET"],
    "Razorpay",
    deployed && data.PAYMENTS_ENABLED,
  );
  validateGroup(
    data,
    context,
    ["RESEND_API_KEY", "EMAIL_FROM"],
    "email delivery",
    data.EMAIL_DELIVERY_REQUIRED,
  );
  validateGroup(
    data,
    context,
    [
      "SHIPROCKET_EMAIL",
      "SHIPROCKET_PASSWORD",
      "SHIPROCKET_PICKUP_LOCATION",
      "SHIPROCKET_PICKUP_PINCODE",
      "SHIPROCKET_WEBHOOK_SECRET",
    ],
    "Shiprocket",
    data.COURIER_PROVIDER === "shiprocket",
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
    data.PAYMENTS_ENABLED &&
    data.RAZORPAY_KEY_ID &&
    !data.RAZORPAY_KEY_ID.startsWith("rzp_live_")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RAZORPAY_KEY_ID"],
      message: "Production requires a Razorpay live key (rzp_live_...)",
    });
  }
  if (deployed && data.RAZORPAY_API_BASE_URL !== RAZORPAY_PRODUCTION_API) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["RAZORPAY_API_BASE_URL"],
      message: "Deployed environments must use the official Razorpay API",
    });
  }
});

export type BackendEnvironment = z.infer<typeof backendEnvSchema>;

export function parseBackendEnvironment(
  input: Record<string, unknown>,
): BackendEnvironment {
  return backendEnvSchema.parse(input);
}
