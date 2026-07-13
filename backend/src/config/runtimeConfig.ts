import type { Env } from "./env.js";

export interface RuntimeConfigurationStatus {
  ready: boolean;
  environment: Env["APP_ENV"];
  release: string | null;
  trustProxyHops: number;
  required: {
    firebase: boolean;
    payments: boolean;
    email: boolean;
  };
  capabilities: {
    firebase: boolean;
    payments: boolean;
    email: boolean;
  };
}

export function getRuntimeConfigurationStatus(
  environment: Env,
): RuntimeConfigurationStatus {
  const firebase = Boolean(
    environment.FIREBASE_PROJECT_ID &&
      environment.FIREBASE_CLIENT_EMAIL &&
      environment.FIREBASE_PRIVATE_KEY,
  );
  const payments = Boolean(
    environment.RAZORPAY_KEY_ID &&
      environment.RAZORPAY_KEY_SECRET &&
      environment.RAZORPAY_WEBHOOK_SECRET,
  );
  const email = Boolean(environment.RESEND_API_KEY && environment.EMAIL_FROM);
  const deployed = environment.APP_ENV !== "local";
  const required = {
    firebase: deployed,
    payments: deployed,
    email: environment.EMAIL_DELIVERY_REQUIRED,
  };

  return {
    ready:
      (!required.firebase || firebase) &&
      (!required.payments || payments) &&
      (!required.email || email),
    environment: environment.APP_ENV,
    release: environment.RELEASE_SHA ?? null,
    trustProxyHops: environment.TRUST_PROXY_HOPS,
    required,
    capabilities: { firebase, payments, email },
  };
}
