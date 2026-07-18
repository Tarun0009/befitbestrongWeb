import admin from "firebase-admin";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { HttpError } from "../middleware/errorHandler.js";

let initialized = false;

export function getFirebaseAdmin(): typeof admin {
  if (initialized) return admin;

  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (env.FIREBASE_AUTH_EMULATOR_HOST) {
    admin.initializeApp({ projectId: FIREBASE_PROJECT_ID });
    initialized = true;
    logger.info(
      {
        projectId: FIREBASE_PROJECT_ID,
        emulatorHost: env.FIREBASE_AUTH_EMULATOR_HOST,
      },
      "firebase-admin initialized for local Auth Emulator",
    );
    return admin;
  }

  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    throw new HttpError(
      503,
      "auth_unavailable",
      "Firebase Admin SDK is not configured. Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in backend/.env.",
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });

  initialized = true;
  logger.info({ projectId: FIREBASE_PROJECT_ID }, "firebase-admin initialized");
  return admin;
}

export function isFirebaseConfigured(): boolean {
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = env;
  if (env.FIREBASE_AUTH_EMULATOR_HOST) return Boolean(FIREBASE_PROJECT_ID);
  return Boolean(FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY);
}
