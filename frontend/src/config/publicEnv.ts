export type PublicAppEnvironment = "local" | "staging" | "production";

export interface PublicEnvironmentInput {
  appEnvironment?: string;
  apiUrl?: string;
  siteUrl?: string;
  releaseSha?: string;
  firebaseApiKey?: string;
  firebaseAuthDomain?: string;
  firebaseProjectId?: string;
  firebaseStorageBucket?: string;
  firebaseMessagingSenderId?: string;
  firebaseAppId?: string;
  firebaseAuthEmulatorUrl?: string;
}

export interface PublicEnvironment {
  appEnvironment: PublicAppEnvironment;
  apiUrl: string;
  siteUrl: string;
  release: string | null;
  firebaseConfigured: boolean;
  firebaseAuthEmulatorUrl: string | null;
  firebase: {
    apiKey?: string;
    authDomain?: string;
    projectId?: string;
    storageBucket?: string;
    messagingSenderId?: string;
    appId?: string;
  };
}

const LOCAL_API_URL = "http://localhost:4000";
const LOCAL_SITE_URL = "http://localhost:3005";

function optional(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isLocalHostname(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(hostname);
}

export function validatePublicEnvironment(
  input: PublicEnvironmentInput,
): PublicEnvironment {
  const errors = new Set<string>();
  const requestedEnvironment = optional(input.appEnvironment) ?? "local";
  const validEnvironments: PublicAppEnvironment[] = [
    "local",
    "staging",
    "production",
  ];
  const appEnvironment = validEnvironments.includes(
    requestedEnvironment as PublicAppEnvironment,
  )
    ? (requestedEnvironment as PublicAppEnvironment)
    : "local";

  if (appEnvironment !== requestedEnvironment) {
    errors.add(
      "NEXT_PUBLIC_APP_ENV must be local, staging, or production",
    );
  }

  const deployed = appEnvironment !== "local";
  const rawApiUrl = optional(input.apiUrl) ?? (deployed ? undefined : LOCAL_API_URL);
  const rawSiteUrl =
    optional(input.siteUrl) ?? (deployed ? undefined : LOCAL_SITE_URL);

  if (!rawApiUrl) errors.add("NEXT_PUBLIC_API_URL is required");
  if (!rawSiteUrl) errors.add("NEXT_PUBLIC_SITE_URL is required");

  let apiUrl = rawApiUrl ?? LOCAL_API_URL;
  let siteUrl = rawSiteUrl ?? LOCAL_SITE_URL;

  try {
    const parsed = new URL(apiUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.add("NEXT_PUBLIC_API_URL must use HTTP or HTTPS");
    }
    if (deployed && (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname))) {
      errors.add("NEXT_PUBLIC_API_URL must be a non-local HTTPS URL when deployed");
    }
    apiUrl = parsed.toString().replace(/\/$/, "");
  } catch {
    errors.add("NEXT_PUBLIC_API_URL must be a valid absolute URL");
  }

  try {
    const parsed = new URL(siteUrl);
    if (!["http:", "https:"].includes(parsed.protocol) || parsed.origin !== siteUrl) {
      errors.add("NEXT_PUBLIC_SITE_URL must be an exact HTTP(S) origin without a path");
    }
    if (deployed && (parsed.protocol !== "https:" || isLocalHostname(parsed.hostname))) {
      errors.add("NEXT_PUBLIC_SITE_URL must be a non-local HTTPS origin when deployed");
    }
    siteUrl = parsed.origin;
  } catch {
    errors.add("NEXT_PUBLIC_SITE_URL must be a valid absolute URL");
  }

  const firebase = {
    apiKey: optional(input.firebaseApiKey),
    authDomain: optional(input.firebaseAuthDomain),
    projectId: optional(input.firebaseProjectId),
    storageBucket: optional(input.firebaseStorageBucket),
    messagingSenderId: optional(input.firebaseMessagingSenderId),
    appId: optional(input.firebaseAppId),
  };
  const firebaseFields = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", firebase.apiKey],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", firebase.authDomain],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", firebase.projectId],
    ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", firebase.storageBucket],
    ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", firebase.messagingSenderId],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", firebase.appId],
  ] as const;
  const configuredFirebaseFields = firebaseFields.filter(([, value]) => value);
  const firebaseConfigured =
    configuredFirebaseFields.length === firebaseFields.length;

  const rawFirebaseAuthEmulatorUrl = optional(input.firebaseAuthEmulatorUrl);
  let firebaseAuthEmulatorUrl: string | null = null;
  if (rawFirebaseAuthEmulatorUrl) {
    try {
      const parsed = new URL(rawFirebaseAuthEmulatorUrl);
      if (
        appEnvironment !== "local" ||
        parsed.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "::1"].includes(parsed.hostname) ||
        parsed.origin !== rawFirebaseAuthEmulatorUrl
      ) {
        errors.add(
          "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL must be an exact local HTTP origin and is allowed only when NEXT_PUBLIC_APP_ENV=local",
        );
      } else {
        firebaseAuthEmulatorUrl = parsed.origin;
      }
    } catch {
      errors.add(
        "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL must be a valid absolute URL",
      );
    }
  }

  if (
    deployed ||
    (configuredFirebaseFields.length > 0 && !firebaseConfigured)
  ) {
    for (const [name, value] of firebaseFields) {
      if (!value) errors.add(`${name} is required to complete Firebase configuration`);
    }
  }

  if (errors.size > 0) {
    throw new Error(
      `Invalid public environment:\n${[...errors]
        .map((message) => `- ${message}`)
        .join("\n")}`,
    );
  }

  return {
    appEnvironment,
    apiUrl,
    siteUrl,
    release: optional(input.releaseSha) ?? null,
    firebaseConfigured,
    firebaseAuthEmulatorUrl,
    firebase,
  };
}

export const publicEnv = validatePublicEnvironment({
  appEnvironment: process.env.NEXT_PUBLIC_APP_ENV,
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL,
  releaseSha: process.env.NEXT_PUBLIC_RELEASE_SHA,
  firebaseApiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  firebaseAuthDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  firebaseStorageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  firebaseMessagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  firebaseAppId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  firebaseAuthEmulatorUrl:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
});
